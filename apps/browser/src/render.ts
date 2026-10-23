import type {Project,Page,Photo} from './model';
import {frameRects} from '../../../packages/browser-local/model.mjs';
import {fitImage} from '../../../packages/publishing/geometry.mjs';
import {bitmap,original} from './media';
import {asset} from './storage';
export async function drawPage(canvas:HTMLCanvasElement,p:Project,page:Page,folio:number,ppi=100,full=false){
 const {width:w,height:h}=p.settings,scale=ppi/25.4;canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);const c=canvas.getContext('2d')!;c.scale(scale,scale);c.fillStyle='#fff';c.fillRect(0,0,w,h);c.fillStyle='#25201b';c.font='6px "Songti SC", SimSun, serif';if(page.title)c.fillText(page.title,14,20,w-28);
 const rects=frameRects(p,page),warnings:string[]=[];
 for(const [i,q] of page.placements.entries()){
 const photo=p.photos.find(x=>x.id===q.photoId)!;const r=rects[i];let b:ImageBitmap|undefined;
 try{const source=full?await original(p,photo):(await asset(p.id,photo.id))?.thumbnail;if(!source)throw Error(`缺少预览，请重新连接：${photo.name}`);b=await bitmap(source,photo.rotation);const caption=q.caption.trim();const frame={...r,height:r.height-(caption&&q.fit==='contain'?10:0)};const f=fitImage(frame.width,frame.height,b.width,b.height,q);
 if(full){const effective=Math.min(b.width/f.width,b.height/f.height)*25.4;if(effective<ppi)warnings.push(`${photo.name}：约 ${Math.floor(effective)} ppi`);}
 c.save();c.beginPath();c.rect(frame.x,frame.y,frame.width,frame.height);c.clip();c.drawImage(b,frame.x+f.x,frame.y+f.y,f.width,f.height);c.restore();
 if(caption){c.save();c.textAlign='center';c.font='4px "Kaiti SC", KaiTi, serif';const overlay=q.fit==='cover';if(overlay){c.fillStyle='rgba(0,0,0,.35)';c.fillRect(r.x,r.y+r.height-12,r.width,12);}c.fillStyle=overlay?'#fff':'#25201b';c.fillText(caption,r.x+r.width/2,r.y+r.height-4,r.width-10);c.restore();}
 }catch(e){if(full)throw e;c.fillStyle='#eee8df';c.fillRect(r.x,r.y,r.width,r.height);c.fillStyle='#8a7770';c.font='4px sans-serif';c.fillText('重新连接照片',r.x+5,r.y+r.height/2,r.width-10);}finally{b?.close();}
 }
 if(folio){c.fillStyle='#655d55';c.font='2.6px serif';c.textAlign=folio%2?'right':'left';c.fillText(String(folio),folio%2?w-12:12,h-7);c.textAlign=folio%2?'left':'right';const places=[...new Set(page.placements.map(q=>p.photos.find(x=>x.id===q.photoId)?.location).filter(Boolean))].join(' · ');c.fillText(places,folio%2?12:w-12,h-7,w-40);}
 return warnings;
}
export async function drawCover(canvas:HTMLCanvasElement,p:Project,back=false,ppi=100,full=false){const id=back?p.settings.backPhotoId:p.settings.coverPhotoId;const page:Page={id:'cover',title:'',placements:id?[{id:'cover',photoId:id,fit:'cover',zoom:1,panX:.5,panY:.5,caption:''}]:[]};const temp={...p,settings:{...p.settings,margin:0}}; // cover frame is the entire trim, without footer.
 const w=p.settings.width,h=p.settings.height;const errors=await drawPage(canvas,temp,page,0,ppi,full);if(id){const photo=p.photos.find(x=>x.id===id)!;const source=full?await original(p,photo):(await asset(p.id,id))?.thumbnail;if(!source){if(full)throw Error('封面缺图');return errors;}const b=await bitmap(source,photo.rotation);const c=canvas.getContext('2d')!,scale=ppi/25.4;c.setTransform(scale,0,0,scale,0,0);const f=fitImage(w,h,b.width,b.height,page.placements[0]);c.drawImage(b,f.x,f.y,f.width,f.height);b.close();}
 if(!back&&p.settings.coverTitle){const c=canvas.getContext('2d')!;c.save();c.textAlign='center';c.font='bold 10px "Songti SC", SimSun, serif';c.fillStyle=id?'#fff':'#25201b';if(id){c.shadowColor='#000';c.shadowBlur=5;}c.fillText(p.settings.coverTitle,w/2,h*.22,w-30);c.restore();}return errors;}
