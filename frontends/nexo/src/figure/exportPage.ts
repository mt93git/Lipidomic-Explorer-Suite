import {notify} from '../ui/model';
import {phrases} from '../ui/strings';
import type {Document} from '../state/document';
import {model,selectedNodes,type Page} from './layout';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {imageSource} from '../ui/Dialogs/ExportDialog';
import {loadJsPdf} from '../export/pngPdf';
import {a4Pdf,figure1Preference,pdfPages} from './a4Pdf';
import {loadLogo,type JsPdf} from '../export/pdfHeader';
import {figure1Page,type PanelSource} from './figure1';
import {type TopHeatmap,buildReport,firstSource,reportDate,reportFileName,reportSummary,titleBlock} from './report';
import {plotlyReady} from '../cards';
const ns='http://www.w3.org/2000/svg';
export function pageSVG(page:Page,doc:Document):SVGSVGElement {
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('xmlns',ns);svg.setAttribute('width',page.width+'pt');svg.setAttribute('height',page.height+'pt');svg.setAttribute('viewBox',`0 0 ${page.width} ${page.height}`);
 const el=(name:string,attrs:Record<string,string|number>,parent:Element=svg)=>{const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;};
 el('rect',{width:page.width,height:page.height,fill:'white'});
 const text=(value:string,x:number,y:number,fontSize=10,color='#23343a',parent:Element=svg)=>{const t=el('text',{x,y,'font-family':'Arial, sans-serif','font-size':fontSize,fill:color},parent);t.textContent=value;};
 if(!page.figure1&&!page.report&&(page.draft||doc.showPageFurniture))text(page.draft?'FIGURE 1 / DRAFT — PENDING PANELS':'FIGURE CANVAS',46,35,8);
 page.items.forEach((item,index)=>{
 const group=el('svg',{'data-figure-item':item.id??String(index),x:item.x,y:item.y,width:item.width,height:item.height,viewBox:`0 0 ${item.width} ${item.height}`,overflow:'hidden'});
 // Figure 1 panels: the panel image fitted in its box (never cropped), its letter on top at the top-left corner.
 if(item.image){const pad=page.figure1?12:0,head=page.report&&item.caption?16:0;if(head){const t=el('text',{x:0,y:11,'font-family':'Arial, sans-serif','font-size':10,'font-weight':'bold',fill:'#1b2330'},group);t.textContent=item.caption!;}el('image',{x:pad,y:head,width:item.width-pad,height:item.height-head,href:item.image,preserveAspectRatio:'xMidYMid meet'},group);if(item.letter){const t=el('text',{x:0,y:12,'font-family':'Arial, sans-serif','font-size':14,'font-weight':'bold',fill:'#000000'},group);t.textContent=item.letter;}return;}
 if(item.type==='text') {const font=item.fontSize??16;const lines:string[]=[];for(const line of (item.text??'').split('\n')){let current='';for(const word of line.split(' ')){if((current+word).length*font*.55>item.width&&current){lines.push(current);current='';}current+=(current?' ':'')+word;}lines.push(current);}lines.forEach((line,i)=>text(line,0,font*(i+1),font,item.color,group));return;}
 if(item.type==='shape') {const attrs={fill:item.fill??'none',stroke:item.stroke??'#315c89','stroke-width':item.strokeWidth??2};const w=item.width,h=item.height;if(item.shape==='rectangle')el('rect',{x:1,y:1,width:w-2,height:h-2,rx:item.radius??0,...attrs},group);else if(item.shape==='ellipse')el('ellipse',{cx:w/2,cy:h/2,rx:w/2-2,ry:h/2-2,...attrs},group);else {el('path',{d:`M 3 ${h-3} L ${w-3} 3` ,...attrs,fill:'none'},group);if(item.shape==='arrow')el('path',{d:`M ${w-14} 3 L ${w-3} 3 L ${w-3} 14`,...attrs,fill:'none'},group);}return;}
 const url=item.node?.finished?.stale?undefined:item.node?.finished?.url;
 text(item.caption??item.node?.label??'',0,10,8,undefined,group);
 if(!url){text('PENDING',8,item.height/2,12,undefined,group);text(item.note??'Finish this plot in the draft canvas to place it here; export waits until then.',8,item.height/2+16,7,undefined,group);return;}
 if(/^data:image\/svg\+xml/i.test(url)){const comma=url.indexOf(','),markup=/;base64/i.test(url.slice(0,comma))?atob(url.slice(comma+1)):decodeURIComponent(url.slice(comma+1));const source=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement;const ids=new Map<string,string>();[source,...source.querySelectorAll('[id]')].forEach(e=>ids.set(e.id,`embedded${index}-${e.id}`));for(const e of [source,...source.querySelectorAll('*')]){for(const a of [...e.attributes]){let v=a.value;if(a.name==='id')v=ids.get(v)??v;else for(const [id,replacement] of ids){v=v.replaceAll(`url(#${id})`,`url(#${replacement})`);if(v===`#${id}`)v=`#${replacement}`;}e.setAttribute(a.name,v);}if(e.localName==='style')for(const [id,replacement] of ids)e.textContent=e.textContent?.replaceAll(`#${id}`,`#${replacement}`)??'';}source.setAttribute('x','0');source.setAttribute('y','18');source.setAttribute('width',String(item.width));source.setAttribute('height',String(item.height-18));group.append(document.importNode(source,true));}
 else el('image',{x:0,y:18,width:item.width,height:item.height-18,href:url},group);
 });if(page.legend)text(page.legend,46,page.height-68,7);
 if(page.caption){const c=page.caption;c.lines.forEach((line,i)=>{const t=el('text',{x:c.x,y:c.y+c.fontSize+i*c.lineHeight,'font-family':'Arial, sans-serif','font-size':c.fontSize,fill:'#000000'});if(line.lead&&line.text.startsWith(c.lead)){const b=document.createElementNS(ns,'tspan');b.setAttribute('font-weight','bold');b.textContent=c.lead;t.append(b,line.text.slice(c.lead.length));}else t.textContent=line.text;});}
 // Legends the page draws (Figure 1 panel A): a dot and the label per group.
 for(const l of page.legends??[])for(const e of l.entries){el('circle',{cx:e.x+l.dot/2,cy:e.y,r:l.dot/2,fill:e.color,stroke:'#3a3a3a','stroke-width':.4});const t=el('text',{x:e.x+l.dot+4,y:e.y+l.fontSize*.35,'font-family':'Arial, sans-serif','font-size':l.fontSize,fill:'#000000'});t.textContent=e.label;}
 // The report's title block: the title in bold, the export date, and the dataset summary in a muted grey.
 if(page.titleBlock){const b=page.titleBlock;let y=b.y;const line=(value:string,size:number,colour:string,bold=false)=>{y+=size*1.25;const t=el('text',{x:b.x,y,'font-family':'Arial, sans-serif','font-size':size,fill:colour,...(bold?{'font-weight':'bold'}:{})});t.textContent=value;};
  b.lines.forEach(l=>{line(l,b.titleSize,'#1b2330',true);y+=b.lineHeight-b.titleSize*1.25;});line(b.date,b.dateSize,'#333333');if(b.summary)line(b.summary,b.summarySize??8,'#6b7280');}
 if(!page.figure1&&!page.report&&(page.draft||doc.showPageFurniture))text(page.draft?'Descriptive draft · review scientific settings before publication':'Finished figure snapshots',46,page.height-28,8);return svg;
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(phrases.downloaded(name));}
export async function exportPage(kind:'svg'|'pdf'|'print',doc:Document,nodes:Node[]){
 const pages=model(doc,selectedNodes(doc,nodes)),svgs=pages.map(p=>new XMLSerializer().serializeToString(pageSVG(p,doc)));
 if(kind==='svg'){svgs.forEach((s,i)=>download(new Blob([s],{type:'image/svg+xml'}),`figure-canvas-${i+1}.svg`));return;}
 if(kind==='print'){const frame=document.createElement('iframe');frame.title='Figure print document';frame.style.cssText='position:fixed;width:0;height:0;border:0';document.body.append(frame);const d=frame.contentDocument!;d.open();d.write('<!doctype html><title>Figure canvas</title>');d.close();const style=d.createElement('style');style.textContent=`@page{size:${pages[0].width}pt ${pages[0].height}pt;margin:0}body{margin:0}svg{display:block;break-after:page}`;d.head.append(style);svgs.forEach(s=>d.body.append(d.importNode(new DOMParser().parseFromString(s,'image/svg+xml').documentElement,true)));frame.contentWindow!.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow!.print();setTimeout(()=>frame.remove(),60000);return;}
 // Always A4 portrait, every page; Figure 1 (from the canvas's own dashboard cards) is page 1 unless turned off.
 const figure1=figure1Preference.get()?await figure1Page(selectedNodes(doc,nodes),{source:liveSource,render:plotlyPng}):null;
 download(await pdfOf(pdfPages(doc,nodes,figure1),doc),'figure-canvas.pdf');
}
/** The report: page 1 is the title block (title, export date, dataset summary) above Figure 1 and its legend, then every
 *  other card of the figure page under its label; every page A4 with the header band. Each card is drawn from its
 *  current figure: the live drawing when the card is live, else the card's own fetch (cardSource), whatever its zoom
 *  tier or finished state, else the image it shows. A card with nothing to draw is left out and named, never PENDING. */
