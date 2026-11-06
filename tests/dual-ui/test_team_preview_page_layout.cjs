const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();
 await page.setContent('<main class="tc-preview-pages">'+Array.from({length:6},()=>'<article class="tc-paper" style="aspect-ratio:612/792"><figure class="tc-paper-figure" style="top:8%;left:8%;width:84%;height:85%">Figure</figure></article>').join('')+'</main>');
 await page.addStyleTag({path:path.resolve('www/team/css/canvas_preview.css')});
 for(const width of [1600,390]){
  await page.setViewportSize({width,height:1000});
  const bounds=await page.locator('.tc-paper').evaluateAll(nodes=>nodes.map(x=>{const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};}));
  for(let i=1;i<bounds.length;i++)assert.ok(bounds[i].top>=bounds[i-1].bottom+17,'preview pages must never overlap');
  for(const b of bounds){assert.ok(b.width<=width);assert.ok(Math.abs(b.height/b.width-792/612)<.02);}
 }
 console.log('PASS: six PDF preview pages retain their paper size without overlapping at desktop and mobile widths');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
