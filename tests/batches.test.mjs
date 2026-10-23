import{test}from'node:test';import assert from'node:assert/strict';import{planBatches}from'../packages/analysis/batches.mjs';
test('相似组跨来源合批、不同快照不混组、已分析和人工排除不重复；大组可拆分',()=>{
 const photo=(id,sourceId,snapshotId,group,extra={})=>({id,sourceId,status:'ready',preview:'test.jpg',curation:{state:'unreviewed'},analyses:[],external:{snapshotId,visualGroups:[group],stale:false},...extra});
 const data={sources:[{id:'a'},{id:'b'}],externalCulling:[{id:'a1',payload:{databaseSnapshotHash:'same'}},{id:'b1',payload:{databaseSnapshotHash:'same'}},{id:'a2',payload:{databaseSnapshotHash:'other'}}],photos:[photo('one','a','a1','1'),photo('different','a','a2','1'),photo('two','b','b1','1'),photo('done','a','a1','2',{analyses:[{stale:false}]}),photo('excluded','a','a1','2',{curation:{state:'exclude'}}),photo('stale','a','a1','2',{analyses:[{stale:true}]}),photo('reference-reject','a','a1','2',{external:{snapshotId:'a1',visualGroups:['2'],flag:'exclude'}})]};
 const batches=planBatches(data,{size:2});assert.deepEqual(batches.map(b=>b.ids),[['one','two'],['different'],['stale','reference-reject']]);assert.ok(planBatches(data,{sourceId:'a'}).flatMap(b=>b.ids).every(id=>id!=='two'));
 data.photos=Array.from({length:25},(_,i)=>photo(String(i),'a','a1','large'));assert.deepEqual(planBatches(data).map(b=>b.ids.length),[12,12,1]);assert.equal(new Set(planBatches(data).flatMap(b=>b.ids)).size,25);
 assert.throws(()=>planBatches(data,{size:21}),/大小/);assert.throws(()=>planBatches(data,{sourceId:'missing'}),/来源/);
});
