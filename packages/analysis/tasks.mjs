import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { PROMPT, PROMPT_VERSION, PROMPT_HASH, validateEnvelope, analysisProfile } from './protocol.mjs';
import { verifyPhoto } from '../metadata/importer.mjs';
import { transaction,library } from '../domain/store.mjs';

export async function createTask(db, dataDir, ids, options={}) {
  const profile=analysisProfile(options.promptVersion);
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length) throw new Error('请选择 1–20 张不同照片');
  const photos = [];
  const data=library(db);
  for (const id of ids) {
    if (typeof id !== 'string') throw new Error('照片 ID 错误');
    const photo = db.prepare('SELECT * FROM photos WHERE id=?').get(id);
    await verifyPhoto(db, photo, dataDir);
    const adjustment=db.prepare('SELECT rotation,version,origin,reason FROM photo_adjustments WHERE photoId=?').get(photo.id)||{rotation:0,version:0};
    const reference=data.photos.find(p=>p.id===photo.id)?.external;
    const external=reference&&!reference.stale?{snapshotId:reference.snapshotId,visualGroups:reference.visualGroups,flag:reference.flag,databaseSnapshotHash:data.externalCulling.find(s=>s.id===reference.snapshotId)?.payload.databaseSnapshotHash}:null;
    photos.push({ photoId: photo.id, filename: photo.relativePath, sourceHash: photo.hash, adjustment,external,
      previewHash: photo.previewHash, previewPath: resolve(dataDir, 'cache', photo.preview), width: photo.width, height: photo.height });
  }
  const id = randomUUID();
  const dir = resolve(dataDir, 'analysis-tasks', id);
  await mkdir(dir, { recursive: true });
  const manifest = { schemaVersion: 1, taskId: id, promptVersion: profile.version, promptHash: profile.hash,
    createdAt: new Date().toISOString(), manifestPath: join(dir, 'manifest.json'), resultPath: join(dir, 'result.json'), photos };
  await writeFile(manifest.manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
  await writeFile(join(dir, 'instructions.md'), `${profile.prompt}\n\n任务清单：${manifest.manifestPath}\n结果路径：${manifest.resultPath}\n\n先查看每张 previewPath 图片，再填写结果。不要修改任何原片。分析所见画面，不依赖文件名猜测。\n\n方向检查：预览已包含 adjustment.rotation 的项目调整。检查实际画面方向；明显横倒或倒置时，先通过项目 photos:rotate 命令纠正（origin 填 Codex，reason 写可见依据），查看新预览，再创建新任务分析；旧任务保留，不将新图结果填进旧哈希。方向不明确时不旋转，在 uncertainties 中说明。照片自身倾斜、俯拍或仰拍不等于横倒。\n`);
  db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(id, JSON.stringify(manifest), manifest.createdAt);
  return manifest;
}

export async function importAnalysis(db, dataDir, input) {
  const envelope = validateEnvelope(input);
  const taskRow = db.prepare('SELECT * FROM tasks WHERE id=?').get(envelope.taskId);
  if (!taskRow) throw new Error('分析任务不存在');
  const task = JSON.parse(taskRow.manifest);
  if (task.promptVersion !== envelope.promptVersion || task.promptHash !== analysisProfile(envelope.promptVersion).hash) throw new Error('任务提示词不匹配');
  const prepared = [];
  for (const result of envelope.results) {
    const member = task.photos.find(p => p.photoId === result.photoId);
    if (!member || member.sourceHash !== result.sourceHash || member.previewHash !== result.previewHash) throw new Error('分析结果与任务照片或哈希不匹配');
    const photo = db.prepare('SELECT * FROM photos WHERE id=?').get(result.photoId);
    await verifyPhoto(db, photo, dataDir);
    if (photo.hash !== result.sourceHash || photo.previewHash !== result.previewHash) throw new Error('分析输入版本已失效');
    const old = db.prepare('SELECT * FROM analyses WHERE taskId=? AND photoId=?').get(task.taskId, result.photoId);
    const json = JSON.stringify(result);
    if (old && (old.result !== json || old.model !== envelope.model || old.analyst !== envelope.analyst)) throw new Error('此任务结果已保存；如需修改请创建新任务以保留历史');
    prepared.push({ result, json, old });
  }
  let imported = 0;
  transaction(db, () => {
    for (const { result, json, old } of prepared) {
      if (old) continue;
      const current = db.prepare('SELECT active,hash,previewHash FROM photos WHERE id=?').get(result.photoId);
      if (!current?.active || current.hash !== result.sourceHash || current.previewHash !== result.previewHash) throw new Error('写回时照片版本已变化');
      db.prepare(`INSERT INTO analyses(id,taskId,photoId,sourceHash,previewHash,analyst,model,promptVersion,promptHash,result,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), task.taskId, result.photoId, result.sourceHash, result.previewHash,
          envelope.analyst, envelope.model, envelope.promptVersion, task.promptHash, json, new Date().toISOString());
      imported++;
    }
  });
  return { imported, unchanged: prepared.length - imported };
}
export async function importResultFile(db, dataDir, path) {
  const content = await readFile(path, 'utf8');
  if (Buffer.byteLength(content) > 1024 * 1024) throw new Error('结果文件超过 1 MB');
  return importAnalysis(db, dataDir, JSON.parse(content));
}
