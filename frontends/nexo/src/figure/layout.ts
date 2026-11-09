import type {Document,DocumentItem} from '../state/document';
import type {Node} from '../api';
export function size(d:Document):[number,number]{if(d.paper==='custom')return [d.paperWidth,d.paperHeight];const s:[number,number]=d.paper==='a4'?[595.28,841.89]:[612,792];return d.orientation==='landscape'?[s[1],s[0]]:s;}
export type Positioned=Partial<DocumentItem>&{x:number;y:number;width:number;height:number;node?:Node;index?:number;note?:string;caption?:string};
export interface Page {width:number;height:number;items:Positioned[];draft?:boolean;legend?:string}
export function model(document:Document,nodes:Node[]):Page[]{
 const [width,height]=size(document),margin=46,top=66,bottom=52;const page=(items:Positioned[]):Page=>({width,height,items});
 if(document.layout==='free')return [page(document.items.slice().sort((a,b)=>a.z-b.z).map(item=>({...item,node:item.type==='figure'?nodes.find(n=>n.id===item.nodeId):undefined})))];
 if(document.layout==='pages')return nodes.length?nodes.map((node,index)=>page([{node,index,x:margin,y:top,width:width-2*margin,height:height-top-bottom}])):[page([])];
 if(document.layout==='figure1'){
 const w=width-2*margin,h=height-top-100,slots:Positioned[]=[];const slot=(caption:string,note:string,x:number,y:number,sw:number,sh:number,index:number)=>slots.push({caption,note,node:nodes[index],index,x:margin+x*w,y:top+y*h,width:sw*w,height:sh*h});
 const art=nodes.map((n,i)=>({n,i})).filter(a=>a.n.kind==='illustration');if(!art.length)slot('A / Study workflow · illustration','Add and finish illustrations in Draft',0,0,1,.18,-1);else {const columns=Math.min(4,art.length),rows=Math.ceil(art.length/columns);art.forEach((a,j)=>slot((j===0?'A / ':'')+a.n.label+' · schematic','',(j%columns)/columns,Math.floor(j/columns)*.18/rows,.96/columns,.17/rows,a.i));}
 // Team's template knows the two fixed PCA cards; when neither is on the canvas, a library copy of the 2D PCA fills B
 // (Team leaves B pending for copies, which the pilot simulation found to be a trap).
 const fixedPca=nodes.findIndex(n=>['results_dashboard-plot_pca','qc_pca_tab-pca2dPlot'].includes(n.id)),pcaIndex=fixedPca>=0?fixedPca:nodes.findIndex(n=>n.instance?.source==='qc_pca_tab-pca2dPlot');
 slot('B / PCA'+(pcaIndex>=0?' · '+nodes[pcaIndex].label:''),'Finish a 2D PCA in Draft',0,.22,.4,.43,pcaIndex);
 ['LPA','LPC','LPI','CL'].forEach((n,i)=>slot('C / '+n,'Log2FC method pending',.44+(i%2)*.29,.22+Math.floor(i/2)*.225,.27,.205,-1));
 ['AA (Sn2) target','PE 18:0_20:4','PC 16:0_20:4','PC 18:0_20:4'].forEach((n,i)=>slot('D / '+n,i?'Selection and scale pending':'AA definition and sn position pending',i*.255,.7,.235,.3,-1));return [{...page(slots),draft:true,legend:'DRAFT · A: '+(art.length?'schematic, not to scale; review workflow.':'illustration pending.')+' C: class Log2FC and model pending. D: targets, scale and sn-position evidence pending.'}];}
 if(!nodes.length)return [page([])];const minX=Math.min(...nodes.map(n=>n.x)),minY=Math.min(...nodes.map(n=>n.y)),maxX=Math.max(...nodes.map(n=>n.x+n.width)),maxY=Math.max(...nodes.map(n=>n.y+n.height)),scale=Math.min((width-2*margin)/(maxX-minX),(height-top-bottom)/(maxY-minY));return [page(nodes.map((node,index)=>({node,index,x:margin+(node.x-minX)*scale,y:top+(node.y-minY)*scale,width:node.width*scale,height:node.height*scale})))];
}

export function selectedNodes(doc:Document,nodes:Node[]):Node[]{return doc.layout==='free'?nodes:doc.items.filter(i=>i.type==='figure').map(i=>nodes.find(n=>n.id===(i as {nodeId:string}).nodeId)).filter((n):n is Node=>!!n);}
// Template layouts (one per page, arrangement, Figure 1) draw their own panels; free text and shapes are kept in the
// document and show on the Free layout. How many a layout hides, so the page can say so.
export function hiddenByLayout(doc:Document):number{return doc.layout==='free'?0:doc.items.filter(i=>i.type==='text'||i.type==='shape').length;}
// Steph review step 9: a template draws only the plots it has slots for (Figure 1: illustrations and the PCA). The
// finished plots ticked for the page that no slot shows are named, so they do not vanish without a word. A plot
// unticked in the Plots column is the author's choice and is not counted.
export function leftOutByLayout(doc:Document,nodes:Node[]):Node[]{
 if(doc.layout==='free')return [];
 const chosen=selectedNodes(doc,nodes),shown=new Set(model(doc,chosen).flatMap(p=>p.items.map(i=>i.node?.id).filter((id):id is string=>!!id)));
 return chosen.filter(n=>n.kind==='plot'&&n.finished&&!shown.has(n.id));
}
