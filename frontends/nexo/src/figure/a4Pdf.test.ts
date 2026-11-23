import {describe,expect,it} from 'vitest';
import {A4,a4Pdf,fitA4,pdfPages} from './a4Pdf';
import {HEADER_HEIGHT,type JsPdf} from '../export/pdfHeader';
import {model,selectedNodes,type Page} from './layout';
import {initialDocument,syncDocument} from './model';
import source from '../../public/vendor/jspdf.umd.min.js?raw';
// The vendored jsPDF the export loads in the browser, loaded here as its UMD build.
const holder={exports:{} as {jsPDF:JsPdf}};new Function('module','exports',source)(holder,holder.exports);
const JsPDF=holder.exports.jsPDF;
// A 1×1 white PNG (synthetic).
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
const boxes=(pdf:string)=>[...pdf.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map(m=>m[1].trim().split(/\s+/).map(Number));
describe('figure page PDF',()=>{
 it('makes every page A4 portrait, whatever the size of the figure page',async()=>{
  const bytes=await a4Pdf([{width:A4[0],height:A4[1],png},{width:612,height:792,png},{width:841.89,height:595.28,png},{width:612,height:2400,png}],JsPDF,{type:'arraybuffer'}) as ArrayBuffer;
  const text=new TextDecoder('latin1').decode(bytes);
  const media=boxes(text);expect(media).toHaveLength(4);
  for(const [x0,y0,x1,y1] of media){expect(x0).toBe(0);expect(y0).toBe(0);expect(x1).toBeCloseTo(595.28,1);expect(y1).toBeCloseTo(841.89,1);}
 });
 it('scales each page to fit A4 under the header, centred and never cropped',()=>{
  for(const [w,h] of [[595.28,841.89],[612,792],[841.89,595.28],[612,2400]]){
   const f=fitA4(w,h);expect(f.x).toBeGreaterThanOrEqual(-1e-9);expect(f.y).toBeGreaterThanOrEqual(HEADER_HEIGHT-1e-9);
   expect(f.x+f.width).toBeLessThanOrEqual(A4[0]+1e-9);expect(f.y+f.height).toBeLessThanOrEqual(A4[1]+1e-9);expect(f.width/f.height).toBeCloseTo(w/h);
  }
  // An A4 page (Figure 1) keeps its full height below the header.
  expect(fitA4(...A4).y+fitA4(...A4).height).toBeCloseTo(A4[1]);
 });
 it('puts Figure 1 first and the figure page pages after it, unchanged',()=>{
  const nodes=[{id:'a',kind:'plot' as const,label:'A',x:0,y:0,width:300,height:300},{id:'b',kind:'plot' as const,label:'B',x:0,y:0,width:300,height:300}];
  const doc=syncDocument({...initialDocument(),layout:'pages' as const},nodes);
  const figure1:Page={width:A4[0],height:A4[1],items:[],figure1:true};
  const existing=model(doc,selectedNodes(doc,nodes));expect(existing).toHaveLength(2);
  expect(pdfPages(doc,nodes,figure1)).toEqual([figure1,...existing]);
  expect(pdfPages(doc,nodes,null)).toEqual(existing);
 });
 it('heads every page with the dark band, the lab logo, "Lipidomic Explorer" in white and Page N of M',async()=>{
  const logo={png,width:240,height:115};
  const bytes=await a4Pdf([{width:A4[0],height:A4[1],png},{width:612,height:792,png},{width:612,height:2400,png}],JsPDF,{type:'arraybuffer',logo,compress:false}) as ArrayBuffer;
  const text=new TextDecoder('latin1').decode(bytes);
  const streams=[...text.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map(m=>m[1]).filter(s=>/ Tj| Do/.test(s));
  expect(streams).toHaveLength(3);
  // Each page: the full-width #1b2330 band at the very top (22 pt), the logo and the page image (two images), the
  // platform name in white (1. g), its page number in light grey (#c7d1e0), and no rule.
  streams.forEach((s,i)=>{
   expect(s).toMatch(/0\.11 0\.14 0\.19 rg\s+0\. 841\.88\d* 595\.27\d* -22\. re\s+f/);
   expect(s.match(/ Do/g)).toHaveLength(2);
   expect(s).toMatch(/1\. g\s+[\d.]+ [\d.]+ Td\s+\(Lipidomic Explorer\) Tj/);
   expect(s).toMatch(new RegExp(String.raw`0\.78 0\.82 0\.878 rg\s+[\d.]+ [\d.]+ Td\s+\(Page ${i+1} of 3\) Tj`));
   expect(s).not.toMatch(/ l\s+S/);
  });
 });
});
