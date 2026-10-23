// One-time migration aid for the locally observed Excire Foto 5.0.2 schema.
// Does not form part of the app's runtime or modify the Excire database.
import { DatabaseSync } from 'node:sqlite';
import { realpath, stat, copyFile, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hashFile, contained } from '../packages/metadata/importer.mjs';

const [databaseArg, rootArg]=process.argv.slice(2);
if(!databaseArg||!rootArg) throw new Error('用法：npm run excire:snapshot -- <已关闭的数据库> <照片来源目录>');
const original=await realpath(databaseArg), root=await realpath(rootArg);
async function present(path){try{await access(path);return true;}catch{return false;}}
if(await present(`${original}-wal`) || await present(`${original}-shm`)) throw new Error('请先正常退出 Excire；不复制活动 WAL 数据库');
const dir=resolve('.local/integrations/excire',randomUUID()); await mkdir(dir,{recursive:true});
const snapshot=join(dir,'catalog.snapshot.sqlite');
const before=await stat(original), beforeHash=await hashFile(original);
await copyFile(original,snapshot);
const after=await stat(original);
if(before.mtimeMs!==after.mtimeMs || before.size!==after.size || await hashFile(original)!==beforeHash || await present(`${original}-wal`) || await present(`${original}-shm`)) {
  await rm(dir,{recursive:true,force:true}); throw new Error('数据库复制时变化，请确认 Excire 已退出再重试');
}
const db=new DatabaseSync(snapshot,{readOnly:true});
try {
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('数据库快照完整性检查失败');
  const prefix=pathToFileURL(root+sep).href;
  const rows=db.prepare('SELECT Id,FileUri,Filename,FlagName,Stars FROM photo_info WHERE substr(FileUri,1,?)=?').all(prefix.length,prefix);
  if(!rows.length) throw new Error('目录未在 Excire 中找到');
  const ids=new Set(rows.map(r=>r.Id));
  const collections=db.prepare('SELECT c.Id FROM culling_collection c JOIN culling_collection__photo_infos_photo_info r ON r.cullingCollectionId=c.Id JOIN photo_info p ON p.Id=r.photoInfoId WHERE substr(p.FileUri,1,?)=? GROUP BY c.Id ORDER BY c.Id DESC').all(prefix.length,prefix);
  if(!collections.length) throw new Error('此来源没有 culling 记录');
  const collectionId=collections[0].Id;
  const allGroups=db.prepare('SELECT Id,CullingSubCollectionType,CoverId FROM culling_cluster WHERE collectionId=?').all(collectionId);
  const groups=allGroups.map(g=>({id:String(g.Id),rawType:g.CullingSubCollectionType,coverExternalId:String(g.CoverId),members:db.prepare('SELECT photoInfoId FROM culling_cluster__photo_infos_photo_info WHERE cullingClusterId=?').all(g.Id).filter(p=>ids.has(p.photoInfoId)).map(p=>String(p.photoInfoId))})).filter(g=>g.members.length);
  const entries=[];
  for(const r of rows){
    const path=fileURLToPath(r.FileUri);
    if(!contained(root,path)) throw new Error('目录边界不匹配');
    let currentHash=null;
    try { if(contained(root,await realpath(path))) currentHash=await hashFile(path); }catch{/* Missing originals remain explicit. */}
    entries.push({externalId:String(r.Id),relativePath:relative(root,path),sourceHash:currentHash,rawFlag:r.FlagName,rating:r.Stars,
      flag:r.FlagName===0?'unmarked':r.FlagName===2?'exclude':'unknown',
      groupIds:groups.filter(g=>g.members.includes(String(r.Id))).map(g=>g.id)});
  }
  const output={schemaVersion:1,provider:'Excire Foto',adapterVersion:'excire-observed-5.0.2-v1',sourceRoot:root,
    databaseSnapshotHash:await hashFile(snapshot),createdAt:new Date().toISOString(),collectionId:String(collectionId),
    mappingEvidence:`Observed local 5.0.2 mapping (validated on camera collection 10): FlagName 0=unmarked, 2=exclude; type 3=visual similarity. This extraction uses collection ${collectionId}; counts are scoped to this source, empty groups omitted. Shared group IDs with the same databaseSnapshotHash can link sources. Other flags retained as unknown.`,
    entries,groups};
  const path=join(dir,'culling.json');await writeFile(path,JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({manifest:path,photos:entries.length,excluded:entries.filter(p=>p.flag==='exclude').length,groupCounts:groups.reduce((a,g)=>(a[g.rawType]=(a[g.rawType]||0)+1,a),{})},null,2));
}finally{db.close();}
