import{test}from'node:test';import assert from'node:assert/strict';
import{mkdtemp,mkdir,writeFile,readFile,rm,readdir}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{openStore,library,readStoryboard}from'../packages/domain/store.mjs';
import{editStoryboard,proposeStoryboard,undoStoryboard}from'../packages/domain/storyboard.mjs';
import{setCuration}from'../packages/domain/curation.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'pbs-story-')),source=join(root,'source'),data=join(root,'data');await mkdir(source);const db=openStore(data);
 t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});db.prepare('INSERT INTO sources VALUES(?,?,?,?)').run('source',source,'test','now');
 db.prepare('INSERT INTO tasks VALUES(?,?,?)').run('task',JSON.stringify({photos:[],manifestPath:'test',resultPath:'test'}),'now');
 for(const id of ['one','two','three','four']){
  await writeFile(join(source,id+'.jpg'),'original '+id);
  db.prepare('INSERT INTO photos(id,sourceId,relativePath,hash,bytes,format,preview,previewHash,status,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'source',id+'.jpg','source-'+id,12,'JPG',id+'.jpg','preview-'+id,'ready','now');
  db.prepare('INSERT INTO analyses(id,taskId,photoId,sourceHash,previewHash,analyst,model,promptVersion,promptHash,result,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('a-'+id,'task',id,'source-'+id,'preview-'+id,'Codex','test-only','test-only','test-only',JSON.stringify({summary:'测试数据，不是真实分析',tags:[]}),'now');
 }
 return{db,data,source};
}
const suggested=()=>[{title:'第一章',description:'建议草稿',photos:[{photoId:'one',analysisId:'a-one',reason:'测试编排依据'},{photoId:'two',analysisId:'a-two',reason:'测试编排依据'}]},{title:'第二章',description:'',photos:[{photoId:'three',analysisId:'a-three',reason:'测试编排依据'}]}];

test('章节草稿独立保存、改名排序和跨章移动；重开恢复、原片与选片不变',async t=>{
 const f=await fixture(t),db=f.db;setCuration(db,{photoId:'one',state:'keep',expectedVersion:0});
 let r=proposeStoryboard(db,{expectedVersion:0,chapters:suggested()}),b=readStoryboard(db);const first=b.chapters[0].id,second=b.chapters[1].id;
 assert.equal(b.chapters[0].origin,'Codex');assert.equal(b.chapters[0].photos[0].analysisId,'a-one');
 r=editStoryboard(db,{expectedVersion:r.version,op:'rename',chapterId:first,title:'新的章名',description:'我修改的说明'});
 r=editStoryboard(db,{expectedVersion:r.version,op:'reorderPhoto',photoId:'two',direction:'up'});assert.deepEqual(readStoryboard(db).chapters[0].photos.map(p=>p.photoId),['two','one']);
 r=editStoryboard(db,{expectedVersion:r.version,op:'movePhoto',photoId:'one',chapterId:second});
 r=editStoryboard(db,{expectedVersion:r.version,op:'reorderChapter',chapterId:second,direction:'up'});b=readStoryboard(db);assert.deepEqual(b.chapters[0].photos.map(p=>p.photoId),['three','one']);
 const reopened=openStore(f.data);assert.deepEqual(readStoryboard(reopened),b);reopened.close();
 assert.equal(library(db).photos.find(p=>p.id==='one').curation.state,'keep');assert.equal(library(db).photos.find(p=>p.id==='two').curation.state,'unreviewed');
 assert.equal(db.prepare("SELECT count(*) n FROM analyses WHERE decision='suggested'").get().n,4);assert.equal(await readFile(join(f.source,'one.jpg'),'utf8'),'original one');
 assert.throws(()=>proposeStoryboard(db,{expectedVersion:r.version,chapters:suggested()}),/不能.*覆盖/);
});
test('移出和移除章节可撤销；旧操作不能覆盖新编排，失败事务无部分结果',async t=>{
 const {db}=await fixture(t);let r=proposeStoryboard(db,{expectedVersion:0,chapters:suggested()}),b=readStoryboard(db);
 const removed=editStoryboard(db,{op:'removeChapter',chapterId:b.chapters[0].id,expectedVersion:r.version});assert.equal(readStoryboard(db).chapters.length,1);
 r=undoStoryboard(db,{undoId:removed.undoId,expectedVersion:removed.version});assert.deepEqual(readStoryboard(db).chapters,b.chapters);
 const moved=editStoryboard(db,{op:'removePhoto',photoId:'one',expectedVersion:r.version});assert.ok(!readStoryboard(db).chapters.some(c=>c.photos.some(p=>p.photoId==='one')));
 r=undoStoryboard(db,{undoId:moved.undoId,expectedVersion:moved.version});assert.equal(readStoryboard(db).chapters[0].photos[0].photoId,'one');
 assert.throws(()=>undoStoryboard(db,{undoId:removed.undoId,expectedVersion:removed.version}),/变化/);
 const before=readStoryboard(db),history=db.prepare('SELECT count(*) n FROM storyboard_history').get().n;
 for(const input of [{op:'addPhoto',chapterId:before.chapters[0].id,photoId:'one'},{op:'movePhoto',photoId:'one',chapterId:'missing'},{op:'rename',chapterId:before.chapters[0].id,title:'   '},{op:'reorderPhoto',photoId:'one',direction:'up'},{op:'create',title:'x',expectedVersion:0}])assert.throws(()=>editStoryboard(db,{expectedVersion:before.version,...input}));
 assert.deepEqual(readStoryboard(db),before);assert.equal(db.prepare('SELECT count(*) n FROM storyboard_history').get().n,history);
 r=editStoryboard(db,{op:'addPhoto',chapterId:before.chapters[0].id,photoId:'four',expectedVersion:before.version});assert.equal(readStoryboard(db).chapters[0].photos.at(-1).origin,'manual');
});
test('Codex 草稿拒绝过期、拒绝的分析、重复或已排除照片；已有引用不因素材失效被删除',async t=>{
 const {db}=await fixture(t);const bad=suggested();bad[1].photos[0].analysisId='missing';assert.throws(()=>proposeStoryboard(db,{expectedVersion:0,chapters:bad}),/有效/);assert.equal(readStoryboard(db).version,0);assert.equal(db.prepare('SELECT count(*) n FROM storyboard_history').get().n,0);
 db.prepare("UPDATE analyses SET decision='rejected' WHERE id='a-one'").run();assert.throws(()=>proposeStoryboard(db,{expectedVersion:0,chapters:suggested()}),/有效/);db.prepare("UPDATE analyses SET decision='suggested',previewHash='old' WHERE id='a-one'").run();assert.throws(()=>proposeStoryboard(db,{expectedVersion:0,chapters:suggested()}),/有效/);db.prepare("UPDATE analyses SET previewHash='preview-one' WHERE id='a-one'").run();
 const duplicate=suggested();duplicate[1].photos[0]=duplicate[0].photos[0];assert.throws(()=>proposeStoryboard(db,{expectedVersion:0,chapters:duplicate}),/重复/);
 setCuration(db,{photoId:'one',state:'exclude',expectedVersion:0});assert.throws(()=>proposeStoryboard(db,{expectedVersion:0,chapters:suggested()}),/排除/);setCuration(db,{photoId:'one',state:'unreviewed',expectedVersion:1});
 const r=proposeStoryboard(db,{expectedVersion:0,chapters:suggested()});db.prepare("UPDATE photos SET active=0 WHERE id='one'").run();assert.equal(readStoryboard(db).chapters[0].photos[0].photoId,'one');assert.equal(library(db).photos.some(p=>p.id==='one'),false);
 const created=editStoryboard(db,{op:'create',title:'第三章',expectedVersion:r.version});assert.throws(()=>editStoryboard(db,{op:'addPhoto',chapterId:readStoryboard(db).chapters.at(-1).id,photoId:'missing',expectedVersion:created.version}),/失效/);
});
test('schema 3 升级前备份已有素材和选片，增加章节表',async t=>{
 const f=await fixture(t);setCuration(f.db,{photoId:'one',state:'keep',expectedVersion:0});f.db.exec('DROP TABLE storyboards;DROP TABLE storyboard_history;PRAGMA user_version=3');
 const upgraded=openStore(f.data);assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,7);assert.equal(library(upgraded).photos.length,4);assert.equal(library(upgraded).photos.find(p=>p.id==='one').curation.state,'keep');assert.deepEqual(readStoryboard(upgraded).chapters,[]);upgraded.close();assert.equal((await readdir(join(f.data,'snapshots'))).filter(p=>p.startsWith('before-schema-4-')).length,1);
});

