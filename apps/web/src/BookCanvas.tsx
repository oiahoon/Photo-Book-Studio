import{paperColor,coverBackFrame}from'../../../packages/publishing/book-design.mjs';
import {textLines,spreadTexts,spreadPlace,footerStyle,footerPositions,spineTexts,matterTexts,coverTitles,coverBackTexts} from '../../../packages/publishing/text.mjs';
import {spreadFrames,fitImage,captionGeometry} from '../../../packages/publishing/geometry.mjs';
import {useEffect,useState} from 'react';
import type {Photo} from './types';
import type {BookDraft,BookSpread,BookPlacement} from './book-types';
type Frame={x:number;y:number;width:number;height:number};
const imageSizes=new Map<string,{width:number;height:number}>();
function usePreviewSize(url:string|null){const[size,setSize]=useState<{url:string;width:number;height:number}|null>(null);useEffect(()=>{if(!url)return;let alive=true;const cached=imageSizes.get(url);if(cached){setSize({url,...cached});return;}const image=new Image();image.onload=()=>{if(!image.naturalWidth||!image.naturalHeight)return;const value={width:image.naturalWidth,height:image.naturalHeight};imageSizes.set(url,value);if(alive)setSize({url,...value});};image.src=url;return()=>{alive=false;image.onload=null;};},[url]);return size?.url===url?size:null;}
function Lines({text,x,y,width,size=7,maxLines=2,fill='#25201b',weight,tracking}:{text:string;x:number;y:number;width:number;size?:number;maxLines?:number;fill?:string;weight?:number;tracking?:number}){const {font,rows}=textLines(text,width,size,maxLines,tracking);return <text x={x} y={y} fill={fill} fontSize={font} fontWeight={weight} letterSpacing={tracking} className="book-page-title">{rows.map((line,i)=><tspan key={i} x={x} dy={i?font*1.35:0}>{line}</tspan>)}</text>;}
export function placedPhotoState(p:BookPlacement,photos:Map<string,Photo>){const current=photos.get(p.photoId);return !current?.preview||current.status!=='ready'?'missing':current.hash!==p.sourceHash||current.previewHash!==p.previewHash||current.adjustment.version!==p.orientationVersion?'changed':'ready';}
function ImageFrame({p,frame,photos,selected,onSelect,overlay=false}:{p:BookPlacement;frame:Frame;photos:Map<string,Photo>;selected?:string;onSelect?:(id:string)=>void;overlay?:boolean}){
 const state=placedPhotoState(p,photos);
 const url=state==='ready'?`/previews/${p.preview}?v=${p.previewHash}`:null,size=usePreviewSize(url);
 const geometry=captionGeometry(frame,p,overlay,size?.width,size?.height),{x,y,width:w,height:h}=geometry.frame,caption=geometry.caption;
 const image=size?fitImage(w,h,size.width,size.height,p):{x:0,y:0,width:w,height:h};
 return <g role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={onSelect?`调整照片 ${p.filename}`:undefined} onClick={()=>onSelect?.(p.id)} onKeyDown={e=>{if(onSelect&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelect(p.id);}}} className={onSelect?'book-image-target':''}>
 <title>{p.filename}{state==='ready'?'':state==='missing'?' · 素材未连接':' · 素材版本需复核'}</title>
 <rect x={x} y={y} width={w} height={h} fill={state==='ready'?'none':'#eeeae3'}/>
 {state==='ready'?<svg x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="hidden"><image href={url!} x={image.x} y={image.y} width={image.width} height={image.height} preserveAspectRatio={size?'none':p.fit==='contain'?'xMidYMid meet':'xMidYMid slice'}/></svg>:<text x={x+w/2} y={y+h/2} textAnchor="middle" fill="#8e6d5f" fontSize="5">{state==='missing'?'素材未连接':'素材版本需复核'}</text>}
 {caption&&<g pointerEvents="none">{caption.overlay&&<rect {...caption.band} fill="#16120e" opacity=".48"/>}<text className="book-photo-caption" x={caption.x} y={caption.y} textAnchor="middle" fontSize={caption.size} fill={caption.overlay?'#fffdf8':'#25201b'}>{caption.text}</text></g>}
 {selected===p.id&&<rect x={x+.5} y={y+.5} width={w-1} height={h-1} fill="none" stroke="#bd3026" strokeWidth=".8"/>}
 <rect className="book-focus-ring" x={x+.7} y={y+.7} width={w-1.4} height={h-1.4} fill="none" stroke="#bd3026" strokeWidth="1"/>
 </g>;
}
function Guides({w,h,safe}:{w:number;h:number;safe:number|null}){return <g className="book-guides" pointerEvents="none"><path d={`M ${w} 0 V ${h}`} stroke="#bbada0" strokeWidth=".4" strokeDasharray="2 2"/>{safe!==null&&[0,w].map(x=><rect key={x} x={x+safe} y={safe} width={w-2*safe} height={h-2*safe} fill="none" stroke="#bd3026" opacity=".55" strokeWidth=".4" strokeDasharray="2 2"/>)}</g>;}
export function SpreadCanvas({book,spread,photos,selected,onSelect,guides=false,thumbnail=false}:{book:BookDraft;spread:BookSpread;photos:Map<string,Photo>;selected?:string;onSelect?:(id:string)=>void;guides?:boolean;thumbnail?:boolean}){
 const w=book.printProfile.widthMm,h=book.printProfile.heightMm;
 const frames=spreadFrames(w,h,spread.layout,spread.placements.length,!!spread.title),footer=footerStyle(book);
 return <svg className="book-canvas" viewBox={`0 0 ${w*2} ${h}`} role={onSelect?"group":"img"} aria-label={`${spread.title||'影集跨页'} · ${spread.placements.length} 张照片`}>
 <rect width={w*2} height={h} fill={paperColor(book)}/>
 {spread.placements.map((p,i)=><ImageFrame key={p.id} p={p} frame={frames[i]} overlay={spread.layout==='bleed'} photos={photos} selected={selected} onSelect={thumbnail?undefined:onSelect}/>)}
 {spreadTexts(book,spread).map((spec,i)=><Lines key={i} {...spec}/>) }
 {spread.layout!=='bleed'&&<g fill={footer.fill} fontSize={footer.size} pointerEvents="none">{[0,1].map(i=><g key={i}><text textAnchor={footerPositions(w,i).placeAnchor} x={footerPositions(w,i).placeX} y={h-9}>{spreadPlace(book,spread)}</text><text x={footerPositions(w,i).pageX} y={h-9} textAnchor={footerPositions(w,i).pageAnchor}>{book.spreads.findIndex(s=>s.id===spread.id)*2+i+1}</text></g>)}</g>}
 {guides&&<Guides w={w} h={h} safe={book.printProfile.safeMm}/>}
 </svg>;
}
export function CoverCanvas({book,photos,selected,onSelect,frontOnly=false,backOnly=false,guides=false}:{book:BookDraft;photos:Map<string,Photo>;selected?:string;onSelect?:(id:string)=>void;frontOnly?:boolean;backOnly?:boolean;guides?:boolean}){
 const w=book.printProfile.widthMm,h=book.printProfile.heightMm,spine=book.printProfile.spineMm??8,total=2*w+spine,frontX=w+spine,c=book.cover,bleed=c.style==='bleed';
 return <svg className="book-canvas book-cover-canvas" viewBox={backOnly?`0 0 ${w} ${h}`:frontOnly?`${frontX} 0 ${w} ${h}`:`0 0 ${total} ${h}`} role={onSelect?"group":"img"} aria-label={backOnly?'影集封底':frontOnly?'影集正面封面':'封底、书脊与封面展开预览'}>
 <rect x={frontOnly?frontX:0} width={frontOnly||backOnly?w:total} height={h} fill="#eee6d9"/>
 {!frontOnly&&c.back&&<ImageFrame p={c.back} frame={coverBackFrame(book)} overlay={c.backStyle==='bleed'} photos={photos} selected={selected} onSelect={onSelect}/>}
 {!backOnly&&c.style!=='text'&&c.front&&<ImageFrame p={c.front} frame={{x:frontX+(bleed?0:25),y:bleed?0:h*.3,width:bleed?w:w-50,height:bleed?h:h*.54}} overlay={bleed} photos={photos} selected={selected} onSelect={onSelect}/>}
 {!backOnly&&c.showTitle!==false&&bleed&&(c.inkTone||(book.design?.coverTypography==='editorial'?'ink':'light'))==='light'&&<rect x={frontX} width={w} height={h*.25} fill="#1d1914" opacity=".58"/>}
 {!frontOnly&&c.backStyle==='bleed'&&<rect y={h-28} width={w} height={28} fill="#1d1914" opacity=".35"/>}
 {!frontOnly&&coverBackTexts(book).map((spec,i)=><Lines key={`back:${i}`} {...spec}/>)}
 {!backOnly&&coverTitles(book,frontX).map((spec,i)=><Lines key={i} {...spec}/>)}
 {!frontOnly&&!backOnly&&<rect x={w} width={spine} height={h} fill="#c9bba6" opacity=".3" stroke="#a89987" strokeWidth=".3" strokeDasharray={book.printProfile.spineMm===null?'2 2':undefined}/>}
 {!frontOnly&&!backOnly&&c.spineStyle!=='editorial-vertical'&&c.spineText&&book.printProfile.spineMm!==null&&<text transform={`translate(${w+spine/2} ${h/2}) rotate(90)`} textAnchor="middle" fontSize={Math.min(4,spine*.65,(h-30)/Math.max(1,Array.from(c.spineText).length))} fill="#25201b">{c.spineText}</text>}
 {!frontOnly&&!backOnly&&c.spineStyle==='editorial-vertical'&&<g><rect x={w} width={spine} height={h} fill="#eee6d9"/>{spineTexts(book,spine).map((t,i)=><text key={i} x={w+spine/2} y={t.y} fontSize={t.size} letterSpacing={t.tracking} textAnchor="middle" className="book-page-title" fill="#25201b">{t.text}</text>)}</g>}
 {book.printProfile.spineMm===null&&!frontOnly&&!backOnly&&<text transform={`translate(${w+spine/2} ${h/2}) rotate(90)`} textAnchor="middle" fontSize="3.5" fill="#766451">书脊待确认</text>}
 {guides&&book.printProfile.safeMm!==null&&(frontOnly?[frontX]:backOnly?[0]:[0,frontX]).map(x=><rect key={x} x={x+book.printProfile.safeMm!} y={book.printProfile.safeMm!} width={w-2*book.printProfile.safeMm!} height={h-2*book.printProfile.safeMm!} fill="none" stroke="#bd3026" strokeWidth=".4" strokeDasharray="2 2"/>)}
 </svg>;
}

export function BlankCanvas({book,label}:{book:BookDraft;label:string}){const w=book.printProfile.widthMm,h=book.printProfile.heightMm;return <svg className="book-canvas" viewBox={`0 0 ${w*2} ${h}`} role="img" aria-label={label}><rect width={w*2} height={h} fill={paperColor(book)}/>{<path d={`M ${w} 0 V ${h}`} stroke="#d6cec2" strokeWidth=".25"/>}</svg>;}

export function MatterCanvas({book,kind}:{book:BookDraft;kind:string}){const w=book.printProfile.widthMm,h=book.printProfile.heightMm,x=kind==='title'?w:0;return <svg className="book-canvas" viewBox={`0 0 ${w*2} ${h}`} role="img" aria-label={kind==='title'?'内封题名 · 右页':'收尾 · 左页'}><g transform={`translate(${x} 0)`}>{book.design?.blankFirst&&<rect x={-x} width={w*2} height={h} fill={paperColor(book)}/>}<rect width={w} height={h} fill={paperColor(book)}/>{matterTexts(book,kind).map((spec,i)=><Lines key={i} {...spec}/>)}</g></svg>;}
