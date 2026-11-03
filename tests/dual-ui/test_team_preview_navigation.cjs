const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('../browser/ci/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const p=await browser.newPage({viewport:{width:1512,height:806}});
 const markup=execFileSync('Rscript',['--vanilla','-e','source("R/frontends/team/canvas.R");cat(as.character(team_canvas_ui()))'],{encoding:'utf8'});
 await p.setContent('<body>'+markup+'</body>');
 await p.addStyleTag({path:'www/team/css/canvas_preview.css'});
 await p.addStyleTag({content:'body{margin:0;font:14px Arial}#team-canvas-root{width:100%;box-sizing:border-box}#tc-workspace-panel[hidden]{display:none}'});
 await p.evaluate(()=>{let url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#315c89"/></svg>');window.fixture={state:{version:'1',nodes:Array.from({length:3},(_,i)=>({id:'plot'+i,label:'Plot '+i,x:0,y:i*500,width:400,height:400,finished:{url,stale:false}}))},ready:true};window.TeamCanvas={previewState:()=>structuredClone(fixture)};});
 await p.addScriptTag({path:'www/team/js/canvas_preview.js'});
 await p.getByRole('tab',{name:'Print preview',exact:true}).click();
 await p.locator('.tc-page-settings>summary').click();
 await p.locator('.tc-preview-layout').selectOption('pages');
 await p.locator('.tc-paper').nth(2).waitFor();
 const source=await p.evaluate(()=>JSON.stringify(fixture));
 const results=[];
 for(const width of [1512,390]){
  await p.setViewportSize({width,height:806});
  await p.getByRole('button',{name:'Reset print preview zoom to 100%',exact:true}).click();
  await p.getByRole('button',{name:'Zoom in print preview',exact:true}).click();
  let r=await p.evaluate(()=>{let v=document.querySelector('.tc-preview-pages');v.scrollTop=v.scrollHeight;v.scrollLeft=v.scrollWidth;let a=v.getBoundingClientRect(),b=v.lastElementChild.getBoundingClientRect();return{width:innerWidth,client:v.clientHeight,scroll:v.scrollHeight,pageBottom:b.bottom,viewportBottom:a.bottom,pageRight:b.right,viewportRight:a.right,zoom:document.querySelector('[aria-label="Reset print preview zoom to 100%"]').textContent}});
  assert(r.scroll>r.client);assert(r.pageBottom<=r.viewportBottom && r.pageBottom>r.viewportBottom-70,'last page bottom reachable');assert(r.pageRight<=r.viewportRight,'right edge reachable');assert.equal(r.zoom,'125%');
  await p.getByRole('button',{name:'Fit whole page',exact:true}).click();
  const fit=await p.evaluate(()=>{let v=document.querySelector('.tc-preview-pages'),s=v.firstElementChild;return{vh:v.clientHeight,vw:v.clientWidth,h:s.offsetHeight,w:s.offsetWidth,left:v.scrollLeft,top:v.scrollTop}});
  assert(fit.h<=fit.vh);assert(fit.w<=fit.vw);assert.equal(fit.top,0);
  await p.getByRole('button',{name:'Fit page width',exact:true}).click();
  assert(await p.evaluate(()=>{let v=document.querySelector('.tc-preview-pages');return v.scrollWidth<=v.clientWidth+1}));
  results.push({scroll:r,fit});
 }
 assert.equal(await p.evaluate(()=>JSON.stringify(fixture)),source,'zoom cannot change scientific or figure state');
 // Print iframe must reset the screen-only pixel dimensions.
 await p.evaluate(()=>{window.printResult=null;const append=document.body.appendChild.bind(document.body);document.body.appendChild=function(el){const value=append(el);if(el.tagName==='IFRAME'){el.contentWindow.focus=()=>{};el.contentWindow.print=()=>{window.printResult=Array.from(el.contentDocument.querySelectorAll('.tc-paper')).map(e=>({width:e.style.width,height:e.style.height,rect:e.getBoundingClientRect().toJSON()}));};}return value;};});
 await p.getByRole('button',{name:'Print',exact:true}).click();
 await p.waitForFunction(()=>window.printResult!==null);
 const printed=await p.evaluate(()=>printResult);assert.equal(printed.length,3);for(const sheet of printed){assert.equal(sheet.width,'');assert.equal(sheet.height,'');assert(Math.abs(sheet.rect.width-816)<1);assert(Math.abs(sheet.rect.height-1056)<1);}
 console.log(JSON.stringify({results,printed},null,2));console.log('PASS preview zoom, desktop/mobile scroll to final page, fit modes, unchanged source and physical print dimensions');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
