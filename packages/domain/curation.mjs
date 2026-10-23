import { transaction } from './store.mjs';
export const CURATION_STATES = ['unreviewed','keep','pending','exclude'];
export function setCuration(db, {photoId,state,expectedVersion}) {
  if (typeof photoId !== 'string' || !CURATION_STATES.includes(state) || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error('选片请求格式不正确');
  return transaction(db,()=>{
    const photo=db.prepare('SELECT active FROM photos WHERE id=?').get(photoId);
    if (!photo?.active) throw new Error('照片不存在或已被新版本替代');
    const previous=db.prepare('SELECT state,version FROM curation WHERE photoId=?').get(photoId)||{state:'unreviewed',version:0};
    if(previous.version!==expectedVersion) throw new Error('选片状态已变化，请刷新后重试');
    const next={photoId,state,version:previous.version+1,updatedAt:new Date().toISOString()};
    db.prepare('INSERT INTO curation VALUES(?,?,?,?) ON CONFLICT(photoId) DO UPDATE SET state=excluded.state,version=excluded.version,updatedAt=excluded.updatedAt').run(photoId,state,next.version,next.updatedAt);
    return {previous,current:next};
  });
}
