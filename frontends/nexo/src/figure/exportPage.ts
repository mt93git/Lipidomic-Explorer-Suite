import {notify} from '../ui/model';
import {phrases} from '../ui/strings';
import type {Document} from '../state/document';
import {model,selectedNodes,type Page} from './layout';
import type {Node} from '../api';
const ns='http://www.w3.org/2000/svg';
export function pageSVG(page:Page,doc:Document):SVGSVGElement {
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('xmlns',ns);svg.setAttribute('width',page.width+'pt');svg.setAttribute('height',page.height+'pt');svg.setAttribute('viewBox',`0 0 ${page.width} ${page.height}`);
 const el=(name:string,attrs:Record<string,string|number>,parent:Element=svg)=>{const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;};
 el('rect',{width:page.width,height:page.height,fill:'white'});
 const text=(value:string,x:number,y:number,fontSize=10,color='#23343a',parent:Element=svg)=>{const t=el('text',{x,y,'font-family':'Arial, sans-serif','font-size':fontSize,fill:color},parent);t.textContent=value;};
 if(page.draft||doc.showPageFurniture)text(page.draft?'FIGURE 1 / DRAFT — PENDING PANELS':'FIGURE CANVAS',46,35,8);
 page.items.forEach((item,index)=>{
 const group=el('svg',{'data-figure-item':item.id??String(index),x:item.x,y:item.y,width:item.width,height:item.height,viewBox:`0 0 ${item.width} ${item.height}`,overflow:'hidden'});
 if(item.type==='text') {const font=item.fontSize??16;const lines:string[]=[];for(const line of (item.text??'').split('\n')){let current='';for(const word of line.split(' ')){if((current+word).length*font*.55>item.width&&current){lines.push(current);current='';}current+=(current?' ':'')+word;}lines.push(current);}lines.forEach((line,i)=>text(line,0,font*(i+1),font,item.color,group));return;}
 if(item.type==='shape') {const attrs={fill:item.fill??'none',stroke:item.stroke??'#315c89','stroke-width':item.strokeWidth??2};const w=item.width,h=item.height;if(item.shape==='rectangle')el('rect',{x:1,y:1,width:w-2,height:h-2,rx:item.radius??0,...attrs},group);else if(item.shape==='ellipse')el('ellipse',{cx:w/2,cy:h/2,rx:w/2-2,ry:h/2-2,...attrs},group);else {el('path',{d:`M 3 ${h-3} L ${w-3} 3` ,...attrs,fill:'none'},group);if(item.shape==='arrow')el('path',{d:`M ${w-14} 3 L ${w-3} 3 L ${w-3} 14`,...attrs,fill:'none'},group);}return;}
 const url=item.node?.finished?.stale?undefined:item.node?.finished?.url;
 text(item.caption??item.node?.label??'',0,10,8,undefined,group);
 if(!url){text('PENDING',8,item.height/2,12,undefined,group);text(item.note??'Finish this plot in the draft canvas to place it here; export waits until then.',8,item.height/2+16,7,undefined,group);return;}
 if(/^data:image\/svg\+xml/i.test(url)){const comma=url.indexOf(','),markup=/;base64/i.test(url.slice(0,comma))?atob(url.slice(comma+1)):decodeURIComponent(url.slice(comma+1));const source=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement;const ids=new Map<string,string>();[source,...source.querySelectorAll('[id]')].forEach(e=>ids.set(e.id,`embedded${index}-${e.id}`));for(const e of [source,...source.querySelectorAll('*')]){for(const a of [...e.attributes]){let v=a.value;if(a.name==='id')v=ids.get(v)??v;else for(const [id,replacement] of ids){v=v.replaceAll(`url(#${id})`,`url(#${replacement})`);if(v===`#${id}`)v=`#${replacement}`;}e.setAttribute(a.name,v);}if(e.localName==='style')for(const [id,replacement] of ids)e.textContent=e.textContent?.replaceAll(`#${id}`,`#${replacement}`)??'';}source.setAttribute('x','0');source.setAttribute('y','18');source.setAttribute('width',String(item.width));source.setAttribute('height',String(item.height-18));group.append(document.importNode(source,true));}
 else el('image',{x:0,y:18,width:item.width,height:item.height-18,href:url},group);
 });if(page.legend)text(page.legend,46,page.height-68,7);if(page.draft||doc.showPageFurniture)text(page.draft?'Descriptive draft · review scientific settings before publication':'Finished figure snapshots',46,page.height-28,8);return svg;
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(phrases.downloaded(name));}
export async function exportPage(kind:'svg'|'pdf'|'print',doc:Document,nodes:Node[]){
 const pages=model(doc,selectedNodes(doc,nodes)),svgs=pages.map(p=>new XMLSerializer().serializeToString(pageSVG(p,doc)));
 if(kind==='svg'){svgs.forEach((s,i)=>download(new Blob([s],{type:'image/svg+xml'}),`figure-canvas-${i+1}.svg`));return;}
 if(kind==='print'){const frame=document.createElement('iframe');frame.title='Figure print document';frame.style.cssText='position:fixed;width:0;height:0;border:0';document.body.append(frame);const d=frame.contentDocument!;d.open();d.write('<!doctype html><title>Figure canvas</title>');d.close();const style=d.createElement('style');style.textContent=`@page{size:${pages[0].width}pt ${pages[0].height}pt;margin:0}body{margin:0}svg{display:block;break-after:page}`;d.head.append(style);svgs.forEach(s=>d.body.append(d.importNode(new DOMParser().parseFromString(s,'image/svg+xml').documentElement,true)));frame.contentWindow!.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow!.print();setTimeout(()=>frame.remove(),60000);return;}
 const win=window as unknown as {jspdf?:{jsPDF:new(options:object)=>{addPage:(size:number[],orientation:string)=>void;addImage:(...args:unknown[])=>void;output:(type:string)=>Blob}}};
 if(!win.jspdf)await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=import.meta.env.BASE_URL+'vendor/jspdf.umd.min.js';script.onload=()=>resolve();script.onerror=()=>reject(Error('PDF library could not load'));document.head.append(script);});
 const orientation=pages[0].width>pages[0].height?'landscape':'portrait',pdf=new win.jspdf!.jsPDF({orientation,unit:'pt',format:[pages[0].width,pages[0].height],compress:true});
 for(const [i,p] of pages.entries()){if(i)pdf.addPage([p.width,p.height],orientation);const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgs[i]);await img.decode();const canvas=document.createElement('canvas');canvas.width=Math.round(p.width*3);canvas.height=Math.round(p.height*3);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,p.width,p.height,undefined,'FAST');}download(pdf.output('blob'),'figure-canvas.pdf');
}
