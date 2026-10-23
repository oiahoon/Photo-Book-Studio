import {validateEdition,editionPages} from './edition.mjs';
export const FORMAT='photo-book-browser';
export const newProject=(name='我的影集')=>({format:FORMAT,schemaVersion:1,id:crypto.randomUUID(),revision:0,name,createdAt:new Date().toISOString(),sources:[],photos:[],pages:[],settings:{width:250,height:250,margin:14,blankSheets:true,spine:null,coverTitle:name,coverPhotoId:null,backPhotoId:null}});
export const placement=photoId=>({id:crypto.randomUUID(),photoId,fit:'contain',zoom:1,panX:.5,panY:.5,caption:''});
export function frameRects(project,page){const {width:w,height:h,margin:m}=project.settings;const n=page.placements.length;if(n>4)throw Error('每页最多四张照片');const top=page.title?30:m,bottom=h-16,g=5,W=w-2*m,H=bottom-top;if(!n)return[];if(n===1)return[{x:m,y:top,width:W,height:H}];if(n===2)return[0,1].map(i=>({x:m,y:top+i*(H+g)/2,width:W,height:(H-g)/2}));return Array.from({length:n},(_,i)=>({x:m+(i%2)*(W+g)/2,y:top+Math.floor(i/2)*(H+g)/2,width:(W-g)/2,height:(H-g)/2}));}
const str=(v,max=10000)=>typeof v==='string'&&v.length<=max;
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export function validateProject(p){
 if(!p||p.format!==FORMAT||p.schemaVersion!==1||!str(p.id,100)||!str(p.name,200)||!Number.isInteger(p.revision)||p.revision<0||!Array.isArray(p.photos)||p.photos.length>10000||!Array.isArray(p.sources)||!Array.isArray(p.pages)||p.pages.length>3000)throw Error('项目格式或版本不支持');
 const s=p.settings;if(!s||!finite(s.width,100,420)||!finite(s.height,100,420)||!finite(s.margin,6,40)||!str(s.coverTitle,200)||typeof s.blankSheets!=='boolean'||!(s.spine===null||finite(s.spine,1,100)))throw Error('影集规格错误');
 const sources=new Set();for(const x of p.sources){if(!str(x.id,100)||!str(x.name,500)||sources.has(x.id))throw Error('来源信息错误');sources.add(x.id);}
 const ids=new Set();for(const x of p.photos){if(!str(x.id,100)||ids.has(x.id)||!sources.has(x.sourceId)||!str(x.path,2000)||x.path.split('/').some(t=>t==='..')||!str(x.name,500)||!/^([a-f0-9]{64})$/.test(x.hash)||!finite(x.width,1,100000)||!finite(x.height,1,100000)||!Number.isInteger(x.rotation)||![0,90,180,270].includes(x.rotation)||!['unreviewed','keep','pending','exclude'].includes(x.selection)||!str(x.location,500)||!Array.isArray(x.people)||x.people.some(v=>!str(v,100)))throw Error('照片记录无效');ids.add(x.id);}
 const pageIds=new Set(),placementIds=new Set();for(const page of p.pages){if(!str(page.id,100)||pageIds.has(page.id)||!str(page.title,500)||!Array.isArray(page.placements)||page.placements.length>4)throw Error('版面记录无效');pageIds.add(page.id);for(const q of page.placements){if(!str(q.id,100)||placementIds.has(q.id)||!ids.has(q.photoId)||!['contain','cover'].includes(q.fit)||!finite(q.zoom,1,3)||!finite(q.panX,0,1)||!finite(q.panY,0,1)||!str(q.caption,500))throw Error('照片放置无效');placementIds.add(q.id);}}
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
export function paginate(project,ids,count=2){if(![1,2,3,4].includes(count))throw Error('版面数量错误');const p=structuredClone(project);for(let i=0;i<ids.length;i+=count)p.pages.push({id:crypto.randomUUID(),title:'',placements:ids.slice(i,i+count).map(placement)});return p;}
