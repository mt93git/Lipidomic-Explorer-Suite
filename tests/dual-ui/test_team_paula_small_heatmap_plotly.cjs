const {chromium}=require('../browser/ci/node_modules/playwright');
const {execFileSync}=require('node:child_process');const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const plotly=execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
 const src=fs.readFileSync('www/team/js/canvas.js','utf8');const resize=src.slice(src.indexOf('  function resize(r) {'),src.indexOf('  function moveNode('));

 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<div id="node" style="height:600px"><div class="tc-content"><div id="heat" style="width:620px;height:420px;min-height:420px!important"></div></div></div>');await page.addScriptTag({path:plotly});
 await page.evaluate(()=>{const x=Array.from({length:9},(_,i)=>'L'+i),y=['A','B'];return Plotly.newPlot('heat',[{type:'heatmap',x,y,z:y.map((g,j)=>x.map((l,i)=>i-j)),xgap:0,ygap:0,colorbar:{orientation:'h',x:0,xanchor:'left',y:1.02,yanchor:'bottom',lenmode:'pixels',len:250,thickness:10}}],{width:520,height:242,meta:{teamHeatmap:{geometry:'square-horizontal'}},margin:{l:210,r:20,t:70,b:140,autoexpand:false},xaxis:{type:'category',automargin:false,constrain:'domain',domain:[0,144/290]},yaxis:{type:'category',automargin:false,scaleanchor:'x',scaleratio:1,constrain:'domain'}},{responsive:true});});
 await page.addScriptTag({content:"function sourceKey(){return 'results_dashboard-plot_heat'};function isClassHeatmap(){return false};function dimensionTrace(){};"+resize+";window.record={node:document.getElementById('node'),el:document.getElementById('heat')};"});
 for(const width of [620,820]){
 await page.evaluate(w=>{record.el.style.width=w+'px';resize(record)},width);await page.waitForTimeout(450);
 const sizes=await page.evaluate(()=>{const g=record.el;return {x:g._fullLayout.xaxis._length/g.data[0].x.length,y:g._fullLayout.yaxis._length/g.data[0].y.length,width:g._fullLayout.width,height:g._fullLayout.height,imageWidth:Number(g.querySelector('.heatmaplayer image').getAttribute('width')),imageHeight:Number(g.querySelector('.heatmaplayer image').getAttribute('height'))}});
 console.log(width,sizes);assert(Math.abs(sizes.x-16)<.2);assert(Math.abs(sizes.y-16)<.2);assert.equal(sizes.imageWidth,144);assert.equal(sizes.imageHeight,32);
 }
 await page.evaluate(async()=>{const g=record.el;await Plotly.restyle(g,{x:[['A','B']],y:[Array.from({length:9},(_,i)=>'L'+i)],z:[Array.from({length:9},(_,i)=>[i,i-1])]});await Plotly.relayout(g,{'xaxis.autorange':true,'yaxis.autorange':true});resize(record)});await page.waitForTimeout(450);
 const swap=await page.evaluate(()=>{const g=record.el;return {x:g._fullLayout.xaxis._length/2,y:g._fullLayout.yaxis._length/9,xd:g._fullLayout.xaxis.domain,yd:g._fullLayout.yaxis.domain,xr:g._fullLayout.xaxis.range,yr:g._fullLayout.yaxis.range,height:g._fullLayout.height,style:g.style.height,margin:g._fullLayout.margin}});console.log('swap',swap);assert(Math.abs(swap.x-16)<.2);assert(Math.abs(swap.y-16)<.2);
 console.log('PASS actual R-bundled Plotly: Canvas resize keeps16px square cells at620/820 and swapped orientation');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
