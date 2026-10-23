import {randomUUID} from 'node:crypto';
import {readStoryboard,transaction} from './store.mjs';

import {collageCounts,supportsLayout} from '../publishing/geometry.mjs';
const layouts=['airy','airy-left','balanced','bleed','duet-left','duet-right','chapter-left','chapter-right','hero-left','hero-right','coda-left',...Object.keys(collageCounts)];
function layout(v,count){option(v,layouts,'版式');if((v==='airy-left'||v.startsWith('chapter-'))&&count!==1)throw new Error('左页单图仅适用于单张跨页');if(v.startsWith('duet-')&&count!==2)throw new Error('主次对页须有两张照片');if(!supportsLayout(v,count))throw new Error('版式与照片数量不匹配');return v;}
function text(v,label,max=100,empty=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))throw new Error(`${label}格式错误`);return v.trim();}
function number(v,label,min,max,nullable=false){if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${label}须在 ${min}–${max} 之间`);return v;}
function option(v,values,label){if(!values.includes(v))throw new Error(`${label}错误`);return v;}
export function readBook(db,id){const row=db.prepare('SELECT * FROM books WHERE id=?').get(id);if(!row)throw new Error('书稿不存在');return{...JSON.parse(row.data),id:row.id,version:row.version,updatedAt:row.updatedAt};}
export function listBooks(db,{includeArchived=false}={}){return db.prepare('SELECT * FROM books ORDER BY updatedAt DESC,id').all().filter(r=>includeArchived||!JSON.parse(r.data).archived).map(r=>{const b=JSON.parse(r.data);return{id:r.id,...(includeArchived?{archived:!!b.archived}:{}),name:b.name,version:r.version,updatedAt:r.updatedAt,storyboardId:b.storyboardId,spreadCount:b.spreads.length,photoCount:b.spreads.reduce((n,s)=>n+s.placements.length,0)};});}
function current(db,id,expectedVersion){if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw new Error('书稿版本错误');const b=readBook(db,id);if(b.version!==expectedVersion)throw new Error('书稿已在其他操作中变化，请重新打开后重试');return b;}
function save(db,before,after){const now=new Date().toISOString(),undoId=randomUUID(),nextVersion=before.version+1;const {id,version,updatedAt,...data}=after;db.prepare('INSERT INTO book_history VALUES(?,?,?,?,?)').run(undoId,id,JSON.stringify(before),nextVersion,now);db.prepare('UPDATE books SET data=?,version=?,updatedAt=? WHERE id=?').run(JSON.stringify(data),nextVersion,now,id);return{book:readBook(db,id),undoId};}
function reference(db,item){const p=db.prepare('SELECT * FROM photos WHERE id=?').get(item.photoId);const a=p?db.prepare('SELECT rotation,version FROM photo_adjustments WHERE photoId=?').get(p.id):null;return{id:randomUUID(),photoId:item.photoId,sourceHash:item.sourceHash,filename:item.filename||p?.relativePath||'未连接照片',preview:p?.hash===item.sourceHash?p.preview:null,previewHash:p?.hash===item.sourceHash?p.previewHash:null,rotation:a?.rotation||0,orientationVersion:a?.version||0,fit:'contain',zoom:1,panX:0.5,panY:0.5};}
export function createBook(db,{boardId,expectedBoardVersion,name,spreadPlan,fromBook}){return transaction(db,()=>{
 const board=readStoryboard(db,boardId);if(!Number.isInteger(expectedBoardVersion)||!board.version||board.version!==expectedBoardVersion)throw new Error('章节方案已变化或不存在，请刷新后重试');
 if(!board.chapters.some(c=>c.photos.length))throw new Error('章节中还没有照片');
 const source=fromBook?current(db,fromBook.id,fromBook.expectedVersion):null,carry=new Map(source?.spreads.flatMap(s=>s.placements.map(p=>[p.photoId,p]))||[]);
 const ref=item=>{const p=carry.get(item.photoId);if(p&&p.sourceHash!==item.sourceHash)throw new Error('来源书稿照片版本与新方案不一致');return p?structuredClone(p):reference(db,item);};
 const spreads=[];
 if(spreadPlan!==undefined){
  if(!Array.isArray(spreadPlan)||!spreadPlan.length||spreadPlan.length>1000)throw new Error('跨页计划格式错误');
  const used=new Set();
  for(const entry of spreadPlan){
   const c=board.chapters.find(c=>c.id===entry.chapterId);
   if(!c||!Array.isArray(entry.photoIds)||entry.photoIds.length<1||entry.photoIds.length>6)throw new Error('跨页计划须引用本方案章节中的一至六张照片');
   const items=entry.photoIds.map(id=>{const p=c.photos.find(p=>p.photoId===id);if(!p||used.has(id))throw new Error('跨页计划照片缺失、跨章或重复');used.add(id);return p;});
   spreads.push({id:randomUUID(),chapterId:c.id,title:text(entry.title??'','跨页标题',100,true),layout:layout(entry.layout,items.length),placements:items.map(ref)});
  }
  if(used.size!==board.chapters.reduce((n,c)=>n+c.photos.length,0))throw new Error('跨页计划必须保留方案中的全部照片');
 }else for(const c of board.chapters){for(let i=0;i<c.photos.length;i+=2)spreads.push({id:randomUUID(),chapterId:c.id,title:i===0?c.title:'',layout:'airy',placements:c.photos.slice(i,i+2).map(ref)});}
 if(source&&[...carry.keys()].some(id=>!spreads.some(s=>s.placements.some(p=>p.photoId===id))))throw new Error('扩充书稿须保留来源书稿全部照片');
 if(spreads.length>1000)throw new Error('书稿页数超过当前上限');
 const first=spreads.flatMap(s=>s.placements).find(p=>p.preview);const id=randomUUID(),now=new Date().toISOString();
 const b={name:text(name||`${board.name} · 书稿`,'书稿名'),storyboardId:board.id,storyboardVersion:board.version,spreads,cover:{title:'北京家庭影集',subtitle:'',spineText:'',style:'photo',front:first?{...first,id:randomUUID()}:null,back:null},printProfile:{widthMm:250,heightMm:250,binding:'unknown',bleedMm:null,safeMm:null,spineMm:null,supplier:'',product:'',paper:'',sourceUrl:'',pdfPageMode:'single',confirmed:false}};
 if(source){b.cover=structuredClone(source.cover);b.printProfile=structuredClone(source.printProfile);b.sourceBookId=source.id;b.sourceBookVersion=source.version;}
 db.prepare('INSERT INTO books VALUES(?,?,?,?)').run(id,JSON.stringify(b),1,now);return{book:readBook(db,id)};
 });}
function placement(book,id){const p=[book.cover.front,book.cover.back,...book.spreads.flatMap(s=>s.placements)].find(p=>p?.id===id);if(!p)throw new Error('照片放置不存在');return p;}
export function editBook(db,input){return transaction(db,()=>{
 const before=current(db,input.id,input.expectedVersion),b=structuredClone(before);
 switch(input.op){
 case 'design':{const d=input.design;if(!d||![0,2].includes(d.frontBlankPages)||![0,2].includes(d.backBlankPages))throw new Error('前后留白须为零或两面');const blankFirst=option(d.blankFirst??b.design?.blankFirst??false,[true,false],'留白顺序');if(blankFirst&&(!(d.readingEdition??b.design?.readingEdition)||d.frontBlankPages!==2||d.backBlankPages!==2))throw Error('先留白装帧须启用实体页序及前后各两面留白');b.design={blankFirst,frontBlankPages:d.frontBlankPages,backBlankPages:d.backBlankPages,paperTone:option(d.paperTone,['white','natural','warm'],'预览纸色'),coverTypography:option(d.coverTypography,['classic','editorial'],'封面字体设计'),...(d.readingEdition!==undefined?{readingEdition:option(d.readingEdition,[true,false],'实体页序')}:b.design?.readingEdition!==undefined?{readingEdition:b.design.readingEdition}:{}),...Object.fromEntries(['titleKicker','titleContext'].map(k=>[k,text(d[k]??b.design?.[k]??'','题名信息',80,true)])),...(d.closingLine!==undefined?{closingLine:text(d.closingLine,'收尾文字',48,true)}:b.design?.closingLine!==undefined?{closingLine:b.design.closingLine}:{})};break;}
 case 'spineStyle':b.cover.spineStyle=option(input.style,['classic','editorial-vertical'],'书脊设计');break;
 case 'archive':if(typeof input.archived!=='boolean')throw new Error('归档状态错误');b.archived=input.archived;break;
 case 'coverAsset':{
  option(input.side,['front','back'],'封面位置');
  const p=db.prepare('SELECT * FROM photos WHERE id=?').get(input.photoId),a=db.prepare('SELECT * FROM analyses WHERE id=? AND photoId=?').get(input.analysisId,input.photoId),orientation=db.prepare('SELECT version FROM photo_adjustments WHERE photoId=?').get(input.photoId);
  if(!p?.active||p.status!=='ready'||!p.preview||!a||a.decision==='rejected'||p.hash!==input.sourceHash||p.previewHash!==input.previewHash||a.sourceHash!==p.hash||a.previewHash!==p.previewHash||(orientation?.version||0)!==input.orientationVersion)throw new Error('封面素材或分析已变化，请重新核对');
  if(db.prepare('SELECT state FROM curation WHERE photoId=?').get(p.id)?.state==='exclude')throw new Error('封面照片已排除，请先确认选片');
  b.cover[input.side]={...reference(db,{photoId:p.id,sourceHash:p.hash,filename:p.relativePath}),caption:''};break;
 }
 case 'coverArtwork':{
  const p=db.prepare('SELECT * FROM photos WHERE id=?').get(input.photoId),source=db.prepare('SELECT id FROM photos WHERE id=?').get(input.basedOnPhotoId);
  if(!p?.active||p.status!=='ready'||!p.preview||p.hash!==input.sourceHash||p.previewHash!==input.previewHash||!source)throw new Error('生成封面素材已变化或来源不存在');
  if(db.prepare('SELECT state FROM curation WHERE photoId=?').get(p.id)?.state==='exclude')throw new Error('封面素材已排除');
  b.cover.front={...reference(db,{photoId:p.id,sourceHash:p.hash,filename:p.relativePath}),fit:'cover',caption:''};b.cover.style='bleed';b.cover.showTitle=false;b.cover.artwork={kind:'generated',basedOnPhotoId:input.basedOnPhotoId};break;
 }
 case 'rename':b.name=text(input.name,'书稿名');break;
 case 'layout':{const s=b.spreads.find(s=>s.id===input.spreadId);if(!s)throw new Error('跨页不存在');s.layout=layout(input.layout,s.placements.length);break;}
 case 'spreadTitle':{const s=b.spreads.find(s=>s.id===input.spreadId);if(!s)throw new Error('跨页不存在');s.title=text(input.title,'跨页标题',100,true);break;}
 case 'reorder':{const i=b.spreads.findIndex(s=>s.id===input.spreadId);option(input.direction,['up','down'],'移动方向');const j=i+(input.direction==='up'?-1:1);if(i<0||j<0||j>=b.spreads.length)throw new Error('已经位于边界');[b.spreads[i],b.spreads[j]]=[b.spreads[j],b.spreads[i]];break;}
 case 'pagination':case 'curationPagination':{
  if(!Array.isArray(input.spreadPlan)||!input.spreadPlan.length||input.spreadPlan.length>1000)throw new Error('跨页计划格式错误');
  const existing=new Map(b.spreads.flatMap(s=>s.placements.map(p=>[p.photoId,{chapterId:s.chapterId,p}]))),used=new Set();
  const excluded=new Set(),curated=input.op==='curationPagination';
  if(curated){
   if(!Array.isArray(input.excludedPhotos)||!Array.isArray(input.addedPhotos))throw new Error('选片调整清单格式错误');
   const selection=(item,state)=>{const c=db.prepare('SELECT state,version FROM curation WHERE photoId=?').get(item.photoId);if(!c||c.state!==state||c.version!==item.expectedCurationVersion)throw new Error('手工选片已变化，请重新核对');};
   for(const item of input.excludedPhotos){selection(item,'exclude');if(!existing.has(item.photoId)||excluded.has(item.photoId))throw new Error('移出清单照片缺失或重复');if([b.cover.front,b.cover.back].some(p=>p?.photoId===item.photoId))throw new Error('封面使用已排除照片，请先手工调整封面');excluded.add(item.photoId);}
   for(const item of input.addedPhotos){
    selection(item,'keep');if(existing.has(item.photoId)||!b.spreads.some(s=>s.chapterId===item.chapterId))throw new Error('加入照片重复或章节不存在');
    const p=db.prepare('SELECT * FROM photos WHERE id=?').get(item.photoId),a=db.prepare('SELECT * FROM analyses WHERE id=? AND photoId=?').get(item.analysisId,item.photoId);
    if(!p?.active||p.status!=='ready'||!a||a.decision==='rejected'||a.sourceHash!==p.hash||a.previewHash!==p.previewHash)throw new Error('加入照片缺少当前有效分析');
    existing.set(item.photoId,{chapterId:item.chapterId,p:reference(db,{photoId:p.id,sourceHash:p.hash,filename:p.relativePath})});
   }
   for(const id of existing.keys())if(!excluded.has(id)&&db.prepare('SELECT state FROM curation WHERE photoId=?').get(id)?.state==='exclude')throw new Error('仍有已排除照片未列入移出清单');
  }
  const spreadIds=new Set();
  const spreads=input.spreadPlan.map(entry=>{
   if(!Array.isArray(entry.photoIds)||entry.photoIds.length<1||entry.photoIds.length>6)throw new Error('每跨页须有一至六张照片');
   const placements=entry.photoIds.map(id=>{const item=existing.get(id);if(!item||item.chapterId!==entry.chapterId||used.has(id)||excluded.has(id))throw new Error('跨页计划照片缺失、跨章、已排除或重复');used.add(id);return item.p;});
   if(entry.spreadId!==undefined){const old=b.spreads.find(s=>s.id===entry.spreadId);if(!old||old.chapterId!==entry.chapterId||spreadIds.has(old.id))throw new Error('跨页引用缺失、跨章或重复');spreadIds.add(old.id);}
   const previous=b.spreads.find(s=>s.id===entry.spreadId),editorial=previous?.editorial&&previous.placements.length===placements.length&&previous.placements.every((p,i)=>p.photoId===placements[i].photoId)?{editorial:structuredClone(previous.editorial)}:{};
   return{id:entry.spreadId||randomUUID(),chapterId:entry.chapterId,title:text(entry.title??'','跨页标题',100,true),layout:layout(entry.layout,placements.length),placements,...editorial};
  });
  if(used.size!==existing.size-excluded.size)throw new Error('跨页计划必须保留书稿中的全部未排除照片');
  b.spreads=spreads;break;
 }
 case 'placement':{const p=placement(b,input.placementId);p.fit=option(input.fit,['contain','cover'],'适应方式');p.zoom=number(input.zoom,'放大',1,3);p.panX=number(input.panX,'水平位置',0,1);p.panY=number(input.panY,'垂直位置',0,1);if(input.caption!==undefined){if(typeof input.caption!=='string'||/[\r\n\u2028\u2029\x00-\x1f]/.test(input.caption)||Array.from(input.caption).length>48)throw new Error('照片短句须为一行，最多 48 字');p.caption=input.caption.trim();}break;}
 case 'coverStyle':{option(input.side,['front','back'],'封面位置');option(input.style,['photo','bleed'],'封面版式');if(input.side==='front')b.cover.style=input.style;else b.cover.backStyle=input.style;if(input.style==='bleed'&&b.cover[input.side])b.cover[input.side].fit='cover';break;}
 case 'cover':{if(input.showTitle!==undefined){if(typeof input.showTitle!=='boolean')throw new Error('封面标题显示设置错误');b.cover.showTitle=input.showTitle;}b.cover.title=text(input.title,'封面书名',100);b.cover.subtitle=text(input.subtitle,'副标题',160,true);b.cover.spineText=text(input.spineText,'书脊文字',100,true);const previousStyle=b.cover.style;b.cover.style=option(input.style,['text','photo','bleed'],'封面版式');if(previousStyle!==b.cover.style&&b.cover.style==='bleed'&&b.cover.front)b.cover.front.fit='cover';if(input.inkTone!==undefined)b.cover.inkTone=option(input.inkTone,['ink','light'],'封面文字色');break;}
 case 'coverPhoto':{option(input.side,['front','back'],'封面位置');if(input.photoId===null){b.cover[input.side]=null;break;}const candidates=[...b.spreads.flatMap(s=>s.placements),b.cover.front,b.cover.back].filter(Boolean);const source=candidates.find(p=>p.photoId===input.photoId);if(!source)throw new Error('请选择本书稿内的照片');b.cover[input.side]={...structuredClone(source),id:randomUUID(),caption:'',fit:'contain',zoom:1,panX:.5,panY:.5};break;}
 case 'profile':{const p=input.profile;if(!p||typeof p!=='object')throw new Error('规格格式错误');const profile={widthMm:number(p.widthMm,'成品宽',100,500),heightMm:number(p.heightMm,'成品高',100,500),binding:option(p.binding,['unknown','layflat','perfect','saddle'],'装订'),bleedMm:number(p.bleedMm,'出血',0,30,true),safeMm:number(p.safeMm,'安全边',0,50,true),spineMm:number(p.spineMm,'书脊宽',0,100,true),supplier:text(p.supplier,'印厂',100,true),product:text(p.product,'产品',100,true),paper:text(p.paper,'纸张',160,true),sourceUrl:text(p.sourceUrl,'规格来源',500,true),pdfPageMode:option(p.pdfPageMode,['single','spread'],'PDF 分页'),confirmed:false};
  if(profile.sourceUrl&&!/^https?:\/\//.test(profile.sourceUrl))throw new Error('规格来源须为 http 或 https 地址');
  b.printProfile=profile;break;}
 default:throw new Error('未知书稿操作');
 }
 // A profile is a preview intent, never a printer certification. Layout changes retain every crop.
 return save(db,before,b);
 });}
export function undoBook(db,{id,expectedVersion,undoId}){return transaction(db,()=>{const b=current(db,id,expectedVersion),h=db.prepare('SELECT * FROM book_history WHERE id=?').get(undoId);if(!h||h.bookId!==id||h.afterVersion!==b.version)throw new Error('不能撤销旧操作或其他书稿的操作');return save(db,b,JSON.parse(h.beforeData));});}

// An editorial edition forks the saved book, not a potentially older storyboard.
// Preserve all placements and manual adjustments; never reflow the source in place.
export function forkBook(db,{id,expectedVersion,name,spreadPlan}){return transaction(db,()=>{
 const source=current(db,id,expectedVersion),b=structuredClone(source),existing=new Map(source.spreads.flatMap(s=>s.placements.map(p=>[p.photoId,{p,chapterId:s.chapterId}]))),used=new Set();
 if(!Array.isArray(spreadPlan)||!spreadPlan.length||spreadPlan.length>1000)throw new Error('跨页计划格式错误');
 b.spreads=spreadPlan.map(entry=>{
  if(!Array.isArray(entry.photoIds)||entry.photoIds.length<1||entry.photoIds.length>6)throw new Error('每跨页须有一至六张照片');
  const placements=entry.photoIds.map(photoId=>{const item=existing.get(photoId);if(!item||item.chapterId!==entry.chapterId||used.has(photoId))throw new Error('跨页计划照片缺失、跨章或重复');used.add(photoId);return item.p;});
  const refs=entry.analysisRefs;
  if(!Array.isArray(refs)||refs.length!==placements.length)throw new Error('编排须逐张引用当前分析');
  const seen=new Set();for(const ref of refs){const p=placements.find(p=>p.photoId===ref.photoId),a=db.prepare('SELECT * FROM analyses WHERE id=? AND photoId=?').get(ref.analysisId,ref.photoId),asset=db.prepare('SELECT * FROM photos WHERE id=?').get(ref.photoId);
   if(!p||seen.has(ref.photoId)||!a||a.decision==='rejected'||a.sourceHash!==p.sourceHash||a.previewHash!==p.previewHash||asset?.hash!==p.sourceHash||asset?.previewHash!==p.previewHash)throw new Error('编排分析或素材已变化，请重新核对');seen.add(ref.photoId);
  }
  return{id:randomUUID(),chapterId:entry.chapterId,title:text(entry.title??'','跨页标题',100,true),layout:layout(entry.layout,placements.length),placements,editorial:{rationale:text(entry.rationale,'搭配依据',800),analysisRefs:structuredClone(refs)}};
 });
 if(used.size!==existing.size)throw new Error('独立编排必须保留来源书稿全部照片');
 for(const s of source.spreads.filter(s=>s.title))if(!b.spreads.some(n=>n.chapterId===s.chapterId&&n.title===s.title))throw new Error('独立编排必须保留现有标题');
 delete b.archived;b.name=text(name,'书稿名');b.sourceBookId=source.id;b.sourceBookVersion=source.version;delete b.id;delete b.version;delete b.updatedAt;
 const nextId=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO books VALUES(?,?,?,?)').run(nextId,JSON.stringify(b),1,now);return{book:readBook(db,nextId)};
});}

export function deleteArchivedBook(db,{id,expectedVersion}){return transaction(db,()=>{const b=current(db,id,expectedVersion);if(!b.archived)throw new Error('仅可删除已归档书稿');db.prepare('DELETE FROM book_history WHERE bookId=?').run(id);db.prepare('DELETE FROM books WHERE id=?').run(id);return{id,name:b.name,deleted:true};});}
