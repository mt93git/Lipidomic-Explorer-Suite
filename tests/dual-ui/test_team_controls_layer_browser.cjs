// Team controls layer (www/team/css/controls_layer.css): no control inside the Team shell keeps a
// browser or old-Bootstrap default look (grey bevel buttons, inset/grey field borders, 13.33px system
// font, default accent checkboxes/radios/ranges, default file-selector buttons, default slider skin),
// and none is clipped by its container. Outside the shell (Classic) and in the mascot/companion the
// layer changes nothing: computed styles are identical with and without it.
// Starts tests/dual-ui/fixture_team_controls_layer_app.R itself (the real ui.R stylesheet stack + bslib theme).
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const port=44100+Math.floor(Math.random()*800);
// Same scanner as the RTX inventory (ux20): returns offending controls.
const SCAN=()=>{
  const DEF_BG=new Set(['rgb(239, 239, 239)','rgb(221, 221, 221)','rgb(233, 233, 237)','rgb(192, 192, 192)','rgb(240, 240, 240)','rgb(230, 230, 230)']);
  const DEF_BORDER=new Set(['rgb(118, 118, 118)','rgb(133, 133, 133)','rgb(169, 169, 169)','rgb(204, 204, 204)','rgb(128, 128, 128)']);
  const bodyFont=getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g,'').trim().toLowerCase();
  const ELSEWHERE=[['.gc-inspector,.gc-root .gc-controls,.tc-chip','ux19/chips (group-comparison lipid-class chips)'],
    ['#lipidomic-companion,#lipidomic-assistant-root,#lipidomic-assistant-panel,#lipidomic-context-help,#lipidomic-help-bar,#lipidomic-help-panel,#lipidomic-tour','mascot/companion (left identical on purpose)'],
    ['.tc-navigation,.tc-zoom-controls,.tc-map,.tc-map-grip,#lipidomic-companion,.companion-speech,[class*=companion],[class*=mascot],.tc-catalog-toggle,.tc-catalog-collapse,.tc-catalog-head,.tc-catalog-header','ux18/canvasux (zoom toolbar / minimap / mascot dock / plot-library collapse)']];
  const vis=e=>{if(!e.getClientRects().length)return false;const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;let n=e;while(n&&n!==document.body){const s=getComputedStyle(n);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return false;n=n.parentElement;}
    // hidden input inside a styled label (Shiny file inputs, awesome checkboxes) still counts if on-screen
    return true;};
  const sel=e=>{if(e.id&&!/^[0-9]/.test(e.id))return '#'+CSS.escape(e.id);const part=n=>n.tagName.toLowerCase()+(n.id?'#'+CSS.escape(n.id):'')+[...n.classList].filter(c=>!/^(shiny-bound|active|show|is-|ng-)/.test(c)).slice(0,3).map(c=>'.'+CSS.escape(c)).join('')+(n.getAttribute('type')?`[type=${n.getAttribute('type')}]`:'');
    const out=[part(e)];let n=e.parentElement,d=0;while(n&&n!==document.body&&d<4){if(n.id){out.unshift('#'+CSS.escape(n.id));break;}if(n.classList.length){out.unshift(part(n));d++;}n=n.parentElement;}return out.join(' > ');};
  const clipAncestor=e=>{let n=e.parentElement;while(n&&n!==document.body){const s=getComputedStyle(n);if(/(auto|scroll)/.test(s.overflowX))return null;if(/(hidden|clip)/.test(s.overflowX))return n;n=n.parentElement;}return null;};
  const cands=[...document.querySelectorAll('button,input:not([type=hidden]),select,textarea,a.btn,.btn,[role=button],.irs,.noUi-target,.selectize-input,.form-control,label.btn-file')];
  const res=[];const seen=new Set();
  for(const e of cands){if(seen.has(e))continue;seen.add(e);
    const t=(e.getAttribute('type')||'').toLowerCase(),tag=e.tagName.toLowerCase();
    if(!vis(e))continue;
    {let n=e.parentElement,hid=false;while(n&&n!==document.body){const rr=n.getBoundingClientRect();const ns=getComputedStyle(n);if((rr.width<=1||rr.height<=1)&&/(hidden|clip)/.test(ns.overflow)||(ns.clip&&ns.clip!=='auto')){hid=true;break;}n=n.parentElement;}if(hid)continue;}
    if(e.closest('.selectize-input')&&tag==='input')continue; if(e.classList.contains('irs-hidden-input'))continue;
    {const rr=e.getBoundingClientRect();if(rr.right+scrollX<0||rr.bottom+scrollY<0||rr.left>20000)continue;}
    const s=getComputedStyle(e);const issues=[];
    let kind=tag==='select'?'select':tag==='textarea'?'textarea':tag==='input'?(['checkbox','radio','range','file','color','button','submit','reset'].includes(t)?t:'text'):(e.classList.contains('irs')?'slider':e.classList.contains('noUi-target')?'slider':e.classList.contains('selectize-input')?'select':'button');
    const ff=s.fontFamily.split(',')[0].replace(/["']/g,'').trim().toLowerCase();
    const sysFont=/^(arial|times|times new roman|serif|monospace)$/.test(ff)&&ff!==bodyFont;
    if(['button','submit','reset','color'].includes(kind)){
      if(DEF_BG.has(s.backgroundColor)&&s.backgroundImage==='none')issues.push('default grey background '+s.backgroundColor);
      if(/outset|inset/.test(s.borderTopStyle+s.borderLeftStyle))issues.push('3D bevel border ('+s.borderTopStyle+')');
      if(/gradient/.test(s.backgroundImage)&&!/rgb\(45, 95, 138\)/.test(s.backgroundImage))issues.push('legacy gradient background');
      if(s.borderTopStyle!=='none'&&parseFloat(s.borderTopWidth)>0&&DEF_BORDER.has(s.borderTopColor)&&parseFloat(s.borderTopLeftRadius)<=4)issues.push('default/old-Bootstrap border '+s.borderTopColor);
      if(s.fontSize==='13.3333px')issues.push('browser default font size 13.33px');
      if(sysFont)issues.push('system font '+ff);
    }
    if(['text','select','textarea'].includes(kind)){
      if(/outset|inset/.test(s.borderTopStyle))issues.push('inset field border');
      if(s.borderTopStyle!=='none'&&parseFloat(s.borderTopWidth)>0&&DEF_BORDER.has(s.borderTopColor))issues.push('default/old-Bootstrap field border '+s.borderTopColor);
      if(DEF_BG.has(s.backgroundColor))issues.push('default grey field background');
      if(s.fontSize==='13.3333px')issues.push('browser default font size 13.33px');
      if(sysFont)issues.push('system font '+ff);
      const h=e.getBoundingClientRect().height;if(kind!=='textarea'&&h<24)issues.push('undersized field '+Math.round(h)+'px');
    }
    if(['checkbox','radio','range'].includes(kind)){
      if(s.accentColor==='auto'&&s.appearance!=='none')issues.push('browser-default accent colour');
    }
    if(kind==='file'){const fb=getComputedStyle(e,'::file-selector-button');
      if(DEF_BG.has(fb.backgroundColor)||/outset|inset/.test(fb.borderTopStyle)||DEF_BORDER.has(fb.borderTopColor))issues.push('default file-selector button '+fb.backgroundColor);}
    if(kind==='slider'&&e.classList.contains('irs')){const bar=e.querySelector('.irs-bar');const bc=bar?getComputedStyle(bar).backgroundColor:'';
      if(/rgb\((66, 139, 202|237, 85, 101|51, 122, 183|0, 123, 255|13, 110, 253)\)/.test(bc))issues.push('ionRangeSlider default skin bar '+bc);
      const h=e.querySelector('.irs-handle,.irs-slider');if(h){const hs=getComputedStyle(h);if(/gradient|url\(/.test(hs.backgroundImage)||DEF_BG.has(hs.backgroundColor))issues.push('ionRangeSlider default handle');}}
    // clipping / overflow
    const r=e.getBoundingClientRect();
    if(['button','submit','reset'].includes(kind)||tag==='label'){
      if(/(hidden|clip)/.test(s.overflowX)&&e.scrollWidth>e.clientWidth+2&&e.textContent.trim())issues.push('label clipped ('+e.scrollWidth+'>'+e.clientWidth+')');
      if(e.scrollHeight>e.clientHeight+4&&/(hidden|clip)/.test(s.overflowY)&&e.textContent.trim())issues.push('label clipped vertically');
    }
    const a=clipAncestor(e);if(a){const ar=a.getBoundingClientRect();if(r.right>ar.right+2||r.left<ar.left-2){issues.push('overflows container '+(a.id?'#'+a.id:'.'+[...a.classList].slice(0,2).join('.'))+' by '+Math.round(Math.max(r.right-ar.right,ar.left-r.left))+'px');}}
    if(!issues.length)continue;
    let elsewhere=null;for(const [q,who] of ELSEWHERE){if(e.closest(q)){elsewhere=who;break;}}
    const inTeam=!!e.closest('#team-workspace,.ts-shell,.team-library,#team-canvas-root,.tc-layout,body.ts-shell-app');
    res.push({sel:sel(e),kind,issues,elsewhere,inTeam,text:(e.textContent||e.value||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,60),rect:[Math.round(r.left+scrollX),Math.round(r.top+scrollY),Math.round(r.width),Math.round(r.height)]});
    e.setAttribute('data-ux20-off',String(res.length-1));
  }
  return res;};
const STYLE_KEYS=['backgroundColor','backgroundImage','borderTopStyle','borderTopColor','borderTopWidth','borderTopLeftRadius','color','fontFamily','fontSize','height','paddingLeft','accentColor','boxShadow','outlineStyle'];
const snapshot=(sel,keys)=>[...document.querySelectorAll(sel)].map(e=>{const s=getComputedStyle(e);return keys.map(k=>s[k]).join('|');});
(async()=>{
 const app=spawn('Rscript',['--vanilla',path.join(__dirname,'fixture_team_controls_layer_app.R')],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,TEAM_CONTROLS_PORT:String(port)},stdio:['ignore','ignore','pipe']});
 let log='';app.stderr.on('data',d=>{log+=d;});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const url='http://127.0.0.1:'+port+'/';
  for(let i=0;;i++){try{await page.goto(url,{timeout:5000});break;}catch(e){if(i>60)throw new Error('fixture app did not start\n'+log.slice(-800));await new Promise(r=>setTimeout(r,1000));}}
  await page.waitForFunction(()=>window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.isConnected()&&document.querySelector('.irs-bar')&&document.querySelector('.selectize-input'),null,{timeout:60000});
  await page.waitForTimeout(400); // let the layer's colour transitions settle
  assert.ok(await page.evaluate(()=>[...document.styleSheets].some(s=>/controls_layer\.css/.test(s.href||''))),'controls_layer.css must be included from R/frontends/team/ui.R');
  // #ux20-designed holds designed controls checked for pixel identity below (their colour wells are styled by their own panels in the app).
  const offenders=(await page.evaluate(SCAN)).filter(o=>!o.elsewhere&&!o.sel.startsWith('#ux20-designed'));
  assert.deepEqual(offenders.map(o=>o.sel+' :: '+o.issues.join('; ')),[],'default-styled or clipped controls inside the Team shell');
  // Buttons share one look: primary filled accent, the rest outlined; plain buttons get the Team outline.
  const look=await page.evaluate(()=>{const cs=e=>getComputedStyle(e);const q=s=>document.querySelector(s);
   return {primary:cs(q('#w_act_primary')).backgroundColor,secondary:cs(q('#w_act')).borderTopColor,plain:cs(q('#ux20-workspace button:not([class])')).borderTopStyle,
    field:Math.round(q('#w_txt').getBoundingClientRect().height),select:Math.round(q('#w_sel_native').getBoundingClientRect().height),fieldBorder:cs(q('#w_txt')).borderTopColor,
    radius:cs(q('#w_num')).borderTopLeftRadius,check:cs(q('#w_chk')).accentColor,bar:cs(q('#ux20-workspace .irs-handle')).borderTopColor,
    head:cs(q('.tc-node-head button')).borderTopStyle,swatch:cs(q('.tc-settings>.tc-edit input[type=color]')).backgroundColor};});
  assert.equal(look.primary,'rgb(45, 95, 138)');assert.equal(look.check,'rgb(45, 95, 138)');assert.equal(look.bar,'rgb(45, 95, 138)');
  assert.ok(look.field>=32&&look.select>=32,'fields keep a usable height');
  assert.equal(look.plain,'solid');assert.equal(look.swatch,'rgb(255, 255, 255)');assert.equal(look.head,'solid');
  // Designed controls are pixel-identical with and without the layer, and the matrix layout
  // (Re-scale toggle included) does not move inside its container.
  const designed=['.btn-close','.tc-chip[aria-pressed=true]','.tc-chip:disabled','.gc-inspector input[type=color]','#ux20-designed > .gc-section input[type=color]','.ts-stale-close','.assistant-send','.ts-step','.dt-buttons .btn','input.palette-color','#ux20-designed .tc-content .tc-edit input[type=color]'];
  const shots=async()=>{const out=[];for(const sel of designed){const l=page.locator(sel).first();const st=await l.evaluate(e=>{const c=getComputedStyle(e);return ['fontWeight','minHeight','opacity','fontSize','padding','border','background','borderRadius','width','height'].map(k=>c[k]).join('|');});
   const box=await l.boundingBox();out.push(st+(box&&box.width>0?'|'+(await l.screenshot()).toString('base64'):''));}return out;};
  const rescale=()=>page.evaluate(()=>{const c=document.querySelector('.prop-matrix-container'),r=document.querySelector('#pm_rescale').closest('.ms-auto');const a=c.getBoundingClientRect(),b=r.getBoundingClientRect();return [Math.round(b.left-a.left),Math.round(b.top-a.top),Math.round(b.width),Math.round(a.width)];});
  await page.mouse.move(0,0);const shotsOn=await shots(),rescaleOn=await rescale();
  await page.evaluate(()=>{for(const s of document.styleSheets)if(/controls_layer\.css/.test(s.href||''))s.disabled=true;});await page.waitForTimeout(300);
  const shotsOff=await shots(),rescaleOff=await rescale();
  designed.forEach((sel,i)=>assert.ok(shotsOn[i]===shotsOff[i],sel+' must be pixel- and style-identical with and without controls_layer.css'));
  assert.deepEqual(rescaleOn,rescaleOff,'the acyl-chain matrix and its Re-scale toggle must not move');
  await page.evaluate(()=>{for(const s of document.styleSheets)if(/controls_layer\.css/.test(s.href||''))s.disabled=false;});await page.waitForTimeout(300);
  // The companion/mascot keeps exactly its own look, in the shell too.
  const companion=async()=>page.evaluate(([f,k])=>(new Function('return '+f))()('#lipidomic-companion *',k),[snapshot.toString(),STYLE_KEYS]);
  const withLayer=await companion();
  await page.evaluate(()=>{for(const s of document.styleSheets)if(/controls_layer\.css/.test(s.href||''))s.disabled=true;});
  assert.deepEqual(withLayer,await companion(),'controls_layer.css must not touch the companion/mascot');
  // Outside the Team shell (Classic markup, no body.ts-shell-app) the layer changes nothing.
  await page.goto(url+'?classic=1');await page.waitForFunction(()=>window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.isConnected()&&document.querySelector('.irs-bar'),null,{timeout:60000});
  assert.ok(!(await page.evaluate(()=>document.body.classList.contains('ts-shell-app'))));
  const all='button,input,select,textarea,.btn,.irs-bar,.selectize-input,label';
  const on=await page.evaluate(([f,s,k])=>(new Function('return '+f))()(s,k),[snapshot.toString(),all,STYLE_KEYS]);
  await page.evaluate(()=>{for(const s of document.styleSheets)if(/controls_layer\.css/.test(s.href||''))s.disabled=true;});
  const off=await page.evaluate(([f,s,k])=>(new Function('return '+f))()(s,k),[snapshot.toString(),all,STYLE_KEYS]);
  assert.deepEqual(on,off,'controls_layer.css must not change any control outside body.ts-shell-app');
  console.log('PASS: no default-styled or clipped control in the Team shell; designed controls (btn-close, chips, colour wells, stale strip, steps, DT buttons), the chain matrix, Classic and the companion are unchanged by the layer');
 }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
