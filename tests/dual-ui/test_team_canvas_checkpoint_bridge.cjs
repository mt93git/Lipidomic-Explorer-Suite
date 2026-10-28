const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<div id="team-canvas-root"></div><div><button id="team_library_save">Save</button></div><div><a id="data_hub-export_session_btn" href="#zip">Export Session</a></div>');
  await page.evaluate(()=>{
   window.handlers={};window.sent=[];window.downloads=0;window.resolvers=[];
   window.Shiny={addCustomMessageHandler:(n,f)=>handlers[n]=f,setInputValue:(n,v)=>sent.push({n,v})};
   window.TeamCanvas={checkpoint:()=>new Promise((resolve,reject)=>resolvers.push({resolve,reject}))};
   document.getElementById('data_hub-export_session_btn').addEventListener('click',e=>{e.preventDefault();downloads++;});
  });
  await page.addScriptTag({path:path.resolve('www/team/js/canvas_checkpoint.js')});
  // The Shiny dispatcher awaits handlers before delivering its next message.
  // A save handler must return immediately so the subsequent ACK can arrive.
  assert.equal(await page.evaluate(()=>{
   const result=handlers['team-canvas-save-request']({requestId:'one'});
   return result === undefined;
  }),true,'save must not block the Shiny message queue while awaiting its ACK');
  assert.equal(await page.locator('#team_library_save').isDisabled(),true);
  assert.equal(await page.evaluate(()=>sent.length),0);
  await page.evaluate(()=>resolvers.shift().resolve({token:'accepted'}));
  assert.deepEqual(await page.evaluate(()=>sent[0]),{n:'team_canvas_save_ready',v:{requestId:'one',token:'accepted',ok:true}});
  await page.evaluate(()=>handlers['team-canvas-save-result']({requestId:'stale',ok:true}));
  assert.equal(await page.locator('#team_library_save').isDisabled(),true);
  await page.evaluate(()=>handlers['team-canvas-save-result']({requestId:'one',ok:true}));
  assert.equal(await page.locator('#team_library_save').isDisabled(),false);
  await page.evaluate(()=>{handlers['team-canvas-save-request']({requestId:'two'});});
  await page.evaluate(()=>resolvers.shift().reject(new Error('Snapshot too large')));
  assert.equal(await page.evaluate(()=>sent.at(-1).v.ok),false);
  assert.ok((await page.locator('.team-checkpoint-status').first().innerText()).includes('not saved'));
  await page.locator('#data_hub-export_session_btn').click();
  assert.equal(await page.evaluate(()=>downloads),0);
  await page.evaluate(()=>resolvers.shift().resolve({token:'zip'}));
  assert.equal(await page.evaluate(()=>downloads),1);
  await page.locator('#data_hub-export_session_btn').click();
  await page.evaluate(()=>resolvers.shift().reject(new Error('Rejected')));
  assert.equal(await page.evaluate(()=>downloads),1);
  console.log('PASS: private save and ZIP wait for Canvas ACK; failure never exports stale state');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
