let token = '';
let sessionRequest: Promise<void> | null = null;
let libraryText = '';
let libraryEtag = '';
let libraryValue: unknown;
export async function api<T>(path: string, body?: unknown): Promise<T> {
  await ensureSession();
  const response = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-project-token': token, ...(path==='library' && body===undefined && libraryEtag?{'If-None-Match':libraryEtag}:{}), ...(body === undefined ? {} : { 'Content-Type':'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if(response.status===304 && path==='library' && libraryValue!==undefined)return libraryValue as T;
  const text = await response.text();
  if(response.ok && path==='library' && body===undefined && text===libraryText)return libraryValue as T;
  const value = JSON.parse(text);
  if (!response.ok) { if (response.status === 401) token = ''; throw new Error(value.error || '操作未完成'); }
  // Preserve object identity for unchanged polls: skip JSON parsing and grid rerenders.
  if(path==='library' && body===undefined){libraryText=text;libraryValue=value;libraryEtag=response.headers.get('ETag')||'';}
  return value;
}

async function ensureSession(){
  if (!token) {
    sessionRequest ??= fetch('/api/session').then(async session=>{if(!session.ok)throw new Error('无法建立本地会话');token=(await session.json()).token;}).finally(()=>{sessionRequest=null;});
    await sessionRequest;
  }
}

export async function downloadReview(id:string,filename:string,quality:'review'|'highres'='review'){
 await ensureSession();
 const response=await fetch(`/api/${quality==='highres'?'book-hd-exports':'book-exports'}/${encodeURIComponent(id)}/pdf`,{headers:{'x-project-token':token}});
 if(!response.ok){if(response.status===401)token='';const value=await response.json();throw new Error(value.error||'下载未完成');}
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export async function downloadPrint(id:string,type:'cover'|'interior',filename:string){
 await ensureSession();const r=await fetch(`/api/book-print-exports/${encodeURIComponent(id)}/${type}/pdf`,{headers:{'x-project-token':token}});if(!r.ok){if(r.status===401)token='';throw Error((await r.json()).error||'下载未完成');}const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
