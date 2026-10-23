import { useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Popover from '@radix-ui/react-popover';
import { X, ChevronDown, MoreHorizontal } from 'lucide-react';

export function Modal({title,description,close,children,wide=false}:{title:string;description:string;close:()=>void;children:ReactNode;wide?:boolean}) {
  const previousFocus=useRef<HTMLElement|null>(document.activeElement as HTMLElement);
  const parentDialogId=previousFocus.current?.closest('[role="dialog"]')?.id;
  const parentTrigger=useRef(parentDialogId?Array.from(document.querySelectorAll<HTMLElement>('button[aria-controls]')).find(el=>el.getAttribute('aria-controls')===parentDialogId):null);
  const content=useRef<HTMLDivElement|null>(null);
  return <Dialog.Root open onOpenChange={open=>{if(!open)close();}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content ref={content} className={`modal-content ${wide?'wide':''}`} onOpenAutoFocus={event=>{const field=content.current?.querySelector<HTMLElement>('input,textarea');if(field){event.preventDefault();field.focus();}}} onCloseAutoFocus={event=>{event.preventDefault();if(previousFocus.current?.isConnected&&!previousFocus.current.matches(':disabled'))previousFocus.current.focus();else if(parentTrigger.current?.isConnected&&!parentTrigger.current.matches(':disabled'))parentTrigger.current.focus();else document.querySelector<HTMLElement>('main')?.focus({preventScroll:true});}}>
    <div className="dialog-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="关闭弹窗"><X size={18}/></button></Dialog.Close></div>
    <Dialog.Description className={description?"muted":"sr-only"}>{description}</Dialog.Description>{children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Hint({label,children}:{label:string;children:ReactNode}) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={7}>{label}<Tooltip.Arrow className="tooltip-arrow"/></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

export function Disclosure({title,children,open=false}:{title:string;children:ReactNode;open?:boolean}) {
  return <details className="disclosure" open={open||undefined}><summary>{title}<ChevronDown size={15}/></summary><div className="disclosure-body">{children}</div></details>;
}

export function ActionPopover({label,children}:{label:string;children:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button className="icon-button more-button" aria-label={label}><MoreHorizontal size={18}/></button></Popover.Trigger><Popover.Portal><Popover.Content className="action-popover" side="bottom" align="end" sideOffset={8} collisionPadding={16} aria-label={label} onClick={e=>{if((e.target as HTMLElement).closest('button'))setOpen(false);}} onChange={()=>setOpen(false)}>{children}<Popover.Close className="popover-done">完成</Popover.Close></Popover.Content></Popover.Portal></Popover.Root>;
}
