import { describe, expect, it } from 'vitest';
import type { SchemaControl } from '../../api';
import { choiceStates, statusNote } from './schemaForm';
// Abundance heatmap "Show: Significant only" (Team R/results_dashboard.R heat_significance_status and
// www/team/js/dashboard_significance.js): the API carries Team's note on the control (schema.R); the Inspector
// disables only the option it names, shows the note under the control and links it by aria-describedby.
const unavailable = 'Significant only is unavailable. Statistics need a confirmed independent study design, current prepared data and no synthetic samples. Review the design, then try again.';
const heat = (status?: SchemaControl['status']): SchemaControl => ({id:'heat_significance', type:'radio', label:'Show',
  options:[{value:'all',label:'All lipids'},{value:'significant',label:'Significant only'}], default:'all', ...(status ? {status} : {})});
describe('Team status note on a control', () => {
  it('not allowed: Significant only is disabled and described by the note; All lipids stays enabled', () => {
    const c = heat({allowed:false, text:unavailable, option:'significant'});
    expect(statusNote(c)).toEqual({id:'heat_significance-status', text:unavailable, allowed:false});
    expect(choiceStates(c, 'all')).toEqual([
      {value:'all', label:'All lipids', checked:true, disabled:false},
      {value:'significant', label:'Significant only', checked:false, disabled:true, describedBy:'heat_significance-status'}]);
  });
  it('a stored "significant" is kept (checked) while not allowed: no silent change of inputs', () => {
    const c = heat({allowed:false, text:unavailable, option:'significant'});
    const states = choiceStates(c, 'significant');
    expect(states.find(s => s.value === 'significant')).toMatchObject({checked:true, disabled:true});
    expect(states.find(s => s.value === 'all')).toMatchObject({checked:false, disabled:false});
  });
  it('allowed: every option enabled; the note shows Team\'s "Showing N" text', () => {
    const text = 'Showing 12 significant lipids: limma moderated t-test, BH-adjusted p < 0.05.';
    const c = heat({allowed:true, text, option:'significant'});
    expect(statusNote(c)).toEqual({id:'heat_significance-status', text, allowed:true});
    expect(choiceStates(c, 'significant').map(s => s.disabled)).toEqual([false, false]);
    expect(choiceStates(c, 'significant').find(s => s.value === 'significant')?.describedBy).toBe('heat_significance-status');
  });
  it('allowed with no text (All lipids shown): no note, nothing disabled', () => {
    const c = heat({allowed:true, text:null, option:'significant'});
    expect(statusNote(c)).toBeUndefined();
    expect(choiceStates(c, 'all').every(s => !s.disabled && !s.describedBy)).toBe(true);
  });
  it('a control without a status is unchanged', () => {
    expect(statusNote(heat())).toBeUndefined();
    expect(choiceStates(heat(), 'all').map(s => s.disabled)).toEqual([false, false]);
  });
});
