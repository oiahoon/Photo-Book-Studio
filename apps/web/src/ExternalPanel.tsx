import { Layers3,Flag,Images } from 'lucide-react';
import type { Library } from './types';
export function ExternalPanel({data,busy,importSamples,showGroup}:{data:Library;busy:boolean;importSamples:(path:string,paths:string[])=>void;showGroup:(snapshotId:string,groupId:string)=>void}) {
  if(!data.externalCulling.length)return <div className="empty-library"><Layers3 size={40}/><h2>带上已有的选片线索</h2><p>支持从关闭后的 Excire 数据库生成只读快照，<br/>导入筛选和分组，不改写原片与手工决定。</p></div>;
  return <div className="external-list">{data.externalCulling.map(snapshot=>{
    const entries=snapshot.payload.entries,rejected=entries.filter(e=>e.flag==='exclude'),groups=snapshot.payload.groups.filter(g=>g.rawType===3);
    const related=data.externalCulling.filter(s=>s.payload.databaseSnapshotHash===snapshot.payload.databaseSnapshotHash);
    const globalMembers=(id:string)=>new Set(related.flatMap(s=>s.payload.groups.filter(g=>g.rawType===3&&g.id===id).flatMap(g=>g.members)));
    const filteredRaw=entries.filter(e=>/\.3fr$/i.test(e.relativePath)&&data.photos.some(p=>p.status==='ready'&&p.preview&&/\.(jpe?g|heic|heif)$/i.test(p.relativePath)&&data.sources.find(s=>s.id===p.sourceId)?.path===snapshot.sourceRoot&&p.relativePath.replace(/\.[^.]+$/,'')===e.relativePath.replace(/\.3fr$/i,'')));
    const matching=data.photos.filter(p=>p.external?.snapshotId===snapshot.id&&!p.external.stale);
    const missingRejected=rejected.filter(e=>!filteredRaw.some(p=>p.relativePath===e.relativePath)&&!data.photos.some(p=>p.external?.snapshotId===snapshot.id&&p.external.externalId===e.externalId&&!p.external.stale));
    return <section key={snapshot.id} className="external-section"><div className="external-title"><div><h2>{snapshot.provider}</h2><p className="muted">只读快照 · {new Date(snapshot.createdAt).toLocaleString('zh-CN')}</p></div><span className="external-source">外部参考</span></div><p className="external-path">{snapshot.sourceRoot}</p>
      <div className="external-stats"><div><Images size={18}/><strong>{entries.length}</strong><span>登记文件</span></div><div><Layers3 size={18}/><strong>{groups.length}</strong><span>视觉相似组</span></div><div><Flag size={18}/><strong>{rejected.length}</strong><span>标记排除</span></div></div>
      <p className="external-explanation">已匹配素材库 {matching.length} 个可见文件{filteredRaw.length?`，${filteredRaw.length} 个配对 RAW 已过滤`:''}。外部排除标记不会改变“我的选片”。</p>
      <div className="section-heading"><h3>先复核被排除的照片</h3>{!!missingRejected.length&&<button disabled={busy} onClick={()=>importSamples(snapshot.sourceRoot,missingRejected.slice(0,20).map(e=>e.relativePath))}>导入排除样本（{Math.min(missingRejected.length,20)} 个文件）</button>}</div>
      <div className="external-files">{rejected.map(e=><div key={e.externalId}><span>{e.relativePath}</span><span>{filteredRaw.some(p=>p.relativePath===e.relativePath)?'同名成片可用，RAW 已过滤':!e.sourceHash?'原片未连接':data.photos.some(p=>p.external?.externalId===e.externalId&&p.external.snapshotId===snapshot.id&&!p.external.stale)?'已在素材库':'尚未导入'}</span></div>)}</div>
      <div className="section-heading"><h3>相似组参考</h3><span className="muted">仅显示有多张成员的组，包含跨来源成员</span></div><div className="group-list">{groups.filter(g=>globalMembers(g.id).size>1).map((g,i)=>{
        const members=globalMembers(g.id);
        const present=data.photos.filter(p=>p.external&&related.some(s=>s.id===p.external?.snapshotId)&&!p.external.stale&&members.has(p.external.externalId)).length;
        return <button key={g.id} aria-label={`查看相似组 ${i+1}，共 ${members.size} 个文件，已导入 ${present} 个`} disabled={!present} onClick={()=>showGroup(snapshot.id,g.id)}><span>相似组 {i+1}{members.size>g.members.length?' · 跨来源':''}</span><span>{members.size} 个文件 · {present} 个已导入</span></button>;
      })}</div><details className="workflow-help"><summary>数据范围</summary><p>仅迁移已核对的标记与分组。不读取人脸身份、GPS 或私有特征向量；未标记不等于保留。</p></details>
    </section>;
  })}</div>;
}
