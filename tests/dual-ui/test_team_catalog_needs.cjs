// A comparison-based card names what is actually missing: a confirmed study design, then the
// comparison, then what the view needs from it (structural run, significant lipids, grid content).
// Run with: node tests/dual-ui/test_team_catalog_needs.cjs
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const state={design:null,de:false,gate:null,tp:null,inputs:{},text:{}};
const window={TeamCanvas:{designReady:()=>state.design,deReady:()=>state.de,inferenceGate:()=>state.gate,timePointsReady:()=>state.tp},Shiny:{shinyapp:{$inputValues:state.inputs}}};
const document={getElementById:id=>id in state.text?{textContent:state.text[id]}:null,addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]};
const ctx=vm.createContext({window,document,console,setTimeout,clearTimeout});ctx.window.document=document;
vm.runInContext(fs.readFileSync('www/team/js/canvas_catalog.js','utf8'),ctx);
const needs=(id,pid)=>window.TeamCanvasCatalog.needs(id,pid);
state.design=false;assert.equal(needs('barchart-barPlotFiltered').kind,'design');assert.match(needs('volcano_tab-volcanoPlot').reason,/Review › Study design/);
// The refusal reason is reported separately: only an unconfirmed design points to Study design.
state.gate='design';assert.equal(needs('volcano_tab-volcanoPlot').status,'Needs a confirmed study design');
state.gate='paired';{const n=needs('barchart-barPlotFiltered');assert.equal(n.kind,'design');assert.equal(n.gate,'paired');assert.equal(n.status,'Not available for a paired design');assert.doesNotMatch(n.status,/confirmed study design/);assert.equal(n.button,undefined,'a paired design is valid: no button to change it');}
state.gate='preparation';assert.equal(needs('volcano_tab-volcanoPlot').status,'Data preparation not ready');assert.equal(needs('volcano_tab-volcanoPlot').button,'Prepare data');
state.gate='uncertain';assert.match(needs('volcano_tab-volcanoPlot').status,/mixed or uncertain/);
state.gate='measured';assert.match(needs('volcano_tab-volcanoPlot').status,/not all measured/);
state.gate='ok';
state.design=true;assert.equal(needs('volcano_tab-volcanoPlot').status,'Needs a comparison','design confirmed, no comparison yet');
state.de=true;assert.equal(needs('volcano_tab-volcanoPlot'),null,'a comparison exists: no "Needs a comparison"');
assert.equal(needs('structural_grid_tab-mergedPlot'),null);
assert.equal(needs('barchart-barPlotFiltered','tcinstance_a-barPlotFiltered'),null,'filtered view not reporting emptiness: no hint');
state.text['tcinstance_a-barPlotFiltered']='No lipids passed filters (Significant & Global Filters).';
assert.equal(needs('barchart-barPlotFiltered','tcinstance_a-barPlotFiltered').status,'No significant lipids');
assert.equal(needs('structural_tab-summaryPlot','tcinstance_b-summaryPlot').kind,'run');
state.inputs['tcinstance_b-runAnalysis:shiny.action']=1;assert.equal(needs('structural_tab-summaryPlot','tcinstance_b-summaryPlot'),null,'after the run the module message speaks');
state.text['tcinstance_b-summaryPlot']='No structural shifts detected or insufficient data.';assert.equal(needs('structural_tab-summaryPlot','tcinstance_b-summaryPlot').status,'No structural shifts found');
assert.match(needs('structural_grid_tab-heatmapPlot','tcinstance_c-heatmapPlot').reason,/no “Generate Grid Plots” button/);
// Time points come from the metadata, so a selector built only after a run (all metrics,
// significant-only) still gets the Generate analysis button.
state.tp=true;{const n=needs('longitudinal_tab-allmetrics_plot','tcinstance_e-allmetrics_plot');assert.equal(n.kind,'run');assert.equal(n.button,'submit_longitudinal_btn');assert.equal(n.action,'Generate analysis');}
state.tp=false;assert.equal(needs('longitudinal_tab-allmetrics_plot','tcinstance_e-allmetrics_plot').kind,'time','metadata without two time points');
state.tp=null;
assert.equal(needs('longitudinal_tab-macroclass_plot').kind,'time','no selector yet: the data lack time points');
state.inputs['tcinstance_d-selectedMacroclass']='GL';const run=needs('longitudinal_tab-macroclass_plot','tcinstance_d-macroclass_plot');
assert.equal(run.kind,'run');assert.equal(run.button,'submit_longitudinal_btn');
state.inputs['tcinstance_d-submit_longitudinal_btn:shiny.action']=1;assert.equal(needs('longitudinal_tab-macroclass_plot','tcinstance_d-macroclass_plot'),null);
console.log('PASS catalog needs follow the missing precondition: design (unconfirmed / paired / uncertain / preparation / measured), time points from metadata, comparison, structural run, time points then Generate Analysis, significant lipids, grid content');
