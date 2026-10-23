export function bookDesign(book){return{frontBlankPages:0,backBlankPages:0,paperTone:'natural',coverTypography:'classic',...book.design};}
export function paperColor(book){return({white:'#ffffff',natural:'#fffdf8',warm:'#f5eddf'})[bookDesign(book).paperTone];}
export function bookSurfaces(book){const d=bookDesign(book);if(d.blankFirst)return[{id:'cover',kind:'front',label:'封面'},{id:'front-matter',kind:'blank',label:'前留白 · 第一面'},{id:'title-page',kind:'title',label:'内封题名 · 左页留白'},...book.spreads.map((s,i)=>({id:s.id,kind:'spread',label:`${i*2+1}–${i*2+2}`,spreadIndex:i})),{id:'closing-page',kind:'closing',label:'收尾 · 右页留白'},{id:'back-matter',kind:'blank',label:'后留白 · 最后一面'},{id:'back-cover',kind:'back',label:'封底'}];return[{id:'cover',kind:'front',label:'封面'},...(d.readingEdition?[{id:'title-page',kind:'title',label:'内封题名'}]:[]),...(d.frontBlankPages?[{id:'front-matter',kind:'blank',label:'前扉页 · 留白'}]:[]),...book.spreads.map((s,i)=>({id:s.id,kind:'spread',label:`${i*2+1}–${i*2+2}`,spreadIndex:i})),...(d.backBlankPages?[{id:'back-matter',kind:'blank',label:'后留白页'}]:[]),...(d.readingEdition?[{id:'closing-page',kind:'closing',label:'收尾页'}]:[]),{id:'back-cover',kind:'back',label:'封底'}];}
export function matterPages(book){const d=bookDesign(book);return d.frontBlankPages+d.backBlankPages;}
export function coverBackFrame(book){const w=book.printProfile.widthMm,h=book.printProfile.heightMm;return book.cover.backStyle==='bleed'?{x:0,y:0,width:w,height:h}:{x:25,y:30,width:w-50,height:h-60};}

// Opt-in physical structure: PDF leaf 1 is recto, each composed body pair starts verso.
// Legacy drafts and immutable exports keep their original sequence.
export function extraMatterPages(book){return bookDesign(book).readingEdition?2:0;}
export function interiorLeaves(book){const d=bookDesign(book);if(d.blankFirst)return[{kind:'blank',label:'前留白第一面',side:1},{kind:'blank',label:'前留白第二面',side:0},{kind:'title',label:'内封题名',side:1},...book.spreads.flatMap((s,i)=>[0,1].map(side=>({kind:'body',page:i*2+side+1,spreadIndex:i,side}))),{kind:'closing',label:'收尾页',side:0},{kind:'blank',label:'后留白第一面',side:1},{kind:'blank',label:'后留白第二面',side:0}];return[
 ...(d.readingEdition?[{kind:'title',label:'内封题名',side:1}]:[]),
 ...Array.from({length:d.frontBlankPages},(_,i)=>({kind:'blank',label:`前留白 ${i+1}`,side:i%2})),
 ...book.spreads.flatMap((s,i)=>[0,1].map(side=>({kind:'body',page:i*2+side+1,spreadIndex:i,side}))),
 ...Array.from({length:d.backBlankPages},(_,i)=>({kind:'blank',label:`后留白 ${i+1}`,side:i%2})),
 ...(d.readingEdition?[{kind:'closing',label:'收尾页',side:0}]:[])
];}
