import type { CardSchema, SchemaControl } from '../api/types';
import catalog from './catalog.json';
import { isLongitudinal, mockTimecourseControls, mockTimecourseLabel } from './timecourse';
import { mockPcaScoreControls } from './pcaScore';
// Synthetic long lipid choices shared by the catalog and API mock. Snapshot at load: the mock API later
// rewrites catalog.outputs[].inputs without options, so reading the catalog lazily would lose the choices.
const lipidControls = Object.fromEntries(['results_dashboard-plot_violin','results_dashboard-plot_heat'].map(id => [id, structuredClone(catalog.outputs.find(e => e.id === id)?.inputs?.[0])]));
const lipidControl = (source: string) => structuredClone(lipidControls[source]) as SchemaControl;
// Synthetic groups and BQC sample ids for the computed controls (Team's renderUI per group / per sample).
export const mockGroups = ['Control', 'Treatment', 'Treatment_high_dose_week12', 'Vehicle_low_dose_week04_crossover', 'Placebo_matched_arm_B_week12'], mockSamples = Array.from({length: 66}, (_, i) => `Pool_QC_Replicate_S${String(i + 1).padStart(2, '0')}`);
const groupPalette = ['#176b73', '#b5465b', '#6b4fa0', '#8a6d1f', '#2f6f3e'];
// Team's shape choices as the real API serves them: ggplot pch numbers with names.
const teamShapes = [['16','Circle'],['15','Square'],['17','Triangle'],['18','Diamond'],['3','Plus'],['4','Cross'],['8','Star']].map(([value, label]) => ({value, label}));
function computedFor(source: string): SchemaControl[] {
  // Pilot F1: per-group pickers are offered where they reach a canvas copy's plot (the cellular organization polar map,
  // 14_cellular_org_module.R polar_active_color_map); a QC copy takes its group colours from the session palette.
  if (source === 'cellular_org_tab-polarPlot') return mockGroups.flatMap((g, i) => [
    {id:`customCol_${g}`, type:'color', label:`Colour for ${g}`, group:g, default:groupPalette[i], computed:true} as SchemaControl,
    {id:`customShape_${g}`, type:'select', label:`Shape for ${g}`, group:g, options:teamShapes, default:'16', computed:true} as SchemaControl]);
  if (isLongitudinal(source)) return mockTimecourseControls();
  if (source === 'qc_pca_tab-bqcPlot') return [{id:'bqcSamples', type:'checkboxgroup', label:'Selected BQC Samples', options:mockSamples.map(v => ({value:v, label:v})), default:[], computed:true}];
  // FLA logratio (b09): Team's index picker, one checkbox group per category (indexPickerUI), labels from the rendered UI.
  if (source === 'fla_tab-logratioPlot') return Object.entries(mockFlaCategories).map(([category, indices]) => ({id:`sel_${category}`, type:'checkboxgroup', label:category,
    options:indices.map(v => ({value:v, label:v.replace(/_Index$/, '')})), default:indices.filter(v => mockFlaDefaults.includes(v)), computed:true} as SchemaControl));
  return [];
}
// missing-controls-a. FLA: synthetic categories with Team's default indices (10_fla_module.R l.898).
export const mockFlaCategories: Record<string, string[]> = {Structural:['PE/PC_Index','(LPC+LPE)/PL_Index','SM/PC_Index'], 'Lysosomal Hydrolysis & Eicosanoids':['AA/EPA_Index'], Energy:['Energy_Load_Index','TG/PL_Index']};
export const mockFlaDefaults = ['PE/PC_Index', 'Energy_Load_Index', '(LPC+LPE)/PL_Index'];
// Structural species (b07 F4): Team's classSelectorUI builds "Select Shifts to Visualize:" only after Initiate Structural
// Analysis; the API seeds its default (the first four shifts). Per card: the actions pressed and the shifts Load Species Plot took.
export const mockShifts = ['PC | PC 34:1', 'PE | PE 36:2', 'TG | TG 52:2', 'SM | SM d18:1/16:0', 'LPC | LPC 16:0', 'CE | CE 18:2'];
export const mockModule: Record<string, {acted: string[]; species?: string[]}> = {};
export function mockAct(source: string, instance: string, actions: string[], inputs: Record<string, unknown>): Record<string, unknown> {
  const state = mockModule[instance] ??= {acted: []};
  state.acted.push(...actions);
  if (source !== 'structural_tab-speciesPlotPlot') return {};
  const seeded: Record<string, unknown> = actions.includes('runAnalysis') && !Array.isArray(inputs.selectedDetails) ? {selectedDetails: mockShifts.slice(0, 4)} : {};
  if (actions.includes('updateSpecies') && state.acted.includes('runAnalysis')) state.species = [...((seeded.selectedDetails ?? inputs.selectedDetails) as string[] ?? [])];
  return seeded;
}
const speciesSchema = (instance?: string): SchemaControl[] => [
  {id:'labelTop', type:'range', label:'Label Top % Extremes:', min:0, max:50, step:1, default:5, group:'Violin Plots'},
  ...(instance && mockModule[instance]?.acted.includes('runAnalysis') ? [{id:'selectedDetails', type:'multiselect', label:'Select Shifts to Visualize:', multiple:true,
    options:mockShifts.map(v => ({value:v, label:v})), default:mockShifts.slice(0, 4), group:'Violin Plots'} as SchemaControl] : []),
  {id:'diff_color_up', type:'color', label:'Up colour:', default:'#D55E00', group:'differential_view', groupLabel:'Differential Acyl Chain Expression'} as SchemaControl];
