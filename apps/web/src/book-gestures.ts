type WheelSample={deltaX:number;deltaY:number;deltaMode:number;shiftKey:boolean;ctrlKey:boolean;metaKey:boolean;altKey:boolean;time:number};

// A continuous wheel burst turns only once, including its momentum tail.
export function createWheelPager(){
 let last=-Infinity,total=0,fired=false;
 return {push(e:WheelSample){
  if(e.ctrlKey||e.metaKey||e.altKey)return{capture:false,step:0};
  const x=e.shiftKey&&Math.abs(e.deltaX)<1?e.deltaY:e.deltaX;
  const y=e.shiftKey?0:e.deltaY;
  if(!x||Math.abs(x)<=Math.abs(y)*1.25)return{capture:false,step:0};
  if(e.time-last>220){total=0;fired=false;}
  last=e.time;
  const pixels=x*(e.deltaMode===1?16:e.deltaMode===2?640:1);
  if(!fired){if(Math.sign(total)!==Math.sign(pixels))total=0;total+=pixels;}
  if(!fired&&Math.abs(total)>=80){fired=true;return{capture:true,step:Math.sign(total)};}
  return{capture:true,step:0};
 }};
}

export function dragPageStep(dx:number,dy:number){
 return Math.abs(dx)>=64&&Math.abs(dx)>Math.abs(dy)*1.3?(dx<0?1:-1):0;
}