export async function exportReport(doc:Document,nodes:Node[],info:{title:string;samples?:unknown;lipids?:unknown;groups?:number;now?:Date;cardSource?:(id:string,size?:{width:number;height:number})=>Promise<PanelSource|undefined>;topHeatmap?:(n:Node)=>Promise<TopHeatmap|undefined>}){
 const now=info.now??new Date(),date=reportDate(now),skipped:string[]=[];
 const block=(groups:string[])=>titleBlock({title:info.title,date,summary:reportSummary({samples:info.samples,lipids:info.lipids,groups:info.groups??(groups.length||undefined)})});
 await plotlyReady();
 // With a size, the report wants a server-drawn card drawn again at its page size: only the card's own fetch can.
 const source=(node:Node,size?:{width:number;height:number})=>size?info.cardSource?.(node.id,size)??Promise.resolve(undefined):firstSource([()=>domFigure(node),async()=>{const s=await info.cardSource?.(node.id);return s&&{...s,inputs:node.instance?.inputs};},()=>shownImage(node)]);
 const pages=await buildReport(doc,nodes,{source,render:plotlyPng,title:block,skipped:label=>skipped.push(label),topHeatmap:info.topHeatmap});
 download(await pdfOf(pages,doc),reportFileName(info.title,now));
 if(skipped.length)notify(phrases.reportSkipped(skipped));
}
async function pdfOf(pages:Page[],doc:Document):Promise<Blob>{
 const images=[];for(const p of pages){const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(pageSVG(p,doc)));await img.decode();const canvas=document.createElement('canvas');canvas.width=Math.round(p.width*4);canvas.height=Math.round(p.height*4);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);images.push({width:p.width,height:p.height,png:canvas.toDataURL('image/png')});}
 return await a4Pdf(images,await loadJsPdf() as JsPdf,{logo:await loadLogo()}) as Blob;
}

