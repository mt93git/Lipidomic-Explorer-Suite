const fs=require('fs'),assert=require('assert'),{execFileSync}=require('child_process');
const {chromium}=require('../browser/ci/node_modules/playwright');
(async()=>{
 execFileSync('Rscript',['--vanilla','-e',"library(shiny);source('R/guided_preparation_controls.R');source('R/guided_workflow.R');team_workspace_enabled<-function()TRUE;writeLines(as.character(team_simple_review_ui()),'/tmp/team-review-layout.html')"]);
 let html=fs.readFileSync('/tmp/team-review-layout.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const p=await browser.newPage();
 await p.setContent('<body class="team-workspace-app" data-tw-screen="review-single" data-guide-analysis="false"><div id="team-workspace"><div class="tw-journey"><div class="tw-journey-copy"><h2>Review your data</h2><p>Adjust detection and watch the PCA update.</p></div></div></div>'+html+'</body>');
 for(const f of ['workspace.css','workspace_minimal.css','review_live.css'])await p.addStyleTag({content:fs.readFileSync('www/team/css/'+f,'utf8')});
 await p.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;padding:16px;font:14px system-ui}.guide-heading{display:none}'});
 await p.evaluate(()=>{document.querySelector('#guide_review_statistics').innerHTML='<table><tr><td>Samples</td><td>67</td></tr><tr><td>Lipids</td><td>2031</td></tr></table>';document.querySelector('#guide_review_data').innerHTML='<table><tr>'+Array.from({length:68},(_,i)=>'<th>Sample_column_'+i+'</th>').join('')+'</tr></table>';});
 const results=[];
 for(const [width,height] of [[1512,806],[1366,768],[1024,768],[768,1024],[390,844]]){
  await p.setViewportSize({width,height});
  const r=await p.evaluate(()=>{const b=s=>{let r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,rail:b('.tw-review-rail'),plot:b('#qc_pca_tab-guided_qc_plot'),tableOpen:document.querySelector('.tw-review-table').open}});
  assert.equal(r.overflow,false,'page overflow at '+width);assert.equal(r.tableOpen,false);
  if(width>=1024){assert(r.plot.x>r.rail.x+r.rail.w,'side-by-side at '+width);assert(r.plot.w>500,'useful PCA width');}
  else assert(r.plot.y>r.rail.y+r.rail.h,'stack on small screens');
  await p.locator('.tw-review-table>summary').click();assert(await p.locator('#guide_review_data').isVisible());
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'table must scroll locally');
  await p.locator('.tw-review-table>summary').click();results.push(r);
 }
 await browser.close();console.log(JSON.stringify(results,null,2));console.log('PASS responsive Review layout, local table overflow and disclosure access');
})().catch(e=>{console.error(e);process.exit(1)});
