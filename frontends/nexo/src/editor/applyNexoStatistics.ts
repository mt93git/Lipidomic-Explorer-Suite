import type {Figure} from '../api/types';
import {applyStatisticsToFigure,type StatisticsInput} from '../statistics/annotations';
/** Presentation adapter only. Team computes exactly the same labels and brackets in data
 * coordinates; Plotly expects log10 coordinates for annotation text, but raw values for shapes. */
export function applyNexoStatistics(figure:Figure,statistics:StatisticsInput|null|undefined,described?:Parameters<typeof applyStatisticsToFigure>[2]):Figure {
 const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
 const axes=(['xaxis','yaxis'] as const).filter(key=>object(figure.layout[key]).type==='log');
 if(!axes.length||!(statistics?.result&&statistics.applied)&&!described?.length)return applyStatisticsToFigure(figure,statistics,described);
 const raw=structuredClone(figure);
 for(const key of axes){const axis=object(raw.layout[key]);if(Array.isArray(axis.range))axis.range=axis.range.map(v=>typeof v==='number'?10**v:v);}
 const out=applyStatisticsToFigure(raw,statistics,described);
 for(const key of axes)out.layout[key]=structuredClone(figure.layout[key]);
 for(const value of Array.isArray(out.layout.annotations)?out.layout.annotations:[]){const a=object(value);if(typeof a.name!=='string'||!a.name.startsWith('tcstat-'))continue;
 for(const key of axes){const axis=key==='xaxis'?'x':'y';if(a[`${axis}ref`]===axis&&typeof a[axis]==='number')a[axis]=Math.log10(a[axis]);}}
 return out;
}
/** FIX-PROD-H 3, as Team's canvas_statistics.js draw(): on a drawn plot the labels and brackets are placed from the value
 *  axis Plotly lays out on the data alone (ours removed first), and the axis is set to make room for them. An explicit
 *  axis range was the baseline already; a log axis keeps the placement from the data. */
export async function placeStatistics(Plotly:{relayout(gd:HTMLElement,update:Record<string,unknown>):Promise<unknown>},gd:HTMLElement,statistics:StatisticsInput|null|undefined,described?:Parameters<typeof applyStatisticsToFigure>[2]):Promise<void>{
 const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
 const g=gd as unknown as {data:Figure['data'];layout:Record<string,unknown>;_fullLayout:Record<string,unknown>};
 const ours=(v:unknown)=>String(object(v).name??'').startsWith('tcstat-'),list=(v:unknown)=>Array.isArray(v)?v:[];
 const annotations=list(g.layout.annotations),shapes=list(g.layout.shapes);
 if(!annotations.some(ours)&&!shapes.some(ours))return;
 const axis=g.data.some(t=>object(t).orientation==='h')?'xaxis':'yaxis',current=object(g.layout[axis]);
 if(current.autorange===false||current.type==='log')return;
 await Plotly.relayout(gd,{annotations:annotations.filter(a=>!ours(a)),shapes:shapes.filter(s=>!ours(s))});
 const range=object(g._fullLayout[axis]).range;
 if(!Array.isArray(range))return;
 const placed=applyNexoStatistics({data:g.data,layout:{...g.layout,[axis]:{...object(g.layout[axis]),range:[...range]}}},statistics,described);
 const value=object(placed.layout[axis]);
 await Plotly.relayout(gd,{annotations:placed.layout.annotations,shapes:placed.layout.shapes,...(value.autorange===false?{[`${axis}.range`]:value.range,[`${axis}.autorange`]:false}:{})});
}
