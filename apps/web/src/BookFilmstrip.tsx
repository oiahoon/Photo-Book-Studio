import{bookSurfaces}from'../../../packages/publishing/book-design.mjs';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import type {BookDraft} from './book-types';
import type {Photo} from './types';
import {CoverCanvas,SpreadCanvas,BlankCanvas,MatterCanvas} from './BookCanvas';
import {FILMSTRIP_STRIDE,filmstripRange,filmstripWheel} from './book-filmstrip';

export function BookFilmstrip({book,photos,index,currentId,disabled,jump}:{book:BookDraft;photos:Map<string,Photo>;index:number;currentId:string;disabled:boolean;jump:(id:string)=>void}){
 const surfaces=bookSurfaces(book),root=useRef<HTMLDivElement>(null),current=Math.max(0,surfaces.findIndex(e=>e.id===(currentId==='cover-wrap'?'cover':currentId))),count=surfaces.length;
 const [range,setRange]=useState(()=>filmstripRange(Math.max(0,current-4)*FILMSTRIP_STRIDE,1024,count));
 const active=useRef(current);active.current=current;
 const measure=()=>{const el=root.current;if(!el||!el.clientWidth)return;const next=filmstripRange(el.scrollLeft,el.clientWidth,count);setRange(old=>old.start===next.start&&old.end===next.end?old:next);};
 function reveal(target:number,behavior:ScrollBehavior){
  const el=root.current;if(!el||!el.clientWidth)return;
  const left=target*FILMSTRIP_STRIDE,right=left+128;
  if(left<el.scrollLeft||right>el.scrollLeft+el.clientWidth)el.scrollTo({left:Math.max(0,left-(el.clientWidth-128)/2),behavior});
 }
 useLayoutEffect(()=>{reveal(current,'auto');measure();},[book.id]);
 useEffect(()=>{reveal(current,window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth');},[current]);
 useEffect(()=>{
  const el=root.current;if(!el)return;
  let frame=0,momentum=0,clickTimer=0,suppress=false;
  let pointer:{id:number;x:number;y:number;left:number;lastX:number;lastAt:number;velocity:number;dragging:boolean}|null=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop=()=>cancelAnimationFrame(momentum);
  const update=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});};
  const resize=new ResizeObserver(()=>{reveal(active.current,'auto');update();});resize.observe(el);
  const wheel=(e:WheelEvent)=>{const delta=filmstripWheel(e,el.clientWidth);if(!delta)return;e.preventDefault();stop();el.scrollLeft+=delta;};
  const down=(e:PointerEvent)=>{
   if(e.button!==0||!e.isPrimary||e.pointerType==='touch'||e.ctrlKey||e.metaKey||e.altKey)return;
   stop();el.scrollTo({left:el.scrollLeft,behavior:'instant'});
   pointer={id:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,lastX:e.clientX,lastAt:performance.now(),velocity:0,dragging:false};
  };
  const clear=()=>{const id=pointer?.id;pointer=null;delete el.dataset.dragging;if(id!==undefined&&el.hasPointerCapture(id))el.releasePointerCapture(id);};
  const move=(e:PointerEvent)=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
   if(!pointer.dragging){
    if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){clear();return;}
    if(Math.abs(dx)<8)return;
    pointer.dragging=true;el.setPointerCapture(e.pointerId);el.dataset.dragging='true';
   }
   e.preventDefault();const now=performance.now(),dt=now-pointer.lastAt;
   if(dt>0)pointer.velocity=Math.max(-2.5,Math.min(2.5,(pointer.lastX-e.clientX)/dt));
   pointer.lastX=e.clientX;pointer.lastAt=now;el.scrollLeft=pointer.left-dx;
  };
  const up=(e:PointerEvent)=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   suppress=pointer.dragging;
   let velocity=pointer.dragging&&performance.now()-pointer.lastAt<80?pointer.velocity:0;
   clear();clearTimeout(clickTimer);clickTimer=window.setTimeout(()=>{suppress=false;},0);
   if(reduced.matches||Math.abs(velocity)<.08)return;
   let last=performance.now();const animate=(now:number)=>{
    const dt=Math.min(32,now-last);last=now;const before=el.scrollLeft;
    el.scrollLeft+=velocity*dt;velocity*=Math.exp(-dt/140);
    if(Math.abs(velocity)>.04&&Math.abs(el.scrollLeft-before)>.1)momentum=requestAnimationFrame(animate);
   };momentum=requestAnimationFrame(animate);
  };
  const click=(e:MouseEvent)=>{if(suppress&&e.detail!==0){e.preventDefault();e.stopPropagation();suppress=false;}};
  const drag=(e:DragEvent)=>e.preventDefault();
  el.addEventListener('scroll',update,{passive:true});el.addEventListener('wheel',wheel,{passive:false});
  el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
  el.addEventListener('pointercancel',clear);el.addEventListener('lostpointercapture',clear);
  el.addEventListener('click',click,true);el.addEventListener('dragstart',drag);
  measure();return()=>{
   clear();stop();cancelAnimationFrame(frame);clearTimeout(clickTimer);resize.disconnect();
   el.removeEventListener('scroll',update);el.removeEventListener('wheel',wheel);
   el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);
   el.removeEventListener('pointercancel',clear);el.removeEventListener('lostpointercapture',clear);
   el.removeEventListener('click',click,true);el.removeEventListener('dragstart',drag);
  };
 },[book.id,count]);
 function key(e:KeyboardEvent<HTMLDivElement>){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();if(disabled)return;
  const target=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filmstrip-index]');
  const from=Number(target?.dataset.filmstripIndex??current);
  const next=e.key==='Home'?0:e.key==='End'?count-1:Math.max(0,Math.min(count-1,from+(e.key==='ArrowLeft'?-1:1)));
  root.current?.querySelector<HTMLButtonElement>(`[data-filmstrip-index="${next}"]`)?.focus({preventScroll:true});reveal(next,'auto');
 }
 return <div ref={root} className="book-filmstrip" role="group" aria-label="书稿跨页导航" title="拖动或滚动浏览缩略图，点击跳转" onKeyDown={key}>
  {Array.from({length:count},(_,i)=>{
   const entry=surfaces[i],s=entry.kind==='spread'?book.spreads[entry.spreadIndex!]:undefined,visible=i>=range.start&&i<range.end;
   return <button key={entry.id} type="button" data-filmstrip-index={i} disabled={disabled} tabIndex={i===current?0:-1} aria-label={s?`前往跨页 ${entry.spreadIndex!+1}`:entry.label} aria-pressed={i===current} onClick={()=>jump(entry.id)}>
    {visible?(s?<SpreadCanvas book={book} spread={s} photos={photos} thumbnail/>:entry.kind==='blank'?<BlankCanvas book={book} label={entry.label}/>:['title','closing'].includes(entry.kind)?<MatterCanvas book={book} kind={entry.kind}/>:<CoverCanvas book={book} photos={photos} frontOnly={entry.kind==='front'} backOnly={entry.kind==='back'}/>):<div className="book-filmstrip-placeholder" aria-hidden="true"/>}
    <span>{entry.label}</span>
   </button>;
  })}
 </div>;
}
