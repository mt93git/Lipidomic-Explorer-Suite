import { describe, expect, it } from 'vitest';
import { applyEditor, baselineOf, type Figure } from './applyEditor';
import { PALETTES } from './palettes';
const figure: Figure = {data: [
  {type:'scatter',name:'Z',legendgroup:'Z',x:[1,2],y:[3,4],marker:{color:'#123456'}},
  {type:'scatter',name:'Healthy',legendgroup:'Healthy',x:[2],y:[5]},
  {type:'scatter',name:'Z companion',legendgroup:'Z',x:[1],y:[3]},
  {type:'scatter',name:'A',legendgroup:'A',x:[1],y:[3]},
], layout:{title:{text:'Original'},xaxis:{title:{text:'X'}},yaxis:{title:{text:'Y'}},annotations:[{text:'Source'}]}};
describe('applyEditor',()=>{
  it('maps palette groups in encounter order and greys Healthy',()=>{
    const out=applyEditor(figure,{palette:'Lab',greyHealthy:true});
    expect(out.data.map(t=>t.marker.color)).toEqual([PALETTES.Lab[0],'#7A7A7A',PALETTES.Lab[0],PALETTES.Lab[2]]);
  });
  it('is idempotent, never mutates inputs, and resets to the baseline',()=>{
    const before=structuredClone(figure), editor={swapAxes:true,layout:{'title.text':'New'},traces:[{index:0,name:'Renamed'}]} as const;
    const e={...editor,traces:[...editor.traces]}; const once=applyEditor(figure,e);
    expect(applyEditor(once,e)).toEqual(once); expect(figure).toEqual(before);
    expect(baselineOf(once)).toEqual(before); expect(applyEditor(once,undefined)).toEqual(before);
  });
  it('overrides by index and preserves per-point colors',()=>{
    const out=applyEditor(figure,{traces:[{index:2,name:'Other',lineWidth:3,markerSize:9,opacity:0.5}]});
    expect(out.data[2]).toMatchObject({name:'Other',line:{width:3},marker:{size:9},opacity:0.5});
    expect(out.data[0]).toEqual(figure.data[0]);
    expect(applyEditor({data:[{marker:{color:[1,2]}}],layout:{}},{traces:[{index:0,color:'#ffffff'}]}).data[0].marker.color).toEqual([1,2]);
  });
  it('clamps added annotations to 30 and preserves source annotations',()=>{
    const annotations=Array.from({length:40},()=>({text:'<note>',x:0.5,y:0.5,xref:'paper' as const,yref:'paper' as const,showarrow:false as const,font:{size:12,color:'#000000'}}));
    const out=applyEditor(figure,{annotations}); expect(out.layout.annotations).toHaveLength(31);
    expect(applyEditor(out,{annotations})).toEqual(out);
  });
  it('swaps scatter x/y and restores orientation on reset',()=>{
    const out=applyEditor(figure,{swapAxes:true});expect(out.data[0].x).toEqual([3,4]);expect(out.data[0].y).toEqual([1,2]);
    expect(applyEditor(out,{})).toEqual(figure);
  });
  it('applies white, black Arial publication style and fine axes',()=>{
    expect(applyEditor(figure,{}, {publication:true}).layout).toMatchObject({paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',font:{family:'Arial',color:'#000000'},xaxis:{linewidth:0.75}});
  });
});

it('transposes heatmap matrices, errors, templates and axis-bound decorations',()=>{
  const f={data:[{type:'heatmap',x:['A','B'],y:['C'],z:[[1,2]],text:[['one','two']],hovertemplate:'%{x}: %{y}',error_x:{array:[1]}}],layout:{xaxis:{title:{text:'X'}},yaxis:{title:{text:'Y'}},shapes:[{type:'line',x0:1,x1:2,y0:3,y1:4}],annotations:[{text:'paper',x:.2,y:.8,xref:'paper',yref:'paper'}]}};
  const out=applyEditor(f,{swapAxes:true});
  expect(out.data[0]).toMatchObject({z:[[1],[2]],text:[['one'],['two']],hovertemplate:'%{y}: %{x}',error_y:{array:[1]}});
  expect(out.layout.xaxis.title.text).toBe('Y');expect(out.layout.shapes[0]).toMatchObject({x0:3,y0:1});
  expect(out.layout.annotations).toEqual(f.layout.annotations);
  expect(applyEditor(out,{swapAxes:true})).toEqual(out);
});
it('preserves unsupported orientation and continuous heat encodings',()=>{
  const f={data:[{type:'heatmap',z:[[1]],coloraxis:'coloraxis',colorscale:[[0,'#000000'],[1,'#ffffff']]}],layout:{shapes:[{type:'path',path:'M 0 0'}]}};
  expect(applyEditor(f,{swapAxes:true,palette:'Lab',traces:[{index:0,scaleLow:'#ff0000',scaleMid:'#00ff00',scaleHigh:'#0000ff'}]})).toEqual(f);
});
it('matches source identities after reordering and skips stale identities',()=>{
  const f={data:[{meta:{teamSourceKey:'b'},name:'B'},{meta:{teamSourceKey:'a'},name:'A'}],layout:{}};
  const out=applyEditor(f,{traces:[{index:0,sourceKey:'source:a',name:'Renamed'},{index:1,sourceKey:'source:absent',opacity:.2}]});
  expect(out.data.map(t=>t.name)).toEqual(['B','Renamed']);expect(out.data[1].opacity).toBeUndefined();
});
it('relabels categories only with matching source identities and values',()=>{
  const f={data:[{meta:{teamSourceKey:'a'},type:'bar',x:['A','B'],y:[1,2]}],layout:{xaxis:{type:'category'}}};
  const c={axis:'xaxis' as const,sourceKeys:['source:a'],values:['A','B'],labels:['Alpha','<Beta>']};
  expect(applyEditor(f,{categoryLabels:[c]}).layout.xaxis.ticktext).toEqual(['Alpha','&lt;Beta&gt;']);
  expect(applyEditor(f,{categoryLabels:[{...c,sourceKeys:['source:stale']}]})).toEqual(f);
});
it('hides companion layers but never the last scientific group',()=>{
  const f={data:[{name:'A',legendgroup:'A',x:[1],y:[2],meta:{teamSourceKey:'a'}},{name:'layer',legendgroup:'A',x:[1],y:[2],meta:{teamSourceKey:'layer'}},{name:'B',legendgroup:'B',x:[1],y:[3],meta:{teamSourceKey:'b'}}],layout:{}};
  const traces=[{index:0,sourceKey:'source:a',hidden:true}];
  expect(applyEditor(f,{traces}).data.map(t=>t.visible)).toEqual([false,false,undefined]);
  expect(applyEditor(f,{traces:[...traces,{index:2,sourceKey:'source:b',hidden:true}]})).toEqual(f);
});
import { nexoEditor, presetOf, publicationEditor } from './applyEditor';
import { serializeEditor } from './editorState';
describe('Nexo preset',()=>{
  const dashboard: Figure = {data:[
    {type:'scatter',mode:'markers',name:'Control',x:[1],y:[2],marker:{color:'#BCD8EC'}},
    {type:'scatter',mode:'markers',name:'Healthy',x:[2],y:[3],marker:{color:'#FFCBE1'}},
  ],layout:{showlegend:true,legend:{orientation:'h',y:-0.25,x:0},xaxis:{title:{text:'PC1'},gridcolor:'#ebeae6'},yaxis:{title:{text:'PC2'}},meta:{teamConditions:['Control','Healthy']}}};
  it('uses only cosmetic allow-list keys, colour-blind-safe palette and a centred legend',()=>{
    const e=nexoEditor(dashboard);
    expect(serializeEditor(e)).toEqual(e);
    expect(e).toMatchObject({palette:'Okabe–Ito',greyHealthy:true,layout:{'font.family':'system-ui','legend.x':0.5,'legend.xanchor':'center','xaxis.showline':true,'yaxis.zeroline':false,'xaxis.gridcolor':'#e3e7ec'}});
    const out=applyEditor(dashboard,e);
    expect(out.data.map(t=>t.marker.color)).toEqual([PALETTES['Okabe–Ito'][0],'#7A7A7A']);
    expect(out.layout).toMatchObject({font:{family:'system-ui',color:'#141b24'},legend:{orientation:'h',x:0.5,xanchor:'center'},xaxis:{showline:true,linewidth:1,title:{text:'PC1'}}});
    expect(out.data[0].x).toEqual([1]);
  });
  it('leaves the legend alone when Team hides it and keeps per-class colours outside the study conditions',()=>{
    const comp: Figure = {data:[{type:'bar',name:'PC',legendgroup:'PC',x:['Control'],y:[1],marker:{color:'#B07AA1'}}],layout:{showlegend:false,xaxis:{type:'category'},yaxis:{},meta:{teamConditions:['Control','Treatment']}}};
    const e=nexoEditor(comp);
    expect(e.layout).not.toHaveProperty('legend.x');
    expect(e.layout).toMatchObject({'xaxis.showgrid':false,'yaxis.showgrid':true});
    expect(nexoEditor({data:[{type:'heatmap',z:[[1]]}],layout:{xaxis:{},yaxis:{}}}).layout).toMatchObject({'xaxis.showgrid':false,'yaxis.showgrid':false});
    expect(applyEditor(comp,e).data[0].marker.color).toBe('#B07AA1');
  });
  it('keeps the user\'s text edits, drops stale colour patches and reports the active preset',()=>{
    const custom={layout:{'title.text':'Mine'},traces:[{index:0,name:'Renamed',color:'#123456'}]};
    const e=nexoEditor(dashboard,custom);
    expect(e.layout?.['title.text']).toBe('Mine');expect(e.traces?.[0]).toEqual({index:0,name:'Renamed'});
    expect(presetOf(dashboard,undefined)).toBe('team');expect(presetOf(dashboard,{})).toBe('team');
    expect(presetOf(dashboard,nexoEditor(dashboard))).toBe('nexo');
    expect(presetOf(dashboard,publicationEditor(dashboard))).toBe('publication');
    expect(presetOf(dashboard,{...nexoEditor(dashboard),layout:{...nexoEditor(dashboard).layout,'font.size':20}})).toBeUndefined();
    expect(applyEditor(applyEditor(dashboard,nexoEditor(dashboard)),{})).toEqual(dashboard);
  });
});

it('tints a violin inner box from the palette colour instead of keeping Team\'s previous tint',()=>{
  const f:Figure={data:[{type:'violin',name:'Control',x:['Control'],y:[1,2],fillcolor:'#BCD8EC',line:{color:'#677782'},marker:{color:'#000000'},box:{visible:true,fillcolor:'#A0B8C9',line:{color:'#4B565E'}}}],layout:{meta:{teamConditions:['Control']}}};
  const out=applyEditor(f,{palette:'Okabe–Ito'});
  expect(out.data[0].fillcolor).toBe('rgba(230,159,0,1)');
  expect(out.data[0].box).toMatchObject({visible:true,fillcolor:'#c48700',line:{color:'#5c4000'}});
  expect(applyEditor(f,{}).data[0].box).toEqual(f.data[0].box);
  const bare={data:[{type:'violin',name:'Control',x:['Control'],y:[1],fillcolor:'#BCD8EC',box:{visible:true}}],layout:{meta:{teamConditions:['Control']}}};
  expect(applyEditor(bare,{palette:'Okabe–Ito'}).data[0].box).toEqual({visible:true});
});
it('paints the 3D scene when Plot background is set on a 3D figure (plot_bgcolor alone is ignored by a scene)',()=>{
  const f={data:[{type:'scatter3d',x:[1],y:[2],z:[3]},{type:'scatter3d',x:[2],y:[1],z:[0],scene:'scene2'}],layout:{scene:{xaxis:{title:{text:'PC1'}}},scene2:{}}};
  const out=applyEditor(f,{layout:{plot_bgcolor:'#f0f0ff',paper_bgcolor:'#ffffee'}});
  expect(out.layout.scene).toMatchObject({bgcolor:'#f0f0ff',xaxis:{title:{text:'PC1'}}});
  expect(out.layout.scene2.bgcolor).toBe('#f0f0ff');
  expect(out.layout.paper_bgcolor).toBe('#ffffee');
  expect(applyEditor(figure,{layout:{plot_bgcolor:'#f0f0ff'}}).layout.scene).toBeUndefined();
});
// The API serialises with jsonlite auto_unbox, so a one-level study arrives as meta.teamConditions:"Control".
describe('applyEditor with a one-condition study',()=>{
  const one:Figure={data:[
    {type:'scatter',name:'Control',legendgroup:'Control',x:[1,2],y:[3,4],marker:{color:'#123456'}},
    {type:'scatter',name:'Cont',legendgroup:'Cont',x:[1],y:[2],marker:{color:'#654321'}},
  ],layout:{meta:{teamConditions:'Control'}}};
  it('treats a scalar teamConditions as a one-item list',()=>{
    const out=applyEditor(one,{palette:'Viridis'});
    expect(out.data[0].marker.color).toBe(PALETTES.Viridis[0]);
    expect(out.data[1].marker.color).toBe('#654321');
  });
});
