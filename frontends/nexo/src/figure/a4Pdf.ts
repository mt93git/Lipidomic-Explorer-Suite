import type {Document} from '../state/document';
import type {Node} from '../api';
import {model,selectedNodes,type Page} from './layout';
import {A4,HEADER_HEIGHT,drawHeader,type JsPdf,type Logo} from '../export/pdfHeader';
export {A4};
// The figure page PDF is always A4 portrait (210 × 297 mm), every page: a page of another size (Letter, landscape, a
// custom tall page) is scaled to fit inside A4 under the lab header, centred, never cropped. Presentation only: the pages keep their content.
export function fitA4(width:number,height:number){
 const room=A4[1]-HEADER_HEIGHT,scale=Math.min(A4[0]/width,room/height),w=width*scale,h=height*scale;
 return {x:(A4[0]-w)/2,y:HEADER_HEIGHT+(room-h)/2,width:w,height:h};
}
/** One PDF of A4 pages, each with the lab header and the page's raster image fitted under it. */
export async function a4Pdf(pages:{width:number;height:number;png:string|Uint8Array}[],JsPDF:JsPdf,options:{type?:string;logo?:Logo|null;compress?:boolean}={}):Promise<unknown>{
 const pdf=new JsPDF({orientation:'portrait',unit:'pt',format:'a4',compress:options.compress??true});
 pages.forEach((p,i)=>{if(i)pdf.addPage('a4','portrait');drawHeader(pdf,A4[0],options.logo);const f=fitA4(p.width,p.height);pdf.addImage(p.png,'PNG',f.x,f.y,f.width,f.height,undefined,'FAST');});
 return pdf.output(options.type??'blob');
}
/** The PDF's pages: Figure 1 first (when there is one), then the figure page's own pages, unchanged. */
export function pdfPages(doc:Document,nodes:Node[],figure1:Page|null):Page[]{
 const pages=model(doc,selectedNodes(doc,nodes));return figure1?[figure1,...pages]:pages;
}
const KEY='nexo.export.figure1';
/** "Include Figure 1" in the figure page PDF: on unless the author turned it off in this browser. */
export const figure1Preference={
 get:()=>{try{return localStorage.getItem(KEY)!=='0';}catch{return true;}},
 set:(on:boolean)=>{try{localStorage.setItem(KEY,on?'1':'0');}catch{/* private mode */}},
};
