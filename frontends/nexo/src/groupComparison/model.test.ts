import {describe,expect,it} from 'vitest';
import {confirmedMessage} from './fixture';
import {csv,defaultVisual,figure,report,resultRows,stateFrom,toggleCondition,toggleFeature,togglePanel,setColor,resetColors,colorFor} from './model';
const all = {features:['PC','PE'],hiddenConditions:[],panelOff:{},panelStyles:{}};
const violins = (v: Parameters<typeof stateFrom>[1]) => figure(stateFrom(confirmedMessage,v)).data.filter(t => t.type === 'violin');
describe('group comparison model', () => {
  it('defaults to the first class and reads column-oriented rows', () => {
    const s = stateFrom(confirmedMessage);
    expect(s.rows).toHaveLength(18); expect(s.features).toEqual(['PC','PE']); expect(defaultVisual(s).features).toEqual(['PC']);
  });
  it('draws one violin per class and condition plus one legend entry per condition', () => {
    const f = figure(stateFrom(confirmedMessage,all));
    expect(f.data.filter(t => t.type === 'violin')).toHaveLength(6);
    expect(f.data.filter(t => t.type === 'scatter')).toHaveLength(3);
    expect(f.layout.xaxis2).toBeTruthy();
    // Every finite p gets a bracket (PC Case A, PC Case B ns, PE Case A; PE Case B has none): three segments each.
    expect((f.layout.shapes as unknown[]).length).toBe(9);
  });
  it('a hidden condition removes its traces', () => {
    expect(violins(toggleCondition(all,'Case B'))).toHaveLength(4);
    expect(violins(toggleCondition(toggleCondition(all,'Case B'),'Case B'))).toHaveLength(6);
  });
  it('a panel-off condition leaves that facet only', () => {
    const v = togglePanel(all,'PE','Case A'), f = figure(stateFrom(confirmedMessage,v));
    expect((f.layout.xaxis2 as {categoryarray:string[]}).categoryarray).toEqual(['Control','Case B']);
    expect((f.layout.xaxis as {categoryarray:string[]}).categoryarray).toEqual(['Control','Case A','Case B']);
    expect(violins(v)).toHaveLength(5);
  });
  it('a class toggled off removes its facet', () => {
    const f = figure(stateFrom(confirmedMessage,toggleFeature(all,'PE')));
    expect(f.layout.xaxis2).toBeUndefined(); expect(f.data.filter(t => t.type === 'violin')).toHaveLength(3);
  });
  it('a colour is shared across panels and resets', () => {
    const v = setColor(all,'Case A','#123456');
    expect(v.panelStyles.PC.colors['Case A']).toBe('#123456');
    expect(violins(v).filter(t => (t.meta as {teamCondition:string}).teamCondition === 'Case A').map(t => t.fillcolor)).toEqual(['#123456','#123456']);
    expect(colorFor(stateFrom(confirmedMessage,resetColors(v)),'Case A')).not.toBe('#123456');
  });
  it('csv quotes every cell and neutralises formulas', () => {
    const text = csv(stateFrom(confirmedMessage,all));
    const lines = text.split('\r\n');
    expect(lines).toHaveLength(19);
    expect(lines[0].startsWith('"Sample","GroupingVal"')).toBe(true);
    expect(text).toContain(`"'=S6"`);
    expect(text).not.toMatch(/(^|,)"=S6"/m);
  });
  it('report and result rows list each class and condition', () => {
    const s = stateFrom(confirmedMessage,all);
    const text = report(s);
    expect(text).toContain('Test applied: Welch');
    expect(text).toContain('Case A: p = 0.0120000; n = 3 (shown)');
    expect(text).toContain('Control: reference; n = 3 (shown)');
    const rows = resultRows(s);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({feature:'PC',comparison:'Case A vs Control',p:0.012,significance:'*',shown:true});
    expect(rows[3].p).toBeNull();
  });
});
