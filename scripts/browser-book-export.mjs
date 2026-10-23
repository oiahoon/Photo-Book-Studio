import {DatabaseSync} from 'node:sqlite';
import {resolve,join,basename,relative} from 'node:path';
import {mkdir,readFile,writeFile,copyFile,realpath,stat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {hashFile,contained} from '../packages/metadata/importer.mjs';
import {jpegSize} from '../packages/publishing/image.mjs';
import {locationValue} from '../packages/domain/location-value.mjs';
import {newProject,validateProject} from '../packages/browser-local/model.mjs';
import {editionPages} from '../packages/browser-local/edition.mjs';
const [sourceDirectory,bookId,outputDirectory,highresDirectory]=process.argv.slice(2);
if(!sourceDirectory||!bookId||!outputDirectory||!highresDirectory){console.error('Usage: npm run browser:book:export -- <data-directory> <book-id> <new-output-directory> <highres-job-directory>');process.exit(1);}
const root=resolve(sourceDirectory),out=resolve(outputDirectory),hd=resolve(highresDirectory);
try{await stat(join(out,'project.photobook'));throw Error('迁移目录已有项目，请使用新的输出目录');}catch(e){if(e.code!=='ENOENT')throw e;}
const db=new DatabaseSync(join(root,'project.sqlite'),{readOnly:true});const digest=b=>createHash('sha256').update(b).digest('hex');
try{
 const row=db.prepare('select * from books where id=?').get(bookId);if(!row)throw Error('书稿不存在');const book={...JSON.parse(row.data),id:row.id,version:row.version,updatedAt:row.updatedAt};
 const all=db.prepare('select * from photos').all(),ready=all.filter(p=>p.active&&p.status==='ready');
 const hdManifest=JSON.parse(await readFile(join(hd,'manifest.json'),'utf8')),hdMap=new Map(hdManifest.assets.map(a=>[a.photoId,a]));
 const used=new Set([...book.spreads.flatMap(s=>s.placements),book.cover.front,book.cover.back].filter(Boolean).map(q=>q.photoId));
 const p=newProject(book.name);p.id=randomUUID();p.edition=book;p.pages=editionPages(book);p.settings={width:book.printProfile.widthMm,height:book.printProfile.heightMm,margin:14,blankSheets:!!book.design?.frontBlankPages,spine:book.printProfile.spineMm,coverTitle:book.cover.showTitle===false?'':book.cover.title,coverPhotoId:book.cover.front?.photoId||null,backPhotoId:book.cover.back?.photoId||null};
 p.sources=db.prepare('select id,name from sources').all();
 await mkdir(join(out,'media','previews'),{recursive:true});await mkdir(join(out,'media','render'),{recursive:true});
 const entries=[],sourceAudit=[];
 for(const [index,photo]of ready.entries()){
  const source=db.prepare('select * from sources where id=?').get(photo.sourceId),sourceRoot=await realpath(source.path),sourcePath=await realpath(resolve(sourceRoot,photo.relativePath));if(!contained(sourceRoot,sourcePath)||await hashFile(sourcePath)!==photo.hash)throw Error('原片校验失败：'+photo.relativePath);
  const adjustment=db.prepare('select * from photo_adjustments where photoId=?').get(photo.id),rotation=adjustment?.rotation||0;
  const previewPath=await realpath(join(root,'cache',photo.preview)),cache=await realpath(join(root,'cache'));if(!contained(cache,previewPath)||await hashFile(previewPath)!==photo.previewHash)throw Error('预览校验失败');
  const size=jpegSize(await readFile(previewPath)),curation=db.prepare('select * from curation where photoId=?').get(photo.id),people=db.prepare('select * from photo_people where photoId=?').get(photo.id),loc=db.prepare('select * from photo_locations where photoId=?').get(photo.id),location=locationValue(photo,loc?{...JSON.parse(loc.data),version:loc.version}:null);
  const rows=db.prepare('select * from analyses where photoId=? order by createdAt,rowid').all(photo.id),analyses=rows.map(a=>({...a,importedAt:new Date().toISOString(),result:JSON.parse(a.result),stale:a.sourceHash!==photo.hash||a.previewHash!==photo.previewHash}));
  const photoRecord={id:photo.id,sourceId:photo.sourceId,path:photo.relativePath,name:basename(photo.relativePath),hash:photo.hash,bytes:photo.bytes,modified:0,mime:photo.format==='PNG'?'image/png':photo.format.includes('HEI')?'image/heic':'image/jpeg',width:photo.width||size.width,height:photo.height||size.height,rotation,previewRotationApplied:rotation,selection:curation?.state||'unreviewed',location:[location.city,location.site].filter(Boolean).join(' · '),people:(people?JSON.parse(people.people):[]).map(x=>({me:'我',annie:'Annie',dad:'爸爸',mom:'妈妈'})[x]||x),meta:{indexedWidth:photo.width,indexedHeight:photo.height},analyses,legacy:{photo,curation:curation||null,people:people||null,location,adjustment:adjustment||null}};
  p.photos.push(photoRecord);const preview={path:'media/previews/'+photo.id+'.jpg',hash:photo.previewHash,...size};await copyFile(previewPath,join(out,preview.path));
  const entry={photoId:photo.id,sourceHash:photo.hash,rotation,preview};
  if(used.has(photo.id)){const a=hdMap.get(photo.id);if(!a||a.sourceHash!==photo.hash||a.previewHash!==photo.previewHash||a.rotation!==rotation||!a.sourceVerified)throw Error('缺少匹配高清派生图：'+photo.relativePath);const path=await realpath(join(hd,a.file));if(!contained(await realpath(hd),path)||await hashFile(path)!==a.derivedHash)throw Error('高清派生校验失败');const target='media/render/'+photo.id+'.jpg';await copyFile(path,join(out,target));entry.render={path:target,hash:a.derivedHash,width:a.width,height:a.height,derivation:a.derivation};}
  entries.push(entry);sourceAudit.push({photoId:photo.id,path:sourcePath,hash:photo.hash});if(index%40===0)console.log(`校验与复制 ${index+1}/${ready.length}`);
 }
 for(const x of sourceAudit)if(await hashFile(x.path)!==x.hash)throw Error('迁移期间原片变化');
 p.migration={bookId,bookVersion:row.version,createdAt:new Date().toISOString(),manifestHash:digest(Buffer.from(JSON.stringify(entries)))};
 validateProject(p);
 await writeFile(join(out,'project.photobook'),JSON.stringify(p,null,2),{flag:'wx'});
 await writeFile(join(out,'media.json'),JSON.stringify({format:'pbs-migration-media',schemaVersion:1,migrationHash:p.migration.manifestHash,entries},null,2),{flag:'wx'});
 await writeFile(join(out,'source-audit.json'),JSON.stringify(sourceAudit,null,2),{flag:'wx'});
 console.log(JSON.stringify({out,photos:p.photos.length,analyses:p.photos.reduce((n,x)=>n+x.analyses.length,0),spreads:book.spreads.length,body:p.pages.length,placements:book.spreads.reduce((n,s)=>n+s.placements.length,0),renderAssets:entries.filter(e=>e.render).length,bookVersion:row.version}));
}finally{db.close();}
