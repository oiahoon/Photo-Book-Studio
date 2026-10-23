import type{VisualStudy as Study}from'./types';
import{Disclosure}from'./ui';
export function VisualStudy({study}:{study:Study}){
 const list=(values:string[])=>values.length?values.join(' · '):'未明确';
 const rows=[['人物',`${study.peopleCount===null?'主要人物数量不确定':study.peopleCount===0?'无主要人物':`${study.peopleCount} 位主要人物`}${study.interactions.length?`；${list(study.interactions)}`:''}`],['景别与位置',`${study.shotScale} · ${list(study.subjectPosition)}`],['构图结构',list(study.structure)],['色彩',`${list(study.palette)}；${study.temperature} · ${study.saturation}饱和`],['明暗',`明度：${study.brightness} · 对比：${study.contrast}`],['光线',list(study.lighting)],['视觉线索',list(study.motifs)],['裁切风险',study.cropRisk]];
 return <Disclosure title="视觉属性"><dl className="visual-study">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="visual-pairing"><h3>搭配建议</h3><p>{study.pairing}</p><div className="tags">{study.roles.map(role=><span key={role}>{role}</span>)}</div></div></Disclosure>;
}
