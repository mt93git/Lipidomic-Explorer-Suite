// A new small (square) dashboard heatmap card is fitted once to its drawn map;
// copied, restored and hydrating frames are never resized.
// Run with: node tests/dual-ui/test_team_square_heatmap_fit.cjs
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('www/team/js/canvas.js','utf8');const code=src.slice(src.indexOf('  function resize(r, camera) {'),src.indexOf('  function moveNode('));
function make(extra){
  const gd={layout:{meta:{teamHeatmap:{geometry:'square-horizontal'}},xaxis:{domain:[0,1]},yaxis:{domain:[0,1]},margin:{l:210,r:20}},_fullLayout:{margin:{l:210,r:20},_size:{w:390},height:242},data:[{x:Array(12).fill('x'),y:['A','B']}]};
  const el=Object.assign({style:{height:'420px',minWidth:'',setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}},clientWidth:960,classList:{contains:()=>true},getBoundingClientRect:()=>({top:100})},gd);
  const child={getBoundingClientRect:()=>({bottom:420,width:500,height:300})};
  const content={scrollTop:0,querySelectorAll:()=>[child]};
  const node={style:{width:'1000px',height:'1100px'},offsetWidth:1000,offsetHeight:1100,clientHeight:1100,getBoundingClientRect:()=>({top:0}),querySelector:s=>s==='.tc-content'?content:null};
  return Object.assign({node,el},extra||{});
}
let arranged=0;const context={window:{Plotly:{Plots:{resize:()=>Promise.resolve()},relayout:()=>Promise.resolve()},dispatchEvent:()=>{}},guardPlotlyResize:()=>{},guardWidgetResize:()=>{},sourceKey:()=> 'results_dashboard-plot_heat',isClassHeatmap:()=>false,dimensionTrace:()=>{},arrange:()=>{arranged++},applyingRestore:false,Event:function(){},Promise,Math,Array};
vm.createContext(context);vm.runInContext(code,context);
(async()=>{
  const fresh=make();context.resize(fresh);await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(fresh.node.style.width,'620px','fresh card narrows to the map');
  assert.equal(fresh.node.style.height,'440px','fresh card height follows the drawn content (420 + 20)');
  assert.equal(fresh.el.style['min-height'],'242px','square map lifts the 420px first-draw floor');
  fresh.node.style.width='1000px';fresh.node.style.height='1100px';context.resize(fresh);await new Promise(setImmediate);
  assert.equal(fresh.node.style.width,'1000px','fit happens once; a later user frame is kept');
  const copied=make({squareHeatmapAdapted:true});context.resize(copied);await new Promise(setImmediate);
  assert.equal(copied.node.style.width,'1000px');assert.equal(copied.node.style.height,'1100px');
  const hydrating=make({hydrating:true});context.resize(hydrating);await new Promise(setImmediate);hydrating.hydrating=false;context.resize(hydrating);await new Promise(setImmediate);
  assert.equal(hydrating.node.style.width,'1000px','a frame first seen while hydrating is never fitted');
  // Parked module controls sit far to the left of the card (card_figure.css); they do not count as drawn content.
  const parked=make();parked.node.getBoundingClientRect=()=>({top:0,left:0});
  const map={getBoundingClientRect:()=>({left:20,right:540,bottom:300,width:520,height:242})},chrome={getBoundingClientRect:()=>({left:-100000,right:-99440,bottom:451,width:560,height:182})};
  parked.node.querySelector=s=>s==='.tc-content'?{scrollTop:0,querySelectorAll:()=>[map,chrome]}:null;
  context.resize(parked);await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(parked.node.style.height,'420px','parked controls are ignored: the drawn map (300 + 20) sits under the 420 floor');
  console.log('PASS new square heatmap card fits its map once; copied/hydrating frames kept; min-height floor lifted');
})().catch(e=>{console.error(e);process.exit(1)});
