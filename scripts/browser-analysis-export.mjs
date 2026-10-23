// Read-only bridge. No original media and no database migrations are invoked.
import {DatabaseSync} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
const dbPath=resolve(process.argv[2]||'.local/beijing/project.sqlite');
const destination=resolve(process.argv[3]||'.local/browser-transfer/analysis.json');
if(destination===dbPath)throw Error('输出不能覆盖数据库');
const db=new DatabaseSync(dbPath,{readOnly:true});
try{
 const rows=db.prepare(`SELECT p.id AS photoId,p.hash AS sourceHash,p.relativePath,s.name AS sourceName,a.id AS analysisId,a.analyst,a.model,a.result FROM photos p JOIN sources s ON s.id=p.sourceId JOIN analyses a ON a.photoId=p.id AND a.sourceHash=p.hash AND a.previewHash=p.previewHash WHERE p.active=1 AND a.id=(SELECT a2.id FROM analyses a2 WHERE a2.photoId=p.id AND a2.sourceHash=p.hash AND a2.previewHash=p.previewHash ORDER BY a2.createdAt DESC,a2.rowid DESC LIMIT 1)`).all();
 const results=rows.map(r=>({...r,result:JSON.parse(r.result)}));
 await mkdir(dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify({format:'photo-book-ai-transfer',schemaVersion:1,createdAt:new Date().toISOString(),results},null,2),{flag:'wx'});console.log(JSON.stringify({destination,photos:results.length,readOnly:true}));
}finally{db.close();}
