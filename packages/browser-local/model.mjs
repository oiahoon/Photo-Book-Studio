import {validateEdition,editionPages} from './edition.mjs';
export const FORMAT='photo-book-browser';
export const newProject=(name='我的影集')=>({format:FORMAT,schemaVersion:1,id:crypto.randomUUID(),revision:0,name,createdAt:new Date().toISOString(),sources:[],photos:[],pages:[],settings:{width:250,height:250,margin:14,blankSheets:true,spine:null,coverTitle:name,coverPhotoId:null,backPhotoId:null}});
export const placement=photoId=>({id:crypto.randomUUID(),photoId,fit:'contain',zoom:1,panX:.5,panY:.5,caption:''});
function automaticFrames(project,page){const {width:w,height:h,margin:m}=project.settings;const n=page.placements.length;if(n>4)throw Error('每页最多四张照片');const top=page.title?30:m,bottom=h-16,g=5,W=w-2*m,H=bottom-top;if(!n)return[];if(n===1)return[{x:m,y:top,width:W,height:H}];if(n===2)return[0,1].map(i=>({x:m,y:top+i*(H+g)/2,width:W,height:(H-g)/2}));return Array.from({length:n},(_,i)=>({x:m+(i%2)*(W+g)/2,y:top+Math.floor(i/2)*(H+g)/2,width:(W-g)/2,height:(H-g)/2}));}
const layouts=[
 {id:'auto',label:'默认',counts:[0,1,2,3,4]},
 {id:'inset',label:'大幅留白',counts:[1]},
 {id:'full',label:'整页图框',counts:[1]},
 {id:'columns',label:'左右双图',counts:[2]},
 {id:'rows',label:'上下双图',counts:[2]},
 {id:'hero-left',label:'左主三图',counts:[3]},
 {id:'hero-right',label:'右主三图',counts:[3]},
 {id:'grid',label:'四图均衡',counts:[4]},
 {id:'story-top',label:'一主三辅',counts:[4]}
];
export const pageLayouts=count=>layouts.filter(x=>x.counts.includes(count));
export function frameRects(project,page){
 const layout=page.layout||'auto',n=page.placements.length;
 if(!pageLayouts(n).some(x=>x.id===layout))throw Error('版式不支持当前照片数量');
 if(layout==='auto'||layout==='rows'||layout==='grid')return automaticFrames(project,page);
 const {width:w,height:h,margin:m}=project.settings,top=page.title?30:m,g=5,W=w-2*m,H=h-16-top;
 if(layout==='inset'){const inset=Math.max(0,Math.min(12,(W-8)/2,(H-8)/2));return[{x:m+inset,y:top+inset,width:W-2*inset,height:H-2*inset}];}
 if(layout==='full')return[{x:0,y:0,width:w,height:h}];
 if(layout==='columns')return[0,1].map(i=>({x:m+i*(W+g)/2,y:top,width:(W-g)/2,height:H}));
 if(layout==='hero-left'||layout==='hero-right'){
  const big=(W-g)*.62,small=W-g-big,left=layout==='hero-left';
  return[{x:left?m:m+small+g,y:top,width:big,height:H},...[0,1].map(i=>({x:left?m+big+g:m,y:top+i*(H+g)/2,width:small,height:(H-g)/2}))];
 }
 const big=(H-g)*.56,small=H-g-big;
 return[{x:m,y:top,width:W,height:big},...[0,1,2].map(i=>({x:m+i*(W+g)/3,y:top+big+g,width:(W-2*g)/3,height:small}))];
}
const str=(v,max=10000)=>typeof v==='string'&&v.length<=max;
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export function validateProject(p){
 if(!p||p.format!==FORMAT||p.schemaVersion!==1||!str(p.id,100)||!str(p.name,200)||!Number.isInteger(p.revision)||p.revision<0||!Array.isArray(p.photos)||p.photos.length>10000||!Array.isArray(p.sources)||!Array.isArray(p.pages)||p.pages.length>3000)throw Error('项目格式或版本不支持');
 const s=p.settings;if(!s||!finite(s.width,100,420)||!finite(s.height,100,420)||!finite(s.margin,6,40)||!str(s.coverTitle,200)||typeof s.blankSheets!=='boolean'||!(s.spine===null||finite(s.spine,1,100)))throw Error('影集规格错误');
 const sources=new Set();for(const x of p.sources){if(!str(x.id,100)||!str(x.name,500)||sources.has(x.id))throw Error('来源信息错误');sources.add(x.id);}
 const ids=new Set();for(const x of p.photos){if(!str(x.id,100)||ids.has(x.id)||!sources.has(x.sourceId)||!str(x.path,2000)||x.path.split('/').some(t=>t==='..')||!str(x.name,500)||!/^([a-f0-9]{64})$/.test(x.hash)||!finite(x.width,1,100000)||!finite(x.height,1,100000)||!Number.isInteger(x.rotation)||![0,90,180,270].includes(x.rotation)||!['unreviewed','keep','pending','exclude'].includes(x.selection)||!str(x.location,500)||!Array.isArray(x.people)||x.people.some(v=>!str(v,100)))throw Error('照片记录无效');ids.add(x.id);}
 const pageIds=new Set(),placementIds=new Set();for(const page of p.pages){if(!str(page.id,100)||pageIds.has(page.id)||!str(page.title,500)||!Array.isArray(page.placements)||page.placements.length>4)throw Error('版面记录无效');if(page.layout!==undefined&&!pageLayouts(page.placements.length).some(x=>x.id===page.layout))throw Error('版式不支持当前照片数量');pageIds.add(page.id);for(const q of page.placements){if(!str(q.id,100)||placementIds.has(q.id)||!ids.has(q.photoId)||!['contain','cover'].includes(q.fit)||!finite(q.zoom,1,p.edition?4:3)||!finite(q.panX,0,1)||!finite(q.panY,0,1)||!str(q.caption,500))throw Error('照片放置无效');placementIds.add(q.id);}}
 if(p.coverDesign){const d=p.coverDesign;if(!['text','photo','bleed'].includes(d.style)||!['photo','bleed'].includes(d.backStyle)||typeof d.showTitle!=='boolean'||!str(d.subtitle,500)||!str(d.spineText,500))throw Error('封面设计无效');for(const side of ['front','back']){const q=d[side];if(q&&(!ids.has(q.photoId)||!['contain','cover'].includes(q.fit)||!finite(q.zoom,1,3)||!finite(q.panX,0,1)||!finite(q.panY,0,1)||q.photoId!==s[side==='front'?'coverPhotoId':'backPhotoId']))throw Error('封面裁切引用无效');}}
 if(p.chapters){const chapters=new Set();if(!Array.isArray(p.chapters)||p.chapters.length>1000)throw Error('章节格式错误');for(const ch of p.chapters){if(!str(ch.id,100)||chapters.has(ch.id)||!str(ch.title,500)||!Array.isArray(ch.photoIds)||new Set(ch.photoIds).size!==ch.photoIds.length||ch.photoIds.some(id=>!ids.has(id)))throw Error('章节引用错误');chapters.add(ch.id);}}
 if(p.external&&(!Array.isArray(p.external)||p.external.length>100||p.external.some(s=>!Array.isArray(s.entries)||s.entries.some(e=>!ids.has(e.photoId)))))throw Error('外部参考引用错误');
 for(const key of ['coverPhotoId','backPhotoId'])if(s[key]!==null&&!ids.has(s[key]))throw Error('封面照片引用无效');
 if(p.edition){validateEdition(p.edition,p.photos);if(JSON.stringify(p.pages)!==JSON.stringify(editionPages(p.edition)))throw Error('跨页与逐页索引不一致');}
 if(JSON.stringify(p).length>30*1024*1024)throw Error('项目配置过大');return structuredClone(p);
}
export function backupProject(p){const q=validateProject(p);return JSON.stringify({...q,backupAt:new Date().toISOString()},null,2);}
export function restoreProject(value){const p=validateProject(value);p.id=crypto.randomUUID();p.revision=0;p.name+=' · 恢复副本';return p;}
export function aiImportPlan(project,input){
 const rows=input?.results||input?.photos;if(!Array.isArray(rows)||rows.length>10000)throw Error('分析文件须含 results 或 photos 数组');
 const changes=[],issues=[],seen=new Set();for(const [i,row] of rows.entries()){
  const hash=row.sourceHash||row.hash;let candidates=hash?project.photos.filter(p=>p.hash===hash):[];
  if(candidates.length>1&&row.relativePath)candidates=candidates.filter(p=>p.path===row.relativePath);
  if(candidates.length!==1){issues.push({row:i+1,reason:hash?(candidates.length?'同内容多处引用，需 relativePath':'未找到匹配照片'):'缺少 sourceHash；不按文件名猜配'});continue;}
  const photo=candidates[0];if(seen.has(photo.id))throw Error('同一文件包含重复照片分析，请拆分后导入');seen.add(photo.id);
  const result=row.result||row;if(!str(result.summary)||!str(result.composition)||!Array.isArray(result.tags)||result.tags.length>100||result.tags.some(t=>!str(t,200)))throw Error(`第 ${i+1} 条分析字段错误`);
  const clean={summary:result.summary,composition:result.composition,tags:result.tags,bookRole:str(result.bookRole)?result.bookRole:'',cautions:Array.isArray(result.cautions)?result.cautions:[],uncertainties:Array.isArray(result.uncertainties)?result.uncertainties:[],visualStudy:result.visualStudy||null};
  if(JSON.stringify(clean).length>50000)throw Error('单张分析过大');
  changes.push({photoId:photo.id,analysis:{id:crypto.randomUUID(),sourceHash:photo.hash,analyst:row.analyst||input.analyst||'external',model:row.model||input.model||'unknown',importedAt:new Date().toISOString(),result:clean}});
 }return{changes,issues};
}
export function applyAI(project,plan){const p=structuredClone(project);for(const c of plan.changes){const photo=p.photos.find(x=>x.id===c.photoId);if(!photo||photo.hash!==c.analysis.sourceHash)throw Error('照片已改变，重新导入分析');photo.analyses=[...(photo.analyses||[]),c.analysis];}return p;}
export function paginate(project,ids,count=2,chapterId){if(![1,2,3,4].includes(count))throw Error('版面数量错误');const p=structuredClone(project);for(let i=0;i<ids.length;i+=count)p.pages.push({id:crypto.randomUUID(),title:i===0&&chapterId?(p.chapters?.find(c=>c.id===chapterId)?.title||''):'',...(chapterId?{chapterId}:{}),placements:ids.slice(i,i+count).map(placement)});return p;}
