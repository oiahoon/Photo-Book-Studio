/** Native decoding first; HEIC's optional decoder stays out of the initial bundle. */
export async function isHeif(blob:Blob){
 if(/image\/hei[cf]/i.test(blob.type))return true;
 const bytes=new Uint8Array(await blob.slice(0,64).arrayBuffer());
 const header=new TextDecoder('ascii').decode(bytes);
 return header.slice(4,8)==='ftyp'&&!/avif|avis/.test(header)&&/heic|heix|hevc|hevx|mif1|msf1/.test(header.slice(8));
}
export type DecodeOptions={signal?:AbortSignal;onFallback?:()=>void};
function waitBitmap(task:Promise<ImageBitmap>,signal?:AbortSignal){return new Promise<ImageBitmap>((resolve,reject)=>{let done=false;const finish=(error?:unknown,image?:ImageBitmap)=>{if(done){image?.close();return;}done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(image!);},abort=()=>finish(new DOMException('已取消解码','AbortError')),timer=setTimeout(()=>finish(Error('解码超时，请使用 JPEG 派生图重试')),120000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();task.then(image=>finish(undefined,image),error=>finish(error));});}
let decoder:Promise<typeof import('heic-to/csp')>|undefined;
export async function decodeBitmap(blob:Blob,{signal,onFallback}:DecodeOptions={}){
 signal?.throwIfAborted();
 let image:ImageBitmap;
 try{image=await waitBitmap(createImageBitmap(blob),signal);}
 catch(nativeError){
  signal?.throwIfAborted();
  if(!await isHeif(blob))throw nativeError;
  onFallback?.();
  try{decoder??=import('heic-to/csp').catch(error=>{decoder=undefined;throw error;});const {heicTo}=await decoder;image=await waitBitmap(heicTo({blob,type:'bitmap'}),signal);}
  catch(error){throw Error('HEIC 本机解码失败：'+(error instanceof Error?error.message:String(error)));}
 }
 if(signal?.aborted){image.close();signal.throwIfAborted();}
 return image;
}
