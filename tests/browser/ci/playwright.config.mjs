import { defineConfig } from '@playwright/test';
const external=process.env.UI_TEST_EXTERNAL_SERVERS==='1';
if(external && process.env.CI) throw Error('CI must launch isolated servers');
const env={LIPIDOMIC_COMPANION_AI:'0',LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL:'0',R_PROFILE_USER:'/dev/null',R_ENVIRON_USER:'/dev/null'};
export default defineConfig({
 testDir:'.',testMatch:'*.spec.mjs',workers:1,retries:0,forbidOnly:!!process.env.CI,
 timeout:180000,globalTimeout:900000,expect:{timeout:20000},
 outputDir:'artifacts/results',reporter:[['list'],['html',{outputFolder:'artifacts/report',open:'never'}],['json',{outputFile:'artifacts/results.json'}]],
 use:{browserName:'chromium',headless:true,viewport:{width:390,height:844},trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure'},
 webServer:external?undefined:['classic','team'].map((ui,i)=>({
  command:`Rscript --vanilla -e 'shiny::runApp(".",host="127.0.0.1",port=${43230+i},launch.browser=FALSE)'`,
  cwd:'../../..',url:`http://127.0.0.1:${43230+i}`,reuseExistingServer:false,timeout:120000,
  env:{...env,LIPIDOMIC_INTERFACE:ui},stdout:'pipe',stderr:'pipe'
 }))
});
