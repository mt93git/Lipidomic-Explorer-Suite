import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {ExportTab} from '../ui/Inspector/ExportTab';
import {Inspector} from '../ui/Inspector/Inspector';
import {ui} from '../ui/model';
import type {CanvasHandle} from '../canvas/handle';
const node={kind:'illustration',id:'art',assetId:'serum-vial',label:'Sample',width:300,height:220,visual:{},x:0,y:0};
it('offers illustration exports in the inspector',()=>{
 vi.stubGlobal('document',{querySelectorAll:()=>[]});
 ui({inspectorOpen:true});
 const handle={selection:()=>['art'],figureOf:()=>undefined,getSession:()=>({canvas:{nodes:[node]}})} as unknown as CanvasHandle;
 const html=renderToStaticMarkup(createElement(Inspector,{handle}));
 const exports=renderToStaticMarkup(createElement(ExportTab,{node:{...node,kind:'illustration' as const},onStatus:()=>{}}));
 vi.unstubAllGlobals();
 expect(exports).toContain('Download PNG');expect(exports).toContain('Download SVG');expect(exports).not.toContain('Plot data (CSV)');
 expect(html).toContain('>Export</button>');
});
it('exports current illustration artwork as SVG even without a mounted card',async()=>{
 const {plotImage,svgAvailable}=await import('../ui/Dialogs/ExportDialog');
 const art={...node,kind:'illustration' as const,color:'#abcdef',label:'Safe & synthetic'};
 expect(svgAvailable(art)).toBe(true);
 const file=await plotImage(art,'svg',80,60,300);
 expect(file.filename).toBe('Safe & synthetic.svg');expect(file.blob.type).toContain('svg');
 expect(await file.blob.text()).toContain('#abcdef');
});
