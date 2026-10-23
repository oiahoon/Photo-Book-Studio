import{randomUUID}from'node:crypto';
import{readStoryboard,transaction}from'./store.mjs';
import{renderedPhotoKeys,isPairedRaw}from'./photo-policy.mjs';

function text(value,name,max,optional=false){
 if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))throw new Error(`${name}格式错误，最多 ${max} 字`);
 return value.trim();
}
function version(value){if(!Number.isInteger(value)||value<0)throw new Error('章节版本错误');}
function current(db,expectedVersion,boardId='main'){version(expectedVersion);if(typeof boardId!=='string'||! /^[a-zA-Z0-9-]{1,80}$/.test(boardId))throw new Error('方案引用错误');const board=readStoryboard(db,boardId);if(board.version!==expectedVersion)throw new Error('章节已在其他操作中变化，请刷新后重试');return board;}
function chapter(board,id){const c=board.chapters.find(c=>c.id===id);if(!c)throw new Error('章节不存在');return c;}
function placement(board,id){for(const c of board.chapters){const index=c.photos.findIndex(p=>p.photoId===id);if(index>=0)return{chapter:c,index,photo:c.photos[index]};}throw new Error('照片尚未安排');}
function movable(array,index,direction){if(!['up','down'].includes(direction))throw new Error('排序方向错误');const next=index+(direction==='up'?-1:1);if(next<0||next>=array.length)throw new Error('已经位于边界');[array[index],array[next]]=[array[next],array[index]];}
function photoReference(db,id){
 if(typeof id!=='string')throw new Error('照片引用错误');
 const p=db.prepare('SELECT * FROM photos WHERE id=?').get(id);
 if(!p?.active||p.status!=='ready'||!p.preview)throw new Error('照片未就绪或版本已失效');
 if(isPairedRaw(p,renderedPhotoKeys(db.prepare('SELECT * FROM photos WHERE active=1 AND sourceId=?').all(p.sourceId))))throw new Error('请使用配对成片');
 if(db.prepare('SELECT state FROM curation WHERE photoId=?').get(id)?.state==='exclude')throw new Error('这张照片已手工排除，请先恢复选片状态');
 return{photoId:p.id,filename:p.relativePath,sourceHash:p.hash,analysisId:null,reason:'',origin:'manual'};
}
function save(db,before,chapters,name=before.name){
 if(chapters.length>100||chapters.some(c=>c.photos.length>500)||chapters.reduce((n,c)=>n+c.photos.length,0)>2000)throw new Error('章节或照片数量超过当前上限');
 const data=JSON.stringify({name,chapters}),nextVersion=before.version+1,now=new Date().toISOString(),undoId=randomUUID();
 db.prepare('INSERT INTO storyboard_history VALUES(?,?,?,?)').run(undoId,JSON.stringify({boardId:before.id,name:before.name,chapters:before.chapters}),nextVersion,now);
 db.prepare('INSERT INTO storyboards VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updatedAt=excluded.updatedAt').run(before.id,data,nextVersion,now);
 return{version:nextVersion,undoId};
}
export function editStoryboard(db,input){
 if(!input||typeof input!=='object')throw new Error('章节操作格式错误');
 return transaction(db,()=>{
  const before=current(db,input.expectedVersion,input.boardId),board=structuredClone(before);
  if(before.id!=='main'&&!before.version)throw new Error('编排方案不存在');
  switch(input.op){
   case'create':board.chapters.push({id:randomUUID(),title:text(input.title,'章名',100),description:text(input.description??'','章节说明',1000,true),origin:'manual',photos:[]});break;
   case'rename':{const c=chapter(board,input.chapterId);c.title=text(input.title,'章名',100);c.description=text(input.description??'','章节说明',1000,true);c.origin='manual';break;}
   case'reorderChapter':{const index=board.chapters.findIndex(c=>c.id===input.chapterId);if(index<0)throw new Error('章节不存在');movable(board.chapters,index,input.direction);break;}
   case'removeChapter':{chapter(board,input.chapterId);board.chapters=board.chapters.filter(c=>c.id!==input.chapterId);break;}
   case'addPhoto':{const c=chapter(board,input.chapterId);if(board.chapters.some(c=>c.photos.some(p=>p.photoId===input.photoId)))throw new Error('照片已经安排，请使用移动操作');c.photos.push(photoReference(db,input.photoId));break;}
   case'movePhoto':{const from=placement(board,input.photoId),to=chapter(board,input.chapterId);if(from.chapter.id===to.id)throw new Error('照片已在这个章节');from.chapter.photos.splice(from.index,1);to.photos.push({...from.photo,origin:'manual'});break;}
   case'reorderPhoto':{const p=placement(board,input.photoId);movable(p.chapter.photos,p.index,input.direction);p.photo.origin='manual';break;}
   case'removePhoto':{const p=placement(board,input.photoId);p.chapter.photos.splice(p.index,1);break;}
   default:throw new Error('未知章节操作');
  }
  return save(db,before,board.chapters);
 });
}
export function undoStoryboard(db,{expectedVersion,undoId,boardId}){
 return transaction(db,()=>{
  const before=current(db,expectedVersion,boardId);if(typeof undoId!=='string')throw new Error('撤销引用错误');
  const history=db.prepare('SELECT * FROM storyboard_history WHERE id=?').get(undoId);
  const data=history?JSON.parse(history.beforeData):null;
  if(!history||history.afterVersion!==before.version||(data.boardId||'main')!==before.id)throw new Error('不能撤销旧操作或其他方案的操作并覆盖新的编排');
  return save(db,before,data.chapters,data.name||before.name);
 });
}
// Codex supplies explicit chapter/asset choices from existing observations, not filename heuristics.
// Only initialize an empty board. Suggestions never modify curation or analysis acceptance.
export function proposeStoryboard(db,{expectedVersion,chapters,boardId='main',name}){
 return transaction(db,()=>{
  const before=current(db,expectedVersion,boardId);if(before.chapters.length)throw new Error('已有章节，不能用建议覆盖');
  if(!Array.isArray(chapters)||!chapters.length||chapters.length>20)throw new Error('建议章节数量错误');
  const used=new Set();const prepared=chapters.map(c=>{
   if(!Array.isArray(c.photos)||c.photos.length>100)throw new Error('建议照片数量错误');
   return{id:randomUUID(),title:text(c.title,'章名',100),description:text(c.description??'','章节说明',1000,true),origin:'Codex',photos:c.photos.map(item=>{
    if(used.has(item.photoId))throw new Error('建议中照片重复');used.add(item.photoId);
    const p=photoReference(db,item.photoId),asset=db.prepare('SELECT previewHash FROM photos WHERE id=?').get(p.photoId);
    const a=db.prepare('SELECT * FROM analyses WHERE id=? AND photoId=?').get(item.analysisId,item.photoId);
    if(!a||a.decision==='rejected'||a.sourceHash!==p.sourceHash||a.previewHash!==asset.previewHash)throw new Error('建议必须引用当前有效且未拒绝的分析');
    return{...p,analysisId:a.id,reason:text(item.reason,'编排依据',1000),origin:'Codex'};
   })};
  });return {...save(db,before,prepared,name===undefined?before.name:text(name,'方案名',100)),boardId};
 });
}
