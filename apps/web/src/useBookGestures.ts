import {useEffect,useRef,useState} from 'react';
import {createWheelPager,dragPageStep} from './book-gestures';

export function useBookGestures(enabled:boolean,step:(delta:number)=>void){
 const [surface,setSurface]=useState<HTMLDivElement|null>(null),latest=useRef(step);
 useEffect(()=>{latest.current=step;});
 useEffect(()=>{
  if(!surface||!enabled)return;
  const wheel=createWheelPager();
  let pointer:{id:number;x:number;y:number;dragging:boolean}|null=null,suppressClick=false,timer=0;
  const modal=()=>!!document.querySelector('[role="dialog"],[role="alertdialog"]');
  const onWheel=(e:WheelEvent)=>{
   if(modal())return;
   const result=wheel.push({deltaX:e.deltaX,deltaY:e.deltaY,deltaMode:e.deltaMode,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,time:performance.now()});
   if(result.capture)e.preventDefault();
   if(result.step)latest.current(result.step);
  };
  const down=(e:PointerEvent)=>{
   if(e.button!==0||!e.isPrimary||e.pointerType==='touch'||e.ctrlKey||e.metaKey||e.altKey||modal())return;
   pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dragging:false};
  };
  const move=(e:PointerEvent)=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
   if(!pointer.dragging){
    if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){pointer=null;return;}
    if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.3)return;
    pointer.dragging=true;surface.setPointerCapture(e.pointerId);surface.dataset.dragging='true';
   }
   e.preventDefault();
  };
  const clear=()=>{
   const id=pointer?.id;pointer=null;delete surface.dataset.dragging;
   if(id!==undefined&&surface.hasPointerCapture(id))surface.releasePointerCapture(id);
  };
  const up=(e:PointerEvent)=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   const delta=pointer.dragging?dragPageStep(e.clientX-pointer.x,e.clientY-pointer.y):0;
   suppressClick=pointer.dragging;clear();
   if(delta&&!modal())latest.current(delta);
   window.clearTimeout(timer);timer=window.setTimeout(()=>{suppressClick=false;},0);
  };
  const click=(e:MouseEvent)=>{if(suppressClick&&e.detail!==0){e.preventDefault();e.stopPropagation();suppressClick=false;}};
  const drag=(e:DragEvent)=>e.preventDefault();
  surface.addEventListener('wheel',onWheel,{passive:false});
  surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);
  surface.addEventListener('pointerup',up);surface.addEventListener('pointercancel',clear);surface.addEventListener('lostpointercapture',clear);
  surface.addEventListener('click',click,true);surface.addEventListener('dragstart',drag);
  return()=>{
   clear();window.clearTimeout(timer);
   surface.removeEventListener('wheel',onWheel);surface.removeEventListener('pointerdown',down);surface.removeEventListener('pointermove',move);
   surface.removeEventListener('pointerup',up);surface.removeEventListener('pointercancel',clear);surface.removeEventListener('lostpointercapture',clear);
   surface.removeEventListener('click',click,true);surface.removeEventListener('dragstart',drag);
  };
 },[surface,enabled]);
 return setSurface;
}
