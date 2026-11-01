(function(){'use strict';
 var authenticated=false, legacy=1, screen='data-choice', pending=null, last='', paintedScreen='', navSequence=0, reviewEntrySequence=0, resumeEntryPending=false, resumeRestoreReady=false, preparation=null, busy=false;
 var screens=[
  ['data-choice',1,'Choose how to begin','Start with a new matrix or open a private saved checkpoint.'],
  ['data-matrix',1,'Add your abundance matrix','Upload the measurements you want to analyze. Your original file stays unchanged.'],
  ['data-metadata',1,'Add sample labels','Add a metadata file, or explicitly continue without one.'],
  ['review-single',3,'Review your data','Adjust detection and watch the PCA update. Click a point to inspect a sample; exclusions can be undone.'],
  ['canvas',5,'Build your figure','Add plots, arrange them, and export when ready.']
 ];
 function entry(id){return screens.find(function(x){return x[0]===id;})||screens[0];}
 function stage(step){return step<=1?'data':step<=4?'review':'canvas';}
 function send(id,value){if(window.Shiny)Shiny.setInputValue(id,value,{priority:'event'});}
 function requestReviewEntry(source){
  var token=++reviewEntrySequence;
  if(window.console&&console.info)console.info('[Team review] entry requested',{source:source,legacyStep:legacy,authenticated:authenticated,busy:busy});
  send('team_review_prepare',{kind:'entry',source:'human',token:token});
 }
 function maybeRequestRestoredReview(){
  if(!resumeEntryPending||!resumeRestoreReady||!authenticated||legacy!==3||busy)return;
  resumeEntryPending=false;resumeRestoreReady=false;requestReviewEntry('resume');
 }
 var idleReconcilePending=false;
 function reconcileIdle(){
  if(!busy||idleReconcilePending||!window.Shiny||!Shiny.shinyapp)return;
  idleReconcilePending=true;
  queueMicrotask(function(){queueMicrotask(function(){idleReconcilePending=false;if(busy&&!document.documentElement.classList.contains('shiny-busy')){busy=false;paint();}});});
 }
 function mark(selector,id){document.querySelectorAll(selector).forEach(function(el){el.dataset.twPanel=id;});}
 function setup(){
  mark('#guide-experiment-abundance','data-matrix');mark('#guide-experiment-metadata,#guide-experiment-design','data-metadata');
  mark('[data-value="Experiment"] .guide-page > details.guide-panel','data-choice');
  mark('.tw-simple-review','review-single');
  var goals=document.querySelector('[data-value="Question"] .guide-goals');if(goals&&!goals.querySelector('.tw-more-goals')){
   var more=document.createElement('details');more.className='tw-more-goals';var summary=document.createElement('summary');summary.textContent='More questions';more.appendChild(summary);
   Array.from(goals.children).slice(2).forEach(function(el){more.appendChild(el);});goals.appendChild(more);
  }
 }
 function state(){var e=entry(screen),i=screens.indexOf(e),next=document.querySelector('[data-tw-next]');return {stage:stage(e[1]),legacyStep:legacy,substep:screen,substepIndex:i+1,substepCount:screens.length,canBack:authenticated&&i>0,canNext:authenticated&&i<screens.length-1&&!(next&&next.disabled),nextReason:next&&next.disabled?(document.getElementById('tw-next')||{}).textContent||'':'',preparationReady:!!preparation&&preparation.ready===true&&!preparation.pending&&!preparation.running&&!preparation.restoring&&!busy,preparationPending:!!preparation&&preparation.pending===true,preparationRunning:!!preparation&&(preparation.running===true||busy),preparationRestoring:!!preparation&&preparation.restoring===true,tool:document.body.dataset.guideAnalysis==='true'?'advanced analysis':'',authenticated:authenticated};}
 function announce(message){var p=document.getElementById('tw-next');if(p)p.textContent=message;}
 function canvasReadiness(){
  if(preparation&&preparation.restoring)return 'Restoring your saved session. Wait before opening Canvas.';
  if(preparation&&(preparation.running||busy))return 'The workspace is updating. Wait before opening Canvas.';
  if(preparation&&preparation.pending)return 'Data changes are pending. Review and prepare them before opening Canvas.';
  return 'Prepare the current data in Review before opening Canvas.';
 }
 function paint(){var root=document.getElementById('team-workspace');if(!root)return;setup();document.body.classList.add('team-workspace-app');document.body.dataset.teamAuthenticated=String(authenticated);
  var raw=document.body.dataset.guideStep;if(/^[1-7]$/.test(raw||'')){var step=Number(raw);if(step!==legacy){legacy=step;if(pending&&entry(pending.id)[1]===legacy){screen=pending.id;if(pending.ack){var completed=pending;pending=null;if(completed.prepareReviewEntry)requestReviewEntry('next');}}else if(entry(screen)[1]!==legacy){screen=({1:'data-choice',2:'review-single',3:'review-single',4:'review-single',5:'canvas',6:'canvas',7:'canvas'})[legacy];pending=null;}}}
  var e=entry(screen),current=stage(e[1]);document.body.dataset.teamStage=current;document.body.dataset.twScreen=screen;
  var canvasReady=!!preparation&&preparation.ready===true&&!preparation.pending&&!preparation.running&&!preparation.restoring&&!busy;
  root.querySelectorAll('[data-tw-stage]').forEach(function(b){
   b.setAttribute('aria-current',b.dataset.twStage===current?'step':'false');
   b.setAttribute('aria-describedby','tw-next');
   var reason=!authenticated?'Sign in to start an analysis.':pending?'Wait for the current navigation to finish.':busy?'A workspace update is running. Wait before switching steps.':b.dataset.twStage==='canvas'&&!canvasReady?canvasReadiness():'';
   b.disabled=!!reason;
   if(reason)b.setAttribute('aria-label',(b.querySelector('strong')||b).textContent.trim()+'. '+reason);else b.removeAttribute('aria-label');
  });
  var title=document.getElementById('tw-screen-title'),help=document.getElementById('tw-screen-help'),progress=document.getElementById('tw-progress');if(title)title.textContent=e[2];if(help)help.textContent=e[3];if(progress){var stageScreens=screens.filter(function(item){return stage(item[1])===current;});progress.textContent=current==='review'?'02 / REVIEW':current.toUpperCase()+' · '+(stageScreens.indexOf(e)+1)+' OF '+stageScreens.length;}
  var back=root.querySelector('[data-tw-back]'),next=root.querySelector('[data-tw-next]');if(back)back.disabled=!authenticated||!!pending||busy||screen==='data-choice';if(next){
   var matrixReady=/Abundance matrix loaded/i.test((document.getElementById('guide_experiment_summary')||{}).textContent||'');
   var metadataReady=!!document.querySelector('#guide_experiment_next button[data-guide-step="2"]');
   var qualityReady=!!preparation&&preparation.ready===true&&!preparation.pending&&!preparation.running&&!preparation.restoring&&!busy;
   next.disabled=!authenticated||screen==='data-choice'||screen==='canvas'||(screen==='data-matrix'&&!matrixReady)||(screen==='data-metadata'&&!metadataReady)||(screen==='review-single'&&!qualityReady);
   next.textContent=screen==='review-single'?'Continue to Canvas →':'Next →';
   if(authenticated&&screen==='data-matrix'&&!matrixReady)announce('Upload or open an abundance matrix before continuing.');
   if(authenticated&&screen==='data-metadata'&&!metadataReady)announce('Confirm metadata or choose “Continue without additional metadata” to continue.');
   if(authenticated&&screen==='review-single'&&!qualityReady)announce(preparation&&(preparation.running||preparation.pending)||busy?'Updating…':'The table and plot update automatically when you change the threshold or sample selection.');
  }
  document.querySelectorAll('[data-tw-panel]').forEach(function(el){el.classList.toggle('tw-panel-hidden',el.dataset.twPanel!==screen);});
  var library=document.querySelector('.team-library');if(library){var h=library.querySelector('h3'),p=library.querySelector('p'),saving=legacy===7;if(h)h.textContent=!authenticated?'Your analysis starts here':saving?'Save your workspace':'Continue a saved analysis';if(p)p.textContent=!authenticated?'Sign in to open your private projects.':saving?'Keep your data, canvas, colors and finished figures together. Changes are saved automatically. You can also name a checkpoint to keep a milestone.':'Choose a project and the checkpoint you want to reopen.';}
  if(!authenticated)announce('Sign in to start an analysis.');
  else if(pending)announce('Opening the requested screen…');
  else if(busy)announce('A workspace update is running. Wait before switching steps.');
  else if(!canvasReady&&(screen==='review-single'||(next&&!next.disabled)))announce(canvasReadiness());
  else if(!canvasReady&&screen==='data-choice')announce('Open a saved analysis or upload an abundance matrix before opening Canvas.');
  else if(!pending&&next&&(!next.disabled||screen==='data-choice'||screen==='canvas'))announce('');
  if(screen!==paintedScreen){paintedScreen=screen;requestAnimationFrame(function(){if(window.jQuery)jQuery(root).trigger('shown');window.dispatchEvent(new Event('resize'));});if(authenticated&&title&&document.activeElement!==title)title.focus({preventScroll:true});}
  maybeRequestRestoredReview();
  var s=state(),key=JSON.stringify(s);if(key!==last){last=key;window.dispatchEvent(new CustomEvent('team-workspace-state',{detail:s}));}
 }
 function navigate(id,prepareReviewEntry){
  if(!authenticated||pending||busy||!screens.some(function(x){return x[0]===id;}))return false;
  if(id==='canvas'&&(!preparation||preparation.ready!==true||preparation.pending||preparation.running||preparation.restoring)){announce(canvasReadiness());return false;}
  var e=entry(id);if(e[1]===legacy && !(id==='canvas' && document.body.dataset.guideAnalysis==='true')){screen=id;paint();return true;}
  var token=++navSequence;pending={id:id,token:token,prepareReviewEntry:prepareReviewEntry===true&&id==='review-single'};
  send('team_workspace_nav',{step:e[1],token:token});paint();announce('Opening the requested screen…');
  setTimeout(function(){if(pending&&pending.token===token)announce('Waiting for the server…');},1800);return true;
 }
 function next(event){paint();var i=screens.findIndex(function(x){return x[0]===screen;}),button=document.querySelector('[data-tw-next]');if(i<0||i>=screens.length-1||!authenticated||(button&&button.disabled))return false;
  if(screen==='data-metadata'&&!document.querySelector('#guide_experiment_next button[data-guide-step="2"]')){announce('Confirm metadata or choose “Continue without additional metadata” first.');return false;}
  if(screen==='review-single'){if(!preparation||preparation.ready!==true||preparation.pending||preparation.running||preparation.restoring||busy){announce(preparation&&preparation.restoring?'Restoring your saved session…':preparation&&(preparation.running||preparation.pending)||busy?'Updating…':'Wait for the data update to finish before continuing to Canvas.');return false;}}
  var target=screens[i+1][0],prepareReviewEntry=!!(event&&event.isTrusted&&screen==='data-metadata'&&target==='review-single');if(prepareReviewEntry)resumeEntryPending=false;return navigate(target,prepareReviewEntry);}
 function back(){var i=screens.findIndex(function(x){return x[0]===screen;});return i>0?navigate(screens[i-1][0]):false;}
 function go(name){var id={data:'data-choice',review:'review-single',canvas:'canvas'}[name];return id?navigate(id):false;}
 function disconnectedNotice(show){
  var notice=document.getElementById('team_library_disconnected');
  if(!notice){
   notice=document.createElement('section');notice.id='team_library_disconnected';notice.className='tw-disconnected-notice';notice.setAttribute('role','alert');
   var title=document.createElement('h2');title.textContent='Connection lost';notice.appendChild(title);
   var message=document.createElement('p');message.textContent='The network connection or this session has disconnected. Reload and sign in to continue. Unsaved changes will be lost when you reload.';notice.appendChild(message);
   var button=document.createElement('button');button.type='button';button.textContent='Reload and sign in';button.addEventListener('click',function(){window.location.reload();});notice.appendChild(button);
   document.body.appendChild(notice);
  }
  notice.hidden=!show;
 }
 function connectionDiagnostics(){
  if(new URLSearchParams(window.location.search).get('connectionDiagnostics')!=='1')return;
  var log=document.createElement('pre');log.id='team-connection-diagnostics';log.style.cssText='position:fixed;bottom:4px;left:4px;z-index:100000;background:white;color:#172332;border:1px solid #bbc8d4;font:11px monospace;max-width:90vw;max-height:110px;overflow:auto';document.body.appendChild(log);
  function record(name,detail){var row=new Date().toISOString()+' '+name+' '+(detail||'');log.textContent=(log.textContent+'\n'+row).split('\n').slice(-12).join('\n');console.info('[Team connection]',row);}
  function attach(){var socket=window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.$socket;if(!socket||socket.__teamObserved)return;socket.__teamObserved=true;record('socket-attached','state='+socket.readyState);socket.addEventListener('close',function(e){record('socket-close','code='+e.code+' clean='+e.wasClean);});socket.addEventListener('error',function(){record('socket-error');});}
  window.addEventListener('beforeunload',function(){record('beforeunload');});window.addEventListener('pagehide',function(e){record('pagehide','persisted='+e.persisted);});
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.tc-preview-pdf'))record('pdf-click');},true);
  if(window.jQuery)jQuery(document).on('shiny:connected',attach).on('shiny:disconnected',function(){record('shiny-disconnected');});attach();
 }
 function init(){if(!document.getElementById('team-workspace'))return;connectionDiagnostics();window.TeamWorkspace={go:go,next:next,back:back,state:state};
  document.querySelectorAll('[data-tw-stage]').forEach(function(b){b.addEventListener('click',function(){go(b.dataset.twStage);});});
  document.querySelector('[data-tw-next]').addEventListener('click',function(event){next(event);});document.querySelector('[data-tw-back]').addEventListener('click',back);
  // "Open latest" on the Data side card is the same human resume intent.
  document.addEventListener('click',function(event){if(event.target.closest&&event.target.closest('#team_library_resume,.ts-data-open')){if(window.console&&console.info)console.info('[Team review] resume click observed',{trusted:!!event.isTrusted,legacyStep:legacy,authenticated:authenticated});if(event.isTrusted){resumeEntryPending=true;resumeRestoreReady=false;}}},true);
  // A human-selected session ZIP has the same reviewed restore intent as a
  // private checkpoint. Wait for server restore completion and idle Review;
  // entry preparation reuses saved settings through the existing R guard.
  document.addEventListener('change',function(event){
   var target=event.target;
   if(event.isTrusted&&target&&target.id==='data_hub-import_session_file'&&target.type==='file'&&target.files&&target.files.length){
    resumeEntryPending=true;resumeRestoreReady=false;
   }
  },true);
  document.querySelector('[data-tw-choice="matrix"]').addEventListener('click',function(){navigate('data-matrix');});
  var logout=document.querySelector('[data-tw-logout]');if(logout)logout.addEventListener('click',function(){var b=document.getElementById('team_library_logout');if(!b)return;logout.disabled=true;logout.textContent='Signing out…';b.click();});
  new MutationObserver(paint).observe(document.body,{attributes:true,attributeFilter:['data-guide-step','data-guide-analysis']});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-auth-state',function(x){authenticated=!!x.authenticated;window.dispatchEvent(new CustomEvent('team-auth-changed',{detail:{authenticated:authenticated}}));paint();});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-review-restore-ready',function(x){if(window.console&&console.info)console.info('[Team review] restore ready received',{ready:!!(x&&x.ready===true),resumePending:resumeEntryPending,legacyStep:legacy,authenticated:authenticated,busy:busy});if(x&&x.ready===true&&resumeEntryPending){resumeRestoreReady=true;paint();}});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-review-entry-diagnostic',function(x){if(window.console&&console.info)console.info('[Team review] server entry diagnostic',JSON.stringify(x||{}));});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-navigation-receipt',function(x){
   if(!pending||x.token!==pending.token)return;
   pending.ack=x;
   if(!x.accepted){pending=null;screen=({1:'data-matrix',2:'review-single',3:'review-single',4:'review-single'})[x.step]||screen;paint();announce(x.reason||'Prepare the current data before continuing.');}
   else if(legacy===Number(x.step)){var completed=pending;screen=completed.id;pending=null;if(completed.prepareReviewEntry)requestReviewEntry('next');paint();}
  });
  window.addEventListener('team-preparation-state',function(e){preparation=e.detail;paint();});
  if(window.jQuery)jQuery(document).on('shiny:busy',function(){busy=true;paint();}).on('shiny:idle',function(){busy=false;paint();});
  new MutationObserver(reconcileIdle).observe(document.documentElement,{attributes:true,attributeFilter:['class']});

  if(window.jQuery){jQuery(document).on('shiny:connected',function(){disconnectedNotice(false);reconcileIdle();send('team_workspace_ready',Date.now());paint();});jQuery(document).on('shiny:disconnected',function(){authenticated=false;disconnectedNotice(true);paint();});jQuery(document).on('shiny:value',function(){requestAnimationFrame(paint);});}
  if(window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.isConnected())send('team_workspace_ready',Date.now());paint();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
