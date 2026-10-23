import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { openStore, library } from '../packages/domain/store.mjs';
import { hashFile, importDirectory, validateSource, validatePreview } from '../packages/metadata/importer.mjs';
import jpeg from 'jpeg-js';
import { createTask, importAnalysis } from '../packages/analysis/tasks.mjs';
import { createApp } from '../apps/local-service/server.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(),'photo-book-test-'));
  const data = join(dir,'project'), source = join(dir,'photos');
  await mkdir(source); const db = openStore(data);
  t.after(async()=>{ db.close(); await rm(dir,{recursive:true,force:true}); });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=', 'base64');
  await writeFile(join(source,'photo.png'), png);
  return { dir, data, source, db, png };
}
function result(task, overrides={}) {
  return {taskId:task.taskId,analyst:'Codex',model:'test-only',promptVersion:task.promptVersion,
    results:task.photos.map(p=>({...p,summary:'测试结果，不是真实分析',composition:'测试构图',bookRole:'测试用途',tags:['测试'],cautions:[],uncertainties:[]})),...overrides};
}

test('来源隔离、同名文件、幂等导入、原片不变与符号链接跳过', {skip:process.platform!=='darwin'}, async t=>{
  const f=await fixture(t);
  await mkdir(join(f.source,'nested')); await copyFile(join(f.source,'photo.png'),join(f.source,'nested','photo.png'));
  await symlink(join(f.source,'photo.png'),join(f.source,'link.png'));
  await writeFile(join(f.source,'raw.3fr'),'RAW fixture');
  const before=await hashFile(join(f.source,'photo.png'));
  const first=await importDirectory(f.db,f.data,f.source,10);
  assert.equal(first.imported,2); assert.equal(first.registered,1); assert.equal(first.skippedSymlinks,1);
  assert.equal(new Set(library(f.db).photos.map(p=>p.id)).size,3);
  const second=await importDirectory(f.db,f.data,f.source,10);
  assert.equal(second.unchanged,2); assert.equal(library(f.db).photos.length,3);
  assert.equal(await hashFile(join(f.source,'photo.png')),before);
  await assert.rejects(validateSource(f.dir,f.data),/不能包含/);
  await assert.rejects(validateSource(join(f.data,'cache'),f.data),/不能包含/);
});

test('分析任务写回、幂等、拒绝错误哈希与批次原子性、结果保留', {skip:process.platform!=='darwin'}, async t=>{
  const f=await fixture(t); await importDirectory(f.db,f.data,f.source,3);
  const photo=library(f.db).photos[0]; const task=await createTask(f.db,f.data,[photo.id]);
  const bad=result(task); bad.results[0].sourceHash='wrong';
  await assert.rejects(importAnalysis(f.db,f.data,bad),/哈希/);
  assert.equal(library(f.db).photos[0].analyses.length,0);
  const good=result(task);
  assert.deepEqual(await importAnalysis(f.db,f.data,good),{imported:1,unchanged:0});
  assert.deepEqual(await importAnalysis(f.db,f.data,good),{imported:0,unchanged:1});
  good.results[0].summary='不允许覆盖旧结果';
  await assert.rejects(importAnalysis(f.db,f.data,good),/创建新任务/);
  const a=library(f.db).photos[0].analyses[0];
  f.db.prepare('UPDATE analyses SET decision=? WHERE id=?').run('accepted',a.id);
  const reopened=openStore(f.data); assert.equal(library(reopened).photos[0].analyses[0].decision,'accepted'); reopened.close();
  const second=await createTask(f.db,f.data,[photo.id]);
  await writeFile(join(f.source,'photo.png'),Buffer.concat([f.png,Buffer.from('changed')]));
  await assert.rejects(importAnalysis(f.db,f.data,result(second)),/内容已变化/);
  const next=await importDirectory(f.db,f.data,f.source,3);
  assert.equal(next.imported,1); assert.notEqual(library(f.db).photos[0].id,photo.id);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM analyses').get().n,1);
});

