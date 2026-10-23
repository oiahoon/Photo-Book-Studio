import {Images,ListChecks,Folder,LockKeyhole} from 'lucide-react';
const icons={library:Images,list:ListChecks,folder:Folder,lock:LockKeyhole};
export function Icon({name,size=19}:{name:keyof typeof icons;size?:number}) {const Component=icons[name];return <Component size={size} strokeWidth={1.5} aria-hidden="true"/>;}
