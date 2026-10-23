import {useEffect,useRef,useState} from 'react';
import type {Photo,Project} from './model';
import {asset} from './storage';
export function PhotoThumbnail({project,photo}:{project:Project;photo:Photo}){
 const [url,setUrl]=useState(''),loaded=useRef<{key:string;url:string}|null>(null);
 useEffect(()=>{let active=true;void asset(project.id,photo.id).then(a=>{if(!a||!active)return;const key=a.thumbnailHash||`${a.thumbnail.size}:${a.thumbnail.type}`;if(loaded.current?.key===key)return;const next=URL.createObjectURL(a.thumbnail);if(loaded.current)URL.revokeObjectURL(loaded.current.url);loaded.current={key,url:next};setUrl(next);}).catch(()=>{});return()=>{active=false;};},[project.id,photo.id,project.revision]);
 useEffect(()=>()=>{if(loaded.current)URL.revokeObjectURL(loaded.current.url);loaded.current=null;},[project.id,photo.id]);
 return url?<img className={`rotation-${(photo.rotation-(photo.previewRotationApplied||0)+360)%360}`} src={url} alt={photo.name} loading="lazy"/>:<span className="missing">重新连接照片</span>;
}
