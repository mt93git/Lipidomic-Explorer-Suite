// Real Plotly fixture: an opt-in publication preset changes presentation only.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const plotly=execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
 assert.ok(plotly);const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<div id="plot"></div><div id="editor"></div>');
  await page.addScriptTag({path:plotly});await page.addScriptTag({path:path.resolve('www/team/js/plot_editor.js')});
  const result=await page.evaluate(async()=>{
   const gd=document.getElementById('plot');
   await Plotly.newPlot(gd,[
    {name:'Healthy',x:[0,1],y:[1,2],marker:{color:'#010203'}},
    {name:'SC-SteadyState',x:[0,1],y:[3,4],marker:{color:'#040506'}},
    {name:'SC-PainCrisis',x:[0,1],y:[5,6],marker:{color:'#070809'}},
    {name:'Unknown group',x:[0,1],y:[7,8],marker:{color:'#0a0b0c'}},
    {name:'Crisis',x:[0,1],y:[9,10],marker:{color:[0.2,0.8],colorscale:'Viridis'}},
    {name:'Pain',legendgroup:'Healthy',x:[0,1],y:[11,12],marker:{color:'#0d0e0f'}},
    {name:'Exp',x:[0,1],y:[13,14],marker:{color:'#101112'}}
   ],{paper_bgcolor:'#eeeeee',font:{family:'Georgia',color:'#333333'},xaxis:{range:[-1,6],zeroline:true,showgrid:true},yaxis:{range:[0,15],zeroline:false},annotations:[{text:'Scientific p = 0.02',x:0,y:2}]});
   const numerical=()=>JSON.stringify(gd.data.map(t=>({x:t.x,y:t.y,type:t.type,transforms:t.transforms})));
   const before=numerical(),ranges=JSON.stringify([gd.layout.xaxis.range,gd.layout.yaxis.range]);
   const initial={layout:{'title.text':'Actual PCA'},traces:[]};const initialJSON=JSON.stringify(initial);
   const preview=TeamPlotEditor.publicationStyle(gd,initial);
   const pure=initialJSON===JSON.stringify(initial)&&gd.layout.paper_bgcolor==='#eeeeee';
   let state={},pending=Promise.resolve();const host=document.getElementById('editor');
   TeamPlotEditor.mount({container:host,getPlot:()=>gd,getState:()=>state,onChange:n=>{state=n;pending=TeamPlotEditor.apply(gd,n);}});
   const click=text=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text).click();
   click('Publication style');await pending;
   const colors=gd.data.map(t=>t.marker.color),font=gd.layout.font.family,bg=gd.layout.paper_bgcolor;
   const preserved=before===numerical()&&ranges===JSON.stringify([gd.layout.xaxis.range,gd.layout.yaxis.range]);
   const zeros=[gd.layout.xaxis.zeroline,gd.layout.yaxis.zeroline],annotation=gd.layout.annotations[0].text;
   const grid=gd.layout.xaxis.showgrid,line=gd.layout.xaxis.linewidth;
   click('Undo');await pending;
   const undo={color:gd.data[0].marker.color,font:gd.layout.font.family,bg:gd.layout.paper_bgcolor};
   const duplicate={layout:{},data:[{name:'Healthy'},{name:'Healthy'}]};
   return {pure,colors,font,bg,preserved,zeros,annotation,grid,line,undo,duplicate:TeamPlotEditor.publicationStyle(duplicate,{}).traces,previewTitle:preview.layout['title.text']};
  });
  assert.ok(result.pure);assert.ok(result.preserved);
  assert.deepEqual(result.colors,['#7A7A7A','#377eb8','#d82332','#0a0b0c',[0.2,0.8],'#0d0e0f','#101112']);
  assert.equal(result.font,'Arial');assert.equal(result.bg,'#ffffff');assert.equal(result.grid,false);assert.equal(result.line,.75);
  assert.deepEqual(result.zeros,[true,false]);assert.equal(result.annotation,'Scientific p = 0.02');
  assert.deepEqual(result.undo,{color:'#010203',font:'Georgia',bg:'#eeeeee'});
  assert.deepEqual(result.duplicate,[]);assert.equal(result.previewTitle,'Actual PCA');
  console.log('PASS: publication preset is opt-in, undoable, and preserves numerical data, ranges, reference zero lines and scientific annotations.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
