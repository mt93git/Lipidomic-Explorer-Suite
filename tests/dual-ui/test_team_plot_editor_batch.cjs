// Plot editor replay: one restyle per attribute set (not per trace) with the same result,
// and no relayout when every layout value already matches. Run from the repository root.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const library=execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
 const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();await page.setContent('<div id="plot"></div>');await page.addScriptTag({path:library});await page.addScriptTag({path:path.resolve('www/team/js/plot_editor.js')});
  const r=await page.evaluate(async()=>{
   const gd=document.getElementById('plot');
   const traces=Array.from({length:30},(_,i)=>({type:'scatter',mode:'markers',name:'Series '+i,x:[1,2],y:[i,i+1],marker:{color:'#000000'}}));
   await Plotly.newPlot(gd,traces,{margin:{t:10},font:{size:12}});
   const colors=traces.map((_,i)=>'#'+(i*7+16).toString(16).padStart(2,'0')+'3366');
   let restyles=0,relayouts=0;const restyle=Plotly.restyle,relayout=Plotly.relayout;
   Plotly.restyle=function(){restyles++;return restyle.apply(this,arguments);};Plotly.relayout=function(){relayouts++;return relayout.apply(this,arguments);};
   const state={layout:{'font.size':12},traces:colors.map((c,i)=>({index:i,color:c}))};
   await TeamPlotEditor.apply(gd,state,{strictIdentity:false});
   const first={restyles,relayouts,colors:gd.data.map(t=>t.marker.color)};restyles=0;relayouts=0;
   await TeamPlotEditor.apply(gd,state,{strictIdentity:false});
   return {first,again:{restyles,relayouts},expected:colors,x:gd.data.map(t=>t.x)};
  });
  assert.deepEqual(r.first.colors,r.expected,'every trace gets its own colour');
  assert.equal(r.first.restyles,1,'30 trace colour patches are one restyle');
  assert.equal(r.first.relayouts,0,'font.size already 12: no relayout');
  assert.deepEqual(r.again,{restyles:0,relayouts:0},'an unchanged replay touches nothing');
  assert.ok(r.x.every(x=>JSON.stringify(x)==='[1,2]'),'data arrays unchanged');
  console.log('PASS plot editor batched replay');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
