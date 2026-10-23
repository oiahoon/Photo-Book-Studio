import{library}from'../domain/store.mjs';
import{createTask}from'./tasks.mjs';

// Source-scoped snapshots can share one Excire collection. Never merge IDs across database snapshots.
export function planBatches(data,{sourceId=null,size=12}={}){
 if(!Number.isInteger(size)||size<1||size>20)throw new Error('批次大小须为 1–20');
 if(sourceId&&!data.sources.some(s=>s.id===sourceId))throw new Error('来源不存在');
 const candidates=data.photos.filter(p=>(!sourceId||p.sourceId===sourceId)&&p.status==='ready'&&p.preview&&p.curation.state!=='exclude'&&!p.analyses.some(a=>!a.stale));
 const groups=new Map();
 for(const p of candidates){const snapshot=data.externalCulling.find(s=>s.id===p.external?.snapshotId);const key=p.external&&!p.external.stale&&p.external.visualGroups.length?`${snapshot.payload.databaseSnapshotHash}:${p.external.visualGroups[0]}`:`photo:${p.id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 const batches=[];let batch=[];
 for(const members of groups.values()){
  for(let n=0;n<members.length;n+=size){const part=members.slice(n,n+size);if(batch.length+part.length>size){batches.push(batch);batch=[];}batch.push(...part);}
 }
 if(batch.length)batches.push(batch);
 return batches.map(ps=>({ids:ps.map(p=>p.id),groups:[...new Set(ps.flatMap(p=>p.external&&!p.external.stale?p.external.visualGroups:[]))]}));
}
export async function prepareNextBatch(db,dataDir,options){
 const data=library(db),batches=planBatches(data,options);
 if(!batches.length)throw new Error('当前范围没有待分析的成片');
 const ids=batches[0].ids;
 // Reuse a matching uncollected task rather than creating duplicates on repeated clicks.
 for(const row of db.prepare('SELECT manifest FROM tasks ORDER BY createdAt DESC').all()){
  const m=JSON.parse(row.manifest);
  if(m.photos.length===ids.length&&m.photos.every(p=>ids.includes(p.photoId)&&data.photos.some(current=>current.id===p.photoId&&current.hash===p.sourceHash&&current.previewHash===p.previewHash)))return m;
 }
 return createTask(db,dataDir,ids);
}
