import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat, readdir, mkdir, rename, rm, readFile, copyFile } from 'node:fs/promises';
import jpeg from 'jpeg-js';
import { join, relative, extname, basename, resolve, sep, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { transaction } from '../domain/store.mjs';
import { photoPairKey,renderedPhotoKeys,isPairedRaw } from '../domain/photo-policy.mjs';

const exec = promisify(execFile);
const PREVIEWABLE = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
const REGISTER_ONLY = new Set(['.3fr', '.dng', '.tif', '.tiff', '.arw', '.cr2', '.nef']);
export function contained(root, file) {
  const r = relative(root, file);
  return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r));
}
export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function validatePreview(path) {
  const { data, width, height } = jpeg.decode(await readFile(path), { useTArray: true, maxResolutionInMP: 5, maxMemoryUsageInMB: 64 });
  if (!width || !height || Math.max(width,height) > 1600) throw new Error('预览尺寸不正确');
  let max=0;
  for (let i=0; i<data.length; i+=4) max=Math.max(max,data[i],data[i+1],data[i+2]);
  if (max <= 1) throw new Error('预览全黑：可能是 macOS 解码环境受限，请在正常本地终端运行后重试；不会据此评价原片');
}
export async function validateSource(path, dataDir) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('请选择绝对目录路径');
  let root;
  try { root=await realpath(path); }
  catch(error) { if(error.code==='ENOENT')throw new Error('照片来源目录不存在，请检查完整路径');throw error; }
  if (!(await stat(root)).isDirectory()) throw new Error('来源必须是目录');
  const data = await realpath(dataDir);
  if (contained(root, data) || contained(data, root)) throw new Error('照片来源不能包含项目数据目录，也不能位于缓存中');
  return root;
}
export async function sourceFile(db, photo) {
  const source = db.prepare('SELECT path FROM sources WHERE id=?').get(photo.sourceId);
  if (!source) throw new Error('来源不存在');
  const path = await realpath(join(source.path, photo.relativePath));
  if (!contained(source.path, path)) throw new Error('照片路径越过来源边界');
  return path;
}
export async function verifyPhoto(db, photo, dataDir) {
  if (!photo?.active || !photo.preview) throw new Error('照片未就绪或版本已过期');
  const path = await sourceFile(db, photo);
  if (await hashFile(path) !== photo.hash) throw new Error('原片内容已变化，请重新导入');
  if (await hashFile(join(dataDir, 'cache', photo.preview)) !== photo.previewHash) throw new Error('预览缓存已变化，请重新导入重建');
  await validatePreview(join(dataDir, 'cache', photo.preview));
}

