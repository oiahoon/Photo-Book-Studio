import {useRef,type ReactNode} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {ArrowLeft,ArrowRight,X} from 'lucide-react';
import type {Photo,CurationState,PersonId} from './types';
import {Hint} from './ui';

type Props={photo:Photo;photos:Photo[];busy:boolean;close:()=>void;select:(id:string)=>void;curate:(state:CurationState)=>void;savePeople:(ids:PersonId[])=>void;children:ReactNode;error:string;feedback:ReactNode};
export function PhotoReview({photo,photos,busy,close,select,curate,savePeople,children,error,feedback}:Props){
  const previousFocus=useRef(document.activeElement as HTMLElement|null);
  const fallbackFocus=useRef(previousFocus.current?.closest<HTMLElement>('main')||document.querySelector<HTMLElement>('main'));
  const index=photos.findIndex(p=>p.id===photo.id);
  const start=Math.max(0,Math.min(index-5,photos.length-11));
  const strip=photos.slice(start,start+11);
  const move=(delta:number)=>{const next=photos[index+delta];if(next&&!busy)select(next.id);};
  return <Dialog.Root open onOpenChange={open=>{if(!open)close();}}><Dialog.Portal><Dialog.Overlay className="modal-overlay review-overlay"/><Dialog.Content className="photo-review" aria-describedby={undefined} onCloseAutoFocus={e=>{e.preventDefault();const target=previousFocus.current;if(target?.isConnected&&!target.matches(':disabled'))target.focus();else fallbackFocus.current?.focus({preventScroll:true});}} onKeyDownCapture={e=>{if(e.key==='Escape'&&(e.target as HTMLElement).closest('.toast,.toast-viewport')){e.preventDefault();e.stopPropagation();close();}}} onKeyDown={e=>{
    const target=e.target as HTMLElement;
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||target.closest('input,textarea,select,[contenteditable="true"]'))return;
    if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!target.closest('[role="group"],[role="radiogroup"]')){e.preventDefault();e.stopPropagation();move(e.key==='ArrowLeft'?-1:1);}
    const person=({'1':'me','2':'annie','3':'dad','4':'mom'} as Record<string,PersonId>)[e.key];
    if(person||e.key.toLowerCase()==='n'){
      e.preventDefault();e.stopPropagation();
      if(!busy&&!e.repeat){const ids=photo.people?.ids||[];savePeople(person?(ids.includes(person)?ids.filter(id=>id!==person):[...ids,person]):[]);}
      return;
    }
    const state=({p:'keep',u:'pending',x:'exclude','0':'unreviewed'} as Record<string,CurationState>)[e.key.toLowerCase()];
    if(state&&!busy){e.preventDefault();e.stopPropagation();curate(state);}
  }}>
    <header className="review-header"><Dialog.Close asChild><button className="review-back"><ArrowLeft size={19}/>返回</button></Dialog.Close><Dialog.Title>{photo.relativePath}</Dialog.Title><div><span aria-live="polite">{index+1} / {photos.length}</span><Dialog.Close asChild><button className="icon-button" aria-label="关闭大图选片"><X size={21}/></button></Dialog.Close></div></header>
    <div className="review-body"><div className="review-canvas"><div className="review-stage"><Hint label="上一张（←）"><button className="review-arrow previous" aria-label="大图上一张" disabled={busy||index<=0} onClick={()=>move(-1)}><ArrowLeft size={20}/></button></Hint><img key={photo.previewHash} decoding="async" src={`/previews/${photo.preview}?v=${photo.previewHash}`} alt={photo.relativePath}/><Hint label="下一张（→）"><button className="review-arrow next" aria-label="大图下一张" disabled={busy||index>=photos.length-1} onClick={()=>move(1)}><ArrowRight size={20}/></button></Hint></div>
      <div className="review-filmstrip" aria-label="照片缩略图带">{strip.map(p=><button key={p.id} className={p.id===photo.id?'current':''} aria-label={`切换到 ${p.relativePath}`} aria-pressed={p.id===photo.id} disabled={busy} onClick={()=>select(p.id)}>{p.preview?<img loading="lazy" decoding="async" src={`/previews/${p.preview}?v=${p.previewHash}`} alt=""/>:<span>{p.format}</span>}</button>)}</div><div className="review-foot"><span><ArrowLeft size={13}/><ArrowRight size={13}/>切换</span><span>1–4 人物 · N 不含 · P/U/X 选片 · Esc 返回</span></div>
    </div><div className="review-inspector">{error&&<p className="banner error" role="alert">{error}</p>}{children}</div></div>{feedback}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
