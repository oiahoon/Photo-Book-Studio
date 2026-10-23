import{extraMatterPages,matterPages,bookDesign,paperColor,coverBackFrame}from'./book-design.mjs';
import PDFDocument from 'pdfkit';
import {kaiFont} from './fonts.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,readdir,realpath,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {join,resolve,basename,relative} from 'node:path';
import {readBook} from '../domain/book.mjs';
import {transaction} from '../domain/store.mjs';
import {spreadFrames,fitImage,captionGeometry} from './geometry.mjs';
import {jpegSize} from './image.mjs';
import {hashFile} from '../metadata/importer.mjs';
import {prepareHighResolution,resolutionReport} from './high-resolution.mjs';
import {textLines,spreadTexts,spreadPlace,footerStyle,footerPositions,matterTexts,coverTitles,coverBackTexts} from './text.mjs';

const MM=72/25.4;
const digest=b=>createHash('sha256').update(b).digest('hex');
const idPattern=/^[0-9a-f]{8}-[0-9a-f-]{27}$/;
function qualityKind(quality){if(!['review','highres'].includes(quality))throw new Error('导出类型无效');return quality==='highres'?'book-highres':'book-review';}
function jobDir(dataDir,id,quality='review'){if(!idPattern.test(id))throw new Error('导出引用无效');return join(dataDir,'exports',qualityKind(quality),id);}
async function atomic(path,data){const temp=path+'.tmp';await writeFile(temp,JSON.stringify(data,null,2));await rename(temp,path);}

