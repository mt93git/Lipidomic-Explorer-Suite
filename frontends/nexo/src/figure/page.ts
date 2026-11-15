import type {Document,DocumentItem} from '../state/document';
import type {Node} from '../api';
import type {CanvasHandle} from '../canvas/handle';
import {tabsBridges} from '../canvas/handle';
import {setDocument} from '../state/commands';
import {model,selectedNodes} from './layout';
import {constrain,replaceItem,resizeBox} from './model';
import {pageSVG} from './exportPage';
// Pages re-render on selection, so a double click is two pointerdowns on the same object id, not a dblclick event.
let lastDown={id:'',at:0};
export function renderPages(handle:CanvasHandle,doc:Document,nodes:Node[],selected:string|null,select:(id:string)=>void,options:{guides?:boolean;lockAspect?:boolean;open?:(id:string)=>void}={}){
 const layer=handle.figureLayer();layer.replaceChildren();let offset=0;
 model(doc,selectedNodes(doc,nodes)).forEach(page=>{const sheet=document.createElement('div');sheet.className='figure-sheet'+(options.guides&&doc.layout==='free'?' figure-guides':'');sheet.setAttribute('aria-label',`${doc.paper} ${doc.orientation} figure page`);Object.assign(sheet.style,{left:`${offset}px`,width:`${page.width}px`,height:`${page.height}px`});offset+=page.width+40;
 const svg=pageSVG(page,doc);sheet.append(svg);
 page.items.forEach(item=>{if(!item.id)return;const box=document.createElement('div');box.className='figure-object'+(selected===item.id?' selected':'');box.dataset.itemId=item.id;Object.assign(box.style,{left:`${item.x}px`,top:`${item.y}px`,width:`${item.width}px`,height:`${item.height}px`,zIndex:String((item.z??0)+1)});const grip=document.createElement('span');grip.className='figure-resize';box.append(grip);
 box.onpointerdown=e=>{e.stopPropagation();e.preventDefault();const now=performance.now(),again=lastDown.id===item.id&&now-lastDown.at<400&&e.target!==grip;lastDown={id:again?'':item.id!,at:now};select(item.id!);if(again){options.open?.(item.id!);return;}const start={...item} as DocumentItem,resize=e.target===grip,scale=tabsBridges.get(handle)!.camera.scale,x=e.clientX,y=e.clientY;let changed=start;const move=(event:PointerEvent)=>{const dx=(event.clientX-x)/scale,dy=(event.clientY-y)/scale;changed=constrain(resize?resizeBox(start,dx,dy,!!options.lockAspect&&start.type==='figure'):{...start,x:start.x+dx,y:start.y+dy},doc);const live=layer.querySelector<HTMLElement>(`[data-item-id="${item.id}"]`)??box;Object.assign(live.style,{left:`${changed.x}px`,top:`${changed.y}px`,width:`${changed.width}px`,height:`${changed.height}px`});const group=live.parentElement?.querySelector(`[data-figure-item="${item.id}"]`);if(group?.localName==='svg'){group.setAttribute('x',String(changed.x));group.setAttribute('y',String(changed.y));group.setAttribute('width',String(changed.width));group.setAttribute('height',String(changed.height));}};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);if(JSON.stringify(changed)!==JSON.stringify(start))tabsBridges.get(handle)!.dispatch(setDocument(replaceItem(doc,changed)));};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});};sheet.append(box);});layer.append(sheet);});
}
