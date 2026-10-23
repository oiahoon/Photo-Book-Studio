import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

async function client(){
 const source=await readFile(new URL('../apps/web/src/api.ts',import.meta.url),'utf8');
 const outputText=stripTypeScriptTypes(source);
 return import(`data:text/javascript;base64,${Buffer.from(outputText+'\n// '+Math.random()).toString('base64')}`);
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('未变化轮询复用结果，编辑后的新结果及时可见，会话只建立一次',async t=>{
 let sessions=0,revision=1;
 t.mock.method(globalThis,'fetch',async url=>url==='/api/session'?(sessions++,json({token:'test'})):json({photos:[{id:revision}],storyboard:{version:revision}}));
 const {api}=await client();
 const [first,second]=await Promise.all([api('library'),api('library')]);
 assert.equal(sessions,1);assert.equal(first,second);
 assert.equal(await api('library'),first);
 revision=2;const changed=await api('library');
 assert.notEqual(changed,first);assert.equal(changed.storyboard.version,2);
 assert.equal(await api('library'),changed);
});
test('断线和鉴权错误不被缓存，下一次操作能重新建立会话',async t=>{
 let sessions=0,fail=false;
 t.mock.method(globalThis,'fetch',async url=>url==='/api/session'?(sessions++,json({token:'test'})):fail?json({error:'会话过期'},401):json({photos:[]}));
 const {api}=await client();await api('library');fail=true;
 await assert.rejects(api('library'),/会话过期/);fail=false;
 assert.deepEqual(await api('library'),{photos:[]});assert.equal(sessions,2);
});
test('条件轮询的 304 复用已保存结果，写入后的新版本取代缓存',async t=>{
 let changed=false;const requests=[];
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  if(url==='/api/session')return json({token:'test'});
  requests.push(options.headers);
  if(options.headers['If-None-Match']==='"v1"'&&!changed)return new Response(null,{status:304});
  return new Response(JSON.stringify({version:changed?2:1}),{headers:{ETag:changed?'"v2"':'"v1"'}});
 });
 const {api}=await client();const first=await api('library');assert.equal(await api('library'),first);
 assert.equal(requests[1]['If-None-Match'],'"v1"');changed=true;
 assert.deepEqual(await api('library'),{version:2});await api('library');assert.equal(requests.at(-1)['If-None-Match'],'"v2"');
});