export function folios(input:string,count:number){if(!input.trim())return Array.from({length:count},(_,i)=>i+1);const out=new Set<number>();for(const token of input.split(',')){const m=token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('页码格式如 1-8,15');const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>count)throw Error('页码超出正文范围');for(let n=a;n<=b;n++)out.add(n);}return [...out].sort((a,b)=>a-b);}
export async function exportPDF(p:Project,kind:'review'|'interior'|'wrap',range:string,ppi:number,signal:AbortSignal,progress:(s:string)=>void){
 if(p.edition){const {exportEditionPDF}=await import('./edition-render');return exportEditionPDF(p,kind,folios(range,p.pages.length),ppi,signal,progress);}
 const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create(),canvas=document.createElement('canvas'),warnings=new Set<string>(),mm=72/25.4;
 const append=async(width:number,height:number)=>{const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('页面生成失败')),'image/jpeg',.95));const img=await pdf.embedJpg(await blob.arrayBuffer());const leaf=pdf.addPage([width*mm,height*mm]);leaf.drawImage(img,{x:0,y:0,width:width*mm,height:height*mm});canvas.width=1;canvas.height=1;await new Promise(r=>setTimeout(r,0));};
 const w=p.settings.width,h=p.settings.height,check=()=>{if(signal.aborted)throw Error('已取消导出');};
 const blank=async()=>{check();pdf.addPage([w*mm,h*mm]);};
 const cover=async(back=false)=>{check();progress(back?'生成封底':'生成封面');(await drawCover(canvas,p,back,ppi,true)).forEach(x=>warnings.add(x));await append(w,h);};
 if(kind==='wrap'){
 if(p.settings.spine===null)throw Error('请先填写商家提供的书脊宽度');const sw=p.settings.spine,whole=document.createElement('canvas'),scale=ppi/25.4;whole.width=Math.round((2*w+sw)*scale);whole.height=Math.round(h*scale);const c=whole.getContext('2d')!;c.fillStyle='#eee6d9';c.fillRect(0,0,whole.width,whole.height);await drawCover(canvas,p,true,ppi,true);c.drawImage(canvas,0,0);check();await drawCover(canvas,p,false,ppi,true);c.drawImage(canvas,Math.round((w+sw)*scale),0);c.fillStyle='#25201b';c.textAlign='center';const letters=Array.from(p.settings.coverTitle),step=Math.min(7,(h-40)/Math.max(1,letters.length)),size=Math.min(6,sw*.4,step*.8),start=(h-(letters.length-1)*step)/2;c.font=`${size*scale}px "Songti SC", serif`;letters.forEach((x,i)=>c.fillText(x,(w+sw/2)*scale,(start+i*step)*scale));canvas.width=whole.width;canvas.height=whole.height;canvas.getContext('2d')!.drawImage(whole,0,0);await append(2*w+sw,h);
 }else{
 const selected=folios(range,p.pages.length);if(!selected.length)throw Error('请先添加正文页面');if(kind==='review'){await cover();if(p.settings.blankSheets){await blank();await blank();}}
 for(const [i,n] of selected.entries()){check();progress(`生成正文 ${n} · ${i+1} / ${selected.length}`);(await drawPage(canvas,p,p.pages[n-1],n,ppi,true)).forEach(x=>warnings.add(x));await append(w,h);}
 if(kind==='review'){if(p.settings.blankSheets){await blank();await blank();}await cover(true);}
 }
 check();pdf.setTitle(p.name);pdf.setCreator('Photo Book Studio · Browser Local');const bytes=await pdf.save();return{blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),warnings:[...warnings],pages:pdf.getPageCount()};
}
