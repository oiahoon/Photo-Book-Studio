import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(await readFile(new URL('../apps/web/src/book-filmstrip.ts',import.meta.url),'utf8'));
const{filmstripRange,filmstripWheel,FILMSTRIP_STRIDE}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('全书胶片条在开头中间末尾只加载可见范围及缓冲，所有跨页可达',()=>{
 for(const count of [1,232,1001])for(const width of [800,1280,1878])for(let i=0;i<count;i++){
  const left=Math.max(0,Math.min(i*FILMSTRIP_STRIDE,count*FILMSTRIP_STRIDE-width)),{start,end}=filmstripRange(left,width,count);
  assert(start>=0&&end<=count&&start<=end);assert(end-start<=Math.ceil(width/FILMSTRIP_STRIDE)+7);assert(i>=start&&i<end);
 }
 assert.deepEqual(filmstripRange(0,1000,0),{start:0,end:0});
});
test('胶片条将普通滚轮、横向滑动、行与页单位映射为连续滚动，缩放透传',()=>{
 const sample={deltaX:0,deltaY:90,deltaMode:0,ctrlKey:false,metaKey:false,altKey:false};
 assert.equal(filmstripWheel(sample,1000),90);assert.equal(filmstripWheel({...sample,deltaX:-40,deltaY:3},1000),-40);
 assert.equal(filmstripWheel({...sample,deltaY:3,deltaMode:1},1000),48);assert.equal(filmstripWheel({...sample,deltaY:1,deltaMode:2},1000),1000);
 for(const key of ['ctrlKey','metaKey','altKey'])assert.equal(filmstripWheel({...sample,[key]:true},1000),0);
});
