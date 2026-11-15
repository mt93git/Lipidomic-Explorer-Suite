import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {FigurePage} from '../ui/FigurePage/FigurePage';
import {tabsBridges,type CanvasHandle} from '../canvas/handle';
import {initialDocument} from './model';
const handle={getSession:()=>({canvas:{nodes:[]}})} as unknown as CanvasHandle;
tabsBridges.set(handle,{document:()=>({version:'1',nodes:[],libraryHidden:false,document:initialDocument()}),dispatch:()=>{},refresh:()=>{},fitWhenShown:()=>{},camera:{x:0,y:0,scale:1}});
it('offers Team rounded rectangle from the Figure page',()=>{
 expect(renderToStaticMarkup(createElement(FigurePage,{handle}))).toContain('Add rounded rectangle');
});
it('offers transient page guides separately from page furniture',()=>{
 const html=renderToStaticMarkup(createElement(FigurePage,{handle}));
 expect(html).toContain('Page guides');expect(html).toContain('Page furniture');
});
