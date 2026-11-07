const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage();
 await page.setContent(`<div id="team-workspace"><section class="team-library"><div class="team-library-login">
  <div class="shiny-input-container"><label for="team_library_email">Email</label><input id="team_library_email" class="form-control"><div id="team_library_email_error" class="team-login-field-error" hidden></div></div>
  <div class="shiny-input-container"><label for="team_library_password">Password</label><input id="team_library_password" type="password" class="form-control"><div id="team_library_password_error" class="team-login-field-error" hidden></div></div>
  <div id="team_library_login_alert" class="team-login-alert" role="alert" hidden></div>
  <button id="team_library_login" type="button">Sign in</button></div>
  <details class="team-library-activation"><summary>Reset password or activate your invitation</summary><p>Code</p></details></section></div>`);
 await page.evaluate(()=>{window.handlers={};window.sent=[];window.custom={};window.Shiny={setInputValue:(name,value)=>sent.push({name,value}),addCustomMessageHandler:(name,fn)=>custom[name]=fn};window.jQuery=()=>({on:function(names,fn){names.split(' ').forEach(n=>handlers[n]=fn);return this;}});
  document.getElementById('team_library_login').addEventListener('click',()=>sent.push({name:'team_library_login'}));});
 await page.addStyleTag({path:path.resolve('www/team/css/login_validation.css')});
 await page.addScriptTag({path:path.resolve('www/team/js/foreground.js')});
 await page.addScriptTag({path:path.resolve('www/team/js/login_validation.js')});
 const dialogOpen=()=>page.evaluate(()=>!!document.querySelector('#team-foreground')?.open);
 const reached=()=>page.evaluate(()=>sent.filter(s=>s.name==='team_library_login'||s.name==='team_foreground_team_library_login').length);

 // Empty submit: both fields marked, first focused, no modal and nothing sent.
 await page.locator('#team_library_login').click();
 assert.equal(await dialogOpen(),false);assert.equal(await reached(),0);
 assert.equal(await page.locator('#team_library_email').getAttribute('aria-invalid'),'true');
 assert.equal(await page.locator('#team_library_email').getAttribute('aria-describedby'),'team_library_email_error');
 assert.equal(await page.locator('#team_library_email_error').textContent(),'Enter the email on your invitation.');
 assert.equal(await page.locator('#team_library_password_error').textContent(),'Enter your password.');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'team_library_email');
 assert.equal(await page.locator('#team_library_email').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(180, 35, 24)');

 // Malformed email via Enter: typed values kept, password error cleared, no modal.
 await page.locator('#team_library_email').fill('not-an-email');await page.locator('#team_library_password').fill('x');
 assert.equal(await page.locator('#team_library_password').getAttribute('aria-invalid'),null,'typing clears the field error');
 await page.locator('#team_library_password').press('Enter');
 assert.equal(await dialogOpen(),false);assert.equal(await reached(),0);
 assert.equal(await page.locator('#team_library_email_error').textContent(),'Enter a valid email address.');
 assert.equal(await page.locator('#team_library_password_error').isVisible(),false);
 assert.equal(await page.locator('#team_library_email').inputValue(),'not-an-email');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'team_library_email');

 // Valid form reaches the server; a refusal shows one alert strip in the card and no modal.
 await page.locator('#team_library_email').fill('user@example.org');
 await page.locator('#team_library_login').click();
 assert.equal(await reached(),2);assert.equal(await page.locator('#team_library_email').getAttribute('aria-invalid'),null);
 const rejected='We could not sign you in. Check your email and password, reset your password below, or try again later.';
 await page.evaluate(m=>{custom['team-login-feedback']({fields:[],alert:m});custom['team-foreground-result']({id:sent.filter(s=>s.name==='team_foreground_team_library_login').at(-1).value,ok:false});},rejected);
 assert.equal(await dialogOpen(),false,'refused sign-in does not open the generic modal');
 assert.equal(await page.locator('#team_library_login_alert').textContent(),rejected);
 assert.equal(await page.locator('#team_library_login_alert').isVisible(),true);
 assert.equal(await page.locator('#team_library_email').inputValue(),'user@example.org');
 assert.equal(await page.locator('[role=alert]:visible').count(),1);

 // Server mirror of the field checks, and the alert clears on the next attempt.
 await page.evaluate(()=>custom['team-login-feedback']({fields:{email:'Enter a valid email address.'}}));
 assert.equal(await page.locator('#team_library_login_alert').isVisible(),false);
 assert.equal(await page.locator('#team_library_email_error').textContent(),'Enter a valid email address.');

 // A failure after sign-in sends no card alert (the server rethrows it to the status line):
 // the operation still ends, without the modal and without an empty alert strip.
 await page.locator('#team_library_login').click();
 assert.equal(await reached(),4);assert.equal(await page.locator('#team_library_email').getAttribute('aria-invalid'),null);
 await page.evaluate(()=>custom['team-foreground-result']({id:sent.filter(s=>s.name==='team_foreground_team_library_login').at(-1).value,ok:false}));
 assert.equal(await dialogOpen(),false);assert.equal(await page.evaluate(()=>TeamBusy.pending()),0);
 assert.equal(await page.locator('#team_library_login_alert').isVisible(),false);
 assert.equal(await page.locator('[role=alert]:visible').count(),0);

 // Reset password is a visible link-styled control with the same disclosure behaviour.
 const summary=page.locator('.team-library-activation>summary');
 assert.equal(await summary.isVisible(),true);
 assert.match(await summary.evaluate(e=>getComputedStyle(e).textDecorationLine),/underline/);
 await summary.focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('.team-library-activation').evaluate(e=>e.open),true);
 console.log('PASS login validation: inline field errors, no modal, single neutral alert, kept email, visible reset link');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
