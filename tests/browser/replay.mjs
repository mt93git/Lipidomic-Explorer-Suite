// Inject a documented CUA tab, viewport capability and artifact writer.
// No browser internals, backend mutation, credentials or production endpoints.
import assert from 'node:assert/strict';
export async function checkpoint(tab, name, save) {
  const snapshot = await tab.playwright.domSnapshot();
  await save(name+'.txt',snapshot);
  await save(name+'.jpg',await tab.screenshot({fullPage:false}));
  return snapshot;
}
export async function restore(tab, zip) {
  const chooser = tab.playwright.waitForEvent('filechooser',{timeoutMs:10000});
  await tab.playwright.locator('span.btn-file').filter({has:tab.playwright.locator('#data_hub-import_session_file')}).click();
  await (await chooser).setFiles(zip);
}
export async function classicMobile(tab, viewport, save) {
  const results=[];
  for (const width of [390,320]) {
    await viewport.set({width,height:844});
    const m=await tab.playwright.evaluate(()=>{
      const r=document.querySelector('.targeted-scope-label').getBoundingClientRect();
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,left:r.left,right:r.right};
    });
    assert.equal(m.width,width); assert.equal(m.documentWidth,width);
    assert(m.left>=0 && m.right<=width,'Scope caption must fit viewport');
    await checkpoint(tab,'classic-scope-'+width,save);results.push(m);
  }
  await tab.playwright.getByRole('button',{name:'Toggle navigation',exact:true}).click();
  await tab.playwright.getByRole('link',{name:'book-bookmark icon 6. Reference & Methods',exact:true}).waitFor({state:'visible'});
  const nav=await tab.playwright.evaluate(()=>({height:document.querySelector('.navbar').getBoundingClientRect().height,width:document.documentElement.scrollWidth}));
  assert(nav.height>100);assert.equal(nav.width,320);
  await checkpoint(tab,'classic-menu-open',save);
  await tab.playwright.getByRole('button',{name:'Toggle navigation',exact:true}).click();
  await tab.playwright.getByRole('button',{name:'Edit',exact:true}).click();
  await tab.playwright.getByRole('button',{name:'check-double icon Select All',exact:true}).waitFor({state:'visible'});
  await checkpoint(tab,'classic-edit',save);
  return {status:'PASS',viewports:results,menu:nav};
}
export async function teamPalette(tab, viewport, save) {
  const results=[];
  for(const width of [390,320]) {
    await viewport.set({width,height:844});
    const m=await tab.playwright.evaluate(()=>Array.from(document.querySelectorAll('.palette-color-grid [data-palette-label]')).map(e=>({label:e.getAttribute('data-palette-label'),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
    const snap=await checkpoint(tab,'team-palette-'+width,save);
    assert(snap.includes('Control')&&snap.includes('Treatment'),'Expected synthetic groups');
    assert(!snap.includes('globalSpeciesCol'),'Legacy species renderer must not replace group editor');
    const layout=await tab.playwright.evaluate(()=>{const e=document.querySelector('.palette-color-grid');return {exists:!!e,width:innerWidth,left:e?.getBoundingClientRect().left,right:e?.getBoundingClientRect().right}});
    assert(layout.exists && layout.left>=0 && layout.right<=width);results.push({width,layout,labels:m});
  }
  const color=tab.playwright.getByRole('button',{name:/Choose color for Control, current color/});
  await color.click();assert.equal(await color.getAttribute('aria-expanded'),'true');
  await checkpoint(tab,'team-color-picker',save);
  return {status:'PASS',viewports:results};
}
export async function reviewTeamDesign(tab, save) {
  await tab.playwright.getByRole('heading',{name:'Confirm the study design',exact:true}).waitFor({state:'visible'});
  const before=await checkpoint(tab,'team-restored-design-required',save);
  assert(before.includes('3 items left before Quality')); 
  const box=tab.playwright.getByRole('checkbox',{name:'I reviewed the labels, selected samples and design above.',exact:true});
  assert.notEqual(await box.getAttribute('checked'),'checked');
  await tab.playwright.getByRole('textbox',{name:'What was independently sampled? (required)',exact:true}).fill('Synthetic independently collected sample');
  await tab.playwright.getByRole('combobox',{name:'Relationship between samples (required)',exact:true}).selectOption({label:'Independent experimental units'});
  await tab.playwright.getByRole('heading',{name:'1 item left before Quality',exact:true}).waitFor({state:'visible'});
  await box.check();
  await tab.playwright.locator('#guide_design_status').getByRole('button',{name:'Continue to Quality →',exact:true}).click();
  await checkpoint(tab,'team-design-confirmed',save);
}
// Precondition: Review exclusion dialog is open for synthetic S01 with a reason.
export async function teamConfirmation(tab, save) {
  await tab.playwright.getByRole('heading',{name:'Confirm sample exclusion',exact:true}).waitFor({state:'visible'});
  const dialog=await checkpoint(tab,'team-exclusion-review',save);
  assert(dialog.includes('Sample: S01') && dialog.includes('current results remain the previous run'));
  await tab.playwright.getByRole('button',{name:'Cancel',exact:true}).click();
  await tab.playwright.getByRole('heading',{name:'Confirm sample exclusion',exact:true}).waitFor({state:'hidden'});
  const cancelled=await checkpoint(tab,'team-exclusion-cancelled',save);
  assert(!cancelled.includes('scheduled for exclusion'),'Cancellation must not schedule removal');
  await tab.playwright.getByRole('button',{name:'Review exclusion',exact:true}).click();
  await tab.playwright.getByRole('heading',{name:'Confirm sample exclusion',exact:true}).waitFor({state:'visible'});
  await tab.playwright.getByRole('button',{name:'Confirm exclusion',exact:true}).click();
  await tab.playwright.getByRole('heading',{name:'Confirm sample exclusion',exact:true}).waitFor({state:'hidden'});
  await tab.playwright.getByRole('button',{name:'Undo',exact:true}).waitFor({state:'visible'});
  const pending=await checkpoint(tab,'team-exclusion-pending',save);
  assert(pending.includes('Changes pending') && pending.includes('8 samples') && pending.includes('scheduled for exclusion'),'Confirmed removal must preserve the eight-sample applied run');
  return {status:'PASS',cancel:'no scheduled removal',confirm:'pending; explicit preparation required'};
}
