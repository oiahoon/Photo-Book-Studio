import type {Project,Placement,Page,AI} from '../../apps/browser/src/model';
export const FORMAT:string;
export function newProject(name?:string):Project;
export function placement(photoId:string):Placement;
export function frameRects(project:Project,page:Page):{x:number;y:number;width:number;height:number}[];
export function validateProject(p:unknown):Project;
export function backupProject(p:Project):string;
export function restoreProject(p:unknown):Project;
export type AIPlan={changes:{photoId:string;analysis:AI}[];issues:{row:number;reason:string}[]};
export function aiImportPlan(p:Project,input:unknown):AIPlan;
export function applyAI(p:Project,plan:AIPlan):Project;
export function paginate(p:Project,ids:string[],count?:number,chapterId?:string):Project;

export function pageLayouts(count:number):{id:string;label:string;counts:number[]}[];
