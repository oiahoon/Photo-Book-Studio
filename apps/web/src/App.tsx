import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ArrowLeft,ArrowRight,Layers3,Plus,BookOpen,PanelLeft,Maximize2,Grid2X2,LayoutGrid,X,Check,Users } from 'lucide-react';
import { api } from './api';
import type {PersonId} from './types';
import {PeopleFilter,PeopleBatchDialog,peopleLabel,peopleMatches,type PeopleMode} from './PeopleEditor';
import type { Analysis, Library, Task, CurationState, Photo } from './types';
import { Inspector } from './Inspector';
import {LocationFilter,locationLabel,locationMatches} from './LocationEditor';
import { ImportDialog } from './ImportDialog';
import { TaskDialog } from './TaskDialog';
import { Icon } from './Icon';
import { Hint } from './ui';
import {PhotoSearch,AnalysisFilter,ResetPhotoFilters} from './PhotoFilters';
import { PhotoReview } from './PhotoReview';
import { StoryboardPanel } from './StoryboardPanel';
import { ExternalPanel } from './ExternalPanel';
import { BookDesigner } from './BookDesigner';
import { Notification, type Notice } from './Notification';
import { curationLabels } from './CurationControl';

const empty: Library = { sources: [], photos: [], tasks: [], jobs: [], externalCulling: [],filteredRaw:[],storyboards:[],storyboard:{id:'main',name:'原章节草稿',chapters:[],version:0,updatedAt:null} };
type View = 'library' | 'tasks' | 'external' | 'storyboard' | 'book';
const titles:Record<View,string>={book:'影集设计',storyboard:'章节编排',library:'素材库',tasks:'分析任务',external:'外部选片'};
export function App() {
  const [data, setData] = useState<Library>(empty);
  const [bookTopCollapsed,setBookTopCollapsed]=useState(()=>{try{return localStorage.getItem('pbs-book-top-collapsed-v1')==='true';}catch{return false;}});
  function toggleBookTop(){const next=!bookTopCollapsed;setBookTopCollapsed(next);try{localStorage.setItem('pbs-book-top-collapsed-v1',String(next));}catch{}}
  const [activeBoardId,setActiveBoardId]=useState(()=>{try{return localStorage.getItem('pbs-active-storyboard-v1')||'main';}catch{return 'main';}});
  const activeBoard=data.storyboards.find(b=>b.id===activeBoardId)||data.storyboard;
  function changeBoard(id:string){setActiveBoardId(id);try{localStorage.setItem('pbs-active-storyboard-v1',id);}catch{/* Selection remains usable without browser storage. */}requestAnimationFrame(()=>document.getElementById('storyboard-variant')?.focus());}
  const [selected, setSelected] = useState('');
  const [inspectOpen,setInspectOpen]=useState(false);
  const [reviewIds,setReviewIds]=useState<string[]>([]);
  const [sourcesOpen,setSourcesOpen]=useState(true);
  const [density,setDensity]=useState<'comfortable'|'compact'>('comfortable');
  const openReview=(id:string,ids=photos.map(p=>p.id))=>{setSelected(id);setReviewIds(ids);setInspectOpen(true);};
  const selectPhoto=(id:string,ids?:string[])=>{setSelected(id);if(view==='storyboard')openReview(id,ids);};
  const [source, setSource] = useState('all');
  const [filter, setFilter] = useState('all');
  const [locationFilter,setLocationFilter]=useState('all');
  const [peopleFilter,setPeopleFilter]=useState('all');
  const [batchMode,setBatchMode]=useState(false),[batchIds,setBatchIds]=useState<string[]>([]),[peopleBatch,setPeopleBatch]=useState<Photo[]|null>(null);
  function toggleBatchPhoto(id:string){setBatchIds(ids=>ids.includes(id)?ids.filter(p=>p!==id):[...ids,id]);}

  const [curationFilter, setCurationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch=useDeferredValue(search);
  const [visibleCount,setVisibleCount]=useState(60);
  const [group, setGroup] = useState<{snapshotId: string; groupId: string} | null>(null);
  useEffect(()=>setBatchIds([]),[source,filter,curationFilter,deferredSearch,group,locationFilter,peopleFilter]);
  useEffect(()=>setVisibleCount(60),[source,filter,curationFilter,deferredSearch,group,locationFilter,peopleFilter]);
  const [busy, setBusy] = useState(false);
  const busyRef=useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeId = useRef(0);
  const pendingNotice=useRef<Notice|null>(null);
  const notify = (text: string, undo?: () => void) => {
    const next={id: ++noticeId.current,text,undo};
    if(busyRef.current)pendingNotice.current=next;else setNotice(next);
  };
  const [importOpen, setImportOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [view, setView] = useState<View>('library');
  useEffect(()=>{document.title=`Photo Book Studio · ${titles[view]}`;},[view]);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const next = await api<Library>('library');
    setData(next); setConnected(true); setLoaded(true);
  }, []);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Library>('library');
        if (alive) {setData(next); setConnected(true); setLoaded(true);}
      } catch (e) {if (alive) {setConnected(false); setError((e as Error).message);}}
      finally {if (alive) timer=setTimeout(()=>void poll(),document.hidden?10000:2500);}
    };
    void poll();
    return () => {alive=false; clearTimeout(timer);};
  }, []);
  const hiddenRawCount=data.filteredRaw.filter(p=>source==='all'||p.sourceId===source).length;
  const scopePhotos = useMemo(() => data.photos.filter(p => source==='all'||p.sourceId===source), [data.photos,source]);
  const groupSnapshot=group?data.externalCulling.find(s=>s.id===group.snapshotId):null;
  const groupIds=group?new Set(data.externalCulling.filter(s=>s.payload.databaseSnapshotHash===groupSnapshot?.payload.databaseSnapshotHash).map(s=>s.id)):null;
  const photos = useMemo(() => scopePhotos.filter(p =>
    (filter==='all'||(filter==='pending'?!p.analyses.some(a=>!a.stale):p.analyses.some(a=>!a.stale))) &&
    locationMatches(p,locationFilter) && peopleMatches(p,peopleFilter) &&
    (curationFilter==='all'||(curationFilter==='external-exclude'?p.external?.flag==='exclude'&&!p.external.stale:p.curation.state===curationFilter)) &&
    (!group || (p.external && groupIds?.has(p.external.snapshotId) && !p.external.stale && p.external.visualGroups.includes(group.groupId))) &&
    `${p.relativePath} ${locationLabel(p)} ${peopleLabel(p)} ${p.analyses.find(a=>!a.stale)?.result.tags.join(' ')||''}`.toLocaleLowerCase().includes(deferredSearch.toLocaleLowerCase())
  ), [scopePhotos,filter,curationFilter,deferredSearch,group,groupSnapshot,data.externalCulling,locationFilter,peopleFilter]);
  const photo = inspectOpen?data.photos.find(p=>p.id===selected):view==='storyboard'?(data.photos.find(p=>p.id===selected)||data.photos.find(p=>p.id===activeBoard.chapters[0]?.photos[0]?.photoId)):(photos.find(p=>p.id===selected)||photos[0]);
  const reviewPhotos=useMemo(()=>{const byId=new Map(data.photos.map(p=>[p.id,p]));return reviewIds.flatMap(id=>{const p=byId.get(id);return p?[p]:[];});},[data.photos,reviewIds]);
  const index = photo ? photos.findIndex(p=>p.id===photo.id) : -1;
  async function action(fn: () => Promise<void>) {
    if(busyRef.current)return;
    busyRef.current=true; setBusy(true); setError('');
    try {await fn(); await refresh();}
    catch (e) {setError((e as Error).message);}
    finally {busyRef.current=false; setBusy(false);if(pendingNotice.current){setNotice(pendingNotice.current);pendingNotice.current=null;}}
  }
  const editStory=(command:Record<string,unknown>,message:string,done?:()=>void)=>void action(async()=>{
    const changed=await api<{version:number;undoId:string}>('storyboard',{...command,boardId:activeBoard.id,expectedVersion:activeBoard.version});
    notify(message,()=>void action(async()=>{await api('storyboard/undo',{boardId:activeBoard.id,undoId:changed.undoId,expectedVersion:changed.version});notify('已撤销章节编排操作。');}));done?.();
  });
  const prepare = (ids: string[]) => action(async () => {
    const t=await api<Task>('tasks',{ids}); setTask(t); notify('分析任务已保存，可交给 Codex。');
  });
  const decide = (id: string, decision: Analysis['decision']) => void action(async () => {
    await api('analysis/decision',{id,decision}); notify('分析建议的确认状态已保存。');
  });
  function curate(target: Photo, state: CurationState) {
    if(target.curation.state===state)return;
    void action(async () => {
      const changed = await api<{previous:{state:CurationState};current:{version:number}}>('curation',{photoId:target.id,state,expectedVersion:target.curation.version});
      notify(`${target.relativePath} · ${curationLabels[state]}`, ()=>void action(async()=>{
        await api('curation',{photoId:target.id,state:changed.previous.state,expectedVersion:changed.current.version}); notify('已撤销选片操作。');
      }));
    });
  }
  function saveLocation(target:Photo,city:string,site:string){
    void action(async()=>{
      const changed=await api<{version:number;undoId:string}>('photos/location',{photoId:target.id,city,site,expectedVersion:target.location.version});
      notify(city||site?'地点已保存。':'地点已清空。',()=>void action(async()=>{await api('photos/location/undo',{photoId:target.id,undoId:changed.undoId,expectedVersion:changed.version});notify('已撤销地点修改。');}));
    });
  }
  function savePeople(targets:Photo[],ids:PersonId[],mode:PeopleMode='replace'){
    void action(async()=>{
      const changed=await api<{undoId:string;changes:{photoId:string;current:{version:number}}[]}>('photos/people',{targets:targets.map(p=>({photoId:p.id,expectedVersion:p.people?.version||0})),ids,mode});
      setPeopleBatch(null);setBatchIds([]);
      notify(`已保存 ${targets.length} 张人物标注。`,()=>void action(async()=>{await api('photos/people/undo',{undoId:changed.undoId,targets:changed.changes.map(c=>({photoId:c.photoId,expectedVersion:c.current.version}))});notify('已撤销人物标注。');}));
    });
  }
  function navigate(delta: number) {
    if(!photos.length)return;
    const next=Math.max(0,Math.min(photos.length-1,index+delta));
    setVisibleCount(count=>Math.max(count,next+1));setSelected(photos[next].id);
  }
  function rotate(target:Photo,rotation:number){
    void action(async()=>{
      const changed=await api<{version:number;undoId:string}>('photos/rotate',{photoId:target.id,rotation,expectedVersion:target.adjustment.version});
      notify('显示方向已保存，原片不变。',()=>void action(async()=>{await api('photos/rotation/undo',{photoId:target.id,undoId:changed.undoId,expectedVersion:changed.version});notify('已撤销方向调整。');}));
    });
  }
  useEffect(()=>{
    const keydown=(event: KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(view!=='library'||inspectOpen||busy||importOpen||task||batchMode||peopleBatch||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||target.closest('input,textarea,select,[role="dialog"],[role="group"],[contenteditable="true"]')||(target.closest('button')&&!target.closest('.photo-tile')))return;
      if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();navigate(event.key==='ArrowRight'?1:-1);}
      if(event.key==='Enter'&&photo&&!target.closest('button')){event.preventDefault();openReview(photo.id);}
      const state=({p:'keep',u:'pending',x:'exclude','0':'unreviewed'} as Record<string,CurationState>)[event.key.toLowerCase()];
      if(state&&photo){event.preventDefault();curate(photo,state);}
    };
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  });
  const running=data.jobs.find(j=>j.status==='running');
  const inspector=<Inspector savePeople={(ids,clear)=>photo&&savePeople([photo],ids,clear?'clear':'replace')} saveLocation={(city,site)=>photo&&saveLocation(photo,city,site)} key={photo?.id} photo={photo} compact={inspectOpen} busy={busy} prepare={()=>photo&&void prepare([photo.id])} decide={decide} curate={state=>photo&&curate(photo,state)} rotate={rotation=>photo&&rotate(photo,rotation)} openPreview={()=>photo&&openReview(photo.id)}/>;
  const sourceBrowser=<><div className="source-heading">来源<Hint label="添加相机或胶片目录"><button aria-label="添加来源" onClick={()=>setImportOpen(true)}><Plus size={17}/></button></Hint></div>
    <button className={`source ${source==='all'?'active':''}`} onClick={()=>{setSource('all');setView('library');}}>全部照片<span>{data.photos.length}</span></button>
    {data.sources.map(s=><button className={`source ${source===s.id?'active':''}`} key={s.id} title={s.path} onClick={()=>{setSource(s.id);setView('library');setGroup(null);}}><Icon name="folder" size={17}/><span className="source-name">{s.name}</span><span>{data.photos.filter(p=>p.sourceId===s.id).length}</span></button>)}
    {!data.sources.length&&loaded&&<p className="source-empty">添加相机或胶片目录，<br/>开始整理第一组照片。</p>}
