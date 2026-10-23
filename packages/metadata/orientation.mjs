import { randomUUID } from 'node:crypto';
import { copyFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyPhoto, hashFile, validatePreview } from './importer.mjs';
import { transaction } from '../domain/store.mjs';

const exec = promisify(execFile);
// Rotate project previews only. Keep the baseline and every task's preview file intact.
export async function rotatePhoto(db,dataDir,{photoId,rotation,expectedVersion,origin='manual',reason='用户调整方向'}) {
  if(typeof photoId!=='string'||![0,90,180,270].includes(rotation)||!Number.isInteger(expectedVersion)||expectedVersion<0||!['manual','Codex'].includes(origin)||typeof reason!=='string'||!reason.trim()||reason.length>1000) throw new Error('方向调整参数错误');
  const photo=db.prepare('SELECT * FROM photos WHERE id=?').get(photoId);
  const old=db.prepare('SELECT * FROM photo_adjustments WHERE photoId=?').get(photoId);
  if((old?.version||0)!==expectedVersion)throw new Error('照片方向已变化，请刷新后重试');
  if(origin==='Codex'&&old?.origin==='manual')throw new Error('此照片方向已由你手工调整，Codex 不自动覆盖');
  await verifyPhoto(db,photo,dataDir);
  const basePreview=old?.basePreview||photo.preview,baseHash=old?.baseHash||photo.previewHash;
  const base=join(dataDir,'cache',basePreview);
  if(await hashFile(base)!==baseHash)throw new Error('方向调整的基准预览已损坏，请重新导入');
  if(rotation===(old?.rotation||0))return{rotation,version:expectedVersion};
  const name=`${photo.id}-${randomUUID()}.jpg`,path=join(dataDir,'cache',name),tmp=`${path}.tmp.jpg`;
  try{
    if(rotation===0)await copyFile(base,tmp);
    else await exec('sips',['--rotate',String(rotation),base,'--out',tmp]);
    await validatePreview(tmp);const previewHash=await hashFile(tmp);
    await rename(tmp,path);
    const next={rotation,version:expectedVersion+1,undoId:randomUUID()};
    transaction(db,()=>{
      const current=db.prepare('SELECT active,hash,previewHash FROM photos WHERE id=?').get(photoId);
      const version=db.prepare('SELECT version FROM photo_adjustments WHERE photoId=?').get(photoId)?.version||0;
      if(!current?.active||current.hash!==photo.hash||current.previewHash!==photo.previewHash||version!==expectedVersion)throw new Error('照片或方向已变化，请刷新后重试');
      db.prepare('INSERT INTO orientation_history VALUES(?,?,?,?)').run(next.undoId,photoId,JSON.stringify({expectedVersion:next.version,sourceHash:photo.hash,previous:{preview:photo.preview,previewHash:photo.previewHash,rotation:old?.rotation||0,origin:old?.origin||'manual',reason:old?.reason||'恢复原始显示方向'}}),new Date().toISOString());
      db.prepare('INSERT INTO photo_adjustments VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(photoId) DO UPDATE SET rotation=excluded.rotation,version=excluded.version,origin=excluded.origin,reason=excluded.reason,updatedAt=excluded.updatedAt').run(photoId,rotation,next.version,basePreview,baseHash,origin,reason,new Date().toISOString());
      db.prepare('UPDATE photos SET preview=?,previewHash=? WHERE id=?').run(name,previewHash,photoId);
    });
    return next;
  }catch(e){await rm(tmp,{force:true});await rm(path,{force:true});throw e;}
}

export async function undoRotation(db,dataDir,{photoId,expectedVersion,undoId}){
  if(typeof photoId!=='string'||typeof undoId!=='string'||!Number.isInteger(expectedVersion))throw new Error('撤销参数错误');
  const record=db.prepare('SELECT data FROM orientation_history WHERE id=? AND photoId=?').get(undoId,photoId);
  if(!record)throw new Error('方向调整记录不存在');
  const saved=JSON.parse(record.data),photo=db.prepare('SELECT * FROM photos WHERE id=?').get(photoId);
  if(saved.expectedVersion!==expectedVersion)throw new Error('撤销版本不匹配');
  await verifyPhoto(db,photo,dataDir);
  if(photo.hash!==saved.sourceHash)throw new Error('原片版本已变化');
  const previous=saved.previous,path=join(dataDir,'cache',previous.preview);
  if(await hashFile(path)!==previous.previewHash)throw new Error('历史预览已损坏，不能撤销');
  await validatePreview(path);
  transaction(db,()=>{
    const current=db.prepare('SELECT active,hash,previewHash FROM photos WHERE id=?').get(photoId);
    const adjustment=db.prepare('SELECT version FROM photo_adjustments WHERE photoId=?').get(photoId);
    if(!current?.active||current.hash!==photo.hash||current.previewHash!==photo.previewHash||adjustment?.version!==expectedVersion)throw new Error('照片方向已变化，不能覆盖新的调整');
    db.prepare('UPDATE photo_adjustments SET rotation=?,version=version+1,origin=?,reason=?,updatedAt=? WHERE photoId=?').run(previous.rotation,previous.origin,previous.reason,new Date().toISOString(),photoId);
    db.prepare('UPDATE photos SET preview=?,previewHash=? WHERE id=?').run(previous.preview,previous.previewHash,photoId);
  });
  return{rotation:previous.rotation,version:expectedVersion+1};
}
