import * as Toast from '@radix-ui/react-toast';
import { CheckCircle2,X } from 'lucide-react';
export type Notice={id:number;text:string;undo?:()=>void};
export function Notification({notice,close,busy=false}:{notice:Notice|null;close:()=>void;busy?:boolean}) {
  return <Toast.Provider swipeDirection="right" duration={12000} label="项目操作通知">{notice&&<Toast.Root key={notice.id} open className="toast" onOpenChange={open=>{if(!open)close();}}><CheckCircle2 size={17}/><Toast.Title>{notice.text}</Toast.Title>{notice.undo&&<Toast.Action asChild altText="撤销刚才的操作"><button onClick={notice.undo} disabled={busy}>撤销</button></Toast.Action>}<Toast.Close asChild><button className="icon-button" aria-label="关闭通知"><X size={14}/></button></Toast.Close></Toast.Root>}<Toast.Viewport className="toast-viewport"/></Toast.Provider>;
}
