import {spreadFrames,supportsLayout} from '../publishing/geometry.mjs';
export function editionPages(book){const w=book.printProfile.widthMm,h=book.printProfile.heightMm;return book.spreads.flatMap((s,index)=>{const frames=spreadFrames(w,h,s.layout,s.placements.length,!!s.title);return [0,1].map(side=>({id:s.id+':'+side,title:s.title,spreadId:s.id,side,folio:index*2+side+1,placements:s.placements.filter((q,i)=>Math.floor((frames[i].x+frames[i].width/2)/w)===side).map(q=>({...q,caption:q.caption||''}))}));});}
export function validateEdition(book,photos){
 if(!book||!Array.isArray(book.spreads)||book.spreads.length>1500||!book.printProfile||!book.cover)throw Error('完整书稿格式错误');const w=book.printProfile.widthMm,h=book.printProfile.heightMm;if(![w,h].every(v=>Number.isFinite(v)&&v>=100&&v<=420))throw Error('完整书稿尺寸错误');
 const ids=new Set(),placements=new Set(),photoMap=new Map(photos.map(p=>[p.id,p]));
 const check=q=>{const photo=photoMap.get(q.photoId);if(!photo||q.sourceHash!==photo.hash||placements.has(q.id)||!['contain','cover'].includes(q.fit)||![q.zoom,q.panX,q.panY].every(Number.isFinite)||q.zoom<1||q.zoom>4||q.panX<0||q.panX>1||q.panY<0||q.panY>1)throw Error('完整书稿照片引用或裁切无效');if(photo.legacy?.photo&&(q.previewHash!==photo.legacy.photo.previewHash||q.orientationVersion!==(photo.legacy.adjustment?.version||0)||q.rotation!==photo.rotation))throw Error('完整书稿预览或方向版本已变化');placements.add(q.id);};
 for(const s of book.spreads){if(ids.has(s.id)||typeof s.title!=='string'||s.title.length>1000||!supportsLayout(s.layout,s.placements?.length))throw Error('完整书稿跨页版式错误');ids.add(s.id);s.placements.forEach(check);}
 for(const q of [book.cover.front,book.cover.back].filter(Boolean))check(q);
 const d=book.design||{};if(d.blankFirst&&(!d.readingEdition||d.frontBlankPages!==2||d.backBlankPages!==2))throw Error('留白与装订页序不兼容');
 for(const key of ['title','subtitle','spineText'])if(typeof book.cover[key]!=='string'||book.cover[key].length>1000)throw Error('封面文字无效');
}
