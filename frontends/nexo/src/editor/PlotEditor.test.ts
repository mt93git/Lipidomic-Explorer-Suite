import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import PlotEditor, { type PlotEditorProps } from '../ui/PlotEditor/PlotEditor';
const noop=()=>{};
it('renders Appearance controls in Team order with nine legend positions',()=>{
  const figure={data:[{type:'scatter',name:'A',legendgroup:'A',x:[1],y:[2],mode:'lines+markers'}],layout:{xaxis:{},yaxis:{}}};
  const props:PlotEditorProps={figure,traces:figure.data,editor:{},legendGroups:['A'],onChange:noop,onUndo:noop,onRedo:noop,onReset:noop,onPreset:noop};
  const html=renderToStaticMarkup(createElement(PlotEditor,props));
  const sections=['Color palette','Typography','Chart background','Horizontal axis','Vertical axis','Grid &amp; zero lines','Legend','Conditions','Series','Text annotations'];
  let last=-1;for(const title of sections){const next=Math.max(html.indexOf(`<summary>${title}</summary>`),html.indexOf(`<summary>${title} <span class="pro-summary">`));expect(next).toBeGreaterThan(last);last=next;}
  for(const v of ['Top','Middle','Bottom'])for(const h of ['Left','Center','Right'])expect(html).toContain(`${v} ${h}</button>`);
  for(const text of ['Team original','Nexo','Publication','Reset presentation','Change orientation','Healthy in grey','Courier New','system-ui','Base size','Tick labels','Axis titles','Reset scale'])expect(html).toContain(text);
  // Pilot simulation step 5: a chosen palette applies at once (the swatch looked selected while the plot was unchanged).
  expect(html).not.toContain('Apply palette');
  expect(html).toContain('min="6" max="72"');
}, 30_000);
it('names condition colour swatches from study metadata, not renamed series',()=>{
 const figure={data:[{type:'scatter',name:'Custom series',legendgroup:'old',meta:{teamCondition:'Control'},x:[1],y:[2],marker:{color:'#123456'}}],layout:{meta:{teamConditions:['Control']}}};
 const props:PlotEditorProps={figure,traces:figure.data,editor:{},legendGroups:['old'],onChange:noop,onUndo:noop,onRedo:noop,onReset:noop,onPreset:noop};
 const html=renderToStaticMarkup(createElement(PlotEditor,props));
 expect(html).toContain('Choose color for Control');
 expect(html).not.toContain('Choose color for Custom series');
});
it('offers no Legend section when no trace can appear in a legend (b11 chart audit, pathway map)',()=>{
 // Team's pathway map sets showlegend = FALSE on every trace (R/modules/13_pathway_module.R l.1369-1522): its key is a
 // colour bar. The nine legend positions and "Show legend" silently did nothing there.
 const figure={data:[{type:'scatter',x:[1],y:[2],mode:'lines',showlegend:false},{type:'scatter',x:[1],y:[2],mode:'markers',showlegend:false,marker:{colorbar:{title:'Z'}}}],layout:{showlegend:false,xaxis:{},yaxis:{}}};
 const props:PlotEditorProps={figure,traces:figure.data,editor:{},legendGroups:[],onChange:noop,onUndo:noop,onRedo:noop,onReset:noop,onPreset:noop};
 const html=renderToStaticMarkup(createElement(PlotEditor,props));
 expect(html).not.toContain('aria-label="Legend position"');
 expect(html).toContain('<summary>Typography</summary>');
 // A plot whose legend Team only hides at layout level keeps the section ("Show legend" brings it back).
 const hidden={data:[{type:'scatter',name:'A',x:[1],y:[2]}],layout:{showlegend:false,xaxis:{},yaxis:{}}};
 expect(renderToStaticMarkup(createElement(PlotEditor,{...props,figure:hidden,traces:hidden.data}))).toContain('aria-label="Legend position"');
});
it('disables the legend positions with a reason when the plot draws no legend (b03 chart audit, guided QC)',()=>{
 // Team's guided QC plot is one unnamed marker trace (R/modules/2_qc_boxplot_module.R:1231-1236): Plotly draws no legend,
 // and a position would only show a meaningless "trace 0". The positions and presets are disabled and say why.
 const figure={data:[{type:'scatter',x:[1],y:[2],mode:'markers'}],layout:{showlegend:false,xaxis:{},yaxis:{}}};
 const props:PlotEditorProps={figure,traces:figure.data,editor:{},legendGroups:[],onChange:noop,onUndo:noop,onRedo:noop,onReset:noop,onPreset:noop};
 const html=renderToStaticMarkup(createElement(PlotEditor,props));
 const grid=html.match(/<div class="plot-editor-positions"[^>]*>(.*?)<\/div>/)!;
 expect(grid[0]).toMatch(/aria-describedby="([^"]+)"/);
 const reason=grid[0].match(/aria-describedby="([^"]+)"/)![1];
 expect(html).toMatch(new RegExp(`<p id="${reason}"[^>]*>This plot has no legend[^<]+</p>`));
 expect(grid[1].match(/<button[^>]*>/g)).toHaveLength(9);
 for(const b of grid[1].match(/<button[^>]*>/g)!)expect(b).toContain('disabled');
 // A single named trace (Team hides its legend at layout level) keeps live positions.
 const named={data:[{type:'scatter',name:'A',x:[1],y:[2]}],layout:{showlegend:false,xaxis:{},yaxis:{}}};
 const live=renderToStaticMarkup(createElement(PlotEditor,{...props,figure:named,traces:named.data})).match(/<div class="plot-editor-positions"[^>]*>(.*?)<\/div>/)!;
 expect(live[0]).not.toContain('aria-describedby');
 for(const b of live[1].match(/<button[^>]*>/g)!)expect(b).not.toContain('disabled');
});
