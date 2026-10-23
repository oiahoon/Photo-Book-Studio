import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore,library} from '../packages/domain/store.mjs';
import {setCuration} from '../packages/domain/curation.mjs';
import {importExternalCulling} from '../packages/metadata/external-culling.mjs';
import {importDirectory} from '../packages/metadata/importer.mjs';
import {renderedPhotoKeys,isPairedRaw} from '../packages/domain/photo-policy.mjs';
import jpeg from 'jpeg-js';

async function setup(t){
  const root=await realpath(await mkdtemp(join(tmpdir(),'pbs-curation-'))),source=join(root,'source'),data=join(root,'data');await mkdir(source);
  const db=openStore(data);t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});
  db.prepare('INSERT INTO sources VALUES(?,?,?,?)').run('source',source,'test','now');
  const hash='a'.repeat(64);
  for(const id of ['one','two'])db.prepare('INSERT INTO photos(id,sourceId,relativePath,hash,bytes,format,status,createdAt) VALUES(?,?,?,?,?,?,?,?)').run(id,'source',`${id}.heic`,hash,1,'HEIC','unsupported','now');
  return{root,source,data,db,hash};
}
function manifest(f){return{schemaVersion:1,provider:'Excire Foto',adapterVersion:'excire-observed-5.0.2-v1',sourceRoot:f.source,databaseSnapshotHash:'b'.repeat(64),
  entries:[{externalId:'1',relativePath:'one.heic',sourceHash:f.hash,rawFlag:2,rating:0},{externalId:'2',relativePath:'two.heic',sourceHash:f.hash,rawFlag:0,rating:0}],groups:[{id:'group',rawType:3,members:['1','2']}]};}

test('选片持久化、撤销版本保护、独立于外部状态',async t=>{
  const f=await setup(t);const first=setCuration(f.db,{photoId:'one',state:'keep',expectedVersion:0});assert.equal(first.current.version,1);
  assert.throws(()=>setCuration(f.db,{photoId:'one',state:'exclude',expectedVersion:0}),/已变化/);
  await importExternalCulling(f.db,manifest(f));
  let photo=library(f.db).photos.find(p=>p.id==='one');assert.equal(photo.curation.state,'keep');assert.equal(photo.external.flag,'exclude');
  const reopened=openStore(f.data);assert.equal(library(reopened).photos.find(p=>p.id==='one').curation.state,'keep');reopened.close();
  setCuration(f.db,{photoId:'one',state:first.previous.state,expectedVersion:1});assert.equal(library(f.db).photos.find(p=>p.id==='one').curation.state,'unreviewed');
  assert.throws(()=>setCuration(f.db,{photoId:'one',state:'delete',expectedVersion:2}),/格式/);
});

test('外部清单幂等、不把未标记当保留、哈希不匹配明确过期',async t=>{
  const f=await setup(t),input=manifest(f);
  const first=await importExternalCulling(f.db,input),again=await importExternalCulling(f.db,input);assert.equal(again.id,first.id);assert.equal(again.unchanged,true);
  const photo=library(f.db).photos.find(p=>p.id==='two');assert.equal(photo.curation.state,'unreviewed');assert.equal(photo.external.flag,'unmarked');assert.equal(photo.external.stale,false);
  f.db.prepare('UPDATE photos SET hash=? WHERE id=?').run('c'.repeat(64),'two');assert.equal(library(f.db).photos.find(p=>p.id==='two').external.stale,true);
  const invalid=structuredClone(input);invalid.entries[0].relativePath='../secret.heic';await assert.rejects(importExternalCulling(f.db,invalid),/越界/);
  const duplicate=structuredClone(input);duplicate.entries[1].externalId='1';await assert.rejects(importExternalCulling(f.db,duplicate),/重复/);
  const badGroup=structuredClone(input);badGroup.groups[0].members.push('missing');await assert.rejects(importExternalCulling(f.db,badGroup),/引用/);
  assert.equal(library(f.db).externalCulling.length,1);
});

test('指定样本只导入允许文件，拒绝越界选择，仍不改原片',async t=>{
  const f=await setup(t);await writeFile(join(f.source,'a.3fr'),'a');await writeFile(join(f.source,'b.3fr'),'b');
  const r=await importDirectory(f.db,f.data,f.source,20,()=>{},()=>false,{includePaths:['b.3fr']});assert.equal(r.registered,1);assert.equal(r.scanned,1);
  assert.ok(!library(f.db).photos.some(p=>p.relativePath==='a.3fr'));
  await assert.rejects(importDirectory(f.db,f.data,f.source,20,()=>{},()=>false,{includePaths:['../secret.3fr']}),/无效/);
});

test('schema 1 升级前创建可读备份，保留已有资产',async t=>{
  const f=await setup(t);f.db.exec('PRAGMA user_version=1');
  const migrated=openStore(f.data);assert.equal(migrated.prepare('PRAGMA user_version').get().user_version,7);assert.equal(library(migrated).photos.length,2);migrated.close();
  const backups=(await readdir(join(f.data,'snapshots'))).filter(p=>p.startsWith('before-schema-4-'));assert.equal(backups.length,1);
});

test('JPEG/HEIC 成片优先，配对限定来源与目录；不可预览条目不掩盖 RAW',()=>{
  const keys=renderedPhotoKeys([{sourceId:'a',relativePath:'roll/IMG.JPG',preview:'preview.jpg',status:'ready'},{sourceId:'a',relativePath:'HEIC.HEIC',preview:'preview2.jpg',status:'ready'},{sourceId:'a',relativePath:'missing.jpg',preview:null,status:'unsupported'}]);
  assert.equal(isPairedRaw({sourceId:'a',relativePath:'roll/IMG.3FR'},keys),true);
  assert.equal(isPairedRaw({sourceId:'a',relativePath:'HEIC.3FR'},keys),true);
  assert.equal(isPairedRaw({sourceId:'b',relativePath:'roll/IMG.3FR'},keys),false);
  assert.equal(isPairedRaw({sourceId:'a',relativePath:'other/IMG.3FR'},keys),false);
  assert.equal(isPairedRaw({sourceId:'a',relativePath:'missing.3FR'},keys),false);
});

test('成片导入后隐藏历史 RAW 记录，重复扫描跳过配对 RAW，不删除源文件', {skip:process.platform!=='darwin'},async t=>{
  const f=await setup(t);
  await writeFile(join(f.source,'capture.3FR'),'original RAW');
  await importDirectory(f.db,f.data,f.source,10,()=>{},()=>false,{includePaths:['capture.3FR']});
  const pixels={data:Buffer.from([255,255,255,255,255,255,255,255]),width:2,height:1};
  await writeFile(join(f.source,'capture.JPG'),jpeg.encode(pixels,90).data);
  const imported=await importDirectory(f.db,f.data,f.source,10);
  assert.equal(imported.imported,1);assert.equal(imported.filteredRaw,1);
  const state=library(f.db);assert.equal(state.filteredRaw.length,1);assert.ok(!state.photos.some(p=>p.relativePath==='capture.3FR'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM photos WHERE relativePath=?').get('capture.3FR').n,1);
  assert.equal(await (await import('node:fs/promises')).readFile(join(f.source,'capture.3FR'),'utf8'),'original RAW');
});
