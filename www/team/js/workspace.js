(function(){'use strict';
 var authenticated=false, legacy=1, screen='data-choice', pending=null, last='', paintedScreen='', navSequence=0, preparation=null, busy=false;
 var screens=[
  ['data-choice',1,'Choose how to begin','Start with a new matrix or open a private saved checkpoint.'],
  ['data-matrix',1,'Add your abundance matrix','Upload the measurements you want to analyze. Your original file stays unchanged.'],
  ['data-metadata',1,'Add sample labels','Add a metadata file, or explicitly continue without one.'],
  ['review-labels',2,'Check sample labels','Review the interpreted labels and correct anything that looks wrong.'],
  ['review-design',2,'Describe your study','Name the experimental unit and choose how samples are related.'],
  ['review-confirm',2,'Confirm the design','Check the selected samples, then confirm your review.'],
  ['review-prepare',3,'Prepare the data','Choose detection, missing-value handling, and normalization; then click Prepare data.'],
  ['review-quality',3,'Review sample quality','Inspect the sample plot. Excluding a sample requires a reason and confirmation.'],
  ['review-comparison',4,'Choose your question','Explore the big picture or compare conditions. More questions are available below.'],
  ['canvas',5,'Build your figure','Add plots, arrange them, and export when ready.']
 ];
 function entry(id){return screens.find(function(x){return x[0]===id;})||screens[0];}
 function stage(step){return step<=1?'data':step<=4?'review':'canvas';}
 function send(id,value){if(window.Shiny)Shiny.setInputValue(id,value,{priority:'event'});}
 function mark(selector,id){document.querySelectorAll(selector).forEach(function(el){el.dataset.twPanel=id;});}
 function setup(){
  mark('#guide-experiment-abundance','data-matrix');mark('#guide-experiment-metadata,#guide-experiment-design','data-metadata');
  mark('[data-value="Experiment"] .guide-page > details.guide-panel','data-choice');
  var design=document.querySelector('[data-value="Design"] .guide-page');if(design){var first=design.querySelector('.guide-panel');if(first)first.dataset.twPanel='review-labels';}
  mark('#guide-design-decisions','review-design');mark('#guide-sample-selection,#guide-design-review','review-confirm');
  mark('[data-value="Preparation"] .guide-columns','review-prepare');mark('#guide-qc-review','review-quality');
  mark('[data-value="Question"] .guide-goals,[data-value="Question"] #guide_question_summary,[data-value="Question"] #guide_question_requirements,[data-value="Question"] #guide-contrast-controls','review-comparison');
  var prep=document.querySelector('[data-value="Preparation"] .guide-columns > .guide-panel:first-child');
  if(prep&&!prep.querySelector('.tw-advanced-prep')){
   var details=document.createElement('details');details.className='tw-advanced-prep';var summary=document.createElement('summary');summary.textContent='More preparation settings';details.appendChild(summary);
   ['qc_pca_tab-dropNonDetected','qc_pca_tab-detectionScope','qc_pca_tab-imputationSeed'].forEach(function(id){var el=document.getElementById(id),box=el&&el.closest('.shiny-input-container');if(box)details.appendChild(box);});prep.appendChild(details);
  }
  var qc=document.getElementById('guide-qc-review');if(qc&&!qc.querySelector('.tw-qc-help')){
   var intro=qc.querySelector(':scope > p'),steps=qc.querySelector(':scope > ol');if(intro||steps){var help=document.createElement('details');help.className='tw-qc-help';var helpTitle=document.createElement('summary');helpTitle.textContent='How to review samples';help.appendChild(helpTitle);if(intro)help.appendChild(intro);if(steps)help.appendChild(steps);qc.insertBefore(help,qc.firstChild);}
  }
  var goals=document.querySelector('[data-value="Question"] .guide-goals');if(goals&&!goals.querySelector('.tw-more-goals')){
   var more=document.createElement('details');more.className='tw-more-goals';var summary=document.createElement('summary');summary.textContent='More questions';more.appendChild(summary);
   Array.from(goals.children).slice(2).forEach(function(el){more.appendChild(el);});goals.appendChild(more);
  }
 }
 function state(){var e=entry(screen),i=screens.indexOf(e),next=document.querySelector('[data-tw-next]');return {stage:stage(e[1]),legacyStep:legacy,substep:screen,substepIndex:i+1,substepCount:screens.length,canBack:authenticated&&i>0,canNext:authenticated&&i<screens.length-1&&!(next&&next.disabled),nextReason:next&&next.disabled?(document.getElementById('tw-next')||{}).textContent||'':'',tool:document.body.dataset.guideAnalysis==='true'?'advanced analysis':'',authenticated:authenticated};}
 function announce(message){var p=document.getElementById('tw-next');if(p)p.textContent=message;}
 function paint(){var root=document.getElementById('team-workspace');if(!root)return;setup();document.body.classList.add('team-workspace-app');document.body.dataset.teamAuthenticated=String(authenticated);
  var raw=document.body.dataset.guideStep;if(/^[1-7]$/.test(raw||'')){var step=Number(raw);if(step!==legacy){legacy=step;if(pending&&entry(pending.id)[1]===legacy){screen=pending.id;if(pending.ack)pending=null;}else if(entry(screen)[1]!==legacy){screen=({1:'data-choice',2:'review-labels',3:'review-prepare',4:'review-comparison',5:'canvas',6:'canvas',7:'canvas'})[legacy];pending=null;}}}
  var e=entry(screen),current=stage(e[1]);document.body.dataset.teamStage=current;document.body.dataset.twScreen=screen;
  root.querySelectorAll('[data-tw-stage]').forEach(function(b){b.setAttribute('aria-current',b.dataset.twStage===current?'step':'false');});
  var title=document.getElementById('tw-screen-title'),help=document.getElementById('tw-screen-help'),progress=document.getElementById('tw-progress');if(title)title.textContent=e[2];if(help)help.textContent=e[3];if(progress)progress.textContent='SCREEN '+(screens.indexOf(e)+1)+' OF '+screens.length;
  var back=root.querySelector('[data-tw-back]'),next=root.querySelector('[data-tw-next]');if(back)back.disabled=!authenticated||!!pending||busy||screen==='data-choice';if(next){
   var matrixReady=/Abundance matrix loaded/i.test((document.getElementById('guide_experiment_summary')||{}).textContent||'');
   var metadataReady=!!document.querySelector('#guide_experiment_next button[data-guide-step="2"]');
   var designReady=/Design review complete/i.test((document.getElementById('guide_design_status')||{}).textContent||'');
   var qualityReady=!!preparation&&preparation.ready===true&&!preparation.pending&&!preparation.running&&!busy;
   next.disabled=!authenticated||screen==='data-choice'||screen==='canvas'||(screen==='data-matrix'&&!matrixReady)||(screen==='data-metadata'&&!metadataReady)||(screen==='review-confirm'&&!designReady)||(screen==='review-prepare'&&!qualityReady);
   next.textContent=screen==='review-comparison'?'Open Canvas →':'Next →';
   if(authenticated&&screen==='data-matrix'&&!matrixReady)announce('Upload or open an abundance matrix before continuing.');
   if(authenticated&&screen==='data-metadata'&&!metadataReady)announce('Confirm metadata or choose “Continue without additional metadata” to continue.');
   if(authenticated&&screen==='review-confirm'&&!designReady)announce('Review the samples and confirm the design before continuing.');
   if(authenticated&&screen==='review-prepare'&&!qualityReady)announce('Click Prepare data and wait for the completed run before continuing.');
  }
  document.querySelectorAll('[data-tw-panel]').forEach(function(el){el.classList.toggle('tw-panel-hidden',el.dataset.twPanel!==screen);});
  var library=document.querySelector('.team-library');if(library){var h=library.querySelector('h3'),p=library.querySelector('p');if(h)h.textContent=authenticated?'Resume an analysis':'Welcome to your workspace';if(p)p.textContent=authenticated?'Choose a project available to your account, or continue with a new upload.':'Sign in to access your private projects and start a new analysis.';}
  if(!authenticated)announce('Sign in to start an analysis.');else if(!pending&&next&&(!next.disabled||screen==='data-choice'||screen==='canvas'))announce('');
  if(screen!==paintedScreen){paintedScreen=screen;requestAnimationFrame(function(){if(window.jQuery)jQuery(root).trigger('shown');window.dispatchEvent(new Event('resize'));});if(authenticated&&title&&document.activeElement!==title)title.focus({preventScroll:true});}
  var s=state(),key=JSON.stringify(s);if(key!==last){last=key;window.dispatchEvent(new CustomEvent('team-workspace-state',{detail:s}));}
 }
 function navigate(id){
  if(!authenticated||pending||busy||!screens.some(function(x){return x[0]===id;}))return false;
  var e=entry(id);if(e[1]===legacy){screen=id;paint();return true;}
  var token=++navSequence;pending={id:id,token:token};
  send('team_workspace_nav',{step:e[1],token:token});paint();announce('Opening the next screen…');
  setTimeout(function(){if(pending&&pending.token===token)announce('Waiting for the server…');},1800);return true;
 }
 function next(){paint();var i=screens.findIndex(function(x){return x[0]===screen;}),button=document.querySelector('[data-tw-next]');if(i<0||i>=screens.length-1||!authenticated||(button&&button.disabled))return false;
  if(screen==='data-metadata'&&!document.querySelector('#guide_experiment_next button[data-guide-step="2"]')){announce('Confirm metadata or choose “Continue without additional metadata” first.');return false;}
  if(screen==='review-prepare'){if(!preparation||preparation.ready!==true||preparation.pending||preparation.running||busy){announce('Click Prepare data and wait for the completed run before reviewing sample quality.');return false;}}
  return navigate(screens[i+1][0]);}
 function back(){var i=screens.findIndex(function(x){return x[0]===screen;});return i>0?navigate(screens[i-1][0]):false;}
 function go(name){var id={data:'data-choice',review:'review-labels',canvas:'canvas'}[name];return id?navigate(id):false;}
 function init(){if(!document.getElementById('team-workspace'))return;window.TeamWorkspace={go:go,next:next,back:back,state:state};
  document.querySelectorAll('[data-tw-stage]').forEach(function(b){b.addEventListener('click',function(){go(b.dataset.twStage);});});
  document.querySelector('[data-tw-next]').addEventListener('click',next);document.querySelector('[data-tw-back]').addEventListener('click',back);
  document.querySelector('[data-tw-choice="matrix"]').addEventListener('click',function(){navigate('data-matrix');});
  var logout=document.querySelector('[data-tw-logout]');if(logout)logout.addEventListener('click',function(){var b=document.getElementById('team_library_logout');if(!b)return;logout.disabled=true;logout.textContent='Signing out…';b.click();});
  new MutationObserver(paint).observe(document.body,{attributes:true,attributeFilter:['data-guide-step','data-guide-analysis']});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-auth-state',function(x){authenticated=!!x.authenticated;paint();});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-navigation-receipt',function(x){
   if(!pending||x.token!==pending.token)return;
   pending.ack=x;
   if(!x.accepted){pending=null;screen=({1:'data-matrix',2:'review-confirm',3:'review-prepare'})[x.step]||screen;paint();announce(x.reason||'Complete the required review before continuing.');}
   else if(legacy===Number(x.step)){screen=pending.id;pending=null;paint();}
  });
  window.addEventListener('team-preparation-state',function(e){preparation=e.detail;paint();});
  if(window.jQuery)jQuery(document).on('shiny:busy',function(){busy=true;paint();}).on('shiny:idle',function(){busy=false;paint();});

  if(window.jQuery){jQuery(document).on('shiny:connected',function(){send('team_workspace_ready',Date.now());paint();});jQuery(document).on('shiny:disconnected',function(){authenticated=false;paint();});jQuery(document).on('shiny:value',function(){requestAnimationFrame(paint);});}
  if(window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.isConnected())send('team_workspace_ready',Date.now());paint();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
