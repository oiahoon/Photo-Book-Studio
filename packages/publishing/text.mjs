// Shared line breaks and font size, preserving the existing SVG title layout.
export function textLines(text,width,size=7,maxLines=2,tracking=0){
 const split=font=>{const rows=[''];let used=0;for(const ch of text){const unit=/[\u0000-\u00ff]/.test(ch)?.58:1;if(used+unit+tracking/font>width/font&&rows.at(-1)){rows.push('');used=0;}rows[rows.length-1]+=ch;used+=unit+tracking/font;}return rows;};
 let font=size,rows=split(font);while(rows.length>maxLines&&font>2){font-=.5;rows=split(font);}return{font,rows};
}
export function spreadTitle(book,spread){const w=book.printProfile.widthMm,h=book.printProfile.heightMm;return{x:spread.placements.length===1?(spread.layout==='airy-left'?w+w*.12:w*.12):25,y:spread.placements.length===1?h*.42:23,width:w-50,text:spread.title,size:spread.placements.length===1?9:7,maxLines:spread.placements.length===1?5:2};}
export function spreadPlace(book,spread){return book.spreads.find(s=>s.chapterId===spread.chapterId&&s.title)?.title.split('｜')[0]||'';}
export function coverTitles(book,frontX=0){if(book.cover.showTitle===false)return[];const w=book.printProfile.widthMm,h=book.printProfile.heightMm,c=book.cover,bleed=c.style==='bleed',light=(c.inkTone||(book.design?.coverTypography==='editorial'?'ink':bleed?'light':'ink'))==='light';if(book.design?.coverTypography==='editorial')return[{x:frontX+25,y:c.style==='text'?h*.42:35,width:w-50,size:14,text:c.title,maxLines:2,fill:light?'#fffdf8':'#25201b',weight:600,tracking:1.8},...(c.subtitle?[{x:frontX+26,y:c.style==='text'?h*.42+24:56,width:w-52,size:3.5,text:c.subtitle,maxLines:3,fill:light?'#fffdf8':'#655b50',tracking:.6}]:[])];return[{x:frontX+25,y:c.style==='text'?h*.4:24,width:w-50,size:12,text:c.title,maxLines:2,fill:light?'#fffdf8':'#25201b'},...(c.subtitle?[{x:frontX+25,y:c.style==='text'?h*.4+35:52,width:w-50,size:5,text:c.subtitle,maxLines:3,fill:light?'#fffdf8':'#655b50'}]:[])];}

// Chapter layouts opt into a hierarchy; other saved layouts keep their text geometry.
export function spreadTexts(book,spread){
 if(!spread.title||spread.layout==='bleed')return[];
 if(spread.layout==='coda-left'){const w=book.printProfile.widthMm,h=book.printProfile.heightMm,parts=spread.title.split('｜');return[{x:w+32,y:h*.46,width:w-64,text:parts[0],size:7,maxLines:2},...(parts[1]?[{x:w+32,y:h*.46+15,width:w-64,text:parts[1],size:4,maxLines:3,fill:'#655b50'}]:[])];}
 if(!spread.layout.startsWith('chapter-'))return[spreadTitle(book,spread)];
 const w=book.printProfile.widthMm,h=book.printProfile.heightMm,x=(spread.layout==='chapter-left'?w:0)+28,width=w-56;
 const parts=spread.title.split('｜'),place=parts.shift(),narrative=parts.join('｜'),chapters=[...new Set(book.spreads.map(s=>s.chapterId))],index=chapters.indexOf(spread.chapterId)+1;
 return[{x,y:h*.28,width,text:String(index).padStart(2,'0'),size:4,maxLines:1,fill:'#bd3026'},
 {x,y:h*.43,width,text:place,size:Math.min(14,width/Math.max(1,Array.from(place).length)),maxLines:2},
 ...(narrative?[{x,y:h*.43+23,width,text:narrative,size:5.5,maxLines:4,fill:'#655b50'}]:[])];
}

export function coverBackTexts(book){if(book.design?.coverTypography!=='editorial')return[];return[{x:25,y:book.printProfile.heightMm-15,width:book.printProfile.widthMm-50,size:3.3,text:book.cover.subtitle||book.cover.title,maxLines:1,fill:book.cover.backStyle==='bleed'?'#fffdf8':'#655b50',tracking:.5}];}

export function footerStyle(book){return book.design?.readingEdition?{size:3.7,fill:'#6b6259'}:{size:3,fill:'#8e8479'};}
// Coordinates are local to a single physical leaf, reused in SVG and all PDFs.
export function matterTexts(book,kind){const w=book.printProfile.widthMm,h=book.printProfile.heightMm;
 if(kind==='title')return[{x:30,y:h*.27,width:w-60,text:book.design?.titleKicker||'',size:4,maxLines:1,fill:'#bd3026',tracking:1.2},
 {x:30,y:h*.43,width:w-60,text:book.cover.title,size:13,maxLines:2,weight:600,tracking:1},
 {x:31,y:h*.43+22,width:w-62,text:book.cover.subtitle,size:4.8,maxLines:3,fill:'#655b50'},
 {x:31,y:h-34,width:w-62,text:book.design?.titleContext||'',size:3.7,maxLines:1,fill:'#655b50',tracking:.6}];
 return book.design?.closingLine?[{x:32,y:h*.47,width:w-64,text:book.design.closingLine,size:5,maxLines:3,tracking:.6,fill:'#655b50'}]:[];
}

export function footerPositions(w,side){return{pageX:side===0?15:2*w-15,pageAnchor:side===0?'start':'end',placeX:side===0?w-15:w+15,placeAnchor:side===0?'end':'start'};}
export function spineTexts(book,spine){if(book.cover.spineStyle!=='editorial-vertical'||spine<=0)return[];const h=book.printProfile.heightMm,scale=h/250,title=Array.from(book.cover.title),size=Math.min(8,spine*.4,150/Math.max(1,title.length))*scale,step=Math.min(14.5,150/Math.max(1,title.length))*scale,start=h/2-(title.length-1)*step/2+size*.594;return[{text:book.design?.titleKicker||'',y:39*scale,size:3.8*scale,tracking:.55*scale},...title.map((text,i)=>({text,y:start+i*step,size,tracking:0}))];}
