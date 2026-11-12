import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import NexoExtras from '../ui/PlotEditor/NexoExtras';
import {validateNexo,validateNexoStyle,setNexoStyle} from '../state/nexo';
import {sourceKey} from './applyEditor';
import {applyNexoStyle} from './applyNexoStyle';
import {createHistory} from '../state/history';
import {createStore} from '../state/store';
it('sanitizes unknown and invalid values without blocking open',()=>{
 expect(validateNexoStyle({unknown:1,xaxis:{min:Infinity,nticks:10001,type:'oops'},margin:{l:-1},titleWeight:'bold'})).toEqual({titleWeight:'bold'});
 expect(validateNexo(null)).toEqual({version:1,nodes:{}});
});
it('applies ranges, ticks, weights and margins immutably and idempotently',()=>{
 const f={data:[{x:[1,10],y:[2,20]}],layout:{title:{text:'Title'},legend:{}}};
 const style={yaxis:{type:'log' as const,min:1,max:100,tickformat:'.2f',dtick:1,nticks:5},titleWeight:'bold' as const,axisWeight:'bold' as const,legendWeight:'bold' as const,margin:{l:40,r:20,t:30,b:50,pad:4}};
 const out=applyNexoStyle(f,style);expect(out.layout.yaxis).toMatchObject({type:'log',range:[0,2],tickformat:'.2f',dtick:1,nticks:5});expect(out.layout.title.text).toBe('<b>Title</b>');expect(out.layout.margin).toEqual(style.margin);expect(applyNexoStyle(out,style)).toEqual(out);expect(f.layout.title.text).toBe('Title');
});
it('refuses unsafe log data and ranges',()=>{
 expect(()=>applyNexoStyle({data:[{y:[0,2]}],layout:{}},{yaxis:{type:'log'}})).toThrow(/positive/);
 expect(()=>applyNexoStyle({data:[{y:[2]}],layout:{}},{yaxis:{type:'log',min:-1}})).toThrow(/positive/);
});
it('shares undo and redo history',()=>{
 const store=createStore({nodes:[{id:'a',x:0,y:0,width:300,height:300,label:'a'}],nexo:validateNexo(null)});const h=createHistory(store);
 h.dispatch(setNexoStyle('a',{margin:{l:20}}));expect(store.get().nexo.nodes.a.style!.margin?.l).toBe(20);h.undo();expect(store.get().nexo.nodes).toEqual({});h.redo();expect(store.get().nexo.nodes.a).toBeTruthy();
});

it('uses the existing log scale for ranges and ignores unrelated subplot data',()=>{
 const f={data:[{x:[1],y:[10]},{yaxis:'y2',y:[-1]}],layout:{yaxis:{type:'log'}}};
 const out=applyNexoStyle(f,{yaxis:{min:1,max:100,type:'log'}});expect(out.layout.yaxis.range).toEqual([0,2]);
 expect(applyNexoStyle({data:[{y:[10]}],layout:{yaxis:{type:'log'}}},{yaxis:{min:1,max:100}}).layout.yaxis.range).toEqual([0,2]);
});
it('rejects log bars extending to zero and negative error bounds',()=>{
 expect(()=>applyNexoStyle({data:[{type:'bar',y:[2],base:[0]}],layout:{}},{yaxis:{type:'log'}})).toThrow(/positive/);
 expect(()=>applyNexoStyle({data:[{y:[2],error_y:{visible:true,array:[3]}}],layout:{}},{yaxis:{type:'log'}})).toThrow(/positive/);
});