/** The mock render shows computed values: the first group's colour and marker, or Team's BQC placeholder. */
export function mockComputedLabel(source: string, label: string, inputs: Record<string, unknown>, instance?: string, session?: string): {label: string; fill?: string} {
  if (isLongitudinal(source)) return {label:`${label} · ${mockTimecourseLabel(inputs)}`};
  if (source === 'fla_tab-logratioPlot') { const picked = Object.keys(mockFlaCategories).flatMap(c => Array.isArray(inputs[`sel_${c}`]) ? inputs[`sel_${c}`] as string[] : mockFlaCategories[c].filter(v => mockFlaDefaults.includes(v))); return {label:`${label} · ${picked.length} indices: ${picked.join(', ')}`}; }
  if (source === 'structural_tab-speciesPlotPlot') { const shown = instance ? mockModule[instance]?.species : undefined; return shown?.length ? {label:`${label} · ${shown.length} shifts: ${shown.join(', ')}`} : {label:"Click 'Initiate Structural Analysis' in the left sidebar", fill:'#d8e2e6'}; }
  if (source === 'qc_pca_tab-bqcPlot') { const n = Array.isArray(inputs.bqcSamples) ? inputs.bqcSamples.length : 0; return n >= 2 ? {label:`${label} · ${n} BQC samples`} : {label:'Select at least 2 BQC samples', fill:'#d8e2e6'}; }
  if (source === 'cellular_org_tab-polarPlot') { const fill = typeof inputs[`customCol_${mockGroups[0]}`] === 'string' ? inputs[`customCol_${mockGroups[0]}`] as string : undefined; return {label:`${label} · ${fill ?? groupPalette[0]} ${teamShapes.find(o => o.value === String(inputs[`customShape_${mockGroups[0]}`] ?? '16'))?.label ?? String(inputs[`customShape_${mockGroups[0]}`])}`, fill}; }
  // Pilot F1: the 2D PCA's group colours follow the session palette (mock/palette.ts), never the card's own pickers.
  if (source === 'qc_pca_tab-pca2dPlot') return session ? {label:`${label} · ${session}`, fill:session} : {label};
  if (source.startsWith('pathway_tab-')) { const moved = Object.keys(parsed(inputs.position_overrides_json, '{}') as object).length;
    return {label: moved ? `${label} · layout: ${moved} moved node${moved === 1 ? '' : 's'}` : label}; }
  return {label};
}
// Team's 2D PCA (R/frontends/team/qc-ui.R:39): "Override sample colors" stays (Team's static control), but a canvas copy's
// per-group pickers never reach its PCA (pilot F1), so the real API no longer offers them (schema.R api_is_computed_id).
const pcaCustomColours = (_values: Record<string, unknown>): SchemaControl[] => [
  {id:'useCustomColors', type:'boolean', label:'Override sample colors in this QC tab?', default:false} as SchemaControl];
