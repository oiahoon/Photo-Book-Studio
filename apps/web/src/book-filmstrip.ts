export const FILMSTRIP_STRIDE=136; // 128px thumbnail + 8px gap, shared with CSS.
export function filmstripRange(left:number,width:number,count:number){
 const start=Math.max(0,Math.floor(Math.max(0,left)/FILMSTRIP_STRIDE)-3);
 return {start:Math.min(start,count),end:Math.min(count,Math.ceil((Math.max(0,left)+Math.max(1,width))/FILMSTRIP_STRIDE)+3)};
}
export function filmstripWheel(e:{deltaX:number;deltaY:number;deltaMode:number;ctrlKey:boolean;metaKey:boolean;altKey:boolean},width:number){
 if(e.ctrlKey||e.metaKey||e.altKey)return 0;
 const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
 return delta*(e.deltaMode===1?16:e.deltaMode===2?width:1);
}
