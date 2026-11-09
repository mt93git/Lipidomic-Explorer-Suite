import type {Figure} from '../api/types';
import {applyStatisticsToFigure,type StatisticsInput} from '../statistics/annotations';
/** Presentation adapter only. Team computes exactly the same labels and brackets in data
 * coordinates; Plotly expects log10 coordinates for annotation text, but raw values for shapes. */
export function applyNexoStatistics(figure:Figure,statistics:StatisticsInput|null|undefined):Figure {
 const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
 const axes=(['xaxis','yaxis'] as const).filter(key=>object(figure.layout[key]).type==='log');
 if(!axes.length||!statistics?.result||!statistics.applied)return applyStatisticsToFigure(figure,statistics);
 const raw=structuredClone(figure);
 for(const key of axes){const axis=object(raw.layout[key]);if(Array.isArray(axis.range))axis.range=axis.range.map(v=>typeof v==='number'?10**v:v);}
 const out=applyStatisticsToFigure(raw,statistics);
 for(const key of axes)out.layout[key]=structuredClone(figure.layout[key]);
 for(const value of Array.isArray(out.layout.annotations)?out.layout.annotations:[]){const a=object(value);if(typeof a.name!=='string'||!a.name.startsWith('tcstat-'))continue;
 for(const key of axes){const axis=key==='xaxis'?'x':'y';if(a[`${axis}ref`]===axis&&typeof a[axis]==='number')a[axis]=Math.log10(a[axis]);}}
 return out;
}
