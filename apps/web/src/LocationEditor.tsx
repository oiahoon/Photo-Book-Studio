import {useState} from 'react';
import {MapPin} from 'lucide-react';
import type {Photo} from './types';
import {Disclosure} from './ui';

export const locationLabel=(p:Photo)=>[p.location.city,p.location.site].filter(Boolean).join(' · ');
export const locationMatches=(p:Photo,filter:string)=>filter==='all'||(filter.startsWith('city:')?p.location.city===filter.slice(5):filter.startsWith('place:')?locationLabel(p)===filter.slice(6):p.location.status===filter);
export function LocationFilter({photos,value,onChange}:{photos:Photo[];value:string;onChange:(value:string)=>void}){
  const counts=new Map<string,number>(),cities=new Map<string,number>();for(const p of photos){const name=locationLabel(p);if(name)counts.set(name,(counts.get(name)||0)+1);if(p.location.city)cities.set(p.location.city,(cities.get(p.location.city)||0)+1);}
  return <label className={`location-filter${value!=='all'?' is-filtered':''}`}><MapPin size={14} aria-hidden="true"/><select aria-label="筛选地点" value={value} onChange={e=>onChange(e.target.value)}><option value="all">全部地点</option><optgroup label="地点状态"><option value="suggested">地点待确认</option><option value="confirmed">地点已确认</option><option value="unknown">地点待补充</option></optgroup><optgroup label="城市">{[...cities].sort(([a],[b])=>a.localeCompare(b,'zh-CN')).map(([city,n])=><option key={city} value={`city:${city}`}>{city} · 全部 {n} 张</option>)}</optgroup><optgroup label="具体地点">{[...counts].sort(([a],[b])=>a.localeCompare(b,'zh-CN')).map(([name,n])=><option key={name} value={`place:${name}`}>{name}{cities.has(name)?' · 景点待补充':''} · {n}</option>)}</optgroup></select></label>;
}
export function LocationEditor({photo,busy,save}:{photo:Photo;busy:boolean;save:(city:string,site:string)=>void}){
  const location=photo.location;
  const [city,setCity]=useState(location.city),[site,setSite]=useState(location.site);
  const label=locationLabel(photo)||'待补充';
  const state=location.stale?'依据已变化':location.status==='confirmed'?'已确认':location.status==='suggested'?'待确认':'';
  const confidence=({high:'较高',medium:'中等',low:'较低',unknown:'不足'} as Record<string,string>)[location.confidence];
  return <div className="photo-location"><Disclosure title={`地点 · ${label}${state?' · '+state:''}`}>
    {location.reason&&<p className="location-evidence">{location.status==='suggested'||!location.manual?`Codex 推测 · 把握${confidence||'不足'}。`:''}{location.reason}</p>}
    <form onSubmit={e=>{e.preventDefault();save(city.trim(),site.trim());}}><div className="location-fields"><label>城市<input aria-label="照片城市" maxLength={80} value={city} onChange={e=>setCity(e.target.value)} placeholder="例如：北京"/></label><label>景点 / 地点<input aria-label="照片景点" maxLength={80} value={site} onChange={e=>setSite(e.target.value)} placeholder="例如：天坛"/></label></div><div className="location-actions"><button className="primary" disabled={busy||(!city.trim()&&!site.trim())}>{location.status==='suggested'&&city===location.city&&site===location.site?'确认地点':'保存地点'}</button><button type="button" disabled={busy||(!location.city&&!location.site)} onClick={()=>save('','')}>清空地点</button></div></form>
  </Disclosure></div>;
}
