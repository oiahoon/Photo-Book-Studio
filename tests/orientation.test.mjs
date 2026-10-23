import{test}from'node:test';
import assert from'node:assert/strict';
import{mkdtemp,mkdir,writeFile,readFile,rm,realpath}from'node:fs/promises';
import{join}from'node:path';import{tmpdir}from'node:os';import jpeg from'jpeg-js';
import{openStore,library}from'../packages/domain/store.mjs';
import{hashFile,importDirectory}from'../packages/metadata/importer.mjs';
import{rotatePhoto,undoRotation}from'../packages/metadata/orientation.mjs';
import{createTask,importAnalysis}from'../packages/analysis/tasks.mjs';
import{setCuration}from'../packages/domain/curation.mjs';

test('项目旋转可恢复、保留原片和选片；旧任务拒绝新预览、并发撤销拒绝覆盖，损坏缓存重建仍保留方向',{skip:process.platform!=='darwin'},async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'pbs-orientation-'))),source=join(root,'source'),data=join(root,'data');await mkdir(source);
 const pixels=Buffer.alloc(4*80*40);for(let y=0;y<40;y++)for(let x=0;x<80;x++){const p=(y*80+x)*4;pixels[p]=x<40?240:20;pixels[p+1]=y<20?180:40;pixels[p+2]=70;pixels[p+3]=255;}
 const original=join(source,'photo.jpg');await writeFile(original,jpeg.encode({width:80,height:40,data:pixels},90).data);
 const hash=await hashFile(original),db=openStore(data);t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});await importDirectory(db,data,source,5);
 const p=library(db).photos[0],base=await readFile(join(data,'cache',p.preview)),baseSize=jpeg.decode(base);setCuration(db,{photoId:p.id,state:'keep',expectedVersion:0});const oldTask=await createTask(db,data,[p.id]);
 const r=await rotatePhoto(db,data,{photoId:p.id,rotation:90,expectedVersion:0,origin:'Codex',reason:'测试方向，不是真实分析'});assert.equal(r.version,1);
 let rotated=library(db).photos[0];const image=jpeg.decode(await readFile(join(data,'cache',rotated.preview)));assert.equal(image.width,baseSize.height);assert.equal(image.height,baseSize.width);assert.equal(rotated.curation.state,'keep');assert.equal(rotated.adjustment.origin,'Codex');assert.equal(await hashFile(original),hash);
 assert.deepEqual(await readFile(oldTask.photos[0].previewPath),base);
 const oldResult={taskId:oldTask.taskId,analyst:'Codex',model:'test-only',promptVersion:oldTask.promptVersion,results:oldTask.photos.map(p=>({...p,summary:'测试',composition:'测试',bookRole:'测试',tags:[],cautions:[],uncertainties:[]}))};await assert.rejects(importAnalysis(db,data,oldResult),/失效/);
 await assert.rejects(rotatePhoto(db,data,{photoId:p.id,rotation:0,expectedVersion:0}),/已变化/);
 const manual=await rotatePhoto(db,data,{photoId:p.id,rotation:180,expectedVersion:1});
 await assert.rejects(rotatePhoto(db,data,{photoId:p.id,rotation:270,expectedVersion:2,origin:'Codex',reason:'测试'}),/手工调整/);
 await undoRotation(db,data,{photoId:p.id,expectedVersion:manual.version,undoId:manual.undoId});assert.equal(library(db).photos[0].previewHash,rotated.previewHash);assert.equal(library(db).photos[0].adjustment.origin,'Codex');
 await assert.rejects(undoRotation(db,data,{photoId:p.id,expectedVersion:manual.version,undoId:manual.undoId}),/已变化/);
 await writeFile(join(data,'cache',rotated.preview),'broken');const imported=await importDirectory(db,data,source,5);assert.equal(imported.errors.length,0);rotated=library(db).photos[0];assert.equal(rotated.adjustment.rotation,90);assert.equal(jpeg.decode(await readFile(join(data,'cache',rotated.preview))).width,baseSize.height);
 const reopened=openStore(data);assert.equal(library(reopened).photos[0].adjustment.rotation,90);reopened.close();
 await rotatePhoto(db,data,{photoId:p.id,rotation:0,expectedVersion:rotated.adjustment.version});const restored=library(db).photos[0];assert.equal(restored.previewHash,restored.adjustment.baseHash);assert.equal(await hashFile(original),hash);
 await assert.rejects(rotatePhoto(db,data,{photoId:p.id,rotation:45,expectedVersion:0}),/参数/);
});
