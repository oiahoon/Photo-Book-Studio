export type TextSpec={x:number;y:number;width:number;text:string;size:number;maxLines:number;fill?:string;weight?:number;tracking?:number};
export function textLines(text:string,width:number,size?:number,maxLines?:number,tracking?:number):{font:number;rows:string[]};
export function spreadTitle(book:any,spread:any):TextSpec;
export function spreadPlace(book:any,spread:any):string;
export function coverTitles(book:any,frontX?:number):TextSpec[];

export function spreadTexts(book:any,spread:any):TextSpec[];
export function coverBackTexts(book:any):TextSpec[];

export function footerStyle(book:any):{size:number;fill:string};
export function matterTexts(book:any,kind:string):TextSpec[];

export function footerPositions(w:number,side:number):{pageX:number;pageAnchor:'start'|'end';placeX:number;placeAnchor:'start'|'end'};
export function spineTexts(book:any,spine:number):{text:string;y:number;size:number;tracking:number}[];
