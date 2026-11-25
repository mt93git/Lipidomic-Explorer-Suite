import {describe,expect,it} from 'vitest';
import {confirmedMessage} from './fixture';
import {colorFor,figure,setColor,setStyle,stateFrom} from './model';
// Lipid class comparison draws by default in the look of "Selected-feature distributions"
// (R/utils_vis.R plot_logratio_violin): the group colour with a thin black outline, a narrow white
// box inside, every sample a white dot with a black outline, a light grey dotted y grid, group names at 45 degrees,
// black axis lines left and bottom only and bold panel titles. Values, points and statistics stay the same.
// The fill stays the plain hex group colour (not rgba at 0.8): Team's colour lock compares violin fills with the legend.
const all = {features:['PC','PE'],hiddenConditions:[],panelOff:{},panelStyles:{}};
type T = Record<string,any>;
// No DOM here: Team's script is read from disk, as cardBodyMessage.test.ts reads cards.ts.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
describe('group comparison default violin look', () => {
  const s = stateFrom(confirmedMessage,all), f = figure(s), violins = f.data.filter(t => t.type === 'violin') as T[];
  it('fills each violin with its group colour, a thin black outline, a white box and white points', () => {
    expect(violins).toHaveLength(6);
    for (const t of violins) {
      const g = t.meta.teamCondition;
      expect(t.fillcolor).toBe(colorFor(s,g));
      expect(t.line).toEqual({color:'#000000',width:.5});
      expect(t.box).toEqual({visible:true,width:.2,fillcolor:'#ffffff',line:{color:'#000000',width:1}});
      expect(t.marker).toEqual({color:'#ffffff',size:6,opacity:1,line:{color:'#000000',width:1}});
      expect(t.points).toBe('all'); expect(t.pointpos).toBe(0); expect(t.meanline).toEqual({visible:false});
    }
  });
  it('draws black axis lines left and bottom only, group names at 45 degrees, a light grey dotted y grid and bold panel titles', () => {
    // While the shared legend is the colour key the group names stay off the x axis (Team's existing rule); when two
    // shown groups share a colour they come back, at 45 degrees.
    for (const k of ['xaxis','xaxis2']) expect(f.layout[k]).toMatchObject({showline:true,mirror:false,linecolor:'#000000',showgrid:false,showticklabels:false});
    const shared = figure(stateFrom(confirmedMessage,setColor(all,'Case A',colorFor(s,'Control'))));
    for (const k of ['xaxis','xaxis2']) { const x = shared.layout[k] as T;
      expect(x).toMatchObject({showline:true,mirror:false,linecolor:'#000000',ticks:'outside',tickangle:-45,showgrid:false}); expect(x.showticklabels).not.toBe(false); }
    for (const k of ['yaxis','yaxis2']) expect(f.layout[k]).toMatchObject({showline:true,mirror:false,linecolor:'#000000',ticks:'outside',showgrid:true,gridcolor:'#cccccc',griddash:'dot',zeroline:false});
    expect(f.layout).toMatchObject({paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff'});
    const titles = (f.layout.annotations as T[]).filter(a => String(a.name).startsWith('team-panel-title:')).map(a => a.text);
    expect(titles).toEqual(['<b>PC</b>','<b>PE</b>']);
  });
  it('keeps every value, point count, bracket and p label', () => {
    expect(violins.map(t => t.y)).toEqual(s.features.flatMap(c => s.groups.map(g => s.rows.filter(r => r.Feature === c && r.GroupingVal === g).map(r => Number(r.Plot_Value)))));
    expect(violins.reduce((n,t) => n+t.y.length,0)).toBe(18);
    expect((f.layout.shapes as unknown[]).length).toBe(9);
    expect((f.layout.annotations as T[]).filter(a => !String(a.name ?? '').startsWith('team-panel-title:')).map(a => a.text)).toEqual(['*','ns','***']);
  });
  it("still lets the user's colours, outline and box choice override the default", () => {
    const v = setStyle(setColor(setColor(all,'Case A','#123456'),'Case A','#abcdef',undefined,'lines'),'PC',{box:false,points:false});
    const t = (figure(stateFrom(confirmedMessage,v)).data as T[]).find(x => x.type === 'violin' && x.meta.teamCondition === 'Case A' && x.meta.teamPanel === 'PC')!;
    expect(t.fillcolor).toBe('#123456'); expect(t.line.color).toBe('#abcdef'); expect(t.box.visible).toBe(false); expect(t.points).toBe(false);
  });
  it("matches Team's group comparison (www/team/js/group_comparison.js)", () => {
    const team = readFileSync(new URL('../../../../www/team/js/group_comparison.js', import.meta.url),'utf8');
    for (const piece of ["marker:{color:'#ffffff',size:6,opacity:1,line:{color:'#000000',width:1}}","fillcolor:fill,line:{color:lineFor(s,g),width:.5}",
      "box:{visible:style.box,width:.2,fillcolor:'#ffffff',line:{color:'#000000',width:1}}","tickangle:-45","mirror:false,linecolor:'#000000',ticks:'outside'",
      "gridcolor:'#cccccc',griddash:'dot'","text:'<b>'+c+'</b>'","paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff'"]) expect(team).toContain(piece);
    expect(team).toMatch(/function lineFor\(s,g\)\{return sharedColor\(s,g,'lines'\)\|\|'#000000';\}/);
  });
});
