import type { PcaScoreReply, SchemaControl } from '../api/types';
// NEXO-P5/P8: what the real API reads from Team's PCA score analysis (statistics.R api_pca_score: the report) and how
// Team draws the PCA score card (R/results_dashboard.R plot_pcascore, publication format of eac6bb75), canned for three
// synthetic groups. The mock computes nothing: each test family answers its fixed synthetic numbers, in Team's wording.
export const mockPcaGroups = ['Control', 'Case', 'Vehicle'];
const colours = ['#BCD8EC', '#FFCBE1', '#D6E5BD'];
export const mockPcaScoreControls = (): SchemaControl[] => [
  {id:'pcs_pc', type:'select', label:'Principal component', options:['PC1','PC2','PC3','PC4','PC5'].map(v => ({value:v, label:v})), default:'PC1', group:'PCA score analysis'},
  {id:'pcs_groups', type:'checkboxgroup', label:'Groups to compare', options:mockPcaGroups.map(v => ({value:v, label:v})), default:mockPcaGroups, multiple:true, group:'PCA score analysis'},
  {id:'pcs_test', type:'select', label:'Tests', options:[{value:'rank', label:'Kruskal-Wallis + Mann-Whitney U (rank-based)'}, {value:'param', label:'One-way ANOVA + Welch t-test'}], default:'rank', group:'PCA score analysis'},
  {id:'pcs_corr', type:'select', label:'Multiple-testing correction', options:[{value:'BH', label:'Benjamini-Hochberg (FDR)'}, {value:'holm', label:'Holm'}, {value:'bonferroni', label:'Bonferroni'}, {value:'none', label:'None (unadjusted)'}], default:'BH', group:'PCA score analysis'},
] as SchemaControl[];
const canned = {
  rank: {omnibus:'Kruskal-Wallis', p:'0.0073', pairs:[['Control','Case','0.043','*'],['Control','Vehicle','0.043','*'],['Case','Vehicle','0.043','*']], pairwise:'Mann-Whitney U (normal approximation)'},
  param: {omnibus:'One-way ANOVA', p:'< 0.0001', pairs:[['Control','Case','0.0021','**'],['Control','Vehicle','0.00048','***'],['Case','Vehicle','0.0090','**']], pairwise:'Welch t-test'},
};
const corrections: Record<string, string> = {BH:'Benjamini-Hochberg', holm:'Holm', bonferroni:'Bonferroni'};
const scores = [[-3.1, -2.6, -2.2, -2.9], [0.4, -0.2, 0.7, 0.1], [2.4, 2.9, 2.1, 3.3]];
const sources = ['results_dashboard-plot_pca', 'results_dashboard-plot_pcascore'];
const testOf = (inputs: Record<string, unknown>) => inputs.pcs_test === 'param' ? canned.param : canned.rank;
export function mockPcaScore(source: string, inputs: Record<string, unknown>): PcaScoreReply {
  if (!sources.includes(source)) throw Object.assign(new Error('PCA score analysis is available for dashboard PCA cards only'), {status:422});
  const chosen = Array.isArray(inputs.pcs_groups) ? inputs.pcs_groups as string[] : mockPcaGroups;
  if (chosen.length < 2) return {message:'Choose at least two groups.', report:[]};
  const test = testOf(inputs), corr = String(inputs.pcs_corr ?? 'BH'), adjusted = corr === 'none' ? '' : 'adjusted ';
  return {message:null, report:[{text:'Statistical tests performed:', note:false},
      {text:`1. ${test.omnibus} across all 3 groups at once: p = ${test.p} (the groups differ).`, note:false},
      {text:`2. ${test.pairwise} on each pair of groups (3 comparisons).`, note:false},
      {text:corr === 'none' ? 'No multiple-testing correction was applied; p-values are unadjusted.' : `${corrections[corr]} correction across the 3 pairwise comparisons.`, note:false},
      ...test.pairs.map(([a, b, p, stars]) => ({text:`${a} vs ${b}: ${adjusted}p = ${p} (significant) ${stars}`, note:false})),
      {text:'Stars: * adjusted p < 0.05, ** < 0.01, *** < 0.001, ns = not significant. Scores are descriptive coordinates of an unsupervised PCA; p-values are exploratory.', note:true}]};
}
/** The PCA score card as Team draws it: boxes with their samples, black frame, brackets and stars, and the group
 *  table below the plot (a round legend proxy per group for its colour dot, then group (n), median, n). */