test('损坏预览被拒绝并可重建；缺图不接受分析；批次不部分写入', {skip:process.platform!=='darwin'}, async t=>{
  const f=await fixture(t); await copyFile(join(f.source,'photo.png'),join(f.source,'second.png'));
  await importDirectory(f.db,f.data,f.source,10);
  const photos=library(f.db).photos; const task=await createTask(f.db,f.data,photos.map(p=>p.id));
  await writeFile(join(f.data,'cache',photos[1].preview),'corrupted');
  await assert.rejects(importAnalysis(f.db,f.data,result(task)),/缓存已变化/);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM analyses').get().n,0);
  await importDirectory(f.db,f.data,f.source,10);
  await rm(join(f.source,photos[0].relativePath));
  await assert.rejects(createTask(f.db,f.data,[photos[0].id]));
  assert.equal(library(f.db).photos.length,2);
});

test('导入限制与取消，不回滚已完成的照片', {skip:process.platform!=='darwin'}, async t=>{
  const f=await fixture(t); await copyFile(join(f.source,'photo.png'),join(f.source,'second.png'));
  const limited=await importDirectory(f.db,f.data,f.source,1); assert.equal(limited.limited,true); assert.equal(limited.scanned,1);
  let cancelled=false;
  const stopped=await importDirectory(f.db,f.data,f.source,10,()=>{cancelled=true;},()=>cancelled);
  assert.equal(stopped.cancelled,true); assert.equal(library(f.db).photos.length,1);
});

test('HTTP 会话、同源与 Host 防护，API 默认拒绝未授权调用',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'photo-http-')); const app=await createApp({dataDir:dir,port:0});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(`${base}/api/library`)).status,401);
  assert.equal((await fetch(`${base}/api/session`,{headers:{origin:'https://example.com'}})).status,403);
  const badHostStatus=await new Promise((resolve,reject)=>{http.get(`${base}/api/session`,{headers:{host:'example.com'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
  assert.equal(badHostStatus,403);
  const session=await (await fetch(`${base}/api/session`)).json();
  const headers={'x-project-token':session.token,'Content-Type':'application/json'};
  const initial=await fetch(`${base}/api/library`,{headers});assert.equal(initial.status,200);
  const etag=initial.headers.get('etag');assert.ok(etag);await initial.json();
  const conditional={...headers,'If-None-Match':etag};
  const unchanged=await fetch(`${base}/api/library`,{headers:conditional});assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
  assert.equal((await fetch(`${base}/api/library`,{headers:{'If-None-Match':etag}})).status,401);
  const external=openStore(dir);external.prepare('INSERT INTO sources VALUES(?,?,?,?)').run('external','/tmp/readonly-source','独立导入',new Date().toISOString());external.close();
  const cliChanged=await fetch(`${base}/api/library`,{headers:conditional});assert.equal(cliChanged.status,200);assert.notEqual(cliChanged.headers.get('etag'),etag);assert.equal((await cliChanged.json()).sources.length,1);
  const beforeEdit=await fetch(`${base}/api/library`,{headers});const beforeEditTag=beforeEdit.headers.get('etag');await beforeEdit.json();
  const created=await fetch(`${base}/api/storyboard`,{method:'POST',headers,body:JSON.stringify({op:'create',title:'中文章节',expectedVersion:0})});assert.equal(created.status,200);const edit=await created.json();
  const edited=await fetch(`${base}/api/library`,{headers:{...headers,'If-None-Match':beforeEditTag}});assert.equal(edited.status,200);assert.notEqual(edited.headers.get('etag'),beforeEditTag);assert.equal((await edited.json()).storyboard.chapters[0].title,'中文章节');
  assert.equal((await fetch(`${base}/api/storyboard`,{method:'POST',headers,body:JSON.stringify({op:'create',title:'旧版本',expectedVersion:0})})).status,400);
  assert.equal((await fetch(`${base}/api/storyboard/undo`,{method:'POST',headers,body:JSON.stringify({expectedVersion:edit.version,undoId:edit.undoId})})).status,200);
  assert.equal((await (await fetch(`${base}/api/library`,{headers})).json()).storyboard.chapters.length,0);
  assert.equal((await fetch(`${base}/api/analysis/decision`,{method:'POST',headers,body:JSON.stringify({id:'none',decision:'delete'})})).status,400);
  assert.equal((await fetch(`${base}/previews/..%2fproject.sqlite`)).status,404);
});

test('拒绝全黑解码产物，不将转换失败当作有效分析输入',async t=>{
  const f=await fixture(t); const path=join(f.dir,'black.jpg');
  const raw={data:Buffer.from([0,0,0,255,0,0,0,255]),width:2,height:1};
  await writeFile(path,jpeg.encode(raw,80).data);
  await assert.rejects(validatePreview(path),/预览全黑/);
});
