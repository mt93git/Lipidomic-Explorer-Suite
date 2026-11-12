import type { PcaScoreReply, SchemaControl } from '../api/types';
// NEXO-P5: what the real API reads from Team's PCA score analysis (statistics.R api_pca_score), canned for three
// synthetic groups. The mock computes nothing: each test family answers its fixed synthetic numbers, in Team's wording
// (R/results_dashboard.R pcs_status, pcs_plot, pcs_table, pcs_report).
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
export function mockPcaScore(source: string, inputs: Record<string, unknown>, ran: boolean): PcaScoreReply {
  if (source !== 'results_dashboard-plot_pca') throw Object.assign(new Error('PCA score analysis is available for dashboard PCA cards only'), {status:422});
  const empty = {status:null, message:null, figure:null, table:null, report:[]};
  if (!ran) return {...empty, status:'Choose the component, groups and tests, then run the analysis.'};
  const chosen = Array.isArray(inputs.pcs_groups) ? inputs.pcs_groups as string[] : mockPcaGroups;
  if (chosen.length < 2) return {...empty, message:'Choose at least two groups.'};
  const test = inputs.pcs_test === 'param' ? canned.param : canned.rank, pc = String(inputs.pcs_pc ?? 'PC1'), corr = String(inputs.pcs_corr ?? 'BH');
  const adjusted = corr === 'none' ? '' : 'adjusted ', labels = mockPcaGroups.map(g => `${g}<br>(n=4)`);
  return {status:null, message:null,
    figure:{data:mockPcaGroups.map((g, i) => ({type:'box', x:scores[i].map(() => labels[i]), y:scores[i], name:g, boxpoints:'all', jitter:0.45, pointpos:0, fillcolor:`${colours[i]}4D`, line:{color:'#6b7280', width:1}, marker:{color:colours[i], size:7, line:{color:'#ffffff', width:0.6}}, showlegend:false})),
      layout:{showlegend:false, margin:{l:60, r:15, t:30, b:60}, xaxis:{title:'', type:'category', categoryorder:'array', categoryarray:labels}, yaxis:{title:`${pc} score (41.2% of variance)`, zeroline:true, range:[-3.5, 5.6]},
        shapes:test.pairs.map(([a, b], i) => { const x1 = mockPcaGroups.indexOf(a), x2 = mockPcaGroups.indexOf(b), y0 = 3.7 + 0.64 * i, y1 = y0 + 0.16; return {type:'path', path:`M ${x1},${y0} L ${x1},${y1} L ${x2},${y1} L ${x2},${y0}`, line:{color:'#52514e', width:1}}; }),
        annotations:[...test.pairs.map(([a, b, , stars], i) => ({x:(mockPcaGroups.indexOf(a) + mockPcaGroups.indexOf(b)) / 2, y:3.86 + 0.64 * i, text:stars, showarrow:false, yanchor:'bottom', xanchor:'center', font:{size:12, color:'#20323b'}})),
          {x:0, y:1, xref:'paper', yref:'paper', text:`${test.omnibus} p = ${test.p}`, showarrow:false, xanchor:'left', yanchor:'bottom', font:{size:10, color:'#52514e'}}]}},
    table:{columns:['Group', `Median ${pc}`, 'n'], rows:mockPcaGroups.map((g, i) => ({color:colours[i], cells:[g, ['-2.75', '+0.25', '+2.65'][i], '4']}))},
    report:[{text:'Statistical tests performed:', note:false},
      {text:`1. ${test.omnibus} across all 3 groups at once: p = ${test.p} (the groups differ).`, note:false},
      {text:`2. ${test.pairwise} on each pair of groups (3 comparisons).`, note:false},
      {text:corr === 'none' ? 'No multiple-testing correction was applied; p-values are unadjusted.' : `${corrections[corr]} correction across the 3 pairwise comparisons.`, note:false},
      ...test.pairs.map(([a, b, p, stars]) => ({text:`${a} vs ${b}: ${adjusted}p = ${p} (significant) ${stars}`, note:false})),
      {text:'Stars: * adjusted p < 0.05, ** < 0.01, *** < 0.001, ns = not significant. Scores are descriptive coordinates of an unsupervised PCA; p-values are exploratory.', note:true}]};
}
