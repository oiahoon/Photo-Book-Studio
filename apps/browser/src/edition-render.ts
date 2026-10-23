import type {Project} from './model';
import type {BookPlacement,BookSpread} from '../../web/src/book-types';
import type {TextSpec} from '../../../packages/publishing/text.mjs';
import {spreadFrames,fitImage,captionGeometry} from '../../../packages/publishing/geometry.mjs';
import {textLines,spreadTexts,spreadPlace,footerPositions,footerStyle,coverTitles,coverBackTexts,matterTexts,spineTexts} from '../../../packages/publishing/text.mjs';
import {paperColor,coverBackFrame,interiorLeaves} from '../../../packages/publishing/book-design.mjs';
import {asset} from './storage';
import {bitmap,hash,original} from './media';
type Rect={x:number;y:number;width:number;height:number};
function text(c:CanvasRenderingContext2D,s:TextSpec){const {font,rows}=textLines(s.text,s.width,s.size,s.maxLines,s.tracking);c.save();c.fillStyle=s.fill||'#25201b';c.font=`${s.weight||400} ${font}px "Songti SC", SimSun, serif`;c.letterSpacing=`${s.tracking||0}px`;for(const[i,row]of rows.entries())c.fillText(row,s.x,s.y+i*font*1.35);c.restore();}
async function image(c:CanvasRenderingContext2D,p:Project,q:BookPlacement,rect:Rect,full:boolean,warnings:string[],overlay=false){
 const photo=p.photos.find(x=>x.id===q.photoId);if(!photo)throw Error('书稿照片缺少：'+q.filename);if(q.sourceHash!==photo.hash||q.rotation!==photo.rotation)throw Error('书稿照片版本需复核：'+q.filename);
 const a=await asset(p.id,photo.id);let source:Blob|undefined,rotation=0;
 if(full&&a?.render){if(a.sourceHash!==photo.hash||!a.renderHash||await hash(a.render)!==a.renderHash)throw Error('派生图校验失败：'+q.filename);source=a.render;rotation=q.rotation-(a.renderRotation||0);}
 else if(full){source=await original(p,photo);rotation=q.rotation;}
 else {source=a?.thumbnail;rotation=q.rotation-(photo.previewRotationApplied||0);}
 if(!source){if(full)throw Error('请连接迁移素材：'+q.filename);c.fillStyle='#eee8df';c.fillRect(rect.x,rect.y,rect.width,rect.height);c.fillStyle='#8e6d5f';c.font='4px sans-serif';c.fillText('素材未连接',rect.x+5,rect.y+rect.height/2);return;}
 const b=await bitmap(source,(rotation+360)%360);try{const g=captionGeometry(rect,q,overlay,b.width,b.height),r=g.frame,f=fitImage(r.width,r.height,b.width,b.height,q);c.save();c.beginPath();c.rect(r.x,r.y,r.width,r.height);c.clip();c.drawImage(b,r.x+f.x,r.y+f.y,f.width,f.height);c.restore();
 const ppi=Math.min(b.width/f.width,b.height/f.height)*25.4;if(full&&ppi<c.getTransform().a*25.4-.5)warnings.push(`${photo.name}：${Math.floor(ppi)} ppi`);
 const cap=g.caption;if(cap){c.save();if(cap.overlay){c.fillStyle='rgba(22,18,14,.48)';c.fillRect(cap.band.x,cap.band.y,cap.band.width,cap.band.height);}c.textAlign='center';c.fillStyle=cap.overlay?'#fffdf8':'#25201b';c.font=`${cap.size}px "Kaiti SC", KaiTi, serif`;c.fillText(cap.text,cap.x,cap.y,cap.width);c.restore();}
 }finally{b.close();}
}
function setup(canvas:HTMLCanvasElement,w:number,h:number,ppi:number,bg:string){canvas.width=Math.round(w*ppi/25.4);canvas.height=Math.round(h*ppi/25.4);const c=canvas.getContext('2d')!;c.scale(ppi/25.4,ppi/25.4);c.fillStyle=bg;c.fillRect(0,0,w,h);return c;}
export async function drawEditionSpread(canvas:HTMLCanvasElement,p:Project,s:BookSpread,index:number,ppi=100,full=false,side?:number){
 const book=p.edition!,w=book.printProfile.widthMm,h=book.printProfile.heightMm,c=setup(canvas,side===undefined?2*w:w,h,ppi,paperColor(book)),warnings:string[]=[];if(side!==undefined)c.translate(-side*w,0);
 const frames=spreadFrames(w,h,s.layout,s.placements.length,!!s.title);
 for(const [i,q]of s.placements.entries()){if(side!==undefined&&Math.floor((frames[i].x+frames[i].width/2)/w)!==side)continue;await image(c,p,q,frames[i],full,warnings,s.layout==='bleed');}
 spreadTexts(book,s).forEach(t=>text(c,t));
 if(s.layout!=='bleed'){const footer=footerStyle(book);for(const leaf of [0,1]){const f=footerPositions(w,leaf);c.save();c.font=`${footer.size}px "Songti SC",serif`;c.fillStyle=footer.fill;c.textAlign=f.pageAnchor==='start'?'left':'right';c.fillText(String(index*2+leaf+1),f.pageX,h-9);c.textAlign=f.placeAnchor==='start'?'left':'right';c.fillText(spreadPlace(book,s),f.placeX,h-9);c.restore();}}
 return warnings;
}
export async function drawEditionCover(canvas:HTMLCanvasElement,p:Project,side:'front'|'back'|'wrap',ppi=100,full=false){
 const b=p.edition!,w=b.printProfile.widthMm,h=b.printProfile.heightMm,spine=b.printProfile.spineMm??8,c=setup(canvas,side==='wrap'?w*2+spine:w,h,ppi,'#eee6d9'),warnings:string[]=[];
 async function back(){if(b.cover.back)await image(c,p,b.cover.back,coverBackFrame(b),full,warnings,b.cover.backStyle==='bleed');if(b.cover.backStyle==='bleed'){c.fillStyle='rgba(29,25,20,.35)';c.fillRect(0,h-28,w,28);}coverBackTexts(b).forEach(t=>text(c,t));}
 async function front(){const bleed=b.cover.style==='bleed';if(b.cover.style!=='text'&&b.cover.front)await image(c,p,b.cover.front,{x:bleed?0:25,y:bleed?0:h*.3,width:bleed?w:w-50,height:bleed?h:h*.54},full,warnings,bleed);if(b.cover.showTitle!==false&&bleed&&(b.cover.inkTone||(b.design?.coverTypography==='editorial'?'ink':'light'))==='light'){c.fillStyle='rgba(29,25,20,.58)';c.fillRect(0,0,w,h*.25);}coverTitles(b).forEach(t=>text(c,t));}
 if(side==='front')await front();else if(side==='back')await back();else{await back();c.save();c.translate(w+spine,0);await front();c.restore();c.fillStyle='#eee6d9';c.fillRect(w,0,spine,h);c.fillStyle='#25201b';c.textAlign='center';if(b.cover.spineStyle==='editorial-vertical'){for(const t of spineTexts(b,spine)){c.font=`${t.size}px "Songti SC",serif`;c.letterSpacing=`${t.tracking}px`;c.fillText(t.text,w+spine/2,t.y);}}else{c.save();c.translate(w+spine/2,h/2);c.rotate(Math.PI/2);c.font=`${Math.min(4,spine*.65)}px serif`;c.fillText(b.cover.spineText,0,0,h-30);c.restore();}}
 return warnings;
}
export function drawEditionMatter(canvas:HTMLCanvasElement,p:Project,kind:string,ppi=100,facing=false){const b=p.edition!,c=setup(canvas,b.printProfile.widthMm*(facing?2:1),b.printProfile.heightMm,ppi,paperColor(b));if(facing&&kind==='title')c.translate(b.printProfile.widthMm,0);if(kind!=='blank')matterTexts(b,kind).forEach(t=>text(c,t));}
export async function exportEditionPDF(p:Project,kind:'review'|'interior'|'wrap',selected:number[],ppi:number,signal:AbortSignal,progress:(s:string)=>void,includeMatter=true){
 const {PDFDocument}=await import('pdf-lib'),pdf=await PDFDocument.create(),canvas=document.createElement('canvas'),b=p.edition!,w=b.printProfile.widthMm,h=b.printProfile.heightMm,warnings=new Set<string>();
 const append=async(width=w)=>{if(signal.aborted)throw Error('已取消');const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(Error('页面编码失败')),'image/jpeg',.94));const embedded=await pdf.embedJpg(await blob.arrayBuffer()),page=pdf.addPage([width*72/25.4,h*72/25.4]);page.drawImage(embedded,{x:0,y:0,width:width*72/25.4,height:h*72/25.4});canvas.width=canvas.height=1;await new Promise(r=>setTimeout(r,0));};
 if(kind==='wrap'){if(b.printProfile.spineMm===null)throw Error('书脊宽度待确认');(await drawEditionCover(canvas,p,'wrap',ppi,ppi>=300)).forEach(x=>warnings.add(x));await append(2*w+b.printProfile.spineMm);}
 else{
  if(kind==='review'){progress('生成封面');(await drawEditionCover(canvas,p,'front',ppi,ppi>=300)).forEach(x=>warnings.add(x));await append();}
  const leaves=interiorLeaves(b).filter(leaf=>leaf.kind==='body'?selected.includes(leaf.page!):includeMatter);
  for(const [i,leaf]of leaves.entries()){if(signal.aborted)throw Error('已取消');progress(`生成内页 ${i+1} / ${leaves.length}`);if(leaf.kind==='body'){const s=b.spreads[leaf.spreadIndex!];(await drawEditionSpread(canvas,p,s,leaf.spreadIndex!,ppi,ppi>=300,leaf.side)).forEach(x=>warnings.add(x));}else drawEditionMatter(canvas,p,leaf.kind,ppi);await append();}
  if(kind==='review'){progress('生成封底');(await drawEditionCover(canvas,p,'back',ppi,ppi>=300)).forEach(x=>warnings.add(x));await append();}
 }
 pdf.setTitle(p.name);pdf.setCreator('Photo Book Studio · Browser Spread');const bytes=await pdf.save();return{blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),warnings:[...warnings],pages:pdf.getPageCount()};
}
