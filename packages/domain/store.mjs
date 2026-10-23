import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { externalForPhoto } from '../metadata/external-culling.mjs';
import { renderedPhotoKeys,isPairedRaw } from './photo-policy.mjs';
import { locationValue } from './location-value.mjs';

export const DEFAULT_DATA_DIR = resolve(process.env.PBS_DATA_DIR || '.local/beijing');
export function openStore(dataDir = DEFAULT_DATA_DIR) {
  mkdirSync(dataDir, { recursive: true });
  const entryPath = join(dataDir, 'project.json');
  if (existsSync(entryPath)) {
    const entry = JSON.parse(readFileSync(entryPath, 'utf8'));
    if (entry.schemaVersion !== 1) throw new Error('项目入口版本不支持');
  } else {
    writeFileSync(entryPath, JSON.stringify({ id: randomUUID(), schemaVersion: 1, name: '北京家庭影集', database: 'project.sqlite' }, null, 2)+'\n', { flag: 'wx' });
  }
  for (const name of ['cache', 'analysis-tasks', 'snapshots', 'exports']) mkdirSync(join(dataDir, name), { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'project.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 7) { db.close(); throw new Error('项目版本较新，请升级应用'); }
  if (version > 0 && version < 7) {
    const backupPath=join(dataDir,'snapshots',`before-schema-${version<4?4:version<5?5:version<6?6:7}-${Date.now()}.sqlite`);
    db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  }
  // Additive migration: existing assets and analysis history remain untouched.
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photos(
      id TEXT PRIMARY KEY, sourceId TEXT NOT NULL REFERENCES sources(id), relativePath TEXT NOT NULL,
      hash TEXT NOT NULL, bytes INTEGER NOT NULL, format TEXT NOT NULL, width INTEGER, height INTEGER,
      preview TEXT, previewHash TEXT, status TEXT NOT NULL, error TEXT, active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL, UNIQUE(sourceId,relativePath,hash));
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, manifest TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS analyses(
      id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), photoId TEXT NOT NULL REFERENCES photos(id),
      sourceHash TEXT NOT NULL, previewHash TEXT NOT NULL, analyst TEXT NOT NULL, model TEXT NOT NULL,
      promptVersion TEXT NOT NULL, promptHash TEXT NOT NULL, result TEXT NOT NULL,
      decision TEXT NOT NULL DEFAULT 'suggested', createdAt TEXT NOT NULL, decidedAt TEXT,
      UNIQUE(taskId,photoId));
    CREATE TABLE IF NOT EXISTS import_jobs(id TEXT PRIMARY KEY, data TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS curation(
      photoId TEXT PRIMARY KEY REFERENCES photos(id), state TEXT NOT NULL CHECK(state IN ('unreviewed','keep','pending','exclude')),
      version INTEGER NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS external_culling(
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, sourceRoot TEXT NOT NULL, snapshotHash TEXT NOT NULL,
      payload TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(provider,snapshotHash));
    CREATE TABLE IF NOT EXISTS photo_adjustments(
      photoId TEXT PRIMARY KEY REFERENCES photos(id), rotation INTEGER NOT NULL CHECK(rotation IN (0,90,180,270)),
      version INTEGER NOT NULL, basePreview TEXT NOT NULL, baseHash TEXT NOT NULL,
      origin TEXT NOT NULL, reason TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orientation_history(id TEXT PRIMARY KEY,photoId TEXT NOT NULL REFERENCES photos(id),data TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS storyboards(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL,updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS storyboard_history(id TEXT PRIMARY KEY,beforeData TEXT NOT NULL,afterVersion INTEGER NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photo_locations(photoId TEXT PRIMARY KEY REFERENCES photos(id),data TEXT NOT NULL,version INTEGER NOT NULL,updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS location_history(id TEXT PRIMARY KEY,photoId TEXT NOT NULL REFERENCES photos(id),beforeData TEXT NOT NULL,afterVersion INTEGER NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL,updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS book_history(id TEXT PRIMARY KEY,bookId TEXT NOT NULL REFERENCES books(id),beforeData TEXT NOT NULL,afterVersion INTEGER NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photo_people(photoId TEXT PRIMARY KEY REFERENCES photos(id),people TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('unmarked','confirmed')),version INTEGER NOT NULL,updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS people_history(id TEXT PRIMARY KEY,data TEXT NOT NULL,createdAt TEXT NOT NULL);
    PRAGMA user_version=7;
    COMMIT;
  `);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function readStoryboard(db,id='main'){
  const row=db.prepare('SELECT * FROM storyboards WHERE id=?').get(id);
  const data=row?JSON.parse(row.data):{chapters:[]};
  return {...data,id,name:data.name||(id==='main'?'原章节草稿':'未命名方案'),version:row?.version||0,updatedAt:row?.updatedAt||null};
}
export function readStoryboards(db){
  const boards=db.prepare('SELECT * FROM storyboards ORDER BY updatedAt DESC,id').all().map(row=>{const data=JSON.parse(row.data);return{...data,id:row.id,name:data.name||(row.id==='main'?'原章节草稿':'未命名方案'),version:row.version,updatedAt:row.updatedAt};});
  if(!boards.some(b=>b.id==='main'))boards.push(readStoryboard(db));
  return boards;
}
export function library(db) {
  const analyses = db.prepare('SELECT * FROM analyses ORDER BY createdAt DESC, rowid DESC').all();
  const people=new Map(db.prepare('SELECT * FROM photo_people').all().map(r=>[r.photoId,{ids:JSON.parse(r.people),status:r.status,version:r.version,origin:'user'}]));
  const curation = new Map(db.prepare('SELECT * FROM curation').all().map(c=>[c.photoId,c]));
  const adjustments = new Map(db.prepare('SELECT * FROM photo_adjustments').all().map(c=>[c.photoId,c]));
  const sources=db.prepare('SELECT * FROM sources ORDER BY createdAt').all();
  const locations=new Map(db.prepare('SELECT * FROM photo_locations').all().map(r=>[r.photoId,{...JSON.parse(r.data),version:r.version,updatedAt:r.updatedAt}]));
  const externalCulling=db.prepare('SELECT * FROM external_culling ORDER BY createdAt DESC, rowid DESC').all().map(r=>({...r,payload:JSON.parse(r.payload)}));
  const assets=db.prepare('SELECT * FROM photos WHERE active=1 ORDER BY relativePath,id').all();
  const renderedKeys=renderedPhotoKeys(assets);
  return {
    storyboard:readStoryboard(db),
    storyboards:readStoryboards(db),
    sources,
    filteredRaw: assets.filter(p=>isPairedRaw(p,renderedKeys)).map(p=>({sourceId:p.sourceId,relativePath:p.relativePath,hash:p.hash})),
    photos: assets.filter(p=>!isPairedRaw(p,renderedKeys)).map(photo => ({
      ...photo,
      people:people.get(photo.id)||{ids:[],status:'unmarked',version:0,origin:null},
      curation: curation.get(photo.id) || {state:'unreviewed',version:0},
      adjustment: adjustments.get(photo.id) || {rotation:0,version:0},
      location: locationValue(photo,locations.get(photo.id)),
      external: externalForPhoto(photo,sources.find(s=>s.id===photo.sourceId)?.path,externalCulling),
      analyses: analyses.filter(a => a.photoId === photo.id).map(a => ({ ...a, stale: a.sourceHash !== photo.hash || a.previewHash !== photo.previewHash, result: JSON.parse(a.result) })),
    })),
    tasks: db.prepare('SELECT id, createdAt, manifest FROM tasks ORDER BY createdAt DESC').all().map(t => {
      const m = JSON.parse(t.manifest);
      return { id: t.id, createdAt: t.createdAt, count: m.photos.length, completed:m.photos.filter(p=>analyses.some(a=>a.taskId===t.id&&a.photoId===p.photoId&&assets.some(current=>current.id===p.photoId&&current.hash===a.sourceHash&&current.previewHash===a.previewHash))).length, resultPath: m.resultPath, manifestPath: m.manifestPath };
    }),
    jobs: db.prepare('SELECT data FROM import_jobs ORDER BY createdAt DESC LIMIT 5').all().map(j => JSON.parse(j.data)),
    externalCulling,
  };
}