// A card's live Plotly figure as the author sees it (their inputs, edits and palette); a finished card, or one drawn as
// an image, gives its image instead (inlined as a data URL so the page SVG can carry it).
async function liveSource(node:Node):Promise<PanelSource|undefined>{return domFigure(node)??shownImage(node);}
/** The live Plotly drawing of an unfinished card, when the card is drawn live now. */
function domFigure(node:Node):PanelSource|undefined{
 const card=Array.from(document.querySelectorAll<HTMLElement>('.card')).find(el=>el.dataset.id===node.id),gd=card?.querySelector('.js-plotly-plot') as (HTMLElement&{data?:Figure['data'];layout?:Figure['layout']})|null|undefined;
 return !node.finished&&gd?.data&&window.Plotly?{figure:{data:gd.data,layout:gd.layout??{}},inputs:node.instance?.inputs}:undefined;
}
/** The image the card shows (finished snapshot, illustration art, rendered PNG), as a data URL. */
async function shownImage(node:Node):Promise<PanelSource|undefined>{
 const url=imageSource(node);if(!url)return undefined;if(url.startsWith('data:'))return {url,inputs:node.instance?.inputs};
 const blob=await (await fetch(url)).blob();return {url:await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);}),inputs:node.instance?.inputs};
}
// A panel image at about 380 DPI: Plotly sizes in CSS pixels (96 per inch), the page in points (72 per inch).
const plotlyPng=(figure:Figure,width:number,height:number)=>window.Plotly!.toImage(figure,{format:'png',width:Math.round(width*96/72),height:Math.round(height*96/72),scale:4});
