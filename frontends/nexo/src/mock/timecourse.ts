// Mock of Team's longitudinal time-course designer (R/modules/11_longitudinal_module.R:1265-1320), shared by every
// longitudinal card like Team's shared_data$saved_designer_cases: a source of synthetic cohorts and "Timecourse i"
// buckets with session-random-looking ids. Bucket values are set as sortable's JS sets them; Generate Analysis
// (submit_longitudinal_btn) syncs them into the cases; Add Timecourse appends an empty case.
import type { SchemaControl } from '../api/types';
export const mockCohorts = ['Cohort_A_T1', 'Cohort_A_T2', 'Cohort_B_T1', 'Cohort_B_T2', 'Cohort_C_T1'];
const fresh = () => [{id: 'case_673990', items: ['Cohort_A_T1', 'Cohort_A_T2']}, {id: 'case_934241', items: ['Cohort_B_T1', 'Cohort_B_T2']}];
let cases = fresh(), next = 100001;
// Team builds the time courses only after Generate Analysis, per card instance (F3): until then the render is refused.
const generated = new Set<string>();
export const mockTimecourseGenerated = (instance: string) => generated.has(instance);
export const isLongitudinal = (source: string) => source.startsWith('longitudinal_tab-');
export function mockTimecourseControls(): SchemaControl[] {
  return cases.map((c, i) => ({id: `case_bucket_${c.id}`, type: 'bucket', label: `Timecourse ${i + 1}`, default: [...c.items],
    options: mockCohorts.map(v => ({value: v, label: v})), multiple: true, group: 'Time-course designer', computed: true} as SchemaControl));
}
export function mockTimecourseUpdate(source: string, inputs: Record<string, unknown>, actions: unknown, instance = ''): void {
  if (!isLongitudinal(source) || !Array.isArray(actions)) return;
  const sync = () => { cases = cases.map(c => Array.isArray(inputs[`case_bucket_${c.id}`]) ? {...c, items: (inputs[`case_bucket_${c.id}`] as unknown[]).map(String)} : c); };
  for (const bad of Object.keys(inputs).filter(k => k.startsWith('case_bucket_')))
    if (!cases.some(c => `case_bucket_${c.id}` === bad) || !(inputs[bad] as unknown[]).every(v => mockCohorts.includes(String(v)))) throw new Error('Invalid value for ' + bad);
  if (actions.includes('submit_longitudinal_btn')) { sync(); generated.add(instance); }
  if (actions.includes('btn_add_case')) { sync(); cases = [...cases, {id: `case_${next++}`, items: []}]; }
}
/** The mock image names its time courses, so a redraw after a move is visible. */
export function mockTimecourseLabel(inputs: Record<string, unknown>): string {
  return cases.map((c, i) => { const v = inputs[`case_bucket_${c.id}`]; const items = Array.isArray(v) ? v.map(String) : c.items;
    return `TC${i + 1}: ${items.map(x => x.replace('Cohort_', '')).join('+') || '-'}`; }).join(' | ');
}
export const resetMockTimecourse = () => { cases = fresh(); next = 100001; generated.clear(); };
