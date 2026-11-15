import {expect,it} from 'vitest';
import {plotGroups,resetPlotOrder} from './plotList';
import {initialDocument} from './model';
const nodes=[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}];
const tabs={version:'1' as const,active:'tab-1',tabs:[{id:'tab-1',name:'First',nodes:['b','a']},{id:'tab-2',name:'Second',nodes:['c']}]};
const doc={...initialDocument(),items:nodes.map((n,z)=>({id:n.id,type:'figure' as const,nodeId:n.id,caption:n.label,x:20,y:40,width:200,height:100,z}))};
it('groups by owning tab while keeping the current figure order inside each tab',()=>{
 expect(plotGroups(nodes,tabs,doc).map(g=>[g.name,g.nodes.map(n=>n.id)])).toEqual([['First',['a','b']],['Second',['c']]]);
});
it('reset uses tab order without restoring unchecked plots or moving objects',()=>{
 expect(resetPlotOrder(doc,nodes,tabs).items.map(i=>i.type==='figure'&&i.nodeId)).toEqual(['b','a','c']);
 const selected={...doc,items:doc.items.filter(i=>i.nodeId!=='a')};
 const reset=resetPlotOrder(selected,nodes,tabs);
 expect(reset.items.map(i=>i.type==='figure'&&i.nodeId)).toEqual(['b','c']);
 expect(reset.items.map(i=>[i.x,i.y])).toEqual([[20,40],[20,40]]);
 const text={id:'title',type:'text' as const,text:'Synthetic title',fontSize:16,color:'#000000',x:5,y:5,width:100,height:30,z:15};
 const mixed={...doc,items:[doc.items[0],text,doc.items[1],doc.items[2]]};
 expect(resetPlotOrder(mixed,nodes,tabs).items[1]).toEqual(text);
});