it('applies series dashes by stable identity and legend order without changing science',()=>{
 const figure={data:[{type:'scatter',name:'A',x:[1,2],y:[2,4],mode:'lines+markers',marker:{color:['red','blue']},line:{width:2}}],layout:{}};
 const out=applyNexoStyle(figure,{series:[{index:0,sourceKey:sourceKey(figure.data[0],figure.data),lineDash:'dash'}],legendOrder:'reversed'});
 expect(out.data[0].marker).toEqual({color:['red','blue']});expect(out.data[0].line).toEqual({width:2,dash:'dash'});expect(out.layout.legend.traceorder).toBe('reversed');expect(out.data[0].y).toEqual([2,4]);expect(applyNexoStyle(out,{series:[{index:0,lineDash:'dash'}],legendOrder:'reversed'})).toEqual(out);
 expect(applyNexoStyle({...figure,data:[{type:'scatter',name:'Other',x:[1],y:[1]}]},{series:[{index:0,sourceKey:sourceKey(figure.data[0],figure.data),lineDash:'dash'}]}).data[0].line).toBeUndefined();
});
it('preserves existing shapes and annotations, adding data anchors idempotently',()=>{
 const figure={data:[{y:[1,2]}],layout:{shapes:[{type:'line',xref:'paper',x0:0,x1:1,y0:1,y1:1}],annotations:[{text:'original',xref:'paper',yref:'paper',x:0,y:0}]}};
 const style={shapes:[{type:'line' as const,x0:1,x1:10,y0:5,y1:5,color:'#112233',width:2},{type:'rect' as const,x0:2,x1:4,y0:1,y1:8,color:'#abcdef',opacity:.2}],annotations:[{text:'Point',x:2,y:3,ax:20,ay:-30,color:'#123456',size:14}]};
 const out=applyNexoStyle(figure,style);expect(out.layout.shapes).toHaveLength(3);expect(out.layout.shapes[1]).toMatchObject({xref:'x',yref:'y',type:'line',line:{color:'#112233',width:2}});expect(out.layout.shapes[2]).toMatchObject({type:'rect',fillcolor:'#abcdef',opacity:.2});expect(out.layout.annotations[1]).toMatchObject({xref:'x',yref:'y',showarrow:true,text:'Point',x:2,y:3,ax:20,ay:-30,font:{color:'#123456',size:14}});expect(applyNexoStyle(out,style)).toEqual(out);
});

it('keeps Nexo overlays idempotent across JSON boundaries and transforms log arrow anchors',()=>{
 const style={yaxis:{type:'log' as const},shapes:[{type:'line' as const,x0:1,x1:2,y0:10,y1:10}],annotations:[{text:'Ten',x:1,y:10}]};const out=applyNexoStyle({data:[{x:[1,2],y:[1,100]}],layout:{}},style);
 expect(out.layout.annotations[0].y).toBe(1);expect(out.layout.shapes[0].y0).toBe(10);expect(applyNexoStyle(JSON.parse(JSON.stringify(out)),style)).toEqual(out);
 expect(()=>applyNexoStyle({data:[{y:[1,2]}],layout:{}},{yaxis:{type:'log'},annotations:[{text:'No',x:1,y:0}]})).toThrow(/positive/);
});
it('handles one-sided auto ranges on both axes, linear scale, tick counts and normal weights',()=>{
 const f={data:[{name:'<b>A</b>',x:[1,2],y:[10,20]}],layout:{title:{text:'<b>T</b>'},xaxis:{title:'<b>X</b>'},yaxis:{title:{text:'<b>Y</b>'}}}};
 const out=applyNexoStyle(f,{xaxis:{type:'linear',min:0,nticks:4},yaxis:{max:30,tickformat:'.1f',dtick:5},titleWeight:'normal',axisWeight:'normal',legendWeight:'normal'});
 expect(out.layout.xaxis).toMatchObject({range:[0,2.05],autorange:false,type:'linear',nticks:4,tickmode:'auto',title:{text:'X'}});expect(out.layout.yaxis).toMatchObject({range:[9.5,30],dtick:5,tickmode:'linear',title:{text:'Y'}});expect(out.layout.title.text).toBe('T');expect(out.data[0].name).toBe('A');
});

it('keeps existing data-anchored group labels in place when the scale changes',()=>{
 const f={data:[{y:[1,100]}],layout:{annotations:[{xref:'paper',yref:'paper',x:.5,y:.9,text:'Title'},{xref:'x',yref:'y',x:0,y:10,text:'Group label'}]}};
 const out=applyNexoStyle(f,{yaxis:{type:'log'}});expect(out.layout.annotations[0]).toEqual(f.layout.annotations[0]);expect(out.layout.annotations[1].y).toBe(1);
 expect(applyNexoStyle({data:[{y:[1,100]}],layout:{yaxis:{type:'log'},annotations:[{xref:'x',yref:'y',x:0,y:1,text:'Group label'}]}},{yaxis:{type:'linear'}}).layout.annotations[0].y).toBe(10);
});

it('Series style offers no second marker shape control beside Team\'s Marker shape (NEXO-P3)',()=>{
 const figure={data:[{type:'scatter',name:'A',x:[1,2],y:[2,4],mode:'lines+markers'},{type:'box',name:'B',y:[1,2]}],layout:{}};
 const html=renderToStaticMarkup(createElement(NexoExtras,{figure,style:{},onChange:()=>{}}));
 expect(html).toContain('Line dash 1');expect(html).not.toContain('Marker symbol');
});
