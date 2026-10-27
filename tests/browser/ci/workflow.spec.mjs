import {test,expect} from '@playwright/test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const fixture=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures/synthetic-session.zip');
const external=process.env.UI_TEST_EXTERNAL_SERVERS==='1';
const url=ui=>`http://127.0.0.1:${external?(ui==='classic'?3936:3935):(ui==='classic'?43230:43231)}/`;
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function shot(page,info,name){await info.attach(name,{body:await page.screenshot(),contentType:'image/png'});}
async function connected(p){await p.waitForFunction(()=>document.documentElement.classList.contains('shiny-connected')||document.querySelector('.shiny-bound-input'));}
async function restore(p){await p.locator('#data_hub-import_session_file').setInputFiles(fixture);}
async function teamReady(p){
 await p.goto(url('team'));await connected(p);
 await p.getByText('Resume from a saved session ZIP instead',{exact:true}).click();await restore(p);
 await expect(p.getByRole('heading',{name:'3 items left before Quality',exact:true})).toBeVisible();
 await p.getByRole('textbox',{name:'What was independently sampled? (required)',exact:true}).fill('Synthetic independent sample');
 await p.getByRole('combobox',{name:'Relationship between samples (required)',exact:true}).selectOption({label:'Independent experimental units'});
 await expect(p.getByRole('heading',{name:'1 item left before Quality',exact:true})).toBeVisible();
 await p.getByRole('checkbox',{name:'I reviewed the labels, selected samples and design above.',exact:true}).check();
 await p.locator('#guide_design_status').getByRole('button',{name:'Continue to Quality →',exact:true}).click();
 await button(p,'play icon Prepare data').click();
 await expect(p.getByRole('combobox',{name:'Choose a sample (keyboard accessible)',exact:true})).toBeVisible();
 await expect(p.getByText('8 samples',{exact:true})).toBeVisible();
}
test('Classic: ZIP requires explicit preparation; mobile menu and scope stay inside viewport',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url('classic'));await button(page,'Close').click();await expect(page.getByRole('dialog')).toBeHidden();
 await restore(page);await expect(page.getByText(/Session restored. Review the study design/)).toBeVisible();
 await expect(button(page,'play icon Run Analysis')).toBeVisible();
 await expect(button(page,'rotate icon Re-run Pipeline')).toHaveCount(0);
 await button(page,'play icon Run Analysis').click();await expect(button(page,'rotate icon Re-run Pipeline')).toBeVisible();
 await button(page,'Toggle sidebar').click();
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const rect=await page.locator('.targeted-scope-label').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);
  await shot(page,info,`classic-${width}`);
 }
 await button(page,'Toggle navigation').click();await expect(page.getByRole('link',{name:'book-bookmark icon 6. Reference & Methods',exact:true})).toBeVisible();
 await expect.poll(()=>page.locator('.navbar').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(100);
 await shot(page,info,'classic-menu');await button(page,'Toggle navigation').click();
 await button(page,'Edit').click();await expect(button(page,'check-double icon Select All')).toBeVisible();
 await info.attach('page-errors',{body:JSON.stringify(errors),contentType:'application/json'});expect(errors).toEqual([]);
});
test('Team: restore review, cancellation/confirmation, unchanged applied data, and palette picker',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await teamReady(page);
 await page.getByRole('combobox',{name:'Choose a sample (keyboard accessible)',exact:true}).selectOption({label:'S01'});
 const reason=page.getByRole('textbox',{name:'Reason for exclusion',exact:true});await reason.fill('Synthetic CI test only');await reason.blur();
 // Wait for Shiny's debounced input acknowledgement, without changing server state.
 await page.waitForFunction(()=>window.Shiny?.shinyapp?.$inputValues['qc_pca_tab-guided_qc_reason']==='Synthetic CI test only');
 await button(page,'Review exclusion').click();await expect(page.getByRole('heading',{name:'Confirm sample exclusion',exact:true})).toBeVisible();
 await shot(page,info,'team-confirm');await button(page,'Cancel').click();await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.getByText('scheduled for exclusion',{exact:true})).toHaveCount(0);await expect(page.getByText('8 samples',{exact:true})).toBeVisible();
 await button(page,'Review exclusion').click();await button(page,'Confirm exclusion').click();
 await expect(button(page,'Undo')).toBeVisible();await expect(page.getByText('Changes pending',{exact:true})).toBeVisible();await expect(page.getByText('8 samples',{exact:true})).toBeVisible();await shot(page,info,'team-pending');
 await button(page,'Undo').click();await expect(page.getByText('Analysis ready',{exact:true})).toBeVisible();
 await button(page,'5 Results').click();await button(page,'palette icon Colors & palettes').click();
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});const grid=page.locator('.palette-color-grid');await expect(grid).toBeVisible();
  await expect(grid.locator('[data-palette-label="Control"]')).toBeVisible();await expect(grid.locator('[data-palette-label="Treatment"]')).toBeVisible();
  const r=await grid.boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(width);await shot(page,info,`team-palette-${width}`);
 }
 const color=page.getByRole('button',{name:/Choose color for Control, current color/});await color.click();await expect(color).toHaveAttribute('aria-expanded','true');await shot(page,info,'team-picker');
 await info.attach('page-errors',{body:JSON.stringify(errors),contentType:'application/json'});expect(errors).toEqual([]);
});
