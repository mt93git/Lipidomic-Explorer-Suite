import type {Document,DocumentItem,Tabs} from '../state/document';
type Plot={id:string;label:string};
/** The row belongs to its canvas tab; its position follows the figure order. */
export function plotGroups<T extends Plot>(nodes:readonly T[],tabs:Tabs|undefined,doc:Document):{id:string;name:string;nodes:T[]}[]{
 const rank=new Map(doc.items.flatMap((i,z)=>i.type==='figure'?[[i.nodeId,z] as const]:[]));
 const groups=(tabs?.tabs??[]).map(t=>({...t,nodes:nodes.filter(n=>t.nodes.includes(n.id)).sort((a,b)=>(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity))}));
 const unowned=nodes.filter(n=>!groups.some(g=>g.nodes.some(a=>a.id===n.id)));
 if(unowned.length)groups.push({id:'unassigned',name:'',nodes:unowned});
 return groups.filter(g=>g.nodes.length);
}
/** Reset order only; exclusions, geometry and non-figure objects survive. */
export function resetPlotOrder(doc:Document,nodes:readonly Plot[],tabs?:Tabs):Document{
 const order=[...(tabs?.tabs.flatMap(t=>t.nodes)??[]),...nodes.map(n=>n.id)];
 const figures=doc.items.filter(i=>i.type==='figure').sort((a,b)=>order.indexOf((a as DocumentItem&{nodeId:string}).nodeId)-order.indexOf((b as DocumentItem&{nodeId:string}).nodeId));
 let at=0;return {...doc,items:doc.items.map(i=>i.type==='figure'?figures[at++]:i)};
}