function references(book){return[...book.spreads.flatMap(s=>s.placements),...(book.cover.style!=='text'&&book.cover.front?[book.cover.front]:[]),...(book.cover.back?[book.cover.back]:[])];}
export function freezeReview(db,{id,expectedVersion,quality='review',assetPhotoIds}){
 qualityKind(quality);return transaction(db,()=>{
  const book=readBook(db,id);if(!Number.isInteger(expectedVersion)||book.version!==expectedVersion)throw new Error('书稿已变化，请重新打开后导出');
  if(!book.spreads.length)throw new Error('书稿没有内页');
  const assets=new Map();for(const p of references(book).filter(p=>!assetPhotoIds||assetPhotoIds.has(p.photoId))){
   const current=db.prepare('SELECT hash,preview,previewHash,status,active FROM photos WHERE id=?').get(p.photoId),adjustment=db.prepare('SELECT version,rotation FROM photo_adjustments WHERE photoId=?').get(p.photoId);
   if(!current?.active||current.status!=='ready'||!p.preview||current.hash!==p.sourceHash||current.preview!==p.preview||current.previewHash!==p.previewHash||(adjustment?.version||0)!==p.orientationVersion||(adjustment?.rotation||0)!==p.rotation)throw new Error(`素材需复核：${p.filename}。请确认版本后再导出。`);
   if(!/^[a-zA-Z0-9-]+\.jpg$/.test(p.preview)||basename(p.preview)!==p.preview)throw new Error('预览引用无效');
   const location=db.prepare('SELECT data,version FROM photo_locations WHERE photoId=?').get(p.photoId);
   const source=quality==='highres'?db.prepare('SELECT s.path AS root,p.relativePath FROM photos p JOIN sources s ON s.id=p.sourceId WHERE p.id=?').get(p.photoId):null;
   assets.set(p.photoId,{...(source?{source}:{}),photoId:p.photoId,sourceHash:p.sourceHash,preview:p.preview,previewHash:p.previewHash,orientationVersion:p.orientationVersion,rotation:p.rotation,location:location?{...JSON.parse(location.data),version:location.version}:null});
  }
  return{schemaVersion:1,kind:quality==='highres'?'book-highres-spreads-v1':'book-review-spreads-v1',quality,book:structuredClone(book),assets:[...assets.values()],contentPages:book.spreads.length*2,matterPages:matterPages(book),logicalPages:book.spreads.length*2+matterPages(book)+extraMatterPages(book),pdfPages:book.spreads.length+2+matterPages(book)/2+extraMatterPages(book),renderVersion:bookDesign(book).readingEdition?(quality==='highres'?'highres-facing-v2':'review-facing-v2'):(quality==='highres'?'highres-pdf-v1':'review-pdf-v1'),createdAt:new Date().toISOString()};
 });
}
export async function createReview(db,dataDir,input){
 const snapshot=freezeReview(db,{id:input.id,expectedVersion:input.expectedVersion,quality:input.quality}),id=randomUUID(),dir=jobDir(dataDir,id,input.quality||'review');
 await mkdir(join(dir,'assets'),{recursive:true});
 const state={id,quality:input.quality||'review',bookId:snapshot.book.id,bookVersion:snapshot.book.version,bookName:snapshot.book.name,status:'running',ownerPid:process.pid,phase:input.quality==='highres'?'准备高清派生图':'冻结预览',completedPages:0,totalPages:snapshot.pdfPages,logicalPages:snapshot.logicalPages,photoCount:new Set(snapshot.book.spreads.flatMap(s=>s.placements.map(p=>p.photoId))).size,createdAt:snapshot.createdAt};
 await atomic(join(dir,'status.json'),state);return{id,dir,snapshot,state};
}
export async function readReview(dataDir,id,quality='review'){
 const path=join(jobDir(dataDir,id,quality),'status.json'),row=JSON.parse(await readFile(path,'utf8'));
 if(row.status==='running'&&Number.isInteger(row.ownerPid)&&row.ownerPid>0){try{process.kill(row.ownerPid,0);}catch(e){if(e.code==='ESRCH'){Object.assign(row,{status:'failed',phase:'已中断',error:'上次导出被中断，请重新生成 PDF。'});await atomic(path,row);}}}
 return row;
}
export async function listReviews(dataDir,bookId,quality='review'){
 const root=join(dataDir,'exports',qualityKind(quality));let dirs;try{dirs=await readdir(root);}catch(e){if(e.code==='ENOENT')return[];throw e;}
 const rows=[];for(const id of dirs.filter(id=>idPattern.test(id))){try{const row=await readReview(dataDir,id,quality);if(row.bookId===bookId)rows.push(row);}catch{/* An unfinished manifest is not a downloadable artifact. */}}
 return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10);
}
export async function reviewFileInfo(dataDir,id,quality='review'){
 const state=await readReview(dataDir,id,quality);if(state.status!=='ready')throw new Error('PDF 尚未生成完成');
 const path=join(jobDir(dataDir,id,quality),'review.pdf');if(await hashFile(path)!==state.pdfHash)throw new Error('导出文件校验失败，请重新导出');return{state,path,bytes:(await stat(path)).size};
}
export async function reviewFile(dataDir,id,quality='review'){
 const state=await readReview(dataDir,id,quality);if(state.status!=='ready')throw new Error('PDF 尚未生成完成');
 const path=join(jobDir(dataDir,id,quality),'review.pdf'),bytes=await readFile(path);if(digest(bytes)!==state.pdfHash)throw new Error('导出文件校验失败，请重新导出');return{state,bytes,path};
}
export function drawText(doc,spec){
 const {font,rows}=textLines(spec.text,spec.width,spec.size,spec.maxLines,spec.tracking);
 doc.fillColor(spec.fill||'#25201b').font(spec.weight===600?'BookCover':'BookSong').fontSize(font*MM);
 for(const [i,row]of rows.entries())doc.text(row,spec.x*MM,(spec.y+i*font*1.35)*MM,{lineBreak:false,baseline:'alphabetic',characterSpacing:(spec.tracking||0)*MM});
}
export function drawImage(doc,placement,frame,asset,dir,overlay=false){
 const geometry=captionGeometry(frame,placement,overlay,asset.width,asset.height);frame=geometry.frame;
 const fitted=fitImage(frame.width,frame.height,asset.width,asset.height,placement);
 doc.save().rect(frame.x*MM,frame.y*MM,frame.width*MM,frame.height*MM).clip();
 doc.image(join(dir,asset.file),(frame.x+fitted.x)*MM,(frame.y+fitted.y)*MM,{width:fitted.width*MM,height:fitted.height*MM,ignoreOrientation:true});doc.restore();
 const c=geometry.caption;if(c){
  if(c.overlay)doc.save().fillOpacity(.48).rect(c.band.x*MM,c.band.y*MM,c.band.width*MM,c.band.height*MM).fill('#16120e').restore();
  doc.font('BookKai').fontSize(c.size*MM);const size=Math.min(c.size*MM,c.size*MM*c.width*MM/Math.max(1,doc.widthOfString(c.text)));doc.fontSize(size).fillColor(c.overlay?'#fffdf8':'#25201b');
  doc.text(c.text,c.x*MM-doc.widthOfString(c.text)/2,c.y*MM,{lineBreak:false,baseline:'alphabetic'});
 }
}
function drawCover(doc,book,assets,dir,side){
 const w=book.printProfile.widthMm,h=book.printProfile.heightMm;doc.addPage({size:[w*MM,h*MM],margin:0});drawCoverContent(doc,book,assets,dir,side);
}
export function drawCoverContent(doc,book,assets,dir,side,{bleedMm=0}={}){
 const w=book.printProfile.widthMm,h=book.printProfile.heightMm,c=book.cover;doc.rect(-bleedMm*MM,-bleedMm*MM,(w+2*bleedMm)*MM,(h+2*bleedMm)*MM).fill('#eee6d9');
 if(side==='back'){if(c.back)drawImage(doc,c.back,expandBleedFrame(coverBackFrame(book),0,w,h,bleedMm),assets.get(c.back.photoId),dir,c.backStyle==='bleed');if(c.backStyle==='bleed')doc.save().fillOpacity(.35).rect(0,(h-28)*MM,w*MM,28*MM).fill('#1d1914').restore();for(const spec of coverBackTexts(book))drawText(doc,spec);return;}
 if(c.style!=='text'&&c.front){const bleed=c.style==='bleed';drawImage(doc,c.front,expandBleedFrame({x:bleed?0:25,y:bleed?0:h*.3,width:bleed?w:w-50,height:bleed?h:h*.54},0,w,h,bleedMm),assets.get(c.front.photoId),dir,bleed);}
 if(c.showTitle!==false&&c.style==='bleed'&&(c.inkTone||(book.design?.coverTypography==='editorial'?'ink':'light'))==='light')doc.save().fillOpacity(.58).rect(0,0,w*MM,h*.25*MM).fill('#1d1914').restore();
 for(const spec of coverTitles(book))drawText(doc,spec);
}
export async function renderReview(job,{fontPath=process.env.PBS_PDF_FONT||'/System/Library/Fonts/Supplemental/Songti.ttc',fontName=process.env.PBS_PDF_FONT_NAME||'STSongti-SC-Regular'}={}){
 const {dir,snapshot,state}=job,path=join(dir,'review.pdf'),temp=join(dir,'review.partial.pdf');
 let doc,output,completion;
 try{
  const fontBytes=await readFile(fontPath);snapshot.font={name:fontName,sha256:digest(fontBytes),embedded:true};if(snapshot.book.design?.coverTypography==='editorial')snapshot.coverFont={name:'STSongti-SC-Bold',sha256:digest(fontBytes),embedded:true};
  const kai=references(snapshot.book).some(p=>p.caption?.trim())?await kaiFont():null;if(kai)snapshot.captionFont={name:kai.name,sha256:digest(kai.bytes),embedded:true};
  if(snapshot.quality==='highres'){await prepareHighResolution(job,async()=>atomic(join(dir,'status.json'),state));snapshot.resolution=resolutionReport(snapshot);state.resolution={targetPpi:300,minPpi:snapshot.resolution.minPpi,belowTarget:snapshot.resolution.belowTarget};}
  else {const cache=await realpath(join(resolve(dir,'../../../'),'cache'));
  for(const asset of snapshot.assets){
   const source=await realpath(join(cache,asset.preview));if(relative(cache,source).startsWith('..')||!(await stat(source)).isFile())throw new Error('预览路径超出项目缓存');
   const bytes=await readFile(source);if(digest(bytes)!==asset.previewHash)throw new Error(`预览校验失败：${asset.preview}，请重建预览`);
   const file='assets/'+asset.previewHash+'.jpg';await writeFile(join(dir,file),bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});Object.assign(asset,{file,...jpegSize(bytes)});
  }
  }
  snapshot.snapshotHash=digest(Buffer.from(JSON.stringify(snapshot)));await atomic(join(dir,'manifest.json'),snapshot);
  state.phase='生成 PDF';await atomic(join(dir,'status.json'),state);
  doc=new PDFDocument({autoFirstPage:false,compress:true,ignoreOrientation:true,info:{Title:snapshot.book.name+(snapshot.quality==='highres'?' · 高清版':' · 审阅版'),Author:'Photo Book Studio',Subject:`${snapshot.quality==='highres'?'原片派生高清 RGB 版，印厂参数待确认，非印厂认证文件。':'预览图审阅版，非印刷文件。'}书稿 v${snapshot.book.version}；正文 1-${snapshot.contentPages||snapshot.logicalPages}，另有 ${snapshot.matterPages||0} 面前后留白。`}});
  doc.registerFont('BookSong',fontBytes,fontName);doc.registerFont('BookCover',fontBytes,'STSongti-SC-Bold');if(kai)doc.registerFont('BookKai',kai.bytes,kai.name);doc.font('BookSong');output=createWriteStream(temp,{flags:'wx'});completion=finished(output);completion.catch(()=>{});doc.on('error',e=>output.destroy(e));doc.pipe(output);
  const book=snapshot.book,assets=new Map(snapshot.assets.map(a=>[a.photoId,a])),w=book.printProfile.widthMm,h=book.printProfile.heightMm;
  drawCover(doc,book,assets,dir,'front');doc.outline.addItem('封面');state.completedPages=1;
  const blank=label=>{doc.addPage({size:[w*2*MM,h*MM],margin:0});doc.rect(0,0,w*2*MM,h*MM).fill(paperColor(book));doc.outline.addItem(label);};
  const blankFirst=bookDesign(book).blankFirst;
  const singleBlank=label=>{doc.addPage({size:[w*MM,h*MM],margin:0});doc.rect(0,0,w*MM,h*MM).fill(paperColor(book));doc.outline.addItem(label);};
  const matter=(kind)=>{doc.addPage({size:[w*(blankFirst?2:1)*MM,h*MM],margin:0});doc.rect(0,0,w*2*MM,h*MM).fill(paperColor(book));doc.save();if(blankFirst&&kind==='title')doc.translate(w*MM,0);drawMatterContent(doc,book,kind);doc.restore();doc.outline.addItem(kind==='title'?'内封题名':'收尾页');};
  if(blankFirst){singleBlank('前留白第一面');matter('title');}else{if(bookDesign(book).readingEdition)matter('title');if(bookDesign(book).frontBlankPages)blank('前扉页 · 留白');}
  const chapters=new Set();
  for(const [index,spread]of book.spreads.entries()){
   doc.addPage({size:[w*2*MM,h*MM],margin:0});doc.rect(0,0,w*2*MM,h*MM).fill(paperColor(book));
   drawSpreadContent(doc,book,spread,index,assets,dir);
   if(!chapters.has(spread.chapterId)){chapters.add(spread.chapterId);doc.outline.addItem(book.spreads.find(s=>s.chapterId===spread.chapterId&&s.title)?.title||`章节 ${chapters.size}`);}
   state.completedPages=index+2+bookDesign(book).frontBlankPages/2+(bookDesign(book).readingEdition?1:0);if(index%8===0)await atomic(join(dir,'status.json'),state);await new Promise(resolve=>setImmediate(resolve));
  }
  if(blankFirst){matter('closing');singleBlank('后留白第二面');}else{if(bookDesign(book).backBlankPages)blank('后留白页');if(bookDesign(book).readingEdition)matter('closing');}
  drawCover(doc,book,assets,dir,'back');doc.outline.addItem('封底');doc.end();await completion;await rename(temp,path);
  const bytes=(await stat(path)).size;Object.assign(state,{status:'ready',phase:'完成',completedPages:snapshot.pdfPages,bytes,pdfHash:await hashFile(path),snapshotHash:snapshot.snapshotHash,filename:`${book.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')}-${snapshot.quality==='highres'?'高清版':'审阅版'}-v${book.version}.pdf`,completedAt:new Date().toISOString()});await atomic(join(dir,'status.json'),state);return state;
 }catch(error){doc?.destroy();output?.destroy();await completion?.catch(()=>{});Object.assign(state,{status:'failed',phase:'未完成',error:error.code==='ENOENT'?'所需原片、预览或中文字体缺失，请检查本地文件后重试':error.message});await atomic(join(dir,'status.json'),state);throw error;}
}

