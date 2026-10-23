import { useState } from 'react';
import { Modal } from './ui';
export function ImportDialog({ close, submit, busy,error }: {close:()=>void;submit:(path:string,limit:number)=>Promise<void>;busy:boolean;error?:string}) {
  const [path,setPath] = useState(''); const [limit,setLimit] = useState(500);
  return <Modal title="添加照片目录" description="照片留在原来的文件夹，无需复制进项目。这里只保存预览、索引与整理记录。" close={close}><form onSubmit={e=>{e.preventDefault();void submit(path.trim().replace(/\\ /g,' '),limit);}}>
    <label>来源目录<input autoFocus required placeholder="粘贴 Finder 中的完整目录路径" value={path} onChange={e=>setPath(e.target.value)}/></label>
    <label>本次最多处理<input type="number" min="1" max="500" required value={limit} onChange={e=>setLimit(Number(e.target.value))}/></label>
    <p className="privacy">每次最多处理 500 个文件。JPEG、PNG、HEIC 可预览；同名成片已就绪时跳过配对 3FR。再次导入会跳过未变化的文件，未变化文件也计入本次数量。原片只读；导入后请保留来源文件夹的位置与名称。</p>
    {error&&<p className="banner error" role="alert">{error}</p>}
    <button className="primary full" disabled={busy}>{busy?'正在开始…':'开始本地导入'}</button>
  </form></Modal>;
}
