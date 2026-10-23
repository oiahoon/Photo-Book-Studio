import{coverBackFrame}from'./book-design.mjs';
import {readFile,writeFile,realpath,stat,rm} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {contained,hashFile,validatePreview} from '../metadata/importer.mjs';
import {jpegSize} from './image.mjs';
import {spreadFrames,fitImage,captionGeometry} from './geometry.mjs';
const exec=promisify(execFile),TARGET_PPI=300;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
// All visible instances, including the cover, determine the needed pixel extent.
function instances(book){
 const w=book.printProfile.widthMm,h=book.printProfile.heightMm,items=[];
 for(const [i,s]of book.spreads.entries()){const frames=spreadFrames(w,h,s.layout,s.placements.length,!!s.title);s.placements.forEach((p,j)=>items.push({placement:p,frame:captionGeometry(frames[j],p,s.layout==='bleed').frame,spread:i+1,pages:[i*2+1,i*2+2]}));}
 if(book.cover.style!=='text'&&book.cover.front){const bleed=book.cover.style==='bleed';items.push({placement:book.cover.front,frame:captionGeometry({x:0,y:0,width:bleed?w:w-50,height:bleed?h:h*.54},book.cover.front,bleed).frame,cover:'front'});}
 if(book.cover.back)items.push({placement:book.cover.back,frame:captionGeometry(coverBackFrame(book),book.cover.back,book.cover.backStyle==='bleed').frame,cover:'back'});return items;
}
export function requiredPixels(book,photoId,width,height){
 return Math.ceil(Math.max(...instances(book).filter(i=>i.placement.photoId===photoId).map(({placement,frame})=>{const f=fitImage(frame.width,frame.height,width,height,placement);return Math.max(f.width,f.height)*TARGET_PPI/25.4;})));
}
export function resolutionReport(snapshot){
 const assets=new Map(snapshot.assets.map(a=>[a.photoId,a]));const placements=instances(snapshot.book).filter(i=>assets.has(i.placement.photoId)).map(({placement,frame,...where})=>{const a=assets.get(placement.photoId),f=fitImage(frame.width,frame.height,a.width,a.height,placement),ppi=Math.min(a.width/f.width,a.height/f.height)*25.4/(1+2*(snapshot.print?.parameters.bleedMm||0)/Math.min(snapshot.book.printProfile.widthMm,snapshot.book.printProfile.heightMm));return{photoId:placement.photoId,filename:placement.filename,...where,ppi:Math.round(ppi*10)/10,belowTarget:ppi<299};});return{targetPpi:TARGET_PPI,minPpi:Math.min(...placements.map(p=>p.ppi)),belowTarget:placements.filter(p=>p.belowTarget).length,placements,printerConfirmed:false};
}
export async function prepareHighResolution(job,progress){
 if(process.platform!=='darwin')throw new Error('高清派生图需要 macOS 本地解码环境');
 const{snapshot,state,dir}=job,cache=await realpath(join(resolve(dir,'../../../'),'cache'));
 state.completedAssets=0;state.totalAssets=snapshot.assets.length;await progress();
 for(const asset of snapshot.assets){
  let temporary,check;
  try{
   state.phase=`读取原片 ${state.completedAssets+1} / ${state.totalAssets}`;await progress();
   const preview=await realpath(join(cache,asset.preview));if(!contained(cache,preview))throw new Error('预览路径超出项目缓存');const previewBytes=await readFile(preview);if(digest(previewBytes)!==asset.previewHash)throw new Error('预览校验失败');const dimensions=jpegSize(previewBytes);
   if(!asset.source||!isAbsolute(asset.source.root)||isAbsolute(asset.source.relativePath))throw new Error('原片引用无效');const root=await realpath(asset.source.root),path=await realpath(resolve(root,asset.source.relativePath));if(!contained(root,path))throw new Error('原片路径越过来源边界');
   const before=await stat(path);if(!before.isFile()||await hashFile(path)!==asset.sourceHash)throw new Error('原片内容已变化，请重新导入后复核书稿');
   const metadata=await exec('/usr/bin/sips',['-g','pixelWidth','-g','pixelHeight',path],{timeout:30000});const sourceWidth=Number(metadata.stdout.match(/pixelWidth: (\d+)/)?.[1]),sourceHeight=Number(metadata.stdout.match(/pixelHeight: (\d+)/)?.[1]);if(!sourceWidth||!sourceHeight)throw new Error('无法读取原片尺寸');
   const maxPixels=Math.min(Math.max(sourceWidth,sourceHeight),Math.ceil(requiredPixels(snapshot.book,asset.photoId,dimensions.width,dimensions.height)*(1+2*(snapshot.print?.parameters.bleedMm||0)/Math.min(snapshot.book.printProfile.widthMm,snapshot.book.printProfile.heightMm))));
   temporary=join(dir,'assets',asset.photoId+'.partial.jpg');check=join(dir,'assets',asset.photoId+'.check.jpg');
   // Same native decoding/rotation order as project previews, with a larger extent.
   await exec('/usr/bin/sips',['--matchTo','/System/Library/ColorSync/Profiles/sRGB Profile.icc','-s','format','jpeg','-s','formatOptions','95','-Z',String(maxPixels),path,'--out',temporary],{timeout:180000});
   if(asset.rotation)await exec('/usr/bin/sips',['--rotate',String(asset.rotation),'-s','formatOptions','95',temporary,'--out',temporary],{timeout:90000});
   const bytes=await readFile(temporary),size=jpegSize(bytes);if(Math.abs((size.width/size.height)/(dimensions.width/dimensions.height)-1)>.005)throw new Error('高清方向或比例与当前预览不一致，需人工复核');if(Math.max(size.width,size.height)>Math.max(sourceWidth,sourceHeight))throw new Error('不允许放大原片像素');
   await exec('/usr/bin/sips',['-Z','1600',temporary,'--out',check],{timeout:90000});await validatePreview(check);
   const after=await stat(path);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||await hashFile(path)!==asset.sourceHash)throw new Error('转换时原片发生变化，本次导出已停止');
   const derivedHash=digest(bytes),file='assets/'+derivedHash+'.jpg';await writeFile(join(dir,file),bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});Object.assign(asset,{file,...size,derivedHash,sourceVerified:true,sourceWidth,sourceHeight,requestedMaxPixels:maxPixels,derivation:{decoder:'macOS sips',version:1,targetPpi:TARGET_PPI,jpegQuality:95,colourSpace:'sRGB',upscaled:false,projectRotation:asset.rotation}});
   state.completedAssets++;await progress();
  }catch(error){throw new Error(`${asset.source?.relativePath||asset.photoId}：${error.code==='ENOENT'?'原片或缓存不可用，请检查来源目录':error.message}`);}
  finally{if(temporary)await rm(temporary,{force:true});if(check)await rm(check,{force:true});}
 }
}
