import {useRef,useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {Search,X,SlidersHorizontal,Check,RotateCcw} from 'lucide-react';
import './PhotoFilters.css';
export function PhotoSearch({value,onChange,label='搜索照片、地点或人物'}:{value:string;onChange:(value:string)=>void;label?:string}){
 const input=useRef<HTMLInputElement>(null);
 return <div className="photo-search"><Search size={14} aria-hidden="true"/><input ref={input} aria-label={label} placeholder={label} value={value} onChange={e=>onChange(e.target.value)}/>{value&&<button aria-label="清除搜索" onClick={()=>{onChange('');input.current?.focus();}}><X size={13}/></button>}</div>;
}
export function AnalysisFilter({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const[open,setOpen]=useState(false);
 return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button className={`analysis-filter-trigger${value!=='all'?' is-filtered':''}`}><SlidersHorizontal size={14}/>筛选{value!=='all'&&<span className="filter-indicator"/>}</button></Popover.Trigger><Popover.Portal><Popover.Content className="photo-filter-popover" align="end" sideOffset={8} collisionPadding={16} aria-label="分析筛选"><h3>分析状态</h3><div role="group" aria-label="分析筛选">{[['all','全部照片'],['pending','未分析'],['analyzed','有分析结果']].map(([key,label])=><button key={key} aria-pressed={key===value} onClick={()=>{onChange(key);setOpen(false);}}>{label}{key===value&&<Check size={14}/>}</button>)}</div></Popover.Content></Popover.Portal></Popover.Root>;
}
export function ResetPhotoFilters({reset}:{reset:()=>void}){return <button className="reset-photo-filters" onClick={reset}><RotateCcw size={12}/>重置筛选</button>;}
