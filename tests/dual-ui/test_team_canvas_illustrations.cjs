// Team-only illustration nodes: persistence, safe assets and no plot regressions.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('../browser/ci/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  await page.setContent('<div id="team-canvas-root"><div class="tc-layout"><div class="tc-board"></div><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><button class="tc-library-toggle"></button></div><p class="tc-status"></p></div>');
  await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
  await page.evaluate(() => {
    window.TeamIllustrations = {list:[{id:'blood-tube',title:'Blood sample tube',category:'Sample context'}],svg:(id,color)=>`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#fff"/><circle cx="120" cy="90" r="45" fill="${color}"/></svg>`};
  });
  await page.evaluate(() => { window.TeamIllustrations = {list:[{id:'blood-tube',title:'Blood sample tube',category:'Sample context'},{id:'cohort-label',title:'Cohort label',category:'Study components'}],svg:(id,color,label)=>`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#fff"/><circle cx="120" cy="90" r="45" fill="${color}"/><text>${id==='cohort-label' ? String(label||'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&apos;'}[c])) : ''}</text></svg>`}; window.TeamCanvas.addIllustration('blood-tube'); window.TeamCanvas.addIllustration('cohort-label'); });
  const initialState = await page.evaluate(() => window.TeamCanvas.serialize());
  assert.equal(initialState.nodes.length,2); assert.equal(initialState.nodes[0].kind,'illustration'); assert.equal(initialState.nodes[0].assetId,'blood-tube');
  const cohort = page.locator('.tc-illustration').nth(1);
  await cohort.locator('input[type="text"]').fill('SC <steady> & control');
  const rendered = await cohort.locator('img').getAttribute('src');
  const renderedSvg = decodeURIComponent(rendered.split(',')[1]);
  assert.match(renderedSvg,/SC &lt;steady&gt; &amp; control/);
  await cohort.getByRole('button',{name:'Finish',exact:true}).click();
  assert.equal(await cohort.locator('.tc-snapshot').count(),1);
  const finishedSvg = decodeURIComponent((await cohort.locator('.tc-snapshot img').getAttribute('src')).split(',')[1]);
  assert.match(finishedSvg,/SC &lt;steady&gt; &amp; control/);
  const state = await page.evaluate(() => window.TeamCanvas.serialize());
  assert.equal(await page.evaluate(() => window.TeamCanvas.addIllustration('nope')),false);
  const invalid = {...state,nodes:[{...state.nodes[0],color:'javascript:alert(1)'}]};
  assert.equal(await page.evaluate(s=>{try{window.TeamCanvas.restore(s);return false;}catch(e){return true;}},invalid),true);
  state.nodes[1].finished.url = 'data:image/svg+xml;base64,' + Buffer.from(decodeURIComponent(state.nodes[1].finished.url.split(',')[1])).toString('base64');
  const archivedUrl = state.nodes[1].finished.url;
  await page.evaluate(() => { const prior = TeamIllustrations.svg; TeamIllustrations.svg = (...args) => prior(...args).replace('</svg>', '<text>New library style</text></svg>'); });
  await page.evaluate(s=>window.TeamCanvas.restore(s),state);
  assert.equal(await page.evaluate(() => TeamCanvas.serialize().nodes[1].finished.url), archivedUrl, 'restoring archived figures preserves exact SVG bytes after a library update');
  assert.equal(await page.locator('.tc-illustration').count(),2);
  const restoredCohort = page.locator('.tc-illustration').filter({has:page.locator('input[type="text"]')}).nth(1);
  assert.equal(await restoredCohort.locator('input[type="text"]').inputValue(),'SC <steady> & control');
  assert.equal(await restoredCohort.locator('.tc-snapshot').count(),1);
  assert.equal(await page.evaluate(() => window.TeamCanvas.serialize().nodes[0].kind),'illustration');
  await restoredCohort.getByRole('button',{name:'Edit',exact:true}).click();
  await restoredCohort.getByRole('button',{name:'Finish',exact:true}).click();
  assert.match(decodeURIComponent((await restoredCohort.locator('.tc-snapshot img').getAttribute('src')).split(',')[1]), /New library style/, 'explicit Edit and Finish adopts the new artwork');
  await browser.close();
  console.log('PASS team canvas illustrations');
})().catch(error => { console.error(error); process.exitCode=1; });
