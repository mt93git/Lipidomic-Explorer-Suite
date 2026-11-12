import {expect,it} from 'vitest';
import {unpackFigure} from './plotPayload';
// Team's Signal distribution transport (R/results_dashboard.R, plotly_build.team_compact_distribution):
// a box trace's repeated sample name sent once and its values as little-endian doubles in base64.
const b64=(a:number[])=>btoa(String.fromCharCode(...new Uint8Array(new Float64Array(a).buffer)));
const packed=()=>({teamPacked:1,layout:{title:'d'},data:[
 {type:'box',name:'S1',x:{teamRepeat:'S1',n:3},y:{teamFloat64:b64([1.5,-2,0.1+0.2])},hovertemplate:'%{y}'},
 {type:'box',name:'S2',x:['S2','S2'],y:[4,5]}]});
it('restores the plain x/y arrays of a packed distribution figure, exact doubles and order',()=>{
 const f=packed() as Record<string,unknown>,out=unpackFigure(f) as {data:{x:unknown;y:unknown}[]}&Record<string,unknown>;
 expect(out.data[0].x).toEqual(['S1','S1','S1']);
 expect(out.data[0].y).toEqual([1.5,-2,0.1+0.2]);
 expect(out.data[1]).toEqual({type:'box',name:'S2',x:['S2','S2'],y:[4,5]});
 expect('teamPacked' in out).toBe(false);
});
it('leaves figures that are not packed untouched',()=>{
 const f={data:[{type:'scatter',x:[1],y:[2]}],layout:{}};
 expect(unpackFigure(f)).toEqual({data:[{type:'scatter',x:[1],y:[2]}],layout:{}});
});
it('leaves a damaged packed figure exactly as received (nothing half-decoded)',()=>{
 for(const damage of [
  (f:any)=>{f.data[0].y.teamFloat64=f.data[0].y.teamFloat64.slice(0,-8);},
  (f:any)=>{f.data[0].x.n=0;},
  (f:any)=>{f.data[0].x={teamRepeat:'S1',n:2};},
  (f:any)=>{f.data[0].y.extra=1;},
 ]){const f:any=packed();damage(f);const before=JSON.stringify(f);expect(JSON.stringify(unpackFigure(f))).toBe(before);}
});
// NEXO-P9 2: plotly R expands the dashboard violin's one hover template per sample. Hovering a violin's body, Plotly
// hands the whole array to its template formatter: "t.replace is not a function". Team's rule (R/results_dashboard.R
// plotly_build.team_compact_distribution): identical templates become the one scalar, the same text for every point.
it('a violin\'s repeated per-point hover template becomes one string', () => {
  const template = '%{text}<br>log10 prepared abundance: %{y:.3f}<extra></extra>';
  const figure = { data: [{ type: 'violin', y: [1, 2, 3], text: ['a', 'b', 'c'], hovertemplate: [template, template, template] }], layout: {} };
  expect(unpackFigure(figure).data[0].hovertemplate).toBe(template);
  expect(figure.data[0].hovertemplate).toEqual([template, template, template]);
});
