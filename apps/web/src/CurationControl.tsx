import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Check,Clock3,X,RotateCcw } from 'lucide-react';
import { Hint } from './ui';
import type { CurationState } from './types';
export const curationLabels:Record<CurationState,string>={unreviewed:'未审阅',keep:'保留',pending:'待定',exclude:'排除'};
export function CurationControl({state,disabled,onChange}:{state:CurationState;disabled:boolean;onChange:(state:CurationState)=>void}) {
  return <section className="curation-control" aria-label="照片选片"><div className="curation-heading"><h3>我的选片</h3><Hint label="P 保留 · U 待定 · X 排除 · 0 重置"><span tabIndex={0} className="key-hint">P / U / X</span></Hint></div>
    <ToggleGroup.Root type="single" value={state} onValueChange={value=>{if(value)onChange(value as CurationState);}} disabled={disabled} className="curation-toggles" aria-label="照片选片状态">
      <ToggleGroup.Item value="keep" aria-label="保留照片"><Check size={15}/>保留</ToggleGroup.Item><ToggleGroup.Item value="pending" aria-label="照片待定"><Clock3 size={15}/>待定</ToggleGroup.Item><ToggleGroup.Item value="exclude" aria-label="排除照片"><X size={15}/>排除</ToggleGroup.Item>
    </ToggleGroup.Root>
    {state!=='unreviewed'&&<button disabled={disabled} className="text-button" onClick={()=>onChange('unreviewed')}><RotateCcw size={12}/>恢复未审阅</button>}
  </section>;
}
