const {chromium}=require('../browser/ci/node_modules/playwright'),path=require('path'),fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
(async()=>{const out=process.env.PAULA_EXPORT_EVIDENCE;assert(out);fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({acceptDownloads:true});await page.setContent('<div class="rd-card"><h3>Overlay</h3><div id="instance" class="shiny-plot-output" style="width:480px;height:320px"><img alt="stale" style="display:none" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><div class="gc-plot" style="width:480px;height:320px"></div></div></div>');
 for(const f of ['/tmp/team-plotly-rtx.min.js','www/team/vendor/jspdf.umd.min.js','www/team/vendor/svg2pdf.umd.min.js'])await page.addScriptTag({path:path.resolve(f)});
 await page.evaluate(()=>Plotly.newPlot(document.querySelector('.gc-plot'),[{type:'scatter',mode:'markers',name:'Visible edited',x:[-1,0,1],y:[-1,0,1],marker:{color:'#ff0000'}},{type:'scatter',name:'Hidden condition',x:[-1],y:[0],visible:false}],{width:480,height:320,title:'Edited overlay',xaxis:{range:[-1,1],tickvals:[-1,0,1]},yaxis:{range:[-1,1],tickvals:[-1,0,1]}}));
 await page.evaluate(()=>{window.rafCount=0;const original=window.requestAnimationFrame;window.requestAnimationFrame=function(fn){rafCount++;return original.call(window,fn);};});
 await page.addScriptTag({path:path.resolve('www/team/js/plot_exports.js')});
 // A renderer can appear after the static toolbar is mounted. Its caption
 // must update once, then the mutation observer must settle rather than loop.
 await page.evaluate(()=>{const gd=document.querySelector('.gc-plot');gd.style.display='none';document.querySelector('#instance').appendChild(document.createElement('i'));});
 await page.waitForFunction(()=>document.querySelector('.plot-export-bar span').textContent.includes('raster image'));
 await page.evaluate(()=>{document.querySelector('.gc-plot').style.display='block';document.querySelector('#instance i').remove();});
 await page.waitForFunction(()=>document.querySelector('.plot-export-bar span').textContent.includes('as shown'));
 await page.waitForTimeout(150);const before=await page.evaluate(()=>rafCount);await page.waitForTimeout(150);const after=await page.evaluate(()=>rafCount);assert(after-before<=1,'mutation observer must settle while idle: '+before+' -> '+after);
 for(const format of ['SVG','PDF','PNG','JPG']){const d=page.waitForEvent('download');await page.locator('.plot-export-button',{hasText:format}).first().click();await(await d).saveAs(path.join(out,'overlay.'+format.toLowerCase()));}
 const svg=fs.readFileSync(path.join(out,'overlay.svg'),'utf8');assert(svg.includes('Edited overlay'));assert(svg.includes('rgb(255, 0, 0)'));assert(!svg.includes('Hidden condition'));assert(svg.includes('−1'));assert(svg.includes('<path'));
 const txt=cp.execFileSync('pdftotext',[path.join(out,'overlay.pdf'),'-'],{encoding:'utf8'});assert(txt.includes('-1'),txt);assert(txt.includes('Edited overlay'));assert(!txt.includes('Hidden condition'));fs.writeFileSync(path.join(out,'overlay-pdf.txt'),txt);
 assert(await page.evaluate(()=>document.querySelector('.gc-plot').textContent.includes('−1')),'screen minus unchanged');
 // Actual heatmap download exercises both axis and colorbar tick labels.
 await page.evaluate(()=>Plotly.react(document.querySelector('.gc-plot'),[{type:'heatmap',z:[[-1,0],[0,1]],x:[-1,1],y:[-1,1],zmin:-1,zmax:1,colorscale:[[0,'#0047ab'],[0.5,'#ffffff'],[1,'#ff0000']],colorbar:{tickvals:[-1,-0.5,0,0.5,1]}}],{width:480,height:320,xaxis:{tickvals:[-1,1]},yaxis:{tickvals:[-1,1]}}));
 for(const format of ['SVG','PDF']){const d=page.waitForEvent('download');await page.locator('.plot-export-button',{hasText:format}).first().click();await(await d).saveAs(path.join(out,'heatmap.'+format.toLowerCase()));}
 const heatSvg=fs.readFileSync(path.join(out,'heatmap.svg'),'utf8');assert(heatSvg.includes('−0.5'));assert(heatSvg.includes('−1'));assert(/rgb\(0, 71, 171\)|#0047ab/i.test(heatSvg));assert(/rgb\(255, 0, 0\)|#ff0000/i.test(heatSvg));
 const heatText=cp.execFileSync('pdftotext',[path.join(out,'heatmap.pdf'),'-'],{encoding:'utf8'});assert(heatText.includes('-0.5'));assert((heatText.match(/-1/g)||[]).length>=2,'axis and colorbar negatives must survive PDF');fs.writeFileSync(path.join(out,'heatmap-pdf.txt'),heatText);
 console.log('PASS visible edited overlay exported as SVG, PDF, PNG and JPG; SVG retains vectors and Unicode minus; PDF text contains ASCII negative ticks; hidden condition absent; live display unchanged');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
