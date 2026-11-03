const {chromium}=require('../browser/ci/node_modules/playwright'),path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(8000);
 await page.setContent('<div class="rd-card"><h3>Test PCA</h3><div id="plot" class="plotly html-widget-output" style="width:480px;height:320px"></div></div>');
 for(const f of ['/tmp/team-plotly-rtx.min.js','www/team/vendor/jspdf.umd.min.js','www/team/vendor/svg2pdf.umd.min.js'])await page.addScriptTag({path:path.resolve(f)});
 await page.evaluate(()=>Plotly.newPlot('plot',[{type:'scatter',mode:'markers',x:[-1,0,2],y:[2,0,-1]}],{width:480,height:320,title:'Test PCA'}));
 await page.evaluate(()=>{window.exportImageOptions=[];window.exportProbe=false;const original=Plotly.toImage;Plotly.toImage=function(gd,options){exportImageOptions.push({format:options.format,width:options.width,height:options.height,scale:options.scale});if(window.exportProbe){if(options.format==='svg')return Promise.resolve('data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#fff"/></svg>'));const c=document.createElement('canvas');c.width=1;c.height=1;return Promise.resolve(c.toDataURL('image/png'));}return original.call(this,gd,options);};});
 await page.addScriptTag({path:path.resolve('www/team/js/plot_exports.js')});
 const sizes={};
 for(const format of ['SVG','PNG','JPG','PDF']){
   const automatic=page.waitForEvent('download',{timeout:8000});await page.getByRole('button',{name:'Download '+format+' Test PCA',exact:true}).click();const download=await automatic;
   const bytes=fs.readFileSync(await download.path());assert(bytes.length>500);sizes[format]=bytes.length;
   if(format==='SVG')assert(bytes.toString().includes('<svg'));if(format==='PNG')assert.equal(bytes.subarray(1,4).toString(),'PNG');if(format==='PDF')assert(bytes.toString().startsWith('%PDF-'));if(format==='JPG')assert.equal(bytes.readUInt16BE(0),0xffd8);
   const retry=page.waitForEvent('download');await page.getByRole('link',{name:'Save '+format+' file',exact:true}).click();assert(fs.readFileSync(await(await retry).path()).equals(bytes));
   assert.equal(await page.locator('.plot-export-fallback').count(),1);
 }
 await page.evaluate(()=>{const node=document.createElement('div');node.className='tc-node';node.style.transformOrigin='top left';document.querySelector('.rd-card').before(node);node.appendChild(document.querySelector('.rd-card'));window.TeamCanvasViewport={scale:1};window.exportProbe=true;window.pdfPageOptions=[];window.jspdf.jsPDF=function(options){pdfPageOptions.push(options);this.svg=async function(){};this.output=function(){return new Blob(['%PDF-probe']);};};});
 for(const scale of [.64,1,1.5]){
   await page.evaluate(scale=>{document.querySelector('.tc-node').style.transform='scale('+scale+')';window.TeamCanvasViewport.scale=scale;},scale);
   for(const format of ['SVG','PNG','PDF']){
     const previous=await page.evaluate(()=>({images:exportImageOptions.length,pdfs:pdfPageOptions.length}));
     await page.getByRole('button',{name:'Download '+format+' Test PCA',exact:true}).click();
     await page.waitForFunction(({images,pdfs,format})=>exportImageOptions.length>images&&(format!=='PDF'||pdfPageOptions.length>pdfs),{images:previous.images,pdfs:previous.pdfs,format});
     await page.waitForFunction(format=>document.querySelector('.plot-export-status')?.textContent.includes(format+' is ready'),format);
     const size=await page.evaluate(()=>exportImageOptions.at(-1));assert.equal(size.width,480,format+' export keeps logical width at viewport scale '+scale);assert.equal(size.height,320,format+' export keeps logical height at viewport scale '+scale);
     if(format==='PDF')assert.deepEqual(await page.evaluate(()=>pdfPageOptions.at(-1).format),[480,320],'PDF page dimensions use the same zoom-independent intrinsic plot size');
   }
 }
 console.log(JSON.stringify(sizes));console.log('PASS real Plotly PNG/SVG/JPG/PDF bytes, direct downloads and same-plot recovery links');
 console.log('PASS live canvas SVG/PNG/PDF intrinsic dimensions remain 480x320 at 64%, 100%, and 150% viewport zoom');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
