import type {Document,DocumentItem} from '../state/document';
import {validateDocument} from '../state/validate';
import {size} from './layout';
export const initialDocument=():Document=>({version:'1',layout:'free',paper:'letter',orientation:'portrait',showPageFurniture:true,items:[]});
export function constrain<T extends {x:number;y:number;width:number;height:number}>(item:T,doc:Document):T {const [w,h]=size(doc),width=Math.max(20,Math.min(w,item.width)),height=Math.max(20,Math.min(h,item.height));return {...item,width,height,x:Math.max(0,Math.min(w-width,item.x)),y:Math.max(0,Math.min(h-height,item.y))};}
export const nextZ=(items:readonly {z:number}[])=>Math.min(10000,Math.max(0,...items.map(i=>i.z))+1);
export function freeTextSlot(items:readonly {x:number;y:number;width:number;height:number}[],pageW:number,pageH:number,w=220,h=50):[number,number]|null {
 const xs=[46,24],ys=[46,24];items.forEach(i=>{xs.push(i.x,i.x+i.width+12);ys.push(i.y,i.y+i.height+12);});const unique=(a:number[])=>[...new Set(a)].sort((a,b)=>a-b);
 for(let pass=0;pass<2;pass++)for(const y of unique(ys))for(const x of unique(xs)){if(!pass&&(x<46||y<46))continue;if(x>=24&&y>=24&&x+w<=pageW-24&&y+h<=pageH-24&&!items.some(i=>x<i.x+i.width+12&&x+w+12>i.x&&y<i.y+i.height+12&&y+h+12>i.y))return [Math.round(x),Math.round(y)];}return null;
}
export function roundTrip(doc:Document,ids:string[]):Document {const copy=JSON.parse(JSON.stringify(doc));const result=validateDocument(copy,ids.map(id=>({id,label:id,x:0,y:0,width:300,height:300})));if(!result.ok)throw Error(result.message);return copy;}
export function syncDocument(doc:Document,nodes:readonly {id:string;label:string}[]):Document {
 let next=structuredClone(doc);next.items=next.items.filter(i=>i.type!=='figure'||nodes.some(n=>n.id===i.nodeId));
 for(const [index,n] of nodes.entries()){if(next.items.some(i=>i.type==='figure'&&i.nodeId===n.id))continue;if(next.items.length>=80)break;
 let [w,h]=size(next);const width=Math.min(w-40,/heatmap/i.test(n.id)?460:220),height=Math.min(h-40,/heatmap/i.test(n.id)?420:160),xs=[20],ys=[40];next.items.forEach(i=>{xs.push(i.x+i.width+16);ys.push(i.y+i.height+16);});let pos:[number,number]|undefined;
 for(const y of ys.sort((a,b)=>a-b)){for(const x of xs.sort((a,b)=>a-b)){if(x+width<=w-20&&y+height<=h-28&&!next.items.some(i=>x<i.x+i.width+16&&x+width+16>i.x&&y<i.y+i.height+16&&y+height+16>i.y)){pos=[x,y];break;}}if(pos)break;}
 if(!pos){const y=Math.max(40,...next.items.map(i=>i.y+i.height+16));if(y+height+28>3000)break;h=y+height+28;next={...next,paper:'custom',paperWidth:w,paperHeight:h};pos=[20,y];}
 next.items.push({id:`figure-${index}-${n.id.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,130)}`,type:'figure',nodeId:n.id,caption:n.label,x:pos[0],y:pos[1],width,height,z:nextZ(next.items)});
 }next.items=next.items.map(i=>constrain(i,next));return next;
}
// Fields canvas_state.R accepts per item type. Page rendering decorates items
// (node, index, note); those must never reach the saved document.
const ITEM_FIELDS:Record<string,readonly string[]>={
 figure:['id','type','x','y','width','height','z','nodeId','caption'],
 text:['id','type','x','y','width','height','z','text','fontSize','color'],
 shape:['id','type','x','y','width','height','z','shape','fill','stroke','strokeWidth','radius']};
export function documentItem(item:DocumentItem):DocumentItem{
 const keep=ITEM_FIELDS[item.type]??ITEM_FIELDS.text,source=item as unknown as Record<string,unknown>,out:Record<string,unknown>={};
 for(const key of keep)if(source[key]!==undefined)out[key]=source[key];
 return out as unknown as DocumentItem;
}
export function replaceItem(doc:Document,item:DocumentItem):Document{return {...doc,items:doc.items.map(i=>i.id===item.id?constrain(documentItem(item),doc):i)};}
/** Resize from the grip; with the aspect lock the larger relative change drives both sides. */
export function resizeBox<T extends {width:number;height:number}>(start:T,dx:number,dy:number,lock:boolean):T{
 if(!lock||!start.width||!start.height)return {...start,width:start.width+dx,height:start.height+dy};
 const ratio=start.width/start.height,byWidth=Math.abs(dx/start.width)>=Math.abs(dy/start.height),width=byWidth?start.width+dx:(start.height+dy)*ratio;
 return {...start,width,height:width/ratio};
}
/** One step up or down the stacking order; z values are renumbered 0…n-1 so ties never hide a step. */
export function restack(doc:Document,id:string,step:1|-1):Document{
 const order=doc.items.map((item,index)=>({item,index})).sort((a,b)=>a.item.z-b.item.z||a.index-b.index).map(e=>e.item),at=order.findIndex(i=>i.id===id),to=at+step;
 if(at<0||to<0||to>=order.length)return doc;
 [order[at],order[to]]=[order[to],order[at]];const z=new Map(order.map((item,index)=>[item.id,Math.min(10000,index)]));
 return {...doc,items:doc.items.map(i=>({...i,z:z.get(i.id)!}))};
}
export const canRestack=(doc:Document,id:string,step:1|-1)=>restack(doc,id,step)!==doc;
/** A copy of one object, offset and on top; null when the page already holds 80 objects. */
export function duplicateItem(doc:Document,id:string,newId:string=crypto.randomUUID()):{doc:Document;id:string}|null{
 const item=doc.items.find(i=>i.id===id);if(!item||doc.items.length>=80)return null;
 const copy=constrain({...structuredClone(item),id:`${item.type}-${newId}`,x:item.x+16,y:item.y+16,z:nextZ(doc.items)} as DocumentItem,doc);
 return {doc:{...doc,items:[...doc.items,copy]},id:copy.id};
}
