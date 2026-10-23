import {basename,dirname,extname} from 'node:path';
export function photoPairKey(sourceId,path) {
  return JSON.stringify([sourceId,dirname(path),basename(path,extname(path))]);
}
export function renderedPhotoKeys(photos) {
  return new Set(photos.filter(p=>p.status==='ready'&&p.preview&&/\.(jpe?g|heic|heif)$/i.test(p.relativePath)).map(p=>photoPairKey(p.sourceId,p.relativePath)));
}
export function isPairedRaw(photo,renderedKeys) {
  return /\.3fr$/i.test(photo.relativePath)&&renderedKeys.has(photoPairKey(photo.sourceId,photo.relativePath));
}
