import {baselineOf,editableColor,seriesCapabilities,sourceKey,teamConditionsOf,type Figure} from './applyEditor';
import type {EditorTrace} from '../state/document';
export const conditionOf=(t:Figure['data'][number]):string=>t.meta?.teamCondition||t.legendgroup||t.name||'';
export function conditionNames(figure:Figure):string[]{
 const source=baselineOf(figure),names=teamConditionsOf(source.layout)??source.data.map(conditionOf);
 return [...new Set<string>(names.filter((n:unknown)=>typeof n==='string'&&!!n))];
}
/** Patch all matching, safely keyed scalar traces; continuous/per-point colours are scientific data. */
export function conditionColorPatches(figure:Figure,condition:string,color:string):EditorTrace[]{
 if(!/^#[a-f0-9]{6}$/i.test(color))return [];
 const source=baselineOf(figure);
 return source.data.flatMap((t,index)=>{
  const key=sourceKey(t,source.data),caps=seriesCapabilities(t);
  if(conditionOf(t)!==condition||!key||caps.continuous||!editableColor(t,'marker'))return [];
  return [{index,sourceKey:key,color,...(editableColor(t,'line')?{lineColor:color}:{}),...(caps.fill?{fillColor:color}:{})}];
 });
}
