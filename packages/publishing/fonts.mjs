import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
// macOS may keep downloaded Chinese fonts in a versioned asset directory.
export async function kaiFont(path=process.env.PBS_PDF_KAI_FONT){
 const name=process.env.PBS_PDF_KAI_FONT_NAME||'STKaitiSC-Regular';
 if(path)return{bytes:await readFile(path),name};
 const paths=['/System/Library/Fonts/Supplemental/Kaiti.ttc'];
 const root='/System/Library/AssetsV2';
 for(const family of (await readdir(root).catch(()=>[])).filter(n=>n.startsWith('com_apple_MobileAsset_Font'))){
  const base=join(root,family);for(const item of await readdir(base).catch(()=>[]))if(item.endsWith('.asset'))paths.push(join(base,item,'AssetData/Kaiti.ttc'));
 }
 for(const candidate of paths){try{return{bytes:await readFile(candidate),name};}catch(e){if(e.code!=='ENOENT')throw e;}}
 throw new Error('正楷字体缺失，请在 macOS 字体册下载「楷体-简」，或配置 PBS_PDF_KAI_FONT 后重试');
}
