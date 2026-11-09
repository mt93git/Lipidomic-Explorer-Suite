import { describe, it, expect, vi, beforeEach } from 'vitest';
const stub = vi.hoisted(() => ({ fail: null as Error | null }));
// A plain function in front of the spy for failures: vitest reports a rejection its spy returned as a test error.
vi.mock('../../api', () => { const spy = vi.fn(); return { updateCard: Object.assign((...args: unknown[]) => stub.fail ? Promise.reject(stub.fail) : spy(...args), {spy}) }; });
import { updateCard } from '../../api';
import { formControls, pressAction } from './actions';
import { controlsByGroup } from './schemaForm';
const update = vi.mocked((updateCard as unknown as {spy: typeof updateCard}).spy);
beforeEach(() => { update.mockReset(); stub.fail = null; });
describe('module actions in the Data tab (Feature 1c)', () => {
  it('lists each action as a button in its tab section, after that section\'s controls', () => {
    const controls = formControls({controls:[{id:'a',type:'select',label:'A',group:'Plot'},{id:'b',type:'number',label:'B',group:'Data'}],
      actions:['go','detail','other'], actionControls:[{id:'detail',label:'Show Statistic Detail',tab:'Plot'},{id:'go',label:'Process Outlier Risks',tab:null},{id:'other',label:'Add Group',tab:'Data'}], tabs:{}});
    const groups = controlsByGroup(controls);
    expect(Object.keys(groups)).toEqual(['Plot','Data','']);
    expect(groups.Plot.map(c => [c.id,c.type,c.label])).toEqual([['a','select','A'],['detail','action','Show Statistic Detail']]);
    expect(groups.Data.map(c => c.id)).toEqual(['b','other']);
    expect(groups[''].map(c => c.label)).toEqual(['Process Outlier Risks']);
  });
  it('an older API (ids only, no actionControls) still lists no unlabelled buttons', () => {
    expect(formControls({controls:[{id:'a',type:'text',label:'A'}],actions:['go'],tabs:{}}).map(c => c.id)).toEqual(['a']);
  });
  it('a click sends the action alone and hands the new inputs to the card', async () => {
    update.mockResolvedValue({settled:true, inputs:{x:1}});
    const onUpdated = vi.fn(async () => {});
    const modal = await pressAction('s1','tcinstance_1','show_stats_detail',onUpdated);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('s1','tcinstance_1',{},['show_stats_detail']);
    expect(onUpdated).toHaveBeenCalledWith({x:1});
    expect(modal).toBeUndefined();
  });
  it('returns the module dialog, sanitised', async () => {
    update.mockResolvedValue({settled:true, inputs:{}, modal:{title:'Statistics Console', html:'<p>Detail</p><script>x()</script>'}});
    expect(await pressAction('s','i','show_stats_detail',async () => {})).toEqual({title:'Statistics Console', html:'<p>Detail</p>'});
  });
  it('a failed request rejects and does not touch the card', async () => {
    stub.fail = new Error('Unknown action: x');
    let touched = false;
    const failure = await pressAction('s','i','x',async () => { touched = true; }).then(() => null, (e: Error) => e.message);
    expect(failure).toBe('Unknown action: x');
    expect(touched).toBe(false);
  });
});
// Chart audit b06: Team keeps the group comparison's confirmation token in a display:none textInput
// (R/frontends/team/group_comparison.R l.77); the card's "Confirm reference group" fills it. Nexo showed it as an
// empty, unlabeled text box at the top of the Data tab.
it('the group comparison confirmation token is not a Data-tab control', () => {
  const ids = formControls({controls:[{id:'gc_baseline_confirmation',type:'text',label:null as never},{id:'panelHeight',type:'select',label:'Panel height'}],actions:[],tabs:{}}).map(c => c.id);
  expect(ids).toEqual(['panelHeight']);
});
describe("Team's hidden state inputs (b11 chart audit: pathway map Data tab)", () => {
  // Team keeps the pathway layout as JSON in labelless text inputs inside a display:none div (13_pathway_module.R
  // l.71-77); the API marks them hidden. Nexo showed them as five unlabelled "{}"/"[]" boxes. They stay in the
  // card's inputs (sent and saved as before) but are not drawn as fields.
  it('does not draw controls the API marks hidden, and keeps the others in order', () => {
    const controls = formControls({controls:[{id:'active_classes_json',type:'text',label:'',hidden:true},{id:'classLabelFormat',type:'radio',label:'Class/Origin Name Format:'},{id:'custom_nodes_json',type:'text',label:'',hidden:true}],actions:[],tabs:{}});
    expect(controls.map(c => c.id)).toEqual(['classLabelFormat']);
  });
});
