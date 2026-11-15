/** NEXO-P2: a Structure figure as Team's R serves it (8_structural_module.R structure_team_plotly), synthetic values.
 *  A bar series keeps its legend entry on a round proxy trace in its legend group (meta.teamLegendProxy, structure_round_legend);
 *  unnamed points are "Points" with per-point sizes; text labels are not editable (meta.teamNoEdit); the all-classes grid
 *  hides the Series section (layout.meta.teamHideSeries). The title carries the mock label, as the other mock figures. */
export function mockStructureFigure(source: string, title: string) {
  const data = [
    {type:'bar', name:'Up', legendgroup:'Up', showlegend:false, x:['PC','PE','TG'], y:[1.2,0.6,1.8], marker:{color:'#D55E00'}},
    {type:'scatter', mode:'markers', name:'Points', showlegend:false, x:['PC','PE','TG','PC'], y:[0.4,1.1,1.5,0.9], marker:{color:'#0072B2', size:[6,12,18,24]}},
    {type:'scatter', mode:'text', name:'Labels', meta:{teamNoEdit:true}, showlegend:false, x:['TG'], y:[1.9], text:['TG']},
    {type:'scatter', mode:'markers', name:'Up', legendgroup:'Up', showlegend:true, meta:{teamLegendProxy:true}, x:[null], y:[null], hoverinfo:'skip', marker:{symbol:'circle', size:9, color:'#D55E00', line:{width:0}}}
  ];
  return {data, layout:{title:{text:title}, font:{family:'Arial, Helvetica, sans-serif', size:10, color:'#52514e'}, ...(source === 'structural_grid_tab-mergedPlot' ? {meta:{teamHideSeries:true}} : {})}};
}
