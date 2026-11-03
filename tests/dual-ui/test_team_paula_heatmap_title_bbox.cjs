const {chromium}=require('../browser/ci/node_modules/playwright');const {execFileSync}=require('child_process'),assert=require('assert/strict');
(async()=>{const b=await chromium.launch({headless:true});try{
 const page=await b.newPage();await page.setContent('<div id="heat"></div>');
 const plotly=execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();await page.addScriptTag({path:plotly});
 const actual=JSON.parse(execFileSync('Rscript',['--vanilla','-e',`source('R/results_dashboard.R');v<-rd_team_heatmap_view(matrix(1:18,9,2,dimnames=list(paste0('LPA(',1:9,')'),c('SC-SteadyState','SC-PainCrisis'))),c(34L,16L));cat(jsonlite::toJSON(list(left=v$margin$l,standoff=v$yaxis$title$standoff),auto_unbox=TRUE))`],{encoding:'utf8'}));
 const result=await page.evaluate(async(actual)=>{
   const gd=document.getElementById('heat'),x=Array.from({length:9},(_,i)=>'LPA('+i+')'),y=['SC-SteadyState','SC-PainCrisis'];
   const draw=async(left,standoff)=>{
     await Plotly.newPlot(gd,[{type:'heatmap',x,y,z:[x.map((_,i)=>i),x.map((_,i)=>-i)],xgap:0,ygap:0}],{width:520,height:242,margin:{l:left,r:20,t:70,b:140,autoexpand:false},font:{size:12},xaxis:{type:'category',domain:[0,144/(520-left-20)],constrain:'domain'},yaxis:{title:standoff==null?'Sample group':{text:'Sample group',standoff},type:'category',tickmode:'array',tickvals:y,ticktext:['SC-SteadyState (n=34)','SC-PainCrisis (n=16)'],automargin:false,scaleanchor:'x',scaleratio:1,constrain:'domain'}});
     const box=n=>{let r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};
     const title=box(gd.querySelector('.ytitle')),ticks=Array.from(gd.querySelectorAll('.ytick text')).map(box);
     const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
     return{left,standoff,title,ticks,overlap:ticks.some(t=>intersects(title,t)),xCell:gd._fullLayout.xaxis._length/9,yCell:gd._fullLayout.yaxis._length/2};
   };
   return{before:await draw(150,null),after:await draw(actual.left,actual.standoff)};
 },actual);console.log(JSON.stringify(result,null,2));assert(result.before.overlap);assert(!result.after.overlap);assert(result.after.title.x>=0);assert(Math.abs(result.after.xCell-16)<.1);assert(Math.abs(result.after.yCell-16)<.1);console.log('PASS actual Plotly bbox: baseline title intersects long group tick; margin210+standoff20 separates them and retains16px cells.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
