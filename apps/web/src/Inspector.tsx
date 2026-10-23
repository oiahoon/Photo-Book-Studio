import{VisualStudy}from'./VisualStudy';
import { useState } from 'react';
import type { Analysis, Photo, CurationState } from './types';
import { Icon } from './Icon';
import { CurationControl } from './CurationControl';
import { RotateCcw, RotateCw, Maximize2, RefreshCw } from 'lucide-react';
import { Hint, Disclosure } from './ui';
import {PeopleEditor} from './PeopleEditor';
import type {PersonId} from './types';
import {LocationEditor} from './LocationEditor';

const decisions = { suggested:'待确认', accepted:'已接受', rejected:'已拒绝' };
export type InspectorProps = {photo?:Photo;busy:boolean;prepare:()=>void;decide:(id:string,decision:Analysis['decision'])=>void;curate:(state:CurationState)=>void;rotate:(rotation:number)=>void;savePeople:(ids:PersonId[],clear?:boolean)=>void;saveLocation:(city:string,site:string)=>void;compact?:boolean;openPreview?:()=>void};

export function Inspector({photo,busy,prepare,decide,curate,rotate,saveLocation,savePeople,compact=false,openPreview}:InspectorProps) {
  const [historyId,setHistoryId]=useState('');
  const analysis=photo?.analyses.find(a=>a.id===historyId)||photo?.analyses[0];
  if(!photo)return <aside className="inspector" aria-label="照片与分析"><div className="inspector-empty"><Icon name="library" size={32}/><h2>选择一张照片</h2></div></aside>;
  return <aside className={`inspector ${compact?'inspector-compact':''}`} aria-label="照片与分析">
    {!compact&&<><div className="inspector-file"><strong title={photo.relativePath}>{photo.relativePath}</strong><span>{photo.format}</span></div>
      {photo.preview?<button className="preview-link" onClick={openPreview} aria-label="打开大图选片"><img decoding="async" className="large-preview" src={`/previews/${photo.preview}?v=${photo.previewHash}`} alt={photo.relativePath}/><span><Maximize2 size={15}/>大图选片</span></button>:<div className="unsupported">此格式暂不生成预览</div>}
    </>}
    <CurationControl state={photo.curation.state} disabled={busy} onChange={curate}/>
    <PeopleEditor key={`people:${photo.id}`} photo={photo} busy={busy} save={savePeople}/>
    <LocationEditor key={`${photo.id}:${photo.location.version}`} photo={photo} busy={busy} save={saveLocation}/>
    {photo.external&&(photo.external.stale||photo.external.flag==='exclude')&&<p className="reference-warning">{photo.external.stale?'Excire 参考已过期': 'Excire 标记排除 · 请人工复核'}</p>}
    <div className="analysis-heading"><h2>Codex 建议</h2><Hint label={analysis?'准备新的分析任务':'准备分析任务'}><button className="icon-button" aria-label={analysis?'重新分析':'准备分析'} disabled={busy||!photo.preview} onClick={prepare}><RefreshCw size={15}/></button></Hint></div>
    {analysis?<>
      {analysis.stale&&<p className="banner error">旧预览的分析，请重新分析。</p>}
      <section className="observation primary-observation"><p>{analysis.result.summary}</p></section>
      <section className="observation book-role"><h3>成书用途</h3><p>{analysis.result.bookRole}</p></section>
      {analysis.result.visualStudy&&<VisualStudy study={analysis.result.visualStudy}/>}
      <Disclosure title="构图细节"><p>{analysis.result.composition}</p><div className="tags">{analysis.result.tags.map(tag=><span key={tag}>{tag}</span>)}</div></Disclosure>
      {!!analysis.result.cautions.length&&<Disclosure title={`使用时留意 · ${analysis.result.cautions.length}`}><ul>{analysis.result.cautions.map((v,i)=><li key={i}>{v}</li>)}</ul></Disclosure>}
      {!!analysis.result.uncertainties.length&&<Disclosure title={`仍需确认 · ${analysis.result.uncertainties.length}`}><ul>{analysis.result.uncertainties.map((v,i)=><li key={i}>{v}</li>)}</ul></Disclosure>}
    </>:<p className="no-analysis muted">暂无分析</p>}
    <Disclosure title="方向与文件"><div className="photo-meta"><span>{photo.width&&photo.height?`${photo.width} × ${photo.height}`:'尺寸未读取'}</span><span>{(photo.bytes/1024/1024).toFixed(1)} MB</span></div>
      {photo.preview&&<div className="orientation-controls" aria-label="照片方向"><span>{photo.adjustment.rotation?`已旋转 ${photo.adjustment.rotation}°`:'原始显示'}</span><Hint label="向左旋转 90°，原片不变"><button className="icon-button" aria-label="向左旋转照片" disabled={busy} onClick={()=>rotate((photo.adjustment.rotation+270)%360)}><RotateCcw size={17}/></button></Hint><Hint label="向右旋转 90°，原片不变"><button className="icon-button" aria-label="向右旋转照片" disabled={busy} onClick={()=>rotate((photo.adjustment.rotation+90)%360)}><RotateCw size={17}/></button></Hint>{photo.adjustment.rotation!==0&&<button className="text-button" disabled={busy} onClick={()=>rotate(0)}>恢复方向</button>}</div>}
    </Disclosure>
    {analysis&&<Disclosure title={`分析确认 · ${decisions[analysis.decision]}`}><div className="decision-state"><span>{new Date(analysis.createdAt).toLocaleDateString('zh-CN')}</span></div><div className="decision-actions"><button disabled={busy||analysis.stale||analysis.decision==='accepted'} onClick={()=>decide(analysis.id,'accepted')}>接受建议</button><button disabled={busy||analysis.stale||analysis.decision==='rejected'} onClick={()=>decide(analysis.id,'rejected')}>拒绝建议</button></div>{analysis.decision!=='suggested'&&<button className="text-button" disabled={busy||analysis.stale} onClick={()=>decide(analysis.id,'suggested')}>恢复为待确认</button>}</Disclosure>}
    <Disclosure title="来源与历史">{photo.external&&<div className="external-observation"><p>{photo.external.stale?'照片内容与快照不一致':photo.external.flag==='exclude'?'Excire 排除（独立于我的选片）':photo.external.flag==='unmarked'?'Excire 未标记（不等于保留）':`未知标记 ${photo.external.rawFlag}`}</p><span>{photo.external.visualGroups.length} 个视觉相似组</span></div>}
      {analysis&&<><p>{analysis.analyst} · {analysis.model} · {analysis.promptVersion}</p>{photo.analyses.length>1&&<label className="history-label">分析历史<select value={analysis.id} onChange={e=>setHistoryId(e.target.value)}>{photo.analyses.map((a,i)=><option key={a.id} value={a.id}>第 {photo.analyses.length-i} 次 · {decisions[a.decision]}</option>)}</select></label>}<p>原片 SHA-256</p><code>{analysis.sourceHash}</code><p>预览 SHA-256</p><code>{analysis.previewHash}</code></>}
    </Disclosure>
  </aside>;
}
