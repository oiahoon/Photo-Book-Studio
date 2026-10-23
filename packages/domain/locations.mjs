import {randomUUID} from 'node:crypto';
import {transaction} from './store.mjs';
const read=(db,id)=>{const r=db.prepare('SELECT * FROM photo_locations WHERE photoId=?').get(id);return r?{data:JSON.parse(r.data),version:r.version}:{data:{suggestion:null,manual:null},version:0};};
function text(v,max,field){if(typeof v!=='string'||v.length>max||/[\u0000-\u001f]/.test(v))throw Error(`${field}格式不正确`);return v.trim();}
function active(db,id){const p=db.prepare('SELECT * FROM photos WHERE id=? AND active=1').get(id);if(!p)throw Error('照片不存在或已失效');return p;}
function version(v){if(!Number.isInteger(v)||v<0)throw Error('地点版本不正确');}
function save(db,photoId,previous,data){
  const next=previous.version+1,now=new Date().toISOString(),undoId=randomUUID();
  db.prepare('INSERT INTO photo_locations VALUES(?,?,?,?) ON CONFLICT(photoId) DO UPDATE SET data=excluded.data,version=excluded.version,updatedAt=excluded.updatedAt').run(photoId,JSON.stringify(data),next,now);
  db.prepare('INSERT INTO location_history VALUES(?,?,?,?,?)').run(undoId,photoId,JSON.stringify(previous.data),next,now);
  return {version:next,undoId};
}
export function setLocation(db,{photoId,city,site,expectedVersion,reason='用户确认或修正地点'}){
  version(expectedVersion);city=text(city,80,'城市');site=text(site,80,'景点');reason=text(reason,500,'依据');
  return transaction(db,()=>{active(db,photoId);const before=read(db,photoId);if(before.version!==expectedVersion)throw Error('地点已变化，请刷新后重试');
    return save(db,photoId,before,{...before.data,manual:{city,site,reason,origin:'user'}});});
}
export function undoLocation(db,{photoId,undoId,expectedVersion}){
  version(expectedVersion);return transaction(db,()=>{active(db,photoId);const current=read(db,photoId),h=db.prepare('SELECT * FROM location_history WHERE id=? AND photoId=?').get(undoId,photoId);
    if(!h||current.version!==expectedVersion||h.afterVersion!==expectedVersion)throw Error('地点已变化，无法撤销旧操作');
    return save(db,photoId,current,JSON.parse(h.beforeData));});
}
// Batch validation and import are atomic. Existing user edits always win over Codex.
export function importLocations(db,input){
  if(input?.schemaVersion!==1||!Array.isArray(input.photos)||!input.photos.length||input.photos.length>500)throw Error('地点清单格式不正确');
  return transaction(db,()=>{const seen=new Set();let imported=0,unchanged=0,protectedCount=0;
    for(const r of input.photos){
      if(seen.has(r.photoId))throw Error('地点清单包含重复照片');seen.add(r.photoId);
      version(r.expectedVersion);const p=active(db,r.photoId),before=read(db,r.photoId);
      if(p.hash!==r.sourceHash||p.previewHash!==r.previewHash)throw Error('地点依据的照片版本已变化');
      const a=db.prepare('SELECT * FROM analyses WHERE id=? AND photoId=?').get(r.analysisId,r.photoId);
      if(!a||a.decision==='rejected'||a.sourceHash!==p.hash||a.previewHash!==p.previewHash)throw Error('地点须引用当前有效分析');
      const suggestion={city:text(r.city,80,'城市'),site:text(r.site,80,'景点'),reason:text(r.reason,500,'依据'),confidence:r.confidence,analysisId:a.id,sourceHash:p.hash,previewHash:p.previewHash,origin:'Codex'};
      if(!['high','medium','low','unknown'].includes(suggestion.confidence)||!suggestion.reason)throw Error('地点推测依据或把握程度不正确');
      if(before.data.manual){protectedCount++;continue;}
      if(JSON.stringify(before.data.suggestion)===JSON.stringify(suggestion)){unchanged++;continue;}
      if(before.version!==r.expectedVersion)throw Error('地点已变化，请重新准备清单');
      save(db,r.photoId,before,{suggestion,manual:null});imported++;
    }
    return {imported,unchanged,protected:protectedCount};
  });
}
