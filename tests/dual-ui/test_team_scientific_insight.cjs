const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('../browser/ci/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="plot-one" class="shiny-plot-output"><svg></svg></div>');
  await page.addStyleTag({path:path.resolve('www/team/css/scientific_insight.css')});
  await page.evaluate(()=>{window.sent=[];window.saved={};window.handlers={};window.Shiny={setInputValue:(k,v)=>sent.push({k,v}),addCustomMessageHandler:(k,f)=>handlers[k]=f};window.TeamCanvas={getInsight:id=>saved[id]||null,setInsight:(id,n)=>{saved[id]=n;return true;},checkpoint:()=>Promise.resolve()};});
  await page.addScriptTag({path:path.resolve('www/team/js/scientific_insight.js')});
  const card=page.locator('.team-scientific-insight[data-plot-id="plot-one"]');
  await card.getByRole('button',{name:'Scientific insight',exact:true}).click();
  await page.evaluate(()=>{window.note={paragraph:'Class-level evidence [PMID:123].',context_label:'Selected feature',searched_at:'2026-10-29 14:00 UTC',fingerprint:'a'.repeat(64),sources:[{pmid:'123',title:'Primary paper',url:'https://pubmed.ncbi.nlm.nih.gov/123/',year:'2026'}]};handlers.team_scientific_insight({...note,plot_id:'plot-one',request_id:sent.at(-1).v.request_id,status:'ready'});});
  await card.getByRole('button',{name:'Update insight',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>saved['plot-one'].paragraph),'Class-level evidence [PMID:123].');
  // A completed response may later be invalidated by the server without a plot redraw.
  await page.evaluate(()=>{window.completed=sent.at(-1).v.request_id;handlers.team_scientific_insight({plot_id:'plot-one',request_id:completed,status:'stale'});});
  assert.equal(await page.evaluate(()=>saved['plot-one'].stale),true);
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  await page.evaluate(()=>{handlers.team_scientific_insight({...note,plot_id:'plot-one',request_id:sent.at(-1).v.request_id,status:'ready'});handlers.team_scientific_insight({plot_id:'plot-one',request_id:completed,status:'stale'});});
  assert.equal(await page.evaluate(()=>saved['plot-one'].stale),false,'old completed response cannot stale a newer note');
  await page.evaluate(()=>{window.completed=sent.at(-1).v.request_id;saved['plot-one'].paragraph='A newer note with the same context fingerprint';handlers.team_scientific_insight({plot_id:'plot-one',request_id:completed,status:'stale'});});
  assert.equal(await page.evaluate(()=>saved['plot-one'].stale),false,'matching fingerprint alone cannot stale replacement content');
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  await page.evaluate(()=>{handlers.team_scientific_insight({...note,plot_id:'plot-one',request_id:sent.at(-1).v.request_id,status:'ready'});window.completed=sent.at(-1).v.request_id;});
  await card.getByRole('button',{name:'Remove insight',exact:true}).click();
  await card.getByRole('button',{name:'Undo removal',exact:true}).click();
  await page.evaluate(()=>handlers.team_scientific_insight({plot_id:'plot-one',request_id:completed,status:'stale'}));
  assert.equal(await page.evaluate(()=>saved['plot-one'].stale),false,'remove/undo clears completed token');
  // A restore with identical content still changes ownership of the note.
  await page.evaluate(()=>{window.completed=sent.at(-1).v.request_id;window.dispatchEvent(new Event('team-canvas-restored'));handlers.team_scientific_insight({plot_id:'plot-one',request_id:completed,status:'stale'});});
  assert.equal(await page.evaluate(()=>saved['plot-one'].stale),false,'restore clears completed token');
  // Finish: actual snapshot nesting must keep the note visible and unmodified.
  await page.evaluate(()=>{const node=document.createElement('article');node.id='frozen';node.className='tc-node tc-finished';node.dataset.plotId='plot-one';node.innerHTML='<div class="tc-content" style="visibility:hidden"></div><div class="tc-snapshot"></div>';document.body.append(node);node.querySelector('.tc-content').append(document.getElementById('plot-one'));TeamScientificInsight.scan();});
  assert.equal(await page.locator('#frozen>.tc-snapshot>.team-scientific-insight').count(),1);
  assert.equal(await card.locator('.team-insight-body').isVisible(),true);
  assert.equal(await page.evaluate(()=>saved['plot-one'].stale),false,'Finish is not a data change');
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  assert.equal(await page.evaluate(()=>sent.at(-1).v.refresh),true);
  assert.equal(await page.evaluate(()=>sent.at(-1).v.fingerprint),'a'.repeat(64));
  await page.evaluate(()=>handlers.team_scientific_insight({plot_id:'plot-one',request_id:sent.at(-1).v.request_id,status:'error',message:'PubMed temporarily unavailable.'}));
  assert.equal(await card.locator('.team-insight-body').textContent(),'Class-level evidence [PMID:123].');
  assert.match(await card.locator('.team-insight-status').textContent(),/PubMed temporarily unavailable/);
  assert.equal(await card.locator('a').count(),1);
  // Remove while awaiting checkpoint: request never starts; response cannot resurrect it.
  await page.evaluate(()=>{TeamCanvas.checkpoint=()=>new Promise(r=>window.ack=r);window.before=sent.length;});
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  await card.getByRole('button',{name:'Remove insight',exact:true}).click();
  await page.evaluate(()=>ack());
  assert.equal(await page.evaluate(()=>sent.length===before),true);
  assert.equal(await page.evaluate(()=>saved['plot-one']),null);
  await card.getByRole('button',{name:'Undo removal',exact:true}).click();
  assert.equal(await card.locator('.team-insight-body').isVisible(),true);
  await page.evaluate(()=>TeamCanvas.checkpoint=()=>Promise.resolve());
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  await page.evaluate(()=>window.late=sent.at(-1).v.request_id);
  await card.getByRole('button',{name:'Remove insight',exact:true}).click();
  await page.evaluate(()=>handlers.team_scientific_insight({...note,plot_id:'plot-one',request_id:late,status:'ready'}));
  assert.equal(await page.evaluate(()=>saved['plot-one']),null);
  // Restore saved note, then another checkpoint with no note; no old DOM leak.
  await page.evaluate(()=>{saved['plot-one']={...note,stale:false};window.dispatchEvent(new Event('team-canvas-restored'));});
  assert.equal(await card.locator('.team-insight-body').isVisible(),true);
  assert.match(await card.locator('.team-insight-caution').textContent(),/Saved literature note/);
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  await page.evaluate(()=>{window.late=sent.at(-1).v.request_id;saved={};window.dispatchEvent(new Event('team-canvas-restored'));handlers.team_scientific_insight({...note,plot_id:'plot-one',request_id:late,status:'ready'});});
  assert.equal(await card.locator('.team-insight-result').isVisible(),false);
  assert.equal(await page.evaluate(()=>saved['plot-one']||null),null);
  // Late response after Edit also rejected.
  await page.evaluate(()=>{saved['plot-one']={...note,stale:false};window.dispatchEvent(new Event('team-canvas-restored'));});
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  await page.evaluate(()=>{window.late=sent.at(-1).v.request_id;document.querySelector('.tc-snapshot').remove();document.querySelector('#frozen').classList.remove('tc-finished');document.querySelector('.tc-content').style.visibility='visible';TeamScientificInsight.scan();handlers.team_scientific_insight({...note,paragraph:'Late unwanted replacement',plot_id:'plot-one',request_id:late,status:'ready'});});
  assert.equal(await page.evaluate(()=>saved['plot-one'].paragraph),'Class-level evidence [PMID:123].');
  assert.equal(await page.evaluate(()=>saved['plot-one'].stale),true);
  // Update a live saved note must bypass cache too. Unsafe server payload is rejected.
  await card.getByRole('button',{name:'Update insight',exact:true}).click();
  assert.equal(await page.evaluate(()=>sent.at(-1).v.refresh),true);
  await page.evaluate(()=>handlers.team_scientific_insight({...note,sources:[{...note.sources[0],url:'https://evil.test/123/'}],plot_id:'plot-one',request_id:sent.at(-1).v.request_id,status:'ready'}));
  assert.equal(await card.locator('a[href*="evil"]').count(),0);
  assert.equal(await page.evaluate(()=>saved['plot-one'].sources[0].url),'https://pubmed.ncbi.nlm.nih.gov/123/');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await card.getByRole('button',{name:'Update insight',exact:true}).evaluate(e=>e.getBoundingClientRect().height>=44));
  assert.deepEqual(errors,[]);
  console.log('PASS saved insight: Finish visibility, refresh/cache/ACK, failed refresh preservation, delete/undo, late responses, checkpoint switch, Edit cancellation, safe sources, mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