</>;
  return <Tooltip.Provider delayDuration={350}><div className={`app view-${view} ${view==='book'&&bookTopCollapsed?'book-top-collapsed':''} ${!sourcesOpen&&view==='library'?'sources-hidden':''} ${view==='tasks'||view==='external'||view==='book'?'wide-workspace':''}`}>
    <header id="workspace-header" className="topbar"><div className="identity"><span className="brand">Photo Book Studio</span><span className="project-title">北京家庭影集</span></div><nav aria-label="工作区">
      <button className={`nav ${view==='library'?'active':''}`} aria-current={view==='library'?'page':undefined} onClick={()=>setView('library')}><Icon name="library"/>素材库</button>
      <button className={`nav ${view==='tasks'?'active':''}`} aria-current={view==='tasks'?'page':undefined} onClick={()=>setView('tasks')}><Icon name="list"/>分析任务<span className="nav-count">{data.tasks.length}</span></button>
      <button className={`nav ${view==='external'?'active':''}`} aria-current={view==='external'?'page':undefined} onClick={()=>setView('external')}><Layers3 size={19} strokeWidth={1.5}/>外部选片<span className="nav-count">{data.externalCulling.length}</span></button>
      <button className={`nav ${view==='storyboard'?'active':''}`} aria-current={view==='storyboard'?'page':undefined} onClick={()=>setView('storyboard')}><BookOpen size={19} strokeWidth={1.5}/>章节编排<span className="nav-count">{activeBoard.chapters.length}</span></button>
      <button className={`nav ${view==='book'?'active':''}`} aria-current={view==='book'?'page':undefined} onClick={()=>setView('book')}><BookOpen size={19} strokeWidth={1.5}/>影集设计</button>
    </nav><div className="project-state"><span>{data.photos.length} 张照片</span><span title={connected?'本地项目已连接':'正在连接本地项目'} className={`save-state ${connected?'':'offline'}`}>{connected?'原片只读':'连接中…'}</span></div></header>
    {view!=='storyboard'&&view!=='book'&&(sourcesOpen||view!=='library')&&<aside className="sidebar">{sourceBrowser}</aside>}
    <main className="workspace" tabIndex={-1}>
      {view!=='storyboard'&&view!=='book'&&<div className="workspace-heading"><div><h1>{titles[view]}</h1></div>{view==='library'&&<button className="primary" onClick={()=>setImportOpen(true)}><Plus size={15}/>导入照片</button>}</div>}
      {error&&<div className="banner error" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="关闭错误">关闭</button></div>}
      {running&&<div className="banner" role="status"><span>正在导入 · 已处理 {running.scanned} 张</span><button onClick={()=>void action(async()=>{await api('import/cancel',{id:running.id});notify('已请求取消；完成的照片会保留。');})}>取消导入</button></div>}
      {!running&&view==='library'&&data.jobs[0]&&data.jobs[0].status!=='completed'&&<details className="import-report"><summary>最近导入 · {({completed:'完成',cancelled:'已取消',failed:'失败',interrupted:'已中断'} as Record<string,string>)[data.jobs[0].status]} · {data.jobs[0].scanned} 张已处理{data.jobs[0].limited?' · 已达本次数量上限':''}</summary><p>新建预览 {data.jobs[0].imported||0} · 未变化 {data.jobs[0].unchanged||0} · 仅登记 {data.jobs[0].registered||0} · 配对 RAW 已过滤 {data.jobs[0].filteredRaw||0}</p><p>{data.jobs[0].error}</p>{data.jobs[0].errors?.map((e,i)=><p key={i}>{e.file}：{e.message}</p>)}</details>}
      {!loaded?<div className="empty-library" role="status">正在打开本地项目…</div>:view==='library'?<>
        <div className="library-toolbar"><label className={curationFilter!=='all'?'is-filtered':''}><span className="sr-only">选片状态</span><select aria-label="筛选选片状态" value={curationFilter} onChange={e=>setCurationFilter(e.target.value)}><option value="all">全部选片</option>{Object.entries(curationLabels).map(([v,l])=><option key={v} value={v}>{l} · {scopePhotos.filter(p=>p.curation.state===v).length}</option>)}<option value="external-exclude">Excire 标记排除</option></select></label><LocationFilter photos={scopePhotos} value={locationFilter} onChange={setLocationFilter}/><PeopleFilter photos={scopePhotos} value={peopleFilter} change={setPeopleFilter}/><PhotoSearch value={search} onChange={setSearch}/><AnalysisFilter value={filter} onChange={setFilter}/></div>
        {(filter!=='all'||curationFilter!=='all'||group||locationFilter!=='all'||peopleFilter!=='all'||search)&&<div className="active-photo-filters"><span>{filter==='pending'?'未分析':filter==='analyzed'?'有分析结果':''}</span><ResetPhotoFilters reset={()=>{setFilter('all');setCurationFilter('all');setGroup(null);setLocationFilter('all');setPeopleFilter('all');setSearch('');}}/></div>}

        {group&&<div className="group-notice"><Layers3 size={15}/>正在查看一个 Excire 相似组<button className="text-button" onClick={()=>setGroup(null)}>查看全部</button></div>}
        <div className="browse-toolbar"><Hint label={sourcesOpen?'收起来源':'展开来源'}><button className="icon-button" aria-label="切换来源栏" aria-pressed={sourcesOpen} onClick={()=>setSourcesOpen(v=>!v)}><PanelLeft size={17}/></button></Hint><span title={hiddenRawCount?`${hiddenRawCount} 个配对 RAW 条目已隐藏`:undefined}>{photos.length} 张</span><div className="browse-view-controls" role="group" aria-label="缩略图大小"><Hint label="大缩略图"><button className="icon-button" aria-label="大缩略图" aria-pressed={density==='comfortable'} onClick={()=>setDensity('comfortable')}><Grid2X2 size={16}/></button></Hint><Hint label="小缩略图"><button className="icon-button" aria-label="小缩略图" aria-pressed={density==='compact'} onClick={()=>setDensity('compact')}><LayoutGrid size={16}/></button></Hint></div><button className="people-batch-entry" aria-pressed={batchMode} onClick={()=>{setBatchMode(v=>!v);setBatchIds([]);}}><Users size={15}/>{batchMode?'结束多选':'批量标注'}</button><button className="people-quick-entry" disabled={!photo?.preview} onClick={()=>photo&&openReview(photo.id)}><Users size={15}/>快速标注</button><button className="review-entry" disabled={!photo?.preview} onClick={()=>photo&&openReview(photo.id)}><Maximize2 size={15}/>大图选片</button></div>
        {batchMode&&<div className="people-batch-toolbar" aria-label="批量人物标注"><span>已选 {batchIds.length} 张</span><button disabled={busy} onClick={()=>setBatchIds(photos.slice(0,visibleCount).map(p=>p.id))}>选择当前显示</button><button disabled={busy} onClick={()=>setBatchIds(photos.map(p=>p.id))}>选择全部筛选结果（{photos.length}）</button><button disabled={busy||!batchIds.length} onClick={()=>setBatchIds([])}>取消选择</button><button className="primary" disabled={busy||!batchIds.length} onClick={()=>{setError('');setPeopleBatch(data.photos.filter(p=>batchIds.includes(p.id)));}}>标注所选人物</button></div>}
        {photos.length?<>
          <div className={`photo-grid density-${density}`} aria-label="照片网格">{photos.slice(0,visibleCount).map(p=><button key={p.id} className={`photo-tile ${photo?.id===p.id?'selected':''} ${batchMode&&batchIds.includes(p.id)?'batch-selected':''}`} onClick={()=>batchMode?toggleBatchPhoto(p.id):selectPhoto(p.id)} onDoubleClick={()=>{if(!batchMode)openReview(p.id);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(batchMode)toggleBatchPhoto(p.id);else openReview(p.id);}if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const grid=e.currentTarget.closest('.photo-grid'),columns=grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:1,delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:e.key==='ArrowDown'?columns:-columns;const n=photos[Math.max(0,Math.min(photos.length-1,photos.findIndex(v=>v.id===p.id)+delta))];setVisibleCount(count=>Math.max(count,photos.indexOf(n)+1));setSelected(n.id);requestAnimationFrame(()=>document.getElementById(`photo-${n.id}`)?.focus());}}} id={`photo-${p.id}`} aria-pressed={batchMode?batchIds.includes(p.id):photo?.id===p.id} aria-label={`${batchMode?'选择':'查看'} ${p.relativePath}`}><div className="photo-frame">{peopleLabel(p)&&<span className="photo-people-label">{peopleLabel(p)}</span>}{batchMode&&<span className="batch-check" aria-hidden="true"><Check size={15}/></span>}{p.preview?<img loading="lazy" decoding="async" src={`/previews/${p.preview}?v=${p.previewHash}`} alt={p.relativePath}/>:<div className="raw-placeholder">{p.format}<small>原件已登记</small></div>}</div><div className="photo-caption"><span title={p.relativePath}>{p.relativePath}</span>{p.curation.state!=='unreviewed'?<span className={`curation-mark ${p.curation.state}`}>{curationLabels[p.curation.state]}</span>:p.external?.flag==='exclude'&&!p.external.stale?<span className="external-mark">Excire 排除</span>:p.analyses.some(a=>!a.stale)&&<span className="analysis-dot" title="已有分析" aria-label="已有分析"/>}</div>{locationLabel(p)&&<span className="photo-place">{locationLabel(p)}{p.location.status==='suggested'?' · 待确认':''}</span>}</button>)}</div>{visibleCount<photos.length&&<div className="load-more"><button onClick={()=>setVisibleCount(n=>n+60)}>显示更多</button><span>{Math.min(visibleCount,photos.length)} / {photos.length}</span></div>}
        </>:<div className="empty-library"><span className="empty-symbol"><Icon name="library" size={44}/></span><h2>{data.photos.length?'没有匹配的照片':'导入照片'}</h2>{data.photos.length?<button onClick={()=>{setFilter('all');setCurationFilter('all');setGroup(null);setLocationFilter('all');setPeopleFilter('all');setSearch('');}}>清除筛选</button>:<button className="primary" onClick={()=>setImportOpen(true)}>添加照片目录</button>}</div>}
      </>:view==='book'?<BookDesigner photos={data.photos} boards={data.storyboards} initialBoardId={activeBoard.id} topCollapsed={bookTopCollapsed} toggleTop={toggleBookTop}/>:view==='storyboard'?<StoryboardPanel key={activeBoard.id} changeBoard={changeBoard} data={{...data,storyboard:activeBoard}} busy={busy} error={error} selected={photo?.id||''} select={selectPhoto} mutate={editStory} sources={sourceBrowser}/>:view==='external'?<ExternalPanel data={data} busy={busy||!!running} importSamples={(path,includePaths)=>void action(async()=>{await api('import',{path,includePaths,limit:includePaths.length});notify('开始导入排除样本，原片保持只读。');})} showGroup={(snapshotId,groupId)=>{setGroup({snapshotId,groupId});setSource('all');setCurationFilter('all');setLocationFilter('all');setFilter('all');setSearch('');setView('library');}}/>:
      <div className="task-list"><div className="batch-toolbar"><span>{data.photos.filter(p=>p.analyses.some(a=>!a.stale)).length} / {data.photos.filter(p=>p.preview).length} 张有当前结果</span><button disabled={busy||!scopePhotos.some(p=>p.preview&&p.curation.state!=='exclude'&&!p.analyses.some(a=>!a.stale))} onClick={()=>void action(async()=>{const t=await api<Task>('tasks/batch',{sourceId:source==='all'?null:source});setTask(t);notify('下一批任务已准备，相似组优先放在一起。');})}>准备下一批未分析</button></div><details className="workflow-help"><summary>如何分析</summary><p>每批最多 12 张。准备任务后交给当前 Codex 对话看图，再读取结果。</p></details>{!data.tasks.length&&<p className="muted">先在素材库选择照片，准备第一个分析任务。</p>}{data.tasks.map(t=><article className="task-row" key={t.id}><h2>{t.count} 张照片的分析任务 <span className="muted">· 当前有效 {t.completed||0} / {t.count}</span></h2><p className="muted">{new Date(t.createdAt).toLocaleString('zh-CN')}</p><details className="workflow-help"><summary>任务路径</summary><code>{t.manifestPath}</code></details><div className="task-actions"><button onClick={()=>setTask(t)}>查看任务</button><button disabled={busy} onClick={()=>void action(async()=>{const r=await api<{imported:number;unchanged:number}>('tasks/collect',{id:t.id});notify(`已写入 ${r.imported} 张，已有 ${r.unchanged} 张。`);})}>读取 Codex 结果</button></div></article>)}</div>}
    </main>
    {view==='library'&&<div className="inspector-shell">{photo&&<div className="photo-navigation"><Hint label="上一张（方向键左）"><button className="icon-button" aria-label="上一张照片" disabled={index<=0} onClick={()=>navigate(-1)}><ArrowLeft size={16}/></button></Hint><span>{index+1} / {photos.length}</span><Hint label="下一张（方向键右）"><button className="icon-button" aria-label="下一张照片" disabled={index>=photos.length-1} onClick={()=>navigate(1)}><ArrowRight size={16}/></button></Hint></div>}{!inspectOpen&&inspector}</div>}{inspectOpen&&photo&&<PhotoReview photo={photo} photos={reviewPhotos} busy={busy} close={()=>setInspectOpen(false)} select={setSelected} curate={state=>curate(photo,state)} savePeople={ids=>savePeople([photo],ids)} error={error} feedback={<Notification notice={notice} close={()=>setNotice(null)} busy={busy}/>}>{inspector}</PhotoReview>}
    {peopleBatch&&<PeopleBatchDialog photos={peopleBatch} busy={busy} error={error} close={()=>setPeopleBatch(null)} save={(ids,mode)=>savePeople(peopleBatch,ids,mode)}/>}
    {importOpen&&<ImportDialog close={()=>setImportOpen(false)} busy={busy} error={error} submit={async(path,limit)=>{await action(async()=>{await api('import',{path,limit});setImportOpen(false);notify('导入已开始，照片会逐步显示。');});}}/>}
    {task&&<TaskDialog task={task} message={error} close={()=>setTask(null)} copied={()=>notify('任务指令已复制。')} error={()=>setError('无法访问剪贴板，请手动复制文本。')}/>}
    {!inspectOpen&&<Notification notice={notice} close={()=>setNotice(null)} busy={busy}/>}
  </div></Tooltip.Provider>;
}
