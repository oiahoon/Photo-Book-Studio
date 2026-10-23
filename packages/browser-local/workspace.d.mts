import type {Project,Photo} from '../../apps/browser/src/model';
import type {BookPlacement} from '../../apps/web/src/book-types';
export function layoutFor(count:number):string;
export function bookPlacement(photo:Photo):BookPlacement;
export function addSpread(p:Project,ids:string[],chapterId?:string,title?:string):Project;
export function replaceSpreadMembers(p:Project,spreadId:string,ids:string[]):Project;
export type Chapter={sourceChapterId?:string;id:string;title:string;photoIds:string[];pageIds?:string[]};
export function chapterGroups(p:Project):Chapter[];
export function reorderChapter(p:Project,id:string,direction:number):Project;
export function renameChapter(p:Project,id:string,title:string):Project;
export type External={provider:string;importedAt:string;entries:{photoId:string;flag:string;group:string}[];issues:string[]};
export function externalPlan(p:Project,input:unknown):External;
export function analysisTask(p:Project,ids:string[]):{id:string;instructions:string;photos:{photoId:string;preview:string;rotation:number}[]};
export function moveChapterPhotos(p:Project,from:string,to:string,ids:string[]):Project;

export function newSpreadProject(name?:string):Project;
