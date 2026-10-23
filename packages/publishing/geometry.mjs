export const collageCounts={'trio-left':3,'trio-right':3,quartet:4,'story-left':4,'story-right':4,'five-left':5,'five-right':5,six:6};
export function supportsLayout(layout,count){return layout in collageCounts?count===collageCounts[layout]:['airy','balanced','bleed'].includes(layout)?count>=1&&count<=2:['airy-left','chapter-left','chapter-right','hero-left','hero-right','coda-left'].includes(layout)?count===1:['duet-left','duet-right'].includes(layout)&&count===2;}
// Preview geometry in millimetres; a future PDF renderer can consume the same values.
export function spreadFrames(width,height,layout,count,hasTitle){
 if(!supportsLayout(layout,count)||!Number.isInteger(count)||!Number.isFinite(width)||!Number.isFinite(height)||width<100||height<100)throw new Error('跨页几何参数错误');
 if(layout in collageCounts){
  // Keep every image inside one leaf; 14 mm paper margin and 6 mm gutters.
  const m=14,g=6,top=hasTitle?40:18,bottom=height-20,W=width-2*m,H=bottom-top;
  const frame=(page,x,y,w,h)=>({x:page*width+m+x,y:top+y,width:w,height:h});
  const full=page=>frame(page,0,0,W,H);
  const pair=page=>[frame(page,0,0,W,(H-g)/2),frame(page,0,(H+g)/2,W,(H-g)/2)];
  const three=page=>[frame(page,0,0,W,H*.53),frame(page,0,H*.53+g,(W-g)/2,H*.47-g),frame(page,(W+g)/2,H*.53+g,(W-g)/2,H*.47-g)];
  const mirror=layout.endsWith('-right');
  if(layout.startsWith('trio-'))return[full(mirror?1:0),...pair(mirror?0:1)];
  if(layout==='quartet')return[...pair(0),...pair(1)];
  if(layout.startsWith('story-'))return[full(mirror?1:0),...three(mirror?0:1)];
  if(layout.startsWith('five-'))return[...pair(mirror?1:0),...three(mirror?0:1)];
  return[...three(0),...three(1)];
 }
 if(layout.startsWith('hero-'))return[{x:(layout==='hero-left'?0:width)+6,y:10,width:width-12,height:height-28}];
 if(layout==='coda-left')return[{x:25,y:38,width:width-50,height:height-76}];
 if(layout.startsWith('chapter-'))return[{x:(layout==='chapter-left'?0:width)+12,y:28,width:width-24,height:height-56}];
 if(layout.startsWith('duet-'))return [0,1].map(i=>{const main=(layout==='duet-left'?i===0:i===1),margin=main?15:48,top=main?(hasTitle?42:20):height*.3;return{x:i*width+margin,y:top,width:width-2*margin,height:main?height-top-22:height*.48};});
 const m=layout==='bleed'?0:layout==='balanced'?12:25,top=layout==='bleed'?0:hasTitle?42:m;
 return Array.from({length:count},(_,i)=>({x:(count===1?(layout==='airy-left'?0:width):i*width)+m,y:top,width:width-2*m,height:height-top-m}));
}
export function fitImage(width,height,pixelWidth,pixelHeight,{fit,zoom,panX,panY}){
 if(![width,height,pixelWidth,pixelHeight,zoom].every(v=>Number.isFinite(v)&&v>0)||!['contain','cover'].includes(fit)||![panX,panY].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('照片放置几何参数错误');
 const base=fit==='cover'?Math.max(width/pixelWidth,height/pixelHeight):Math.min(width/pixelWidth,height/pixelHeight),w=pixelWidth*base*zoom,h=pixelHeight*base*zoom;
 return {x:(width-w)*panX,y:(height-h)*panY,width:w,height:h};
}

// Caption-free frames are unchanged. Paper layouts reserve a strip only on opt-in.
export function captionGeometry(frame,placement,overlay=false,pixelWidth,pixelHeight){
 const text=(placement.caption||'').trim();if(!text)return{frame,caption:null};
 const imageFrame=overlay?frame:{...frame,height:Math.max(1,frame.height-12)};
 if(overlay&&pixelWidth&&pixelHeight){const fitted=fitImage(frame.width,frame.height,pixelWidth,pixelHeight,placement);if(frame.height-(fitted.y+fitted.height)>=12)overlay=false;}
 let bottom=imageFrame.y+imageFrame.height;
 if(!overlay&&pixelWidth&&pixelHeight){const image=fitImage(imageFrame.width,imageFrame.height,pixelWidth,pixelHeight,placement);bottom=imageFrame.y+Math.min(imageFrame.height,Math.max(0,image.y+image.height));}
 const width=Math.max(1,frame.width-16),units=Array.from(text).length,size=Math.min(4,width/Math.max(1,units));
 return{frame:imageFrame,caption:{text,x:frame.x+frame.width/2,y:overlay?frame.y+frame.height-12:bottom+7,width,size,overlay,band:{x:frame.x,y:frame.y+frame.height-24,width:frame.width,height:24}}};
}
