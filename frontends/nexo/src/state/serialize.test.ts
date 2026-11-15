import { expect,test } from 'vitest';
import { toCanvasV1,fromCanvasV1 } from './serialize';
import * as tabs from './tabs';
const nodes=[1,2,3].map(i=>({kind:'plot' as const,id:`tcinstance_${i}-plot_pca`,label:'PCA',x:i*500,y:0,width:440,height:330,visual:{plotTitle:'Title'},finished:null,instance:{instanceId:`tcinstance_${i}`,source:'results_dashboard-plot_pca',inputs:{color_by:'Group1'}}}));
test('three nodes with inputs and tabs round trip',()=>{
 const t=tabs.initial(nodes.map(n=>n.id));tabs.addTab(t,'Other');tabs.moveNode(t,nodes[2].id,t.active);
 const state=toCanvasV1({nodes},t);expect(state.nodes[0].instance?.id).toBe('tcinstance_1');expect(toCanvasV1(fromCanvasV1(state),tabs.validate(state.tabs,nodes.map(n=>n.id)))).toEqual(state);
});
test('default tabs null; finished snapshot verbatim',()=>{
 const finished={url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=',createdAt:'2026-01-01T00:00:00Z',stale:false};const state=toCanvasV1({nodes:[{...nodes[0],finished}]},tabs.initial([nodes[0].id]));expect(state.tabs).toBeNull();expect(state.document).toBeNull();expect(state.nodes[0].finished).toEqual(finished);
});
test('figure page document survives the v1 round trip (Team keeps it in team-canvas-v1.json)',()=>{
 const document={version:'1' as const,layout:'free' as const,paper:'letter' as const,orientation:'portrait' as const,items:[{id:'text-1',type:'text' as const,x:46,y:46,width:220,height:50,z:1,text:'Synthetic figure title',fontSize:16,color:'#172d4b'}]};
 const t=tabs.initial(nodes.map(n=>n.id));
 const state=toCanvasV1({nodes,document},t);expect(state.document).toEqual(document);
 const back=fromCanvasV1(state);expect(back.document).toEqual(document);
 expect(toCanvasV1(back,tabs.validate(state.tabs,nodes.map(n=>n.id)))).toEqual(state);
});
test('a Team canvas with a PCA score card opens in Nexo and saves back with the card and its settings',()=>{
 // Team 8e2f5c07: "Plot on canvas" saves a results_dashboard-plot_pcascore instance with the PCA card's inputs.
 const team={version:'1',libraryHidden:false,tabs:null,document:null,nodes:[{kind:'plot',id:'tcinstance_aa11bb22cc33-plot_pcascore',label:'PCA score analysis · PC2',x:0,y:0,width:620,height:700,visual:{},finished:null,
  instance:{id:'tcinstance_aa11bb22cc33',source:'results_dashboard-plot_pcascore',inputs:{pcs_pc:'PC2',pcs_groups:['Control','Case'],pcs_test:'param',pcs_corr:'holm'}}}]};
 const back=fromCanvasV1(team);expect(back.nodes[0].instance?.source).toBe('results_dashboard-plot_pcascore');
 const saved=toCanvasV1(back,back.tabs);expect(saved.nodes[0]).toMatchObject({id:team.nodes[0].id,label:team.nodes[0].label,width:620,height:700,instance:team.nodes[0].instance});
});
