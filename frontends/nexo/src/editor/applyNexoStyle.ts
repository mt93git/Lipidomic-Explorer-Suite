import {baselineOf,sourceKey,type Figure,type PlotObject} from './applyEditor';
import {validateNexoStyle,type NexoStyle} from '../state/nexo';
const originals=new WeakMap<Figure,Figure>();
/** Plotly 2.25.2 predates font.weight. Bold uses text markup, including legend names. */
export function applyNexoStyle(figure:Figure,value?:NexoStyle):Figure {
 const base=originals.get(figure)??figure,out=structuredClone(base),style=validateNexoStyle(value);
 for(const key of ['xaxis','yaxis'] as const){const a=style[key];if(!a)continue;const axis=key==='xaxis'?'x':'y';
 const target=out.layout[key]={...(out.layout[key]??{})},log=(a.type??target.type)==='log';
 const values:number[]=[];let categorical=false;
 for(const t of out.data){if((t[`${axis}axis`]??axis)!==axis)continue;
 const raw=t[axis];const coords=Array.isArray(raw)?raw.flat(Infinity):[];
 for(let i=0;i<coords.length;i++){const v=coords[i];if(typeof v==='number'&&Number.isFinite(v)){
 values.push(v);const error=t[`error_${axis}`];if(error&&error.visible!==false){const amount=error.symmetric===false?(error.arrayminus?.[i]??error.valueminus):(error.array?.[i]??error.value);if(typeof amount==='number'&&Number.isFinite(amount))values.push(error.type==='percent'?v-Math.abs(v)*amount/100:v-amount);}
 }else if(typeof v==='string'&&v.length)categorical=true;}
 // Precomputed box/violin traces can omit individual coordinates.
 for(const k of ['q1','median','q3','lowerfence','upperfence'])if((t.orientation==='h'?'x':'y')===axis&&Array.isArray(t[k]))for(const v of t[k])if(typeof v==='number'&&Number.isFinite(v))values.push(v);
 if(t.type==='bar'&&(t.orientation==='h'?'x':'y')===axis){const bases=Array.isArray(t.base)?t.base:[t.base??0];for(const v of bases)if(typeof v==='number'&&Number.isFinite(v))values.push(v);}
 }
 if(log&&(categorical||values.some(v=>v<=0)||a.min!==undefined&&a.min<=0||a.max!==undefined&&a.max<=0))throw Error(`Log ${axis} requires positive numeric data and range limits.`);
 if(a.type){target.type=a.type;if(a.min===undefined&&a.max===undefined){delete target.range;target.autorange=true;}}
 if(a.min!==undefined||a.max!==undefined){
 const convert=(v:number)=>log?Math.log10(v):v;let low=Infinity,high=-Infinity;for(const v of values){const coordinate=convert(v);low=Math.min(low,coordinate);high=Math.max(high,coordinate);}if(!values.length){low=0;high=1;}const padding=(high-low||1)*.05;
 // Plotly 2.25 has no one-sided autorange. Recompute the blank endpoint from the current data.
 let min=a.min===undefined?low-padding:convert(a.min),max=a.max===undefined?high+padding:convert(a.max);
 if(a.min===undefined&&min>=max)min=max-(Math.abs(max)||1)*.05;
 if(a.max===undefined&&max<=min)max=min+(Math.abs(min)||1)*.05;
 target.range=[min,max];target.autorange=false;
 }
 for(const k of ['tickformat','dtick','nticks'] as const)if(a[k]!==undefined)target[k]=a[k];if(a.dtick!==undefined)target.tickmode='linear';else if(a.nticks!==undefined)target.tickmode='auto';
 }
 // Existing group-comparison labels use data coordinates before the scale changes.
 for(const axis of ['x','y'] as const){const key=`${axis}axis`,wasLog=base.layout[key]?.type==='log',isLog=out.layout[key]?.type==='log';if(wasLog===isLog)continue;
 for(const a of out.layout.annotations??[]){if((a[`${axis}ref`]??axis)!==axis||typeof a[axis]!=='number')continue;
 if(isLog&&a[axis]<=0)throw Error(`Log ${axis} annotations require positive coordinates.`);
 a[axis]=isLog?Math.log10(a[axis]):10**a[axis];
 if(a[`${axis==='x'?'ax':'ay'}ref`]===axis&&typeof a[axis==='x'?'ax':'ay']==='number'){const tail=axis==='x'?'ax':'ay';if(isLog&&a[tail]<=0)throw Error(`Log ${axis} annotations require positive coordinates.`);a[tail]=isLog?Math.log10(a[tail]):10**a[tail];}
 }}
 for(const patch of style.series??[]){const trace=out.data[patch.index];if(!trace)continue;const source=baselineOf(base);if(patch.sourceKey&&sourceKey(source.data[patch.index],source.data)!==patch.sourceKey)continue;
 if(patch.lineDash&&['scatter','scattergl'].includes(trace.type??'scatter'))trace.line={...trace.line,dash:patch.lineDash};}
 if(style.legendOrder)out.layout.legend={...out.layout.legend,traceorder:style.legendOrder};
 if(style.shapes)out.layout.shapes=[...(out.layout.shapes??[]).filter((shape:PlotObject)=>!String(shape.name??'').startsWith('nexo-style-v1:')),...style.shapes.map((shape,index)=>({name:`nexo-style-v1:${index}`,type:shape.type,xref:'x',yref:'y',x0:shape.x0,x1:shape.x1,y0:shape.y0,y1:shape.y1,line:{color:shape.color??'#555555',width:shape.width??1},...(shape.type==='rect'?{fillcolor:shape.color??'#555555'}:{}),opacity:shape.opacity??(shape.type==='rect'?.2:1)}))];
 if(style.annotations)out.layout.annotations=[...(out.layout.annotations??[]).filter((a:PlotObject)=>!String(a.name??'').startsWith('nexo-style-v1:')),...style.annotations.map((a,index)=>{
 const coordinate=(axis:'x'|'y',value:number)=>{if(out.layout[`${axis}axis`]?.type!=='log')return value;if(value<=0)throw Error(`Log ${axis} annotations require positive coordinates.`);return Math.log10(value);};
 return {name:`nexo-style-v1:${index}`,text:a.text,x:coordinate('x',a.x),y:coordinate('y',a.y),xref:'x',yref:'y',showarrow:true,arrowhead:2,axref:'pixel',ayref:'pixel',ax:a.ax??20,ay:a.ay??-30,font:{color:a.color??'#333333',size:a.size??12}};})];
 const weight=(parent:PlotObject,key:string,w:'normal'|'bold'|undefined)=>{if(!w)return;const raw=parent[key];const obj=typeof raw==='string'?{text:raw}:{...raw};if(typeof obj.text==='string'){const text=obj.text.replace(/^<b>([\s\S]*)<\/b>$/,'$1');obj.text=w==='bold'?`<b>${text}</b>`:text;}parent[key]=obj;};
 weight(out.layout,'title',style.titleWeight);for(const k of ['xaxis','yaxis'])if(style.axisWeight){out.layout[k]={...out.layout[k]};weight(out.layout[k],'title',style.axisWeight);}
 if(style.legendWeight)for(const t of out.data)if(typeof t.name==='string'){const name=t.name.replace(/^<b>([\s\S]*)<\/b>$/,'$1');t.name=style.legendWeight==='bold'?`<b>${name}</b>`:name;}
 // F10 symmetric: the colour scale is centred on 0; z values and limits set by the module stay as they are.
 if(style.heatSymmetric)for(const t of out.data)if(t.type==='heatmap'&&!t.coloraxis&&t.zmid==null&&t.zmin==null&&t.zmax==null)t.zmid=0;
 if(style.margin)out.layout.margin={...out.layout.margin,...style.margin};originals.set(out,base);return out;
}