test('独立候选方案可复用照片，编辑和撤销按方案隔离；旧主草稿与选片不变',async t=>{
 const{db,data}=await fixture(t);const main=proposeStoryboard(db,{expectedVersion:0,chapters:suggested()});const before=readStoryboard(db);
 const draft=proposeStoryboard(db,{boardId:'family-204',name:'家人纪念候选',expectedVersion:0,chapters:suggested()});
 assert.equal(draft.boardId,'family-204');assert.deepEqual(readStoryboard(db),before);assert.equal(library(db).storyboards.length,2);
 assert.throws(()=>undoStoryboard(db,{boardId:'family-204',undoId:main.undoId,expectedVersion:draft.version}),/其他方案/);
 const b=readStoryboard(db,'family-204');const edit=editStoryboard(db,{boardId:b.id,expectedVersion:b.version,op:'rename',chapterId:b.chapters[0].id,title:'天安门｜家人的纪念照'});
 assert.equal(readStoryboard(db,'family-204').chapters[0].title,'天安门｜家人的纪念照');assert.deepEqual(readStoryboard(db),before);
 assert.throws(()=>proposeStoryboard(db,{boardId:'family-204',expectedVersion:edit.version,chapters:suggested()}),/覆盖/);
 assert.throws(()=>editStoryboard(db,{boardId:'missing',expectedVersion:0,op:'create',title:'x'}),/不存在/);
 undoStoryboard(db,{boardId:'family-204',undoId:edit.undoId,expectedVersion:edit.version});assert.equal(readStoryboard(db,'family-204').chapters[0].title,b.chapters[0].title);
 const reopened=openStore(data);assert.equal(readStoryboard(reopened,'family-204').name,'家人纪念候选');assert.deepEqual(readStoryboard(reopened).chapters,before.chapters);assert.ok(library(reopened).photos.every(p=>p.curation.state==='unreviewed'));reopened.close();
});
test('历史主草稿的撤销记录继续可用，不能跨方案使用',async t=>{
 const{db}=await fixture(t);const r=proposeStoryboard(db,{expectedVersion:0,chapters:suggested()});
 db.prepare('UPDATE storyboard_history SET beforeData=? WHERE id=?').run(JSON.stringify({chapters:[]}),r.undoId);
 const restored=undoStoryboard(db,{expectedVersion:r.version,undoId:r.undoId});assert.equal(readStoryboard(db).chapters.length,0);assert.equal(restored.version,2);
});