export function expandBleedFrame(f,left,w,h,b){if(!b)return f;const x=f.x<=left+.01?f.x-b:f.x,y=f.y<=.01?f.y-b:f.y,right=f.x+f.width>=(left+w)-.01?f.x+f.width+b:f.x+f.width,bottom=f.y+f.height>=h-.01?f.y+f.height+b:f.y+f.height;return{x,y,width:right-x,height:bottom-y};}
export function drawSpreadContent(doc,book,spread,index,assets,dir,{pageSide=null,bleedMm=0}={}){const w=book.printProfile.widthMm,h=book.printProfile.heightMm;
const frames=spreadFrames(w,h,spread.layout,spread.placements.length,!!spread.title);
   for(const [i,p]of spread.placements.entries())if(pageSide===null||(frames[i].x<(pageSide+1)*w&&frames[i].x+frames[i].width>pageSide*w))drawImage(doc,p,pageSide===null?frames[i]:expandBleedFrame(frames[i],pageSide*w,w,h,bleedMm),assets.get(p.photoId),dir,spread.layout==='bleed');
   for(const spec of spreadTexts(book,spread))drawText(doc,spec);
   const footer=footerStyle(book);
   if(spread.layout!=='bleed')for(const i of[0,1]){
    const pos=footerPositions(w,i),place=spreadPlace(book,spread);doc.font('BookSong').fontSize(footer.size*MM);const placeWidth=doc.widthOfString(place)/MM;drawText(doc,{text:place,x:pos.placeX-(pos.placeAnchor==='end'?placeWidth:0),y:h-9,width:w-30,size:footer.size,maxLines:1,fill:footer.fill});
    const page=String(index*2+i+1);doc.font('BookSong').fontSize(footer.size*MM);const width=doc.widthOfString(page)/MM;drawText(doc,{text:page,x:pos.pageX-(pos.pageAnchor==='end'?width:0),y:h-9,width:20,size:footer.size,maxLines:1,fill:footer.fill});
   }

}

export function drawMatterContent(doc,book,kind){doc.rect(0,0,book.printProfile.widthMm*MM,book.printProfile.heightMm*MM).fill(paperColor(book));for(const spec of matterTexts(book,kind))drawText(doc,spec);}
