import type { Project,Handle } from './model';
import {validateProject} from '../../../packages/browser-local/model.mjs';
let connection:Promise<IDBDatabase>;
function db(){return connection??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('photo-book-browser-v1',1);r.onupgradeneeded=()=>{for(const s of ['projects','assets','handles'])r.result.createObjectStore(s);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('请关闭旧版影集标签页后重试'));});}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export async function projects(){const d=await db();return request<Project[]>(d.transaction('projects').objectStore('projects').getAll());}
export type Asset={thumbnail:Blob;handle?:Handle;render?:Blob;renderHash?:string;sourceHash?:string;renderRotation?:number;derivation?:Record<string,unknown>};
export async function asset(projectId:string,photoId:string){const d=await db();return request<Asset|undefined>(d.transaction('assets').objectStore('assets').get(projectId+':'+photoId));}
export async function rootHandle(projectId:string,sourceId:string){const d=await db();return request<Handle|undefined>(d.transaction('handles').objectStore('handles').get(projectId+':'+sourceId));}
export async function commit(p:Project,assets:Map<string,Asset>=new Map(),handles:Map<string,Handle>=new Map()){
 validateProject(p);const d=await db();return new Promise<Project>((resolve,reject)=>{const t=d.transaction(['projects','assets','handles'],'readwrite'),s=t.objectStore('projects'),r=s.get(p.id);let conflict=false;
 r.onsuccess=()=>{const old=r.result as Project|undefined;if(old&&old.revision!==p.revision){conflict=true;t.abort();return;}const next={...p,revision:p.revision+1};s.put(next,p.id);for(const [id,a] of assets)t.objectStore('assets').put(a,p.id+':'+id);for(const [id,h] of handles)t.objectStore('handles').put(h,p.id+':'+id);t.oncomplete=()=>resolve(next);};
 t.onerror=()=>reject(t.error||Error('本地保存失败'));t.onabort=()=>reject(conflict?Error('另一个标签页已修改书稿，请重新打开最新版本'):t.error||Error('保存中断，原书稿仍保留'));
 });
}
