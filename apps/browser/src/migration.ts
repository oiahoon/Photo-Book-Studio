import type {Project} from './model';
import {validateProject} from '../../../packages/browser-local/model.mjs';
import {commit} from './storage';
import type {Asset} from './storage';
import {hash} from './media';
export async function importMigration(files:FileList,current:Project|null,signal:AbortSignal,progress:(s:string)=>void){
 const paths=new Map(Array.from(files).map(file=>[(file.webkitRelativePath||file.name).split('/').slice(1).join('/')||file.name,file]));
 const config=paths.get('project.photobook'),manifestFile=paths.get('media.json');if(!config||!manifestFile)throw Error('请选择含 project.photobook 与 media.json 的迁移目录');
 if(config.size>32*1024*1024||manifestFile.size>8*1024*1024)throw Error('迁移配置过大');
 const original=validateProject(JSON.parse(await config.text())),manifest=JSON.parse(await manifestFile.text());
 if(manifest.format!=='pbs-migration-media'||manifest.schemaVersion!==1||!Array.isArray(manifest.entries)||manifest.entries.length>10000)throw Error('迁移素材清单无效');
 const project:Project=current&&current.migration?.manifestHash===original.migration?.manifestHash?structuredClone(current):original;
 if(await hash(new Blob([JSON.stringify(manifest.entries)]))!==manifest.migrationHash||manifest.migrationHash!==project.migration?.manifestHash)throw Error('素材清单与书稿不匹配');
 const assets=new Map<string,Asset>(),seen=new Set<string>();
 for(const [i,entry]of manifest.entries.entries()){
  if(signal.aborted)throw Error('已取消，未修改书稿');progress(`校验迁移素材 ${i+1} / ${manifest.entries.length}`);
  const photo=project.photos.find(p=>p.id===entry.photoId);if(!photo||photo.hash!==entry.sourceHash||seen.has(photo.id)||photo.previewRotationApplied!==entry.rotation)throw Error('迁移照片引用或方向不一致');seen.add(photo.id);
  const check=async(spec:{path:string;hash:string})=>{if(!spec||!/^media\/(previews|render)\/[a-zA-Z0-9-]+\.jpg$/.test(spec.path))throw Error('迁移素材路径无效');const file=paths.get(spec.path);if(!file||await hash(file)!==spec.hash)throw Error('迁移素材缺少或校验失败：'+spec.path);return file;};
  const thumbnail=await check(entry.preview);let a:Asset={thumbnail};if(entry.render)a={...a,render:await check(entry.render),renderHash:entry.render.hash,sourceHash:photo.hash,renderRotation:entry.rotation,derivation:entry.render.derivation};assets.set(photo.id,a);
 }
 if(seen.size!==project.photos.length)throw Error('迁移素材未覆盖全部照片');if(signal.aborted)throw Error('已取消');return commit(project,assets);
}
