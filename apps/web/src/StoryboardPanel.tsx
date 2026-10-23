import {useMemo,useState,useDeferredValue,useEffect,useRef,type ReactNode} from 'react';
import {ArrowUp,ArrowDown,Plus,Pencil,Trash2,X,BookOpen,ImagePlus,ChevronDown,ArrowLeft,ArrowRight,Check,Layers3} from 'lucide-react';
import type {Chapter,Library,Photo,StoryPhoto} from './types';
import {Modal,Hint,ActionPopover} from './ui';
import './Storyboard.css';
import {PhotoSearch,ResetPhotoFilters} from './PhotoFilters';
import {LocationFilter,locationLabel,locationMatches} from './LocationEditor';

type Props={changeBoard:(id:string)=>void;data:Library;busy:boolean;error:string;selected:string;select:(id:string,scope?:string[])=>void;sources:ReactNode;mutate:(command:Record<string,unknown>,message:string,done?:()=>void)=>void};
const preview=(p:Photo)=>`/previews/${p.preview}?v=${p.previewHash}`;
export function StoryboardPanel({changeBoard,data,busy,error,selected,select,mutate,sources}:Props){
 const root=useRef<HTMLDivElement>(null);
 const [panel,setPanel]=useState<'chapters'|'pool'>('chapters');
 const [moving,setMoving]=useState<{item:StoryPhoto;chapterId:string}|null>(null);
 const [activeChapter,setActiveChapter]=useState('');
 const [editing,setEditing]=useState<Chapter|'new'|null>(null);
 const [search,setSearch]=useState('');
 const deferredSearch=useDeferredValue(search);
 const [pool,setPool]=useState('analyzed');
 const [locationFilter,setLocationFilter]=useState('all');
 const [target,setTarget]=useState('');
 const [visibleCount,setVisibleCount]=useState(48);
 const board=data.storyboard;
 const activeId=board.chapters.some(c=>c.id===activeChapter)?activeChapter:board.chapters[0]?.id;
 const photoMap=useMemo(()=>new Map(data.photos.map(p=>[p.id,p])),[data.photos]);
 const assigned=useMemo(()=>new Set(board.chapters.flatMap(c=>c.photos.map(p=>p.photoId))),[board.chapters]);
 const available=useMemo(()=>data.photos.filter(p=>p.preview&&locationMatches(p,locationFilter)&&!assigned.has(p.id)&&p.curation.state!=='exclude'&&(pool==='all'||(pool==='keep'?p.curation.state==='keep':p.analyses.some(a=>!a.stale&&a.decision!=='rejected')))&&`${p.relativePath} ${locationLabel(p)} ${p.analyses.find(a=>!a.stale)?.result.tags.join(' ')||''}`.toLocaleLowerCase().includes(deferredSearch.toLocaleLowerCase())),[data.photos,locationFilter,assigned,pool,deferredSearch]);
 const targetId=board.chapters.some(c=>c.id===target)?target:activeId||board.chapters[0]?.id||'';
 function openPool(id=activeId){if(id)setTarget(id);setPanel('pool');}
 useEffect(()=>{root.current?.closest('.workspace')?.scrollTo({top:0});},[panel,board.id]);
 function reorderChapter(id:string,direction:'up'|'down'){setActiveChapter(id);mutate({op:'reorderChapter',chapterId:id,direction},'章节顺序已保存。');}
 function warnings(item:StoryPhoto,p?:Photo){
  if(!p)return '原素材版本未连接，编排引用仍保留';
  if(p.hash!==item.sourceHash)return '素材版本已变化，请复核';
  if(p.curation.state==='exclude')return '已手工排除，仍在草稿中';
  if(p.external?.flag==='exclude'&&!p.external.stale)return 'Excire 标记排除，需人工复核';
  if(item.analysisId){const a=p.analyses.find(a=>a.id===item.analysisId);if(!a||a.stale)return '参考分析已过期，请复核';if(a.decision==='rejected')return '参考分析已拒绝，请复核';}
  return '';
 }
 return <div ref={root} className="storyboard-panel"><div className="story-canvas">
  <div className="story-overview"><h1>章节编排</h1><label className="storyboard-variant"><select id="storyboard-variant" aria-label="编排方案" value={board.id} disabled={busy||!!editing||!!moving} onChange={e=>changeBoard(e.target.value)}>{data.storyboards.map(b=><option key={b.id} value={b.id}>{b.name} · {b.chapters.reduce((n,c)=>n+c.photos.length,0)} 张</option>)}</select></label><p className="story-save" role="status">{busy?'保存中…':board.updatedAt?<><Check size={12}/>已保存</>:'本地草稿'}</p><button onClick={()=>setEditing('new')} disabled={busy}><Plus size={15}/>新建章节</button></div>
  <div className="story-toolbar"><div className="story-view-switch" role="group" aria-label="章节视图"><button aria-pressed={panel==='chapters'} onClick={()=>setPanel('chapters')}><BookOpen size={14}/>章节</button><button aria-pressed={panel==='pool'} onClick={()=>openPool()}><Layers3 size={14}/>待安排</button></div>{panel==='pool'&&<span>{available.length} 张待安排</span>}{panel==='chapters'&&<button className="story-add-photos" disabled={!board.chapters.length} onClick={()=>openPool()}><ImagePlus size={14}/>添加照片</button>}</div>
  {!board.chapters.length&&panel==='chapters'&&<div className="story-empty"><BookOpen size={32}/><h2>还没有章节</h2><button onClick={()=>setEditing('new')}>新建第一个章节</button></div>}
  {panel==='chapters'&&<ol className="chapter-list" aria-label="章节顺序">{board.chapters.map((c,ci)=>c.id!==activeId?null:<li className={`chapter ${activeId===c.id?'expanded':'collapsed'}`} id={`chapter-${c.id}`} key={c.id}>
   <header className="chapter-heading"><span className="chapter-number">{String(ci+1).padStart(2,'0')}</span><div className="chapter-title"><h2>{c.title}</h2><span>{c.photos.length} 张</span></div><div className="chapter-actions">
    {c.description&&<details className="chapter-description"><summary>构想</summary><p>{c.description}</p></details>}
    <ActionPopover label={`章节操作 ${c.title}`}><strong>{c.title}</strong><button disabled={busy||ci===0} onClick={()=>reorderChapter(c.id,'up')}><ArrowUp size={16}/>上移章节</button><button disabled={busy||ci===board.chapters.length-1} onClick={()=>reorderChapter(c.id,'down')}><ArrowDown size={16}/>下移章节</button><button disabled={busy} onClick={()=>setEditing(c)}><Pencil size={16}/>编辑章节</button><button className="destructive" disabled={busy} onClick={()=>mutate({op:'removeChapter',chapterId:c.id},'章节已移除，照片仍在素材库中。')}><Trash2 size={16}/>移除章节</button></ActionPopover>
   </div></header>
   {activeId===c.id&&<>
   {!c.photos.length?<div className="chapter-empty"><p>还没有照片</p><button onClick={()=>openPool(c.id)}><ImagePlus size={14}/>添加照片</button></div>:<ol className="chapter-photos" aria-label={`${c.title}的照片顺序`}>{c.photos.map((item,i)=>{
    const p=photoMap.get(item.photoId),warning=warnings(item,p);
    return <li className={`story-photo ${selected===item.photoId?'selected':''}`} key={item.photoId}>
     <button className="story-photo-open" disabled={!p} aria-label={`查看编排照片 ${item.filename}`} aria-pressed={selected===item.photoId} onClick={()=>select(item.photoId,c.photos.filter(item=>photoMap.has(item.photoId)).map(item=>item.photoId))}><div className="story-photo-frame">{p?.preview?<img loading="lazy" decoding="async" src={preview(p)} alt={item.filename}/>:<span>素材版本未连接</span>}</div></button>
     <div className="story-photo-footer"><span className="story-photo-name"><span>{String(i+1).padStart(2,'0')}</span><span title={item.filename}>{item.filename}</span></span><div className="story-photo-adjust"><Hint label="向前一张"><button className="icon-button" aria-label={`前移照片 ${item.filename}`} disabled={busy||i===0} onClick={()=>mutate({op:'reorderPhoto',photoId:item.photoId,direction:'up'},'照片顺序已保存。')}><ArrowLeft size={13}/></button></Hint><Hint label="向后一张"><button className="icon-button" aria-label={`后移照片 ${item.filename}`} disabled={busy||i===c.photos.length-1} onClick={()=>mutate({op:'reorderPhoto',photoId:item.photoId,direction:'down'},'照片顺序已保存。')}><ArrowRight size={13}/></button></Hint><ActionPopover label={`调整照片 ${item.filename}`}><strong>{item.filename}</strong><button disabled={busy||board.chapters.length<2} onClick={()=>setMoving({item,chapterId:c.id})}><Layers3 size={15}/>移至其他章节</button><button className="destructive" aria-label={`移出章节 ${item.filename}`} disabled={busy} onClick={()=>mutate({op:'removePhoto',photoId:item.photoId},'已移出章节，原片不变。')}><X size={15}/>移出章节</button>{item.reason&&<details className="story-placement-reason"><summary>编排依据</summary><p>{item.reason}</p></details>}</ActionPopover></div></div>
     {p&&locationLabel(p)&&<span className="photo-place">{locationLabel(p)}{p.location.status==='suggested'?' · 待确认':''}</span>}{warning&&<p className="story-warning">{warning}</p>}
    </li>;
   })}</ol>}
   </>}{activeId!==c.id&&<ChevronDown className="collapsed-chevron" size={19}/>}
  </li>)}</ol>}
  {panel==='pool'&&<section className="story-pool" id="unassigned-pool" aria-label="未安排素材"><div className="story-pool-filters"><label className="pool-destination">加入到<select aria-label="加入的目标章节" disabled={!board.chapters.length} value={targetId} onChange={e=>{setTarget(e.target.value);setActiveChapter(e.target.value);}}>{!board.chapters.length&&<option value="">请先新建章节</option>}{board.chapters.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><div className="pool-filter-row"><label><span className="sr-only">范围</span><select aria-label="筛选未安排素材" value={pool} onChange={e=>{setPool(e.target.value);setVisibleCount(48);}}><option value="analyzed">有当前分析</option><option value="keep">我的保留</option><option value="all">全部可用成片</option></select></label><LocationFilter photos={data.photos} value={locationFilter} onChange={value=>{setLocationFilter(value);setVisibleCount(48);}}/><PhotoSearch label="搜索未安排素材" value={search} onChange={value=>{setSearch(value);setVisibleCount(48);}}/></div>{(pool!=='analyzed'||locationFilter!=='all'||search)&&<ResetPhotoFilters reset={()=>{setPool('analyzed');setLocationFilter('all');setSearch('');setVisibleCount(48);}}/>}</div>
   {!available.length?<p className="chapter-empty">没有匹配的待安排照片</p>:<div className="pool-photos">{available.slice(0,visibleCount).map(p=><article className="pool-photo" key={p.id}><button className="story-photo-open" aria-label={`查看未安排照片 ${p.relativePath}`} onClick={()=>select(p.id,available.map(p=>p.id))}><div className="story-photo-frame"><img loading="lazy" decoding="async" src={preview(p)} alt={p.relativePath}/></div><span className="story-photo-name">{p.relativePath}</span>{locationLabel(p)&&<span className="photo-place">{locationLabel(p)}{p.location.status==='suggested'?' · 待确认':''}</span>}</button><button className="add-to-chapter" disabled={busy||!targetId} onClick={()=>mutate({op:'addPhoto',photoId:p.id,chapterId:targetId},'照片已加入章节，选片状态保持不变。')}><ImagePlus size={14}/>加入</button></article>)}</div>}{available.length>visibleCount&&<div className="load-more"><button onClick={()=>setVisibleCount(n=>n+48)}>显示更多</button><span>{Math.min(visibleCount,available.length)} / {available.length}</span></div>}
  </section>}
  </div><aside className="chapter-index" aria-label="章节索引"><div className="chapter-index-heading"><h2>章节</h2><span>{board.chapters.length} 章 · {assigned.size} 张</span></div><ol>{board.chapters.map((c,ci)=><li key={c.id} className={activeId===c.id?'current':''}><button className="chapter-index-link" aria-current={activeId===c.id?'true':undefined} onClick={()=>{setActiveChapter(c.id);if(panel==='pool'){setTarget(c.id);return;}root.current?.closest('.workspace')?.scrollTo({top:0});}}><span>{String(ci+1).padStart(2,'0')}</span><div><strong>{c.title}</strong><small>{c.photos.length} 张</small></div>{activeId===c.id&&<div className="chapter-miniatures" aria-hidden="true">{c.photos.slice(0,3).map(item=>{const p=photoMap.get(item.photoId);return p?.preview?<img key={item.photoId} loading="lazy" decoding="async" src={preview(p)} alt=""/>:null;})}</div>}</button>{activeId===c.id&&<div className="chapter-index-order"><Hint label="章节上移"><button className="icon-button" aria-label={`索引上移章节 ${c.title}`} disabled={busy||ci===0} onClick={()=>reorderChapter(c.id,'up')}><ArrowUp size={15}/><span>上移</span></button></Hint><Hint label="章节下移"><button className="icon-button" aria-label={`索引下移章节 ${c.title}`} disabled={busy||ci===board.chapters.length-1} onClick={()=>reorderChapter(c.id,'down')}><ArrowDown size={15}/><span>下移</span></button></Hint></div>}</li>)}</ol><button className="index-add" onClick={()=>openPool()}><Plus size={17}/>添加照片</button><details className="index-sources"><summary>来源</summary>{sources}</details></aside>
  {moving&&<MovePhoto key={moving.item.photoId} item={moving.item} from={moving.chapterId} chapters={board.chapters} busy={busy} error={error} close={()=>setMoving(null)} submit={chapterId=>mutate({op:'movePhoto',photoId:moving.item.photoId,chapterId},'照片已移动。',()=>setMoving(null))}/>}
  {editing&&<ChapterEditor chapter={editing} busy={busy} error={error} close={()=>setEditing(null)} submit={(title,description)=>mutate(editing==='new'?{op:'create',title,description}:{op:'rename',chapterId:editing.id,title,description},'章节草稿已保存。',()=>setEditing(null))}/>}
 </div>;
}
function ChapterEditor({chapter,busy,error,close,submit}:{chapter:Chapter|'new';busy:boolean;error:string;close:()=>void;submit:(title:string,description:string)=>void}){
 const [title,setTitle]=useState(chapter==='new'?'':chapter.title),[description,setDescription]=useState(chapter==='new'?'':chapter.description);
 return <Modal title={chapter==='new'?'新建章节':'编辑章节'} description="" close={close}><form onSubmit={e=>{e.preventDefault();submit(title,description);}}><label>章节名称<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>章节说明（选填）<textarea maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label>{error&&<p className="banner error" role="alert">{error}</p>}<button className="primary full" disabled={busy||!title.trim()}>保存章节</button></form></Modal>;
}

function MovePhoto({item,from,chapters,busy,error,close,submit}:{item:StoryPhoto;from:string;chapters:Chapter[];busy:boolean;error:string;close:()=>void;submit:(id:string)=>void}){
 const[target,setTarget]=useState(chapters.find(c=>c.id!==from)?.id||'');
 return <Modal title="移动照片" description={item.filename} close={close}><form className="move-photo-form" onSubmit={e=>{e.preventDefault();if(target)submit(target);}}><label>目标章节<select aria-label="移动到章节" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}>{chapters.filter(c=>c.id!==from).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>{error&&<p className="error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy||!target}>移动照片</button></div></form></Modal>;
}
