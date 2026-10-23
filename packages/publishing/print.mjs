import PDFDocument from 'pdfkit';
import{randomUUID,createHash}from'node:crypto';
import{mkdir,readFile,writeFile,rename,readdir,stat}from'node:fs/promises';
import{createWriteStream}from'node:fs';
import{finished}from'node:stream/promises';
import{join}from'node:path';
import{readBook}from'../domain/book.mjs';
import{hashFile}from'../metadata/importer.mjs';
import{freezeReview,drawCoverContent,drawSpreadContent,drawMatterContent}from'./review.mjs';
import{prepareHighResolution,resolutionReport}from'./high-resolution.mjs';
import{bookDesign,interiorLeaves,paperColor}from'./book-design.mjs';
import{spreadFrames}from'./geometry.mjs';
import{spineTexts}from'./text.mjs';
import{kaiFont}from'./fonts.mjs';
const MM=72/25.4,validId=/^[0-9a-f]{8}-[0-9a-f-]{27}$/;
const digest=b=>createHash('sha256').update(b).digest('hex');
async function atomic(path,value){await writeFile(path+'.tmp',JSON.stringify(value,null,2));await rename(path+'.tmp',path);}
function jobDir(dataDir,id){if(!validId.test(id))throw Error('导出引用无效');return join(dataDir,'exports','book-print',id);}
function parameter(value,label,max){if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw Error(`${label}参数无效`);return value;}
export function parsePageRange(value,total){if(typeof value!=='string'||value.length>2000)throw Error('页码范围格式错误');if(!value.trim())return Array.from({length:total},(_,i)=>i+1);const result=new Set();for(const part of value.replaceAll('，',',').split(',')){const m=part.trim().match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);if(!m)throw Error('页码请填写如 1-8, 15, 20-24');const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>total)throw Error(`正文页码须在 1–${total} 之间`);for(let n=a;n<=b;n++)result.add(n);}return[...result].sort((a,b)=>a-b);}
export function printPlan(book,input){
 if(!['interior','cover','both'].includes(input.target))throw Error('请选择导出内容');
 if(input.includeBlanks!==undefined&&typeof input.includeBlanks!=='boolean')throw Error('留白页选项无效');if(input.parameters!==undefined&&(!input.parameters||typeof input.parameters!=='object'||Array.isArray(input.parameters)))throw Error('印刷参数格式无效');
 const p=input.parameters||{},parameters={spineMm:parameter(p.spineMm,'书脊宽',100),bleedMm:parameter(p.bleedMm,'出血',30),safeMm:parameter(p.safeMm,'安全边',50)};
 if(input.target!=='interior'&&parameters.spineMm===null)throw Error('封面展开需要书脊宽度，请填写商家确认值；未确认时可先导出内页样片');
 const pages=input.target==='cover'?[]:parsePageRange(input.range??'',book.spreads.length*2),d=bookDesign(book),includeBlanks=input.includeBlanks!==false;
 let leaves=[...(includeBlanks?Array.from({length:d.frontBlankPages},(_,i)=>({kind:'blank',label:`前留白 ${i+1}`})):[]),...pages.map(page=>({kind:'body',page,spreadIndex:Math.floor((page-1)/2),side:(page-1)%2})),...(includeBlanks?Array.from({length:d.backBlankPages},(_,i)=>({kind:'blank',label:`后留白 ${i+1}`})):[])];
 if(d.readingEdition&&input.target!=='cover'){
  const selected=new Set(pages),blocks=new Set(pages.map(p=>Math.floor((p-1)/2)));
  leaves=interiorLeaves(book).filter(l=>l.kind==='body'?blocks.has(l.spreadIndex):includeBlanks).map(l=>l.kind==='body'&&!selected.has(l.page)?{kind:'blank',side:l.side,label:`样片留空 · 未选正文 ${l.page}`} : l);
  // A sample is also right-starting: keep each requested spread together without
  // reading assets for its omitted half or inventing adjacencies across gaps.
  if(!includeBlanks)leaves=[{kind:'blank',side:1,label:'样片起始留白'},...leaves,{kind:'blank',side:0,label:'样片收尾留白'}];
 }
 return{target:input.target,parameters,pages,leaves:input.target==='cover'?[]:leaves,includeBlanks,pending:['spineMm','bleedMm','safeMm'].filter(k=>parameters[k]===null),certified:false};
}
export async function createPrint(db,dataDir,input){
 const book=readBook(db,input.id);if(book.version!==input.expectedVersion)throw Error('书稿已变化，请重新打开后导出');const plan=printPlan(book,input),ids=new Set(),w=book.printProfile.widthMm,h=book.printProfile.heightMm;
 for(const leaf of plan.leaves)if(leaf.kind==='body'){const s=book.spreads[leaf.spreadIndex],frames=spreadFrames(w,h,s.layout,s.placements.length,!!s.title);s.placements.forEach((p,i)=>{if(frames[i].x<(leaf.side+1)*w&&frames[i].x+frames[i].width>leaf.side*w)ids.add(p.photoId);});}
 if(plan.target!=='interior'){if(book.cover.style!=='text'&&book.cover.front)ids.add(book.cover.front.photoId);if(book.cover.back)ids.add(book.cover.back.photoId);}
 const snapshot=freezeReview(db,{id:input.id,expectedVersion:input.expectedVersion,quality:'highres',assetPhotoIds:ids});Object.assign(snapshot,{kind:'book-print-delivery-v1',renderVersion:bookDesign(book).readingEdition?'print-facing-v2':'print-pdf-v1',print:plan,sourceContentPages:snapshot.contentPages,contentPages:plan.pages.length,matterPages:plan.leaves.filter(l=>l.kind==='blank').length,logicalPages:plan.leaves.length,pdfPages:plan.leaves.length+(plan.target!=='interior'?1:0)});
 const id=randomUUID(),dir=jobDir(dataDir,id);await mkdir(join(dir,'assets'),{recursive:true});const state={id,bookId:book.id,bookName:book.name,bookVersion:book.version,status:'running',ownerPid:process.pid,phase:'准备印刷结构',totalPages:plan.leaves.length+(plan.target!=='interior'?1:0),completedPages:0,createdAt:snapshot.createdAt,target:plan.target,pages:plan.pages,includeBlanks:plan.includeBlanks,parameters:plan.parameters,pending:plan.pending,certified:false,files:[]};await atomic(join(dir,'status.json'),state);return{id,dir,state,snapshot};
}
function addPage(doc,w,h,bleed){doc.addPage({size:[(w+2*bleed)*MM,(h+2*bleed)*MM],margin:0});doc.page.dictionary.data.TrimBox=[bleed*MM,bleed*MM,(bleed+w)*MM,(bleed+h)*MM];doc.page.dictionary.data.BleedBox=[0,0,(w+2*bleed)*MM,(h+2*bleed)*MM];doc.save().translate(bleed*MM,bleed*MM);}
export async function renderPrint(job){
 const{snapshot,state,dir}=job;let activeDoc,activeStream,completion;
 try{
  await prepareHighResolution(job,()=>atomic(join(dir,'status.json'),state));const report=resolutionReport(snapshot);snapshot.resolution=report;state.resolution={targetPpi:300,minPpi:Number.isFinite(report.minPpi)?report.minPpi:null,belowTarget:report.belowTarget};
  const fontPath=process.env.PBS_PDF_FONT||'/System/Library/Fonts/Supplemental/Songti.ttc',font=await readFile(fontPath),fontName=process.env.PBS_PDF_FONT_NAME||'STSongti-SC-Regular',kai=snapshot.assets.some(a=>[snapshot.book.cover.front,snapshot.book.cover.back,...snapshot.book.spreads.flatMap(s=>s.placements)].some(p=>p?.photoId===a.photoId&&p.caption?.trim()))?await kaiFont():null;
  snapshot.font={name:fontName,sha256:digest(font)};if(kai)snapshot.captionFont={name:kai.name,sha256:digest(kai.bytes)};
  const book=snapshot.book,plan=snapshot.print,w=book.printProfile.widthMm,h=book.printProfile.heightMm,b=plan.parameters.bleedMm??0,assets=new Map(snapshot.assets.map(a=>[a.photoId,a]));
  for(const type of ['cover','interior'].filter(t=>plan.target===t||plan.target==='both')){
   state.phase=type==='cover'?'生成封面展开':'生成逐页内页';await atomic(join(dir,'status.json'),state);
   const temp=join(dir,type+'.partial.pdf'),path=join(dir,type+'.pdf');activeDoc=new PDFDocument({autoFirstPage:false,compress:true,ignoreOrientation:true,info:{Title:`${book.name} · ${type==='cover'?'封面展开':'逐页内页'} · v${book.version}`,Author:'Photo Book Studio',Subject:`RGB 原片派生；印厂认证及打样待确认。参数待填：${plan.pending.join(',')||'无（仍需印厂核对）'}；正文页码：${plan.pages.join(',')}`}});const doc=activeDoc;doc.registerFont('BookSong',font,fontName);doc.registerFont('BookCover',font,'STSongti-SC-Bold');if(kai)doc.registerFont('BookKai',kai.bytes,kai.name);doc.font('BookSong');activeStream=createWriteStream(temp,{flags:'wx'});completion=finished(activeStream);completion.catch(()=>{});doc.on('error',e=>activeStream?.destroy(e));doc.pipe(activeStream);
   if(type==='cover'){
    const spine=plan.parameters.spineMm;addPage(doc,w*2+spine,h,b);doc.rect(-b*MM,-b*MM,(w*2+spine+2*b)*MM,(h+2*b)*MM).fill('#eee6d9');drawCoverContent(doc,book,assets,dir,'back',{bleedMm:b});doc.save().translate((w+spine)*MM,0);drawCoverContent(doc,book,assets,dir,'front',{bleedMm:b});doc.restore();doc.rect(w*MM,-b*MM,spine*MM,(h+2*b)*MM).fill('#eee6d9');if(book.cover.spineStyle==='editorial-vertical')for(const t of spineTexts(book,spine)){doc.font('BookSong').fontSize(t.size*MM).fillColor('#25201b');doc.text(t.text,(w+spine/2)*MM-(doc.widthOfString(t.text)+(Array.from(t.text).length-1)*t.tracking*MM)/2,t.y*MM,{lineBreak:false,baseline:'alphabetic',characterSpacing:t.tracking*MM});}if(book.cover.spineStyle!=='editorial-vertical'&&spine>0&&book.cover.spineText){doc.save().translate((w+spine/2)*MM,h/2*MM).rotate(90);doc.font('BookSong').fontSize(Math.min(4,spine*.65)*MM);const width=doc.widthOfString(book.cover.spineText),scale=Math.min(1,(h-30)*MM/Math.max(1,width));doc.fontSize(Math.min(4,spine*.65)*MM*scale).fillColor('#25201b').text(book.cover.spineText,-width*scale/2,0,{lineBreak:false,baseline:'alphabetic'});doc.restore();}doc.restore();state.completedPages++;
   }else for(const leaf of plan.leaves){
    addPage(doc,w,h,b);doc.rect(-b*MM,-b*MM,(w+2*b)*MM,(h+2*b)*MM).fill(paperColor(book));if(leaf.kind==='body'){doc.save().rect(-b*MM,-b*MM,(w+2*b)*MM,(h+2*b)*MM).clip().translate(-leaf.side*w*MM,0);drawSpreadContent(doc,book,book.spreads[leaf.spreadIndex],leaf.spreadIndex,assets,dir,{pageSide:leaf.side,bleedMm:b});doc.restore();}else if(leaf.kind==='title'||leaf.kind==='closing')drawMatterContent(doc,book,leaf.kind);doc.restore();doc.outline.addItem(leaf.kind==='body'?`正文 ${leaf.page}`:leaf.label);state.completedPages++;if(state.completedPages%8===0)await atomic(join(dir,'status.json'),state);await new Promise(resolve=>setImmediate(resolve));
   }
   doc.end();await completion;await rename(temp,path);state.files.push({type,filename:`${book.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')}-${type==='cover'?'封底-书脊-封面':'内页逐页'}-v${book.version}.pdf`,bytes:(await stat(path)).size,hash:await hashFile(path),pages:type==='cover'?1:plan.leaves.length});activeDoc=null;activeStream=null;completion=null;
  }
  snapshot.snapshotHash=digest(Buffer.from(JSON.stringify(snapshot)));await atomic(join(dir,'manifest.json'),snapshot);Object.assign(state,{status:'ready',phase:'完成',completedAt:new Date().toISOString(),snapshotHash:snapshot.snapshotHash});await atomic(join(dir,'status.json'),state);return state;
 }catch(error){activeDoc?.destroy();activeStream?.destroy();await completion?.catch(()=>{});state.status='failed';state.error=error.message;state.phase='未完成';await atomic(join(dir,'status.json'),state);throw error;}
}
export async function readPrint(dataDir,id){const path=join(jobDir(dataDir,id),'status.json'),s=JSON.parse(await readFile(path,'utf8'));if(s.status==='running'){try{process.kill(s.ownerPid,0);}catch(e){if(e.code==='ESRCH'){s.status='failed';s.error='上次导出已中断，请重新生成';await atomic(path,s);}}}return s;}
export async function listPrints(dataDir,bookId){let ids;try{ids=await readdir(join(dataDir,'exports','book-print'));}catch(e){if(e.code==='ENOENT')return[];throw e;}const rows=[];for(const id of ids.filter(id=>validId.test(id)))try{const s=await readPrint(dataDir,id);if(s.bookId===bookId)rows.push(s);}catch{}return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10);}
export async function printFileInfo(dataDir,id,type){if(!['cover','interior'].includes(type))throw Error('文件类型无效');const state=await readPrint(dataDir,id),file=state.files.find(f=>f.type===type);if(state.status!=='ready'||!file)throw Error('PDF 尚未生成完成');const path=join(jobDir(dataDir,id),type+'.pdf');if(await hashFile(path)!==file.hash)throw Error('导出文件校验失败');return{path,file,bytes:(await stat(path)).size};}
