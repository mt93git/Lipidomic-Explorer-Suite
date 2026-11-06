// W16c: while Data (choice), Review or Canvas shows, the conditionalPanels of Max's hidden tool tabs are
// parked (data-display-if -> data-team-display-if) so Shiny's page-wide conditional
// re-check skips them. Checks: hidden panels are skipped on Canvas, a control changed while
// parked is honoured once they are restored, opening a parked tab restores it at once,
// leaving Canvas restores every panel with Shiny's own state, and a Review conditional
// control still toggles live. Synthetic fixture only.
const assert=require('node:assert/strict');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
const idle=p=>p.waitForFunction(()=>!document.documentElement.classList.contains('shiny-busy'),null,{timeout:300000});
const screen=(p,s)=>p.waitForFunction(s=>document.body.dataset.twScreen===s,s,{timeout:300000});
// Shiny sends a non-event input from its action queue (a later task), then re-checks conditionals.
const flipAndWait=async(p,key,v,msg)=>{await p.evaluate(([k,v])=>{const x=window[k];x.box.checked=v;$(x.box).trigger('change');},[key,v]);
 await p.waitForFunction(([k,v])=>{const x=window[k];return x.panel.hasAttribute('data-display-if')&&x.panel.classList.contains('shiny-conditional--shown')===v;},[key,v],{timeout:15000}).catch(()=>{throw Error(msg);});};
// Every live [data-display-if] must show exactly when Shiny's own evaluation says so.
const audit=p=>p.evaluate(()=>{
 const a=Shiny.shinyapp,inputs={};for(const k in a.$inputValues)inputs[k.replace(/:.*/,'')]=a.$inputValues[k];
 const narrow=(o,ns)=>{const r={};for(const k in o)if(k.indexOf(ns)===0)r[k.substring(ns.length)]=o[k];return r;};
 let n=0,bad=[];for(const el of document.querySelectorAll('[data-display-if]')){const ns=el.getAttribute('data-ns-prefix');const sc=ns?{input:narrow(inputs,ns),output:narrow(a.$values,ns)}:{input:inputs,output:a.$values};
  let want;try{want=Boolean(new Function('with(this){return ('+el.getAttribute('data-display-if')+')}').call(sc));}catch(e){continue;}
  n++;if(want!==el.classList.contains('shiny-conditional--shown'))bad.push((ns||'')+' '+el.getAttribute('data-display-if'));}
 return {n,bad:bad.slice(0,5),mismatches:bad.length,parked:document.querySelectorAll('[data-team-display-if]').length};});