export async function importDirectory(db, dataDir, path, limit, report = () => {}, cancelled = () => false, options = {}) {
  const root = await validateSource(path, dataDir);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('导入数量须为 1–500');
  let allowedPaths=null;
  if(options.includePaths!==undefined){
    if(!Array.isArray(options.includePaths)||!options.includePaths.length||options.includePaths.length>500||options.includePaths.some(p=>typeof p!=='string'||!p||isAbsolute(p)||!contained(root,resolve(root,p)))) throw new Error('指定照片路径无效');
    allowedPaths=new Set(options.includePaths);
  }
  let source = db.prepare('SELECT * FROM sources WHERE path=?').get(root);
  if (!source) {
    source = { id: randomUUID(), path: root, name: basename(root), createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO sources VALUES (?,?,?,?)').run(source.id, source.path, source.name, source.createdAt);
  }
  const renderedKeys=renderedPhotoKeys(db.prepare('SELECT * FROM photos WHERE active=1 AND sourceId=?').all(source.id));
  const result = { sourceId: source.id, imported: 0, unchanged: 0, registered: 0, filteredRaw:0, errors: [], skippedSymlinks: 0, scanned: 0, limited: false, cancelled: false };
  async function* walk(dir) {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a,b) => {
      const aStem=basename(a.name,extname(a.name)),bStem=basename(b.name,extname(b.name));
      if(a.isFile()&&b.isFile()&&aStem===bStem)return Number(/\.3fr$/i.test(a.name))-Number(/\.3fr$/i.test(b.name))||a.name.localeCompare(b.name,'en');
      return a.name.localeCompare(b.name,'en');
    });
    for (const entry of entries) {
      if (cancelled()) return;
      if (entry.isSymbolicLink()) { result.skippedSymlinks++; continue; }
      if (entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(path);
      else if (entry.isFile() && (PREVIEWABLE.has(extname(path).toLowerCase()) || REGISTER_ONLY.has(extname(path).toLowerCase()))) yield path;
    }
  }
  for await (const entryPath of walk(root)) {
    if (cancelled()) { result.cancelled = true; break; }
    const relativePath = relative(root, entryPath);
    if(allowedPaths && !allowedPaths.has(relativePath))continue;
    if(isPairedRaw({sourceId:source.id,relativePath},renderedKeys)){result.filteredRaw++;report({...result,current:relativePath});continue;}
    if (result.scanned >= limit) { result.limited = true; break; }
    result.scanned++;
    let tmp;
    try {
      const path = await realpath(entryPath);
      if (!contained(root, path)) throw new Error('文件位于来源目录外');
      const before = await stat(path);
      const hash = await hashFile(path);
      const existing = db.prepare('SELECT * FROM photos WHERE sourceId=? AND relativePath=? AND hash=?').get(source.id, relativePath, hash);
      if (existing?.status === 'ready') {
        try {
          await verifyPhoto(db, { ...existing, active: 1 }, dataDir);
          transaction(db, () => {
            db.prepare('UPDATE photos SET active=0 WHERE sourceId=? AND relativePath=?').run(source.id, relativePath);
            db.prepare('UPDATE photos SET active=1 WHERE id=?').run(existing.id);
          });
          result.unchanged++; report({ ...result, current: relativePath }); continue;
        } catch { /* Rebuild missing or damaged cache. */ }
      }
      const id = existing?.id || randomUUID();
      const adjustment=db.prepare('SELECT * FROM photo_adjustments WHERE photoId=?').get(id);
      let rebuiltBase=null,rebuiltBaseHash=null;
      const format = extname(path).slice(1).toUpperCase();
      let preview = null, previewHash = null, width = null, height = null, status = 'unsupported';
      if (PREVIEWABLE.has(extname(path).toLowerCase())) {
        if (process.platform !== 'darwin') throw new Error('当前预览转换需要 macOS sips');
        const metadata = await exec('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], { timeout: 30000 });
        width = Number(metadata.stdout.match(/pixelWidth: (\d+)/)?.[1]) || null;
        height = Number(metadata.stdout.match(/pixelHeight: (\d+)/)?.[1]) || null;
        preview = `${id}-${hash.slice(0,16)}.jpg`;
        tmp = join(dataDir, 'cache', `${randomUUID()}.tmp.jpg`);
        await mkdir(join(dataDir, 'cache'), { recursive: true });
        await exec('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1600', path, '--out', tmp], { timeout: 90000 });
        await validatePreview(tmp);
        if(adjustment){
          rebuiltBase=`${id}-${randomUUID()}.jpg`;
          rebuiltBaseHash=await hashFile(tmp);
          await copyFile(tmp,join(dataDir,'cache',rebuiltBase));
          preview=`${id}-${randomUUID()}.jpg`;
          if(adjustment.rotation)await exec('/usr/bin/sips',['--rotate',String(adjustment.rotation),join(dataDir,'cache',rebuiltBase),'--out',tmp],{timeout:30000});
          await validatePreview(tmp);
        }
        previewHash = await hashFile(tmp);
        status = 'ready';
      }
      const after = await stat(path);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || await hashFile(path) !== hash) throw new Error('导入时文件变化，未保存，请稍后重试');
      if (tmp) await rename(tmp, join(dataDir, 'cache', preview));
      transaction(db, () => {
        if(adjustment){
          const version=db.prepare('SELECT version FROM photo_adjustments WHERE photoId=?').get(id)?.version;
          if(version!==adjustment.version)throw new Error('导入时照片方向已变化，请重试');
          db.prepare('UPDATE photo_adjustments SET basePreview=?,baseHash=?,version=version+1 WHERE photoId=?').run(rebuiltBase,rebuiltBaseHash,id);
        }
        db.prepare('UPDATE photos SET active=0 WHERE sourceId=? AND relativePath=?').run(source.id, relativePath);
        db.prepare(`INSERT INTO photos(id,sourceId,relativePath,hash,bytes,format,width,height,preview,previewHash,status,error,active,createdAt)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,1,?) ON CONFLICT(id) DO UPDATE SET preview=excluded.preview,previewHash=excluded.previewHash,status=excluded.status,active=1,error=NULL`)
          .run(id, source.id, relativePath, hash, before.size, format, width, height, preview, previewHash, status, new Date().toISOString());
      });
      if (status === 'ready') result.imported++; else result.registered++;
      if(status==='ready'&&/\.(jpe?g|heic|heif)$/i.test(relativePath))renderedKeys.add(photoPairKey(source.id,relativePath));
    } catch (error) { result.errors.push({ file: relativePath, message: error.message }); }
    finally { if (tmp) await rm(tmp, { force: true }); }
    report({ ...result, current: relativePath });
  }
  if (cancelled()) result.cancelled = true;
  return result;
}