/** Families whose group colours follow Team's session palette (palette.R api_palette_session_families). */
export const sessionPaletteFamily = (source: string) => /^(qc_pca_tab|barchart|structural_tab|logratio_tab|group_comparison_tab|fla_tab|cellular_org_tab|results_dashboard)-/.test(source);
export function schemaFor(source: string, instance?: string, values: Record<string, unknown> = {}): CardSchema {
  if (source === 'structural_tab-speciesPlotPlot') return {controls:speciesSchema(instance), actions:['runAnalysis','updateSpecies'],
    actionControls:[{id:'runAnalysis', label:'Initiate Structural Analysis', tab:'Violin Plots'}, {id:'updateSpecies', label:'Load Species Plot', tab:'Violin Plots'}], tabs:{}};
  return {controls: computedFor(source).length ? computedFor(source) : source === 'heatmap_barchart_tab-violin_plot_render' ? [
    // Mock suites pick lipids on this card (as on every mock violin source); beside it Team's sliderInput as the real
    // API serves it, 2340 being the module's height for the synthetic selection (b05 F5).
    lipidControl('results_dashboard-plot_violin'),
    {id:'violin_zoom_pct',type:'range',label:'Plot Height (px):',min:300,max:5000,step:50,default:2340}
  ] : source.includes('violin') ? [lipidControl('results_dashboard-plot_violin')] : source === 'logratio_tab-logratioPlot' ? [
    {id:'primary_grouping',type:'multiselect',label:'Primary Grouping (Order matters)',selectize:{plugins:['drag_drop']},options:['Condition','Time','Sex','Treatment_arm_by_dose_and_week','Sampling_batch_and_extraction_day'].map(v=>({value:v,label:v})),default:['Condition','Time']}
  ] : source === 'results_dashboard-plot_pca' ? mockPcaScoreControls() : source === 'qc_pca_tab-pca2dPlot' ? pcaCustomColours(values) : source === 'volcano_tab-volcanoPlot' ? [
    // Team sliderInputs as the real API serves them (schema.R: type range with min/max/step; label and help in one string).
    {id:'volcano_alpha',type:'range',label:'Alpha:',min:0,max:1,step:0.05,default:0.7},
    {id:'volcano_weight_logp',type:'range',label:'Weight -Log10PControls how heavily the significance term counts when ranking labelled points.',min:0,max:5,step:0.1,default:1}
  ] : source === 'results_dashboard-plot_heat' ? [
    // Shaped like the real API schema (H8): a Team dashboard selection bar and a control without a label.
    {id:'heat_group_selection',type:'text',label:'Sample groups',options:['Control','Treatment','Vehicle','Treatment_high_dose_week12','Vehicle_low_dose_week04_crossover','Placebo_matched_arm_B_week12'].map(v=>({value:v,label:v})),defaultChoices:['Control','Treatment'],allToken:'__EVERY__',default:'__ALL__'},
    lipidControl('results_dashboard-plot_heat'),
    // Team's "Show" radio (R/results_dashboard.R rd_heat_significance_ui), kept without a label as the H8 live schema
    // served it; its status note is added per session by the mock API (mockHeatStatus).
    {id:'heat_significance',type:'radio',label:null as unknown as string,options:[{value:'all',label:'All lipids'},{value:'significant',label:'Significant only'}],default:'all'}
  ] : [],...(source.startsWith('pathway_tab-') ? {uploads:[{id:'upload_config',label:'Upload Layout JSON (.json):',accept:'.json'}]} : {}),...(source.startsWith('qc_pca_tab-') ? {actions:['show_stats_detail'],actionControls:[{id:'show_stats_detail',label:'Show Statistic Detail',tab:null}]} :
    // Chart audit b07 F3: the structural summary draws only after its module button (Team's placeholder before it).
    isLongitudinal(source) ? {actions:['submit_longitudinal_btn','btn_add_case'],actionControls:[{id:'submit_longitudinal_btn',label:'Generate Analysis',tab:null},{id:'btn_add_case',label:'Add Timecourse',tab:null}]} :
    source === 'structural_tab-summaryPlot' ? {actions:['runAnalysis'],actionControls:[{id:'runAnalysis',label:'Initiate Structural Analysis',tab:null}]} :
    // NEXO-P5: Team's PCA score analysis sits in the dashboard module; its Run button is the PCA card's module action.
    source === 'results_dashboard-plot_pca' ? {actions:['pcs_run'],actionControls:[{id:'pcs_run',label:'Run PCA score analysis',tab:'PCA score analysis'}]} : {actions:[]}),tabs:{},
    ...(sessionPaletteFamily(source) ? {sessionPalette:true} : {})};
}
// saveFault: a test sets it to make the next checkpoint saves fail with that message (journey review 8.1).
// replays / replayFault: recorded module presses replayed on a card (chart audit b07 F3); a test sets replayFault to make replays fail.
export const mockCounters: { refusals?: number; renders: number; cardPatches: {instance: string; body: {inputs: Record<string, unknown>; actions: unknown}}[]; saveFault?: string; labels: Record<string, string>; replays: {instance: string; actions: string[]}[]; replayFault?: boolean; uploads: {instance: string; input: string; name: string}[]; pngRenders?: {instance: string; width: number; height: number; dpr: number}[]; cardEvents?: {instance: string; body: unknown}[] } = { renders: 0, cardPatches: [], labels: {}, replays: [], uploads: [] };
export const MOCK_STRUCTURAL_PLACEHOLDER = "Click 'Initiate Structural Analysis' in the left sidebar";
// b11 F3: the pathway module's layout as its download_config handler writes it from the five *_json inputs, and as its
// upload_config observer writes an uploaded layout back to them (13_pathway_module.R:603-641).
const layoutKeys = [['active_classes','active_classes_json','[]'],['custom_nodes','custom_nodes_json','{}'],['added_edges','added_edges_json','[]'],['removed_edges','removed_edges_json','[]'],['position_overrides','position_overrides_json','{}']] as const;
const parsed = (text: unknown, fallback: string): unknown => { try { return JSON.parse(typeof text === 'string' ? text : fallback); } catch { return JSON.parse(fallback); } };
export function mockLayoutDownload(inputs: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(layoutKeys.map(([key, input, fallback]) => [key, parsed(inputs[input], fallback)])), null, 2);
}
export function mockLayoutApply(inputs: Record<string, unknown>, layout: unknown): Record<string, unknown> {
  const next = {...inputs}, value = (layout && typeof layout === 'object' ? layout : {}) as Record<string, unknown>;
  for (const [key, input] of layoutKeys) if (value[key] !== undefined && value[key] !== null) next[input] = JSON.stringify(value[key]);
  return next;
}
// What the real API returns for QC "Show Statistic Detail" (showModal), with markup the client must not run.
export const mockActionModals: Record<string, {title: string; html: string}> = {
  show_stats_detail: {title:'Statistics Console', html:'<div class="stats-console"><p>Statistic detail for this view.</p><pre>n = 24</pre></div><script>window.__pwned = 1</script><a href="https://example.com" onclick="window.__pwned = 2">More</a><img src="x" onerror="window.__pwned = 3">'}
};

// Team's wording (R/results_dashboard.R heat_significance_status and the heatmap's 422), synthetic criterion and count.
export const MOCK_HEAT_UNAVAILABLE = 'Significant only is unavailable. Statistics need a confirmed independent study design, current prepared data and no synthetic samples. Review the design, then try again.';
export const MOCK_HEAT_RENDER_UNAVAILABLE = `${MOCK_HEAT_UNAVAILABLE} No p-values were computed. Choose All lipids to show the heatmap.`;
/** The note the real API reads from Team's heat_significance_status output (schema.R api_control_status). */
export function mockHeatStatus(allowed: boolean, value: unknown): NonNullable<SchemaControl['status']> {
  if (!allowed) return {allowed:false, text:MOCK_HEAT_UNAVAILABLE, option:'significant'};
  return {allowed:true, text:value === 'significant' ? 'Showing 12 significant lipids: limma moderated t-test, Benjamini-Hochberg adjusted p < 0.05.' : null, option:'significant'};
}
