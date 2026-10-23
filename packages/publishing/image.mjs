export function jpegSize(bytes){
 if(bytes[0]!==255||bytes[1]!==216)throw new Error('预览不是有效 JPEG');
 let p=2;while(p+8<bytes.length){if(bytes[p++]!==255)throw new Error('JPEG 结构错误');while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const length=bytes.readUInt16BE(p);if(length<2||p+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){const height=bytes.readUInt16BE(p+3),width=bytes.readUInt16BE(p+5);if(width&&height)return{width,height};}p+=length;}
 throw new Error('无法读取预览尺寸');
}
