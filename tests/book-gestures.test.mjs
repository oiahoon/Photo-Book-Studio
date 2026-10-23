import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(await readFile(new URL('../apps/web/src/book-gestures.ts',import.meta.url),'utf8'));
const{createWheelPager,dragPageStep}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sample=(time,deltaX,deltaY=0,rest={})=>({time,deltaX,deltaY,deltaMode:0,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,...rest});
test('横向滚动累计阈值；一次滑动与惯性只翻一页，停顿后才开始下一次',()=>{
 const p=createWheelPager();assert.deepEqual(p.push(sample(0,35)),{capture:true,step:0});assert.equal(p.push(sample(16,50)).step,1);
 for(let time=32;time<1000;time+=16)assert.equal(p.push(sample(time,40)).step,0);
 assert.equal(p.push(sample(1300,90)).step,1);assert.equal(p.push(sample(1600,-85)).step,-1);
});
test('纵向、近似对角、缩放和系统修饰键不拦截；Shift加滚轮可翻页',()=>{
 const p=createWheelPager();for(const e of [sample(0,0,100),sample(0,100,100),sample(0,100,0,{ctrlKey:true}),sample(0,100,0,{metaKey:true}),sample(0,100,0,{altKey:true})])assert.deepEqual(p.push(e),{capture:false,step:0});
 assert.deepEqual(p.push(sample(0,0,90,{shiftKey:true})),{capture:true,step:1});
 assert.equal(p.push(sample(300,-90,0,{shiftKey:true})).step,-1);
});
test('方向抖动不累加成误翻，行和页单位标准化',()=>{
 const p=createWheelPager();p.push(sample(0,50));assert.equal(p.push(sample(10,-35)).step,0);assert.equal(p.push(sample(20,50)).step,0);assert.equal(p.push(sample(30,30)).step,1);
 assert.equal(p.push(sample(400,-5,0,{deltaMode:1})).step,-1);assert.equal(p.push(sample(700,1,0,{deltaMode:2})).step,1);
});
test('拖动需明确横向位移，轻点、竖拖和斜拖不翻页',()=>{
 assert.equal(dragPageStep(-64,0),1);assert.equal(dragPageStep(90,12),-1);assert.equal(dragPageStep(63,0),0);assert.equal(dragPageStep(12,90),0);assert.equal(dragPageStep(80,75),0);
});
