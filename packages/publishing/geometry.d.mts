export function spreadFrames(width:number,height:number,layout:string,count:number,hasTitle:boolean):{x:number;y:number;width:number;height:number}[];
export function fitImage(width:number,height:number,pixelWidth:number,pixelHeight:number,placement:{fit:string;zoom:number;panX:number;panY:number}):{x:number;y:number;width:number;height:number};

type Frame={x:number;y:number;width:number;height:number};
export function captionGeometry(frame:Frame,placement:{caption?:string;fit:string;zoom:number;panX:number;panY:number},overlay?:boolean,pixelWidth?:number,pixelHeight?:number):{frame:Frame;caption:null|{text:string;x:number;y:number;width:number;size:number;overlay:boolean;band:Frame}};

export const collageCounts:Record<string,number>;
export function supportsLayout(layout:string,count:number):boolean;
