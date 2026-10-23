import {setPeople,undoPeople} from '../packages/domain/people.mjs';
import { resolve } from 'node:path';
import { openStore, DEFAULT_DATA_DIR, library } from '../packages/domain/store.mjs';
import { importDirectory } from '../packages/metadata/importer.mjs';
import { createTask, importResultFile } from '../packages/analysis/tasks.mjs';
import { importExternalCulling } from '../packages/metadata/external-culling.mjs';
import { readFile } from 'node:fs/promises';
import { rotatePhoto } from '../packages/metadata/orientation.mjs';
import {importLocations} from '../packages/domain/locations.mjs';
import {forkBook,editBook,listBooks,deleteArchivedBook} from '../packages/domain/book.mjs';
import {proposeStoryboard} from '../packages/domain/storyboard.mjs';

const db = openStore();
try {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'import') result = await importDirectory(db, DEFAULT_DATA_DIR, resolve(args[0]), Number(args[1] || 6));
  else if (command === 'task') result = await createTask(db, DEFAULT_DATA_DIR, args.length ? args : library(db).photos.filter(p => p.status === 'ready').slice(0,6).map(p => p.id));
  else if (command === 'visual-task') result=await createTask(db,DEFAULT_DATA_DIR,args,{promptVersion:'photo-visual-study-v1'});
  else if (command === 'analysis-import') result = await importResultFile(db, DEFAULT_DATA_DIR, resolve(args[0]));
  else if (command === 'inspect') result = library(db);
  else if (command === 'rotate') result=await rotatePhoto(db,DEFAULT_DATA_DIR,{photoId:args[0],rotation:Number(args[1]),expectedVersion:Number(args[2]),origin:args[3]||'manual',reason:args[4]||'用户调整方向'});
  else if (command === 'external-import') result=await importExternalCulling(db,JSON.parse(await readFile(resolve(args[0]),'utf8')));
  else if (command === 'locations-import') result=importLocations(db,JSON.parse(await readFile(resolve(args[0]),'utf8')));
  else if (command === 'people-set') result=setPeople(db,JSON.parse(await readFile(resolve(args[0]),'utf8')));
  else if (command === 'people-undo') result=undoPeople(db,JSON.parse(await readFile(resolve(args[0]),'utf8')));
  else if(command==='book-delete') result=deleteArchivedBook(db,{id:args[0],expectedVersion:Number(args[1])});
  else if(command==='books') result=listBooks(db,{includeArchived:args[0]==='all'});
  else if(command==='book-archive'||command==='book-restore') result=editBook(db,{id:args[0],expectedVersion:Number(args[1]),op:'archive',archived:command==='book-archive'});
  else if (command === 'book-fork') result=forkBook(db,JSON.parse(await readFile(resolve(args[0]),'utf8')));
  else if (command === 'storyboard-import') {
    const proposal=JSON.parse(await readFile(resolve(args[0]),'utf8'));
    if(proposal.schemaVersion!==1||typeof proposal.id!=='string'||proposal.id==='main')throw new Error('请为候选方案使用独立 ID，不能覆盖原章节草稿');
    result=proposeStoryboard(db,{boardId:proposal.id,name:proposal.name,expectedVersion:0,chapters:proposal.chapters});
  }
  else throw new Error('支持 import <目录> [数量]、task [照片ID...]、analysis-import <结果文件>、locations-import <地点结果文件>、storyboard-import <独立方案文件>、book-fork <独立书稿计划>、people-set <人工确认文件>、people-undo <撤销文件>、inspect');
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
