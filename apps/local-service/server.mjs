import{createPrint,renderPrint,readPrint,listPrints,printFileInfo}from'../../packages/publishing/print.mjs';
import {setPeople,undoPeople} from '../../packages/domain/people.mjs';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, DEFAULT_DATA_DIR, library } from '../../packages/domain/store.mjs';
import { importDirectory, contained, validateSource } from '../../packages/metadata/importer.mjs';
import { createTask, importAnalysis, importResultFile } from '../../packages/analysis/tasks.mjs';
import { setCuration } from '../../packages/domain/curation.mjs';
import { rotatePhoto,undoRotation } from '../../packages/metadata/orientation.mjs';
import { prepareNextBatch } from '../../packages/analysis/batches.mjs';
import { editStoryboard,undoStoryboard } from '../../packages/domain/storyboard.mjs';
import {setLocation,undoLocation} from '../../packages/domain/locations.mjs';
import {createReview,renderReview,listReviews,readReview,reviewFileInfo} from '../../packages/publishing/review.mjs';
import {listBooks,readBook,createBook,editBook,undoBook} from '../../packages/domain/book.mjs';

export async function createApp({ dataDir = DEFAULT_DATA_DIR, port = 4317 } = {}) {
  const db = openStore(dataDir);
  const token = randomBytes(32).toString('hex');
  const running = new Map();
  let exportBusy=false;
  for (const row of db.prepare('SELECT id,data FROM import_jobs').all()) {
    const job = JSON.parse(row.data);
    if (job.status === 'running') {
      job.status = 'interrupted'; job.error = '上次导入被中断，可再次导入目录继续';
      db.prepare('UPDATE import_jobs SET data=? WHERE id=?').run(JSON.stringify(job), row.id);
    }
  }
  let libraryCache;
  const revision=()=>`${db.prepare('PRAGMA data_version').get().data_version}:${db.prepare('SELECT total_changes() AS n').get().n}`;
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    try {
      const actualPort = server.address()?.port || port;
      const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
      const origins = hosts.map(host => `http://${host}`);
      if (!hosts.includes(req.headers.host) || req.headers.origin && !origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: '仅允许本地同源访问' });
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const styleNonce=randomBytes(18).toString('base64');
      res.setHeader('Content-Security-Policy', `default-src 'self'; img-src 'self'; style-src 'self' 'nonce-${styleNonce}'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
      const url = new URL(req.url, origins[0]);
      if (url.pathname === '/api/session' && req.method === 'GET') return send(res, 200, { token });
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-project-token'] !== token) return send(res, 401, { error: '会话已过期，请刷新页面' });
        if (url.pathname === '/api/library' && req.method === 'GET') {
          // Track writes from this connection and independent Codex/CLI connections.
          const current=revision();
          if(!libraryCache || libraryCache.revision!==current){
            const text=JSON.stringify(library(db));
            libraryCache={revision:current,text,etag:`"${createHash('sha256').update(text).digest('hex')}"`};
          }
          res.setHeader('ETag',libraryCache.etag);
          res.setHeader('Cache-Control','no-store');
          if(req.headers['if-none-match']===libraryCache.etag){res.writeHead(304);res.end();return;}
          res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(libraryCache.text);return;
        }
        const printRoute=url.pathname.match(/^\/api\/book-print-exports(?:\/(.*))?$/);
        if(printRoute&&req.method==='GET'){
          if(!printRoute[1]){const id=url.searchParams.get('bookId');readBook(db,id);return send(res,200,await listPrints(dataDir,id));}
          const parts=printRoute[1].split('/');if(parts.length===1)return send(res,200,await readPrint(dataDir,parts[0]));
          if(parts.length!==3||parts[2]!=='pdf')return send(res,404,{error:'导出不存在'});
          const{path,file,bytes}=await printFileInfo(dataDir,parts[0],parts[1]);res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':bytes,'Content-Disposition':`attachment; filename="book-print.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,'Cache-Control':'no-store'});const stream=createReadStream(path);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
        }
        const exportRoute=url.pathname.match(/^\/api\/(book-exports|book-hd-exports)(?:\/(.*))?$/),exportQuality=exportRoute?.[1]==='book-hd-exports'?'highres':'review';
        if (exportRoute && !exportRoute[2] && req.method === 'GET') {
          const bookId=url.searchParams.get('bookId');readBook(db,bookId);return send(res,200,await listReviews(dataDir,bookId,exportQuality));
        }
        if (exportRoute?.[2] && req.method === 'GET') {
          const parts=exportRoute[2].split('/');
          if(parts.length===1)return send(res,200,await readReview(dataDir,parts[0],exportQuality));
          if(parts.length!==2||parts[1]!=='pdf')return send(res,404,{error:'导出不存在'});
          const {state,bytes,path}=await reviewFileInfo(dataDir,parts[0],exportQuality);
          res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':bytes,'Content-Disposition':`attachment; filename="book-review.pdf"; filename*=UTF-8''${encodeURIComponent(state.filename)}`,'Cache-Control':'no-store'});const stream=createReadStream(path);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
        }
        if (url.pathname === '/api/books' && req.method === 'GET') return send(res,200,listBooks(db));
        if (url.pathname.startsWith('/api/books/') && req.method === 'GET') return send(res,200,readBook(db,decodeURIComponent(url.pathname.slice('/api/books/'.length))));
        let body = {};
        if (req.method === 'POST') {
          let raw = '';
          for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('请求过大'); }
          body = raw ? JSON.parse(raw) : {};
        }
        if(printRoute&&!printRoute[1]&&req.method==='POST'){
          if(exportBusy)throw Error('已有 PDF 正在生成，请稍后重试');exportBusy=true;
          try{const job=await createPrint(db,dataDir,body);renderPrint(job).catch(()=>{}).finally(()=>{exportBusy=false;});return send(res,202,job.state);}catch(e){exportBusy=false;throw e;}
        }
        if (exportRoute && !exportRoute[2] && req.method === 'POST') {
          if(exportBusy)throw new Error('已有 PDF 正在生成，请稍后重试');
          exportBusy=true;
          try {
            const job=await createReview(db,dataDir,{...body,quality:exportQuality});
            renderReview(job).catch(()=>{}).finally(()=>{exportBusy=false;});
            return send(res,202,job.state);
          } catch(error) {exportBusy=false;throw error;}
        }
        if (url.pathname === '/api/books/create' && req.method === 'POST') return send(res,201,createBook(db,body));
        if (url.pathname === '/api/books/edit' && req.method === 'POST') return send(res,200,editBook(db,body));
        if (url.pathname === '/api/books/undo' && req.method === 'POST') return send(res,200,undoBook(db,body));
        if (url.pathname === '/api/import' && req.method === 'POST') {
          if (running.size) throw new Error('请等待当前导入完成，或先取消');
          const path = await validateSource(body.path, dataDir);
          const limit = body.limit ?? 6;
          if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('导入数量须为 1–500');
          const job = { id: randomUUID(), status: 'running', createdAt: new Date().toISOString(), path, limit, scanned: 0 };
          const save = () => db.prepare('INSERT INTO import_jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id, JSON.stringify(job), job.createdAt);
          const control = { cancelled: false }; running.set(job.id, control); save();
          importDirectory(db, dataDir, path, limit, progress => { Object.assign(job, progress); save(); }, () => control.cancelled, {includePaths:body.includePaths})
            .then(result => { Object.assign(job, result, { status: result.cancelled ? 'cancelled' : 'completed' }); save(); })
            .catch(error => { Object.assign(job, { status: 'failed', error: error.message }); save(); })
            .finally(() => running.delete(job.id));
          return send(res, 202, job);
        }
        if (url.pathname === '/api/import/cancel' && req.method === 'POST') {
          const control = running.get(body.id);
          if (control) control.cancelled = true;
          return send(res, 200, { requested: Boolean(control) });
        }
        if (url.pathname === '/api/tasks' && req.method === 'POST') return send(res, 201, await createTask(db, dataDir, body.ids));
        if (url.pathname === '/api/tasks/batch' && req.method === 'POST') return send(res, 201, await prepareNextBatch(db,dataDir,{sourceId:body.sourceId||null}));
        if (url.pathname === '/api/photos/people' && req.method === 'POST') return send(res,200,setPeople(db,body));
        if (url.pathname === '/api/photos/people/undo' && req.method === 'POST') return send(res,200,undoPeople(db,body));
        if (url.pathname === '/api/curation' && req.method === 'POST') return send(res, 200, setCuration(db,body));
        if (url.pathname === '/api/photos/location' && req.method === 'POST') return send(res,200,setLocation(db,body));
        if (url.pathname === '/api/photos/location/undo' && req.method === 'POST') return send(res,200,undoLocation(db,body));
        if (url.pathname === '/api/storyboard' && req.method === 'POST') return send(res, 200, editStoryboard(db,body));
        if (url.pathname === '/api/storyboard/undo' && req.method === 'POST') return send(res, 200, undoStoryboard(db,body));
        if (url.pathname === '/api/photos/rotate' && req.method === 'POST') return send(res, 200, await rotatePhoto(db,dataDir,{...body,origin:'manual',reason:'用户调整方向'}));
        if (url.pathname === '/api/photos/rotation/undo' && req.method === 'POST') return send(res, 200, await undoRotation(db,dataDir,body));
        if (url.pathname === '/api/analysis/import' && req.method === 'POST') return send(res, 200, await importAnalysis(db, dataDir, body));
        if (url.pathname === '/api/tasks/collect' && req.method === 'POST') {
          const row = db.prepare('SELECT manifest FROM tasks WHERE id=?').get(body.id);
          if (!row) throw new Error('任务不存在');
          return send(res, 200, await importResultFile(db, dataDir, JSON.parse(row.manifest).resultPath));
        }
        if (url.pathname === '/api/analysis/decision' && req.method === 'POST') {
          if (!['accepted','rejected','suggested'].includes(body.decision)) throw new Error('状态错误');
          const a = db.prepare('SELECT a.id FROM analyses a JOIN photos p ON p.id=a.photoId WHERE a.id=? AND p.active=1 AND a.sourceHash=p.hash AND a.previewHash=p.previewHash').get(body.id);
          if (!a) throw new Error('结果不存在或照片版本已失效');
          db.prepare('UPDATE analyses SET decision=?,decidedAt=? WHERE id=?').run(body.decision, new Date().toISOString(), body.id);
          return send(res, 200, { saved: true });
        }
        return send(res, 404, { error: '接口不存在' });
      }
      if (req.method !== 'GET') return send(res, 405, { error: '方法不支持' });
      if (url.pathname.startsWith('/previews/')) {
        const name = decodeURIComponent(url.pathname.slice('/previews/'.length));
        if (!/^[a-f0-9-]+\.jpg$/.test(name)) return send(res, 404, { error: '预览不存在' });
        const photo = db.prepare('SELECT id FROM photos WHERE preview=?').get(name);
        if (!photo) return send(res, 404, { error: '预览不存在' });
        const bytes = await readFile(join(dataDir, 'cache', name));
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' }); res.end(bytes); return;
      }
      const root = resolve('dist');
      const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!contained(root, path)) return send(res, 404, { error: '不存在' });
      if (!(await stat(path)).isFile()) return send(res, 404, { error: '不存在' });
      res.writeHead(200, { 'Content-Type': ({ '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' })[extname(path)] || 'application/octet-stream' });
      const bytes=await readFile(path);
      res.end(extname(path)==='.html'?bytes.toString('utf8').replace('</head>',`<meta name="style-nonce" content="${styleNonce}"></head>`):bytes);
    } catch (error) { send(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? '文件未找到，请检查来源或先构建应用' : error.message }); }
  });
  return { server, db, token, close: async () => { for (const control of running.values()) control.cancelled = true; await new Promise(resolve => server.close(resolve)); while (running.size || exportBusy) await new Promise(resolve => setTimeout(resolve, 100)); db.close(); } };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 4317);
  const app = await createApp({ port });
  app.server.listen(port, '127.0.0.1', () => console.log(`Photo Book Studio http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
