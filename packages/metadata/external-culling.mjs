import { createHash, randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute, normalize, sep } from 'node:path';
import { transaction } from '../domain/store.mjs';

export async function importExternalCulling(db, input) {
  if(input?.schemaVersion!==1 || input.provider!=='Excire Foto' || input.adapterVersion!=='excire-observed-5.0.2-v1' || typeof input.sourceRoot!=='string' || !isAbsolute(input.sourceRoot)) throw new Error('外部选片清单格式或适配器版本不支持');
  if(!Array.isArray(input.entries)||input.entries.length<1||input.entries.length>5000||!Array.isArray(input.groups)) throw new Error('外部照片/分组清单格式错误');
  if(input.groups.length>10000) throw new Error('分组过多');
  if(typeof input.databaseSnapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(input.databaseSnapshotHash)) throw new Error('数据库快照哈希缺失');
  const sourceRoot=await realpath(input.sourceRoot);
  const ids=new Set(),paths=new Set();
  const entries=input.entries.map(e=>{
    if(typeof e.externalId!=='string'||!e.externalId||ids.has(e.externalId)) throw new Error('外部照片 ID 重复或无效');ids.add(e.externalId);
    if(typeof e.relativePath!=='string'||!e.relativePath||isAbsolute(e.relativePath)||normalize(e.relativePath)!==e.relativePath||e.relativePath.split(sep).includes('..')||paths.has(e.relativePath)) throw new Error('外部照片路径重复或越界');paths.add(e.relativePath);
    if(e.sourceHash!==null && !/^[a-f0-9]{64}$/.test(e.sourceHash)) throw new Error('外部照片哈希错误');
    if(!Number.isInteger(e.rawFlag)||!Number.isInteger(e.rating)||e.rating<0||e.rating>5) throw new Error('外部标记错误');
    const flag=e.rawFlag===0?'unmarked':e.rawFlag===2?'exclude':'unknown';
    return {externalId:e.externalId,relativePath:e.relativePath,sourceHash:e.sourceHash,rawFlag:e.rawFlag,rating:e.rating,flag};
  });
  const groupIds=new Set();
  const groups=input.groups.map(g=>{
    if(typeof g.id!=='string'||groupIds.has(g.id)||!Number.isInteger(g.rawType)||!Array.isArray(g.members)||g.members.length>5000||g.members.some(id=>!ids.has(id))) throw new Error('外部分组引用无效');
    groupIds.add(g.id);return{id:g.id,rawType:g.rawType,members:[...new Set(g.members)]};
  });
  const payload={schemaVersion:1,adapterVersion:input.adapterVersion,sourceRoot,databaseSnapshotHash:input.databaseSnapshotHash,entries,groups,
    mappingEvidence:typeof input.mappingEvidence==='string'?input.mappingEvidence.slice(0,1000):'unknown'};
  const serialized=JSON.stringify(payload),snapshotHash=createHash('sha256').update(serialized).digest('hex');
  const existing=db.prepare('SELECT id FROM external_culling WHERE provider=? AND snapshotHash=?').get(input.provider,snapshotHash);
  if(existing)return{id:existing.id,unchanged:true,count:entries.length};
  const id=randomUUID();transaction(db,()=>db.prepare('INSERT INTO external_culling VALUES(?,?,?,?,?,?)').run(id,input.provider,sourceRoot,snapshotHash,serialized,new Date().toISOString()));
  return{id,unchanged:false,count:entries.length};
}

export function externalForPhoto(photo,sourcePath,snapshots) {
  for(const snapshot of snapshots){
    if(snapshot.sourceRoot!==sourcePath)continue;
    const entry=snapshot.payload.entries.find(e=>e.relativePath===photo.relativePath);
    if(entry)return{snapshotId:snapshot.id,...entry,stale:entry.sourceHash!==photo.hash,
      visualGroups:snapshot.payload.groups.filter(g=>g.rawType===3&&g.members.includes(entry.externalId)).map(g=>g.id)};
  }
  return null;
}