export function mockPcaScoreFigure(inputs: Record<string, unknown>) {
  const test = testOf(inputs), pc = String(inputs.pcs_pc ?? 'PC1'), fam = 'Arial, Helvetica, sans-serif', medians = ['-2.75', '+0.25', '+2.65'];
  const cell = (x: number, y: number, text: string, xanchor: string) => ({x, y, xref:'paper', yref:'paper', text, showarrow:false, xanchor, yanchor:'middle', align:xanchor, font:{family:fam, size:10, color:'#000000'}});
  const frame = {showline:true, linecolor:'#000000', linewidth:1, mirror:true, showgrid:false, zeroline:false};
  return {data:[...mockPcaGroups.map((g, i) => ({type:'box', x:scores[i].map(() => g), y:scores[i], name:g, legendgroup:g, boxpoints:'all', jitter:0.45, pointpos:0, fillcolor:`${colours[i]}A6`, line:{color:'#000000', width:1.5}, marker:{color:colours[i], size:6, line:{color:'#3a3a3a', width:0.8}}, hoverinfo:'y+text', showlegend:false})),
      ...mockPcaGroups.map((g, i) => ({type:'scatter', mode:'markers', x:[0.045], y:[0.215 - 0.052 * (i + 1)], xaxis:'x2', yaxis:'y2', name:g, legendgroup:g, showlegend:false, meta:{teamLegendProxy:true}, hoverinfo:'skip', marker:{symbol:'circle', size:8, color:colours[i], line:{color:'#3a3a3a', width:0.8}}}))],
    layout:{showlegend:false, margin:{l:65, r:15, t:15, b:10},
      xaxis:{title:'', type:'category', domain:[0, 1], categoryorder:'array', categoryarray:mockPcaGroups, showticklabels:false, ticks:'', ...frame},
      yaxis:{title:`${pc} score (41.2% of variance)`, domain:[0.28, 1], ticks:'outside', range:[-3.42, 6.66], ...frame, tickcolor:'#000000', ticklen:4},
      xaxis2:{domain:[0, 1], range:[0, 1], visible:false, fixedrange:true, anchor:'y2'}, yaxis2:{domain:[0, 0.28], range:[0, 0.28], visible:false, fixedrange:true, anchor:'x2'},
      shapes:test.pairs.map(([a, b], i) => { const x1 = mockPcaGroups.indexOf(a), x2 = mockPcaGroups.indexOf(b), y0 = 3.7 + 1.0 * i, y1 = y0 + 0.19; return {type:'path', path:`M ${x1},${y0} L ${x1},${y1} L ${x2},${y1} L ${x2},${y0}`, line:{color:'#000000', width:1.5}}; }),
      annotations:[...test.pairs.map(([a, b, , stars], i) => ({x:(mockPcaGroups.indexOf(a) + mockPcaGroups.indexOf(b)) / 2, y:3.89 + 1.0 * i, text:stars, showarrow:false, yanchor:'bottom', xanchor:'center', font:{family:fam, size:stars === 'ns' ? 12 : 16, color:'#000000'}})),
        cell(0.27, 0.215, '<b>Group</b>', 'center'), cell(0.60, 0.215, `<b>Median ${pc}</b>`, 'center'), cell(0.86, 0.215, '<b>n</b>', 'center'),
        ...mockPcaGroups.flatMap((g, i) => { const y = 0.215 - 0.052 * (i + 1); return [cell(0.075, y, `${g} (n = 4)`, 'left'), cell(0.60, y, medians[i], 'center'), cell(0.86, y, '4', 'center')]; })]}};
}