(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
  await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
  await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
  if(process.env.TEAM_CHECKPOINT)await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},process.env.TEAM_CHECKPOINT);
  await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
  await screen(p,'review-single');
  await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled&&window.TeamWorkspace?.state().preparationReady;},null,{timeout:600000});
  const review=await p.evaluate(()=>({active:TeamConditionalPark.active,parked:TeamConditionalPark.parked(),inActive:[...document.querySelectorAll('[data-team-display-if]')].filter(e=>!e.closest('.tab-pane:not(.active)')).length}));
  assert.ok(review.active&&review.parked>0,'Review parks nothing: '+JSON.stringify(review));assert.equal(review.inActive,0,'a parked panel is outside a hidden tab pane');
  console.log('PASS Review parks',review.parked,'hidden panels, none in a visible pane');

  // Canvas: hidden panels are skipped by Shiny's re-check.
  await p.evaluate(()=>TeamWorkspace.request('canvas'));await screen(p,'canvas');
  await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false,null,{timeout:300000});await idle(p);
  const skip=await p.evaluate(()=>{const parked=[...document.querySelectorAll('[data-team-display-if]')];const seen=[...$(document).find('[data-display-if]')];
   return {parked:parked.length,overlap:parked.filter(e=>seen.includes(e)).length,visible:parked.filter(e=>e.getClientRects().length).length,canvasLive:document.querySelectorAll('[data-display-if][data-ns-prefix^="tcinstance_"]').length,outside:parked.filter(e=>!e.closest('.tab-pane:not(.active)')).length};});
  assert.ok(skip.parked>0&&skip.overlap===0,'Canvas: Shiny still finds parked panels '+JSON.stringify(skip));assert.equal(skip.visible,0,'a parked panel is rendered');assert.equal(skip.outside,0,'a panel outside a hidden tab pane was parked');
  console.log('PASS Canvas parks',skip.parked,'hidden panels; Shiny no longer finds them;',skip.canvasLive,'Canvas card copy panels outside unopened tabs stay live');
  let a=await audit(p);assert.equal(a.mismatches,0,'live panels wrong on Canvas: '+a.bad.join(' | '));
  // A Canvas card copy's own conditional control still toggles live.
  const card=await p.evaluate(()=>{for(const el of document.querySelectorAll('[data-display-if][data-ns-prefix^="tcinstance_"]')){const ns=el.getAttribute('data-ns-prefix');const m=/^\s*input\.([A-Za-z0-9_]+)\s*==\s*true\s*$/.exec(el.getAttribute('data-display-if'));if(!m)continue;
    const box=document.getElementById(ns+m[1]);if(!box||box.type!=='checkbox'||el.contains(box)||el.closest('.shiny-html-output'))continue;window.__w16cCard={panel:el,box:box};return {box:box.id,checked:box.checked};}return null;});
  if(card){await flipAndWait(p,'__w16cCard',!card.checked,'card copy panel did not follow its control');await flipAndWait(p,'__w16cCard',card.checked,'card copy panel did not follow its control back');await idle(p);
   console.log('PASS a Canvas card copy conditional control still toggles live',card.box);}
  else console.log('SKIP no checkbox-driven card copy panel in this checkpoint');

  // A control changed while its panel is parked: the panel follows once restored.
  const pick=await p.evaluate(()=>{for(const el of document.querySelectorAll('[data-team-display-if]')){const ns=el.getAttribute('data-ns-prefix')||'';const m=/^\s*input\.([A-Za-z0-9_]+)\s*==\s*true\s*$/.exec(el.getAttribute('data-team-display-if'));if(!m)continue;
    const box=document.getElementById(ns+m[1]);if(!box||box.type!=='checkbox'||el.contains(box)||el.closest('.shiny-html-output')||box.closest('.shiny-html-output'))continue;window.__w16c={panel:el,box:box};return {box:box.id,shown:el.classList.contains('shiny-conditional--shown'),checked:box.checked};}return null;});
  assert.ok(pick,'no parked checkbox-driven panel to exercise');
  await p.evaluate(()=>{const box=window.__w16c.box;box.checked=!box.checked;$(box).trigger('change');});await idle(p);
  const stale=await p.evaluate(()=>({parked:window.__w16c.panel.isConnected&&window.__w16c.panel.hasAttribute('data-team-display-if'),shown:window.__w16c.panel.classList.contains('shiny-conditional--shown')}));
  assert.ok(stale.parked,'panel left parking while its pane stayed hidden');assert.equal(stale.shown,pick.shown,'parked panel was re-evaluated while parked');console.log('PASS a parked panel is skipped while its control changes',pick.box);

  // Opening a parked tab pane restores its panels at once.
  const pane=await p.evaluate(()=>{const el=[...document.querySelectorAll('[data-team-display-if]')].find(e=>{const tp=e.closest('.tab-pane:not(.active)');return tp&&!tp.parentElement.closest('.tab-pane:not(.active)');});const tp=el.closest('.tab-pane:not(.active)');tp.id=tp.id||'w16c-open';tp.classList.add('active');return tp.id;});
  await p.waitForTimeout(50);
  const opened=await p.evaluate(id=>{const tp=document.getElementById(id);const r={parkedInPane:[...tp.querySelectorAll('[data-team-display-if]')].filter(e=>!e.closest('.tab-pane:not(.active)')).length,live:tp.querySelectorAll('[data-display-if]').length};tp.classList.remove('active');return r;},pane);
  assert.ok(opened.parkedInPane===0&&opened.live>0,'opening a parked pane left panels parked '+JSON.stringify(opened));console.log('PASS an opened tab pane is restored at once');
  a=await audit(p);assert.equal(a.mismatches,0,'restored pane wrong: '+a.bad.join(' | '));

  // Real Bootstrap transitions on nested tabs: showing the outer tab keeps a panel parked while
  // its inner tab is still hidden; showing the inner tab then restores it.
  await idle(p);await p.evaluate(()=>Shiny.shinyapp.$updateConditionals());await p.waitForTimeout(1100);await p.evaluate(()=>Shiny.shinyapp.$updateConditionals());
  const nest=await p.evaluate(()=>{const link=pane=>{if(!pane.id)return null;const t='#'+CSS.escape(pane.id);return document.querySelector(['tab','pill'].map(k=>'[data-bs-toggle="'+k+'"][data-bs-target="'+t+'"],[data-bs-toggle="'+k+'"][href="'+t+'"]').join(','));};
   const prev=l=>{const nav=l.closest('.nav,[role=tablist]');return nav&&nav.querySelector('[data-bs-toggle="tab"].active,[data-bs-toggle="pill"].active');};
   for(const el of document.querySelectorAll('[data-team-display-if]')){const P=el.closest('.tab-pane:not(.active)');const O=P&&P.parentElement.closest('.tab-pane:not(.active)');
    if(!P||!O||!link(P)||!link(O)||O.querySelector('#team-canvas-root'))continue;
    window.__n={el,P,O,lp:link(P),lo:link(O),pp:prev(link(P)),po:prev(link(O))};return {inner:P.id,outer:O.id};}return null;});
  if(nest){const show=k=>p.evaluate(k=>{const l=window.__n[k];if(l)bootstrap.Tab.getOrCreateInstance(l).show();},k);
   await show('lo');await p.waitForFunction(()=>window.__n.O.classList.contains('active'),null,{timeout:5000});await p.waitForTimeout(400);
   assert.ok(await p.evaluate(()=>window.__n.el.hasAttribute('data-team-display-if')),'showing the outer tab released a panel its inner tab still hides');
   await show('lp');await p.waitForFunction(()=>window.__n.P.classList.contains('active'),null,{timeout:5000});await p.waitForTimeout(100);
   assert.ok(await p.evaluate(()=>window.__n.el.hasAttribute('data-display-if')),'showing the inner tab left its panel parked');
   a=await audit(p);assert.equal(a.mismatches,0,'panels wrong after tab transitions: '+a.bad.join(' | '));
   await show('pp');await show('po');await p.waitForTimeout(400);
   console.log('PASS Bootstrap tab transitions on nested tabs: outer keeps the inner panel parked, inner restores it',nest.outer,nest.inner);}
  else console.log('SKIP no nested Bootstrap tabset with a parked panel in this checkpoint');

  // A parked node moved into a visible container is restored before the next frame.
  const moved=await p.evaluate(()=>{const el=document.querySelector('[data-team-display-if]');window.__m={el,parent:el.parentNode,next:el.nextSibling};
   const box=document.createElement('div');box.id='w16c-visible';document.body.appendChild(box);box.appendChild(el);return true;});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r())));
  assert.ok(await p.evaluate(()=>window.__m.el.hasAttribute('data-display-if')&&!window.__m.el.hasAttribute('data-team-display-if')),'a parked node moved into view stayed parked');
  a=await audit(p);assert.equal(a.mismatches,0,'moved panel wrong: '+a.bad.join(' | '));
  await p.evaluate(()=>{const m=window.__m;m.parent.insertBefore(m.el,m.next&&m.next.parentNode===m.parent?m.next:null);document.getElementById('w16c-visible').remove();});
  console.log('PASS a parked node moved into a visible container is restored at once',moved);

  // Synthetic tabset: a pane portaled out of its .tab-content is released; 500 class changes
  // inside a parked pane cost at most 2 re-validations; a removed pane is freed.
  const frames=n=>p.evaluate(n=>new Promise(r=>{let i=0;const f=()=>++i>=n?r():requestAnimationFrame(f);requestAnimationFrame(f);}),n);
  const park=async()=>{await p.waitForTimeout(1100);await p.evaluate(()=>Shiny.shinyapp.$updateConditionals());};
  await p.evaluate(()=>{const tc=document.createElement('div');tc.className='tab-content';tc.id='w16c-tc';const on=document.createElement('div');on.className='tab-pane active';
   const pn=document.createElement('div');pn.className='tab-pane';pn.id='w16c-pane';const c=document.createElement('div');c.className='shiny-panel-conditional';c.id='w16c-cond';c.setAttribute('data-display-if','true');c.setAttribute('data-ns-prefix','');c.textContent='w16c';
   const sp=document.createElement('span');sp.id='w16c-span';pn.append(c,sp);tc.append(on,pn);document.body.appendChild(tc);});
  await park();
  assert.ok(await p.evaluate(()=>document.getElementById('w16c-cond').hasAttribute('data-team-display-if')),'synthetic hidden pane not parked');
  await p.evaluate(()=>document.body.appendChild(document.getElementById('w16c-pane')));await frames(2);
  const portal=await p.evaluate(()=>{const c=document.getElementById('w16c-cond');return {live:c.hasAttribute('data-display-if'),shown:c.classList.contains('shiny-conditional--shown')};});
  assert.ok(portal.live&&portal.shown,'a pane moved out of .tab-content stayed parked '+JSON.stringify(portal));
  console.log('PASS a pane moved out of .tab-content (not active) is released and re-checked');
  await p.evaluate(()=>document.getElementById('w16c-tc').appendChild(document.getElementById('w16c-pane')));await park();
  assert.ok(await p.evaluate(()=>document.getElementById('w16c-cond').hasAttribute('data-team-display-if')),'synthetic pane not parked again after returning');
  const churn=await p.evaluate(()=>{const before=TeamConditionalPark.revalidates,sp=document.getElementById('w16c-span');for(let i=0;i<500;i++)sp.classList.toggle('k'+(i%7));return before;});
  await frames(3);const rv=await p.evaluate(b=>TeamConditionalPark.revalidates-b,churn);
  assert.ok(rv<=2,'500 class changes inside a parked pane caused '+rv+' re-validations');
  assert.ok(await p.evaluate(()=>document.getElementById('w16c-cond').hasAttribute('data-team-display-if')),'class churn released the panel');
  console.log('PASS 500 class changes inside a parked pane cost',rv,'re-validations');
  const freed=await p.evaluate(()=>({parked:TeamConditionalPark.parked(),panes:TeamConditionalPark.panes()}));
  await p.evaluate(()=>document.getElementById('w16c-pane').remove());await frames(2);
  const gone=await p.evaluate(()=>({parked:TeamConditionalPark.parked(),panes:TeamConditionalPark.panes()}));
  assert.ok(gone.parked===freed.parked-1&&gone.panes===freed.panes-1,'a removed pane was not freed '+JSON.stringify({freed,gone}));
  await p.evaluate(()=>document.getElementById('w16c-tc').remove());
  console.log('PASS a removed pane and its panel are dropped and unobserved');

  // A pane moved between two .tab-content stays parked and watched there; portaled out of the
  // second one it is released. An inactive pane exposed by an inline style is released within ~1 s.
  const synth=(tcId,paneId,condId)=>p.evaluate(([t,pi,ci])=>{const tc=document.createElement('div');tc.className='tab-content';tc.id=t;const on=document.createElement('div');on.className='tab-pane active';tc.appendChild(on);
   if(pi){const pn=document.createElement('div');pn.className='tab-pane';pn.id=pi;const c=document.createElement('div');c.className='shiny-panel-conditional';c.id=ci;c.setAttribute('data-display-if','true');c.setAttribute('data-ns-prefix','');c.textContent='w16c';pn.appendChild(c);tc.appendChild(pn);}
   document.body.appendChild(tc);},[tcId,paneId,condId]);
  const parkedNow=id=>p.evaluate(id=>document.getElementById(id).hasAttribute('data-team-display-if'),id);
  const liveShown=id=>p.evaluate(id=>{const c=document.getElementById(id);return c.hasAttribute('data-display-if')&&c.classList.contains('shiny-conditional--shown');},id);
  await synth('w16c-tc1','w16c-pa','w16c-ca');await synth('w16c-tc2');await park();
  assert.ok(await parkedNow('w16c-ca'),'synthetic pane A not parked');
  await p.evaluate(()=>document.getElementById('w16c-tc2').appendChild(document.getElementById('w16c-pa')));await frames(2);
  assert.ok(await parkedNow('w16c-ca'),'pane moved into another .tab-content (still inactive) was released');
  await p.evaluate(()=>document.body.appendChild(document.getElementById('w16c-pa')));await frames(2);
  assert.ok(await liveShown('w16c-ca'),'pane portaled out of its second .tab-content stayed parked (stale parent observer)');
  console.log('PASS a pane moved between two .tab-content and then portaled out is released');
  await synth('w16c-tc3','w16c-pb','w16c-cb');await park();
  assert.ok(await parkedNow('w16c-cb'),'synthetic pane B not parked');
  const t0=Date.now();await p.evaluate(()=>{document.getElementById('w16c-pb').style.display='block';});
  await p.waitForFunction(()=>{const c=document.getElementById('w16c-cb');return c.hasAttribute('data-display-if')&&c.classList.contains('shiny-conditional--shown');},null,{timeout:1200,polling:20}).catch(()=>{throw Error('an inline style exposing an inactive pane was not released within 1.2 s');});
  console.log('PASS an inactive pane exposed by an inline style is released in',Date.now()-t0,'ms');
  await p.evaluate(()=>['w16c-tc1','w16c-tc2','w16c-tc3','w16c-pa'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();}));

  // An error inside the park code restores everything.
  await park();
  const err=await p.evaluate(()=>new Promise(res=>{const el=document.querySelector('[data-team-display-if]');if(!el)return res(null);const before=TeamConditionalPark.errors,pane=el.closest('.tab-pane:not(.active)');
   el.closest=function(){throw Error('w16c injected');};pane.classList.add('w16c-poke');
   requestAnimationFrame(()=>requestAnimationFrame(()=>{delete el.closest;pane.classList.remove('w16c-poke');res({errors:TeamConditionalPark.errors-before,parked:TeamConditionalPark.parked(),left:document.querySelectorAll('[data-team-display-if]').length});}));}));
  assert.ok(err&&err.errors>0&&err.parked===0&&err.left===0,'an injected error did not restore everything '+JSON.stringify(err));
  a=await audit(p);assert.equal(a.mismatches,0,'panels wrong after an error restore: '+a.bad.join(' | '));
  console.log('PASS an injected error restores every panel, matching Shiny');

  // Leaving the parked screens restores every panel with Shiny's own state. The screens
  // that do not park (upload steps) are reached only through an upload, so the screen
  // attribute is switched the way workspace.js paints it, then put back.
  const was=await p.evaluate(()=>{const s=document.body.dataset.twScreen;document.body.dataset.twScreen='data-metadata';return s;});await p.waitForTimeout(100);
  a=await audit(p);assert.equal(a.parked,0,'panels still parked after leaving the parked screens');assert.equal(a.mismatches,0,'restored panels wrong: '+a.bad.join(' | '));
  const after=await p.evaluate(()=>({shown:window.__w16c.panel.classList.contains('shiny-conditional--shown'),checked:window.__w16c.box.checked}));
  assert.equal(after.shown,after.checked,'restored panel ignores the change made while parked');
  console.log('PASS leaving the parked screens restores',a.n,'panels, all matching Shiny; the parked change is honoured');
  await p.evaluate(s=>{document.body.dataset.twScreen=s;},was);
  await p.evaluate(x=>{const box=window.__w16c.box;box.checked=x.checked;$(box).trigger('change');},pick);await idle(p);
  // Data (choice) parks too; its own pane stays live.
  await p.evaluate(()=>TeamWorkspace.go('data'));await screen(p,'data-choice');await idle(p);
  a=await audit(p);const dc=await p.evaluate(()=>({parked:TeamConditionalPark.parked(),active:TeamConditionalPark.active,outside:[...document.querySelectorAll('[data-team-display-if]')].filter(e=>!e.closest('.tab-pane:not(.active)')).length}));
  assert.ok(dc.active&&dc.parked>0&&dc.outside===0,'Data screen parking wrong '+JSON.stringify(dc));assert.equal(a.mismatches,0,'live panels wrong on Data: '+a.bad.join(' | '));
  console.log('PASS Data parks',dc.parked,'hidden panels; live panels match Shiny');

  // Review: Team's Review page itself has no conditionalPanel (team_simple_review_ui). Every panel
  // that is not in a hidden pane (Canvas card copies, the docked sidebar) stays live there: its
  // checkbox still flips it in Shiny's same pass, and back.
  await p.evaluate(()=>TeamWorkspace.go('review'));await screen(p,'review-single');await idle(p);
  const live=await p.evaluate(()=>{for(const el of document.querySelectorAll('[data-display-if]')){const ns=el.getAttribute('data-ns-prefix')||'';const m=/^\s*input\.([A-Za-z0-9_]+)\s*==\s*true\s*$/.exec(el.getAttribute('data-display-if'));if(!m)continue;
    const box=document.getElementById(ns+m[1]);if(!box||box.type!=='checkbox'||el.contains(box)||el.closest('.shiny-html-output'))continue;window.__w16cLive={panel:el,box:box};return {box:box.id,checked:box.checked,parked:TeamConditionalPark.parked(),reviewParked:document.querySelectorAll('.tw-simple-review [data-team-display-if]').length};}return null;});
  assert.ok(live&&live.parked>0&&live.reviewParked===0,'no live checkbox-driven panel on Review, or Review parks wrongly: '+JSON.stringify(live));
  await flipAndWait(p,'__w16cLive',!live.checked,'live panel did not follow its control on Review');
  await flipAndWait(p,'__w16cLive',live.checked,'live panel did not follow its control back on Review');
  console.log('PASS a live conditional control still toggles on Review',live.box);
  await idle(p);
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
