import { Modal } from './ui';
import type { Task } from './types';
export function TaskDialog({task,close,copied,error,message}:{task:Task;close:()=>void;copied:()=>void;error:()=>void;message?:string}) {
  const prompt=`请读取分析任务 ${task.manifestPath} 及同目录 instructions.md，逐张实际查看预览图，按协议分析并写入 ${task.resultPath}，然后使用项目的 analysis:import 命令写回。保持原片只读。`;
  return <Modal wide title="交给 Codex 分析" description="复制下面的指令到当前 Codex 对话。Codex 将查看预览图并把结果写入本地项目。" close={close}><textarea readOnly aria-label="Codex 分析指令" value={prompt}/><p className="privacy">本地服务不会自动发送照片。Codex 查看预览时会使用其模型服务。</p>{message&&<p className="banner error" role="alert">{message}</p>}<div className="task-actions"><button className="primary" onClick={()=>void navigator.clipboard.writeText(prompt).then(copied).catch(error)}>复制指令</button><button onClick={close}>完成</button></div></Modal>;
}
