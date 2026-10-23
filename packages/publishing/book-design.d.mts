export type BookDesign={frontBlankPages:0|2;backBlankPages:0|2;paperTone:'white'|'natural'|'warm';coverTypography:'classic'|'editorial';blankFirst?:boolean;readingEdition?:boolean;closingLine?:string;titleKicker?:string;titleContext?:string};
export function bookDesign(book:any):BookDesign;
export function paperColor(book:any):string;
export function matterPages(book:any):number;
export function bookSurfaces(book:any):{id:string;kind:string;label:string;spreadIndex?:number}[];
export function coverBackFrame(book:any):{x:number;y:number;width:number;height:number};

export function extraMatterPages(book:any):number;
export function interiorLeaves(book:any):{kind:string;label?:string;side:number;page?:number;spreadIndex?:number}[];
