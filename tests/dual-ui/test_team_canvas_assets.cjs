const assert = require('assert');
const path = require('path');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true}); const page=await browser.newPage();
  await page.setContent('<div></div>'); await page.addScriptTag({path:path.resolve('www/team/js/canvas_assets.js')}); await page.addScriptTag({path:path.resolve('www/team/js/illustrations.js')});
  const result=await page.evaluate(()=>({list:window.TeamCanvasAssets.list,svg:window.TeamCanvasAssets.svg('lipid-class-taxonomy','#377eb8')}));
  assert.equal(result.list[0].id,'lipid-class-taxonomy'); assert.match(result.svg,/Global Lipidomics/); assert.match(result.svg,/Glycerophospholipids/); assert.match(result.svg,/data-team-illustration-kind="schematic-taxonomy"/);
  assert.ok(!/2,?300|2,?280|Total Lipids/.test(result.svg),'asset must not hardcode a lipid count');
  assert.equal(await page.evaluate(()=>{try{window.TeamCanvasAssets.svg('unknown');return false;}catch(e){return true;}}),true);
  assert.equal(await page.evaluate(()=>{try{window.TeamCanvasAssets.svg('lipid-class-taxonomy','url(evil)');return false;}catch(e){return true;}}),true);
  assert.equal(await page.evaluate(()=>window.TeamIllustrations.list.some(x=>x.id==='lipid-class-taxonomy')),true);
  assert.match(await page.evaluate(()=>window.TeamIllustrations.svg('lipid-class-taxonomy','#377eb8')),/Global Lipidomics/);
  const components=['donor-person','cohort-label','connector-arrow','lipid-class-chip','sample-vial-component'];
  for(const id of components){const markup=await page.evaluate(id=>window.TeamIllustrations.svg(id,'#377eb8'),id);assert.match(markup,/data-team-illustration-version="1"/);assert.match(markup,/schematic-not-to-scale/);}
 const custom=await page.evaluate(()=>window.TeamIllustrations.svg('cohort-label','#377eb8','SC-SteadyState')); assert.match(custom,/SC-SteadyState/); assert.match(custom,/viewBox="24 44 192 72"/); assert.ok(!custom.includes('textLength='),'cohort label uses unstretched type'); assert.ok(!custom.includes('M48 80h144'),'label placeholder line removed'); assert.ok(!custom.includes('M28 143h184'),'primitive baseline removed'); assert.ok(!custom.includes('<script'));
 const chip=await page.evaluate(()=>window.TeamIllustrations.svg('lipid-class-chip','#377eb8','Phospholipids')); assert.match(chip,/Phospholipids/); assert.match(chip,/viewBox="24 44 192 72"/); assert.match(chip,/x="120"/); assert.ok(!chip.includes('textLength=')); assert.ok(!chip.includes('M86 80h98'),'chip placeholder line removed'); assert.ok(!chip.includes('M28 143h184'),'primitive baseline removed');
  const geometry=await page.evaluate(()=>{const svg=window.TeamIllustrations.svg('lipid-class-taxonomy','#377eb8');document.body.innerHTML=svg;const root=document.querySelector('svg');const rects=[...root.querySelectorAll('rect')].map(r=>({x:+r.getAttribute('x'),y:+r.getAttribute('y'),w:+r.getAttribute('width'),h:+r.getAttribute('height')}));return {view:root.getAttribute('viewBox'),rects};});
  assert.equal(geometry.view,'0 0 980 380');
  for(let i=0;i<geometry.rects.length;i++)for(let j=i+1;j<geometry.rects.length;j++){const a=geometry.rects[i],b=geometry.rects[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'taxonomy boxes overlap');}
  assert.match(await page.evaluate(()=>window.TeamIllustrations.svg('study-workflow-scd')),/Healthy/);
  assert.match(await page.evaluate(()=>window.TeamIllustrations.svg('study-workflow-scd')),/schematic-not-to-scale/);
  assert.ok(!/2,?300|2,?280|2031|67 samples/.test(await page.evaluate(()=>window.TeamIllustrations.svg('study-workflow-scd'))));
  await browser.close(); console.log('PASS team canvas taxonomy asset');
})().catch(e=>{console.error(e);process.exitCode=1;});
