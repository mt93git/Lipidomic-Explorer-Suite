(function(){'use strict';
 var authenticated=false, legacy=1, screen='data-choice', pending=null, last='', paintedScreen='', navSequence=0, reviewEntrySequence=0, resumeEntryPending=false, resumeRestoreReady=false, preparation=null, busy=false;
 // A stage click that lands while the steps are locked only by a transient
 // Shiny busy cycle is remembered here and sent once, when the app is idle.
 var queued=null, lockedFocus=null, STAGE_IDS={data:'data-choice',review:'review-single',canvas:'canvas'}, STAGE_NAMES={data:'Data',review:'Review',canvas:'Canvas'};
 var screens=[
  // Resolved when painted: this script runs in <head>, before the body marks a session-only workspace.
  ['data-choice',1,'Choose how to begin',function(){return sessionOnly()?'Start with a new matrix or resume a session ZIP you saved earlier. This local session is not saved automatically.':'Start with a new matrix or open a private saved checkpoint.';}],
  ['data-matrix',1,'Add your abundance matrix','Upload the measurements you want to analyze. Your original file stays unchanged.'],
  ['data-metadata',1,'Add sample labels','Add a metadata file, or explicitly continue without one.'],
  ['review-single',3,'Review your data','Adjust detection and watch the PCA update. Click a point to inspect a sample; exclusions can be undone.'],
  ['canvas',5,'Build your figure','Add plots, arrange them, and export when ready.']
 ];
 function sessionOnly(){var root=document.getElementById('team-workspace');return window.LIPIDOMIC_TEAM_SESSION_ONLY===true||(!!root&&root.dataset.twSessionOnly==='true');}
 function helpText(e){return typeof e[3]==='function'?e[3]():e[3];}
 function entry(id){return screens.find(function(x){return x[0]===id;})||screens[0];}
 function stage(step){return step<=1?'data':step<=4?'review':'canvas';}
 function send(id,value){if(window.Shiny)Shiny.setInputValue(id,value,{priority:'event'});}
 function requestReviewEntry(source){
  var token=++reviewEntrySequence;
  if(window.console&&console.info)console.info('[Team review] entry requested',{source:source,legacyStep:legacy,authenticated:authenticated,busy:busy});
  send('team_review_prepare',{kind:'entry',source:'human',token:token});
 }
 // Sent as soon as the server reports the restore ready at Review, even while
 // Shiny is busy: the server queues it and runs the same guarded preparation
 // after that flush (guided_workflow.R checks the step there). Waiting for idle
 // only added the restored canvas and hidden outputs' render time before Review.
 function maybeRequestRestoredReview(){
  if(!resumeEntryPending||!resumeRestoreReady||!authenticated||legacy!==3)return;
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
 function state(){var e=entry(screen),i=screens.indexOf(e),next=document.querySelector('[data-tw-next]');return {stage:stage(e[1]),legacyStep:legacy,substep:screen,substepIndex:i+1,substepCount:screens.length,canBack:authenticated&&i>0,canNext:authenticated&&i<screens.length-1&&!(next&&next.disabled),nextReason:next&&next.disabled?statusText():'',preparationReady:!!preparation&&preparation.ready===true&&!preparation.pending&&!preparation.running&&!preparation.restoring&&!busy,preparationPending:!!preparation&&preparation.pending===true,preparationRunning:!!preparation&&(preparation.running===true||busy),preparationRestoring:!!preparation&&preparation.restoring===true,tool:document.body.dataset.guideAnalysis==='true'?'advanced analysis':document.body.dataset.guideToolPage==='true'?'tool page':'',authenticated:authenticated};}
 function canvasReadyIgnoringBusy(){return !!preparation&&preparation.ready===true&&!preparation.pending&&!preparation.running&&!preparation.restoring;}
 // True when the only thing stopping this stage is the busy lock itself.
 function busyOnly(name){return authenticated&&!pending&&busy&&!!STAGE_IDS[name]&&(name!=='canvas'||canvasReadyIgnoringBusy());}
 function queuedMessage(name){return 'Opening '+STAGE_NAMES[name]+' when the update finishes.';}
 // status_hold.js (when loaded) keeps each status text up for ~1 s so busy cycles do not blink it.
 function announce(message,urgent){var p=document.getElementById('tw-next');if(!p)return;if(window.TeamStatusHold)TeamStatusHold.set(p,message,urgent);else p.textContent=message;}
 function statusText(){var p=document.getElementById('tw-next');return window.TeamStatusHold?TeamStatusHold.target(p):(p||{}).textContent||'';}
 function canvasReadiness(){
  if(preparation&&preparation.restoring)return 'Restoring your saved session. Wait before opening Canvas.';
  if(preparation&&(preparation.running||busy))return 'The workspace is updating. Wait before opening Canvas.';
  if(preparation&&preparation.pending)return 'Data changes are pending. Review and prepare them before opening Canvas.';
  return 'Prepare the current data in Review before opening Canvas.';
 }
 function paint(){var root=document.getElementById('team-workspace');if(!root)return;setup();document.body.classList.add('team-workspace-app');document.body.dataset.teamAuthenticated=String(authenticated);
  var raw=document.body.dataset.guideStep;if(/^[1-7]$/.test(raw||'')){var step=Number(raw);if(step!==legacy){legacy=step;if(pending&&entry(pending.id)[1]===legacy){screen=pending.id;if(pending.ack){var completed=pending;pending=null;if(completed.prepareReviewEntry)requestReviewEntry('next');}}else if(entry(screen)[1]!==legacy){screen=({1:'data-choice',2:'review-single',3:'review-single',4:'review-single',5:'canvas',6:'canvas',7:'canvas'})[legacy];pending=null;}}}
  if(queued&&(!authenticated||(queued.sent&&(!pending||pending.token!==queued.token))))queued=null;
  var e=entry(screen),current=stage(e[1]);document.body.dataset.teamStage=current;document.body.dataset.twScreen=screen;
  var canvasReady=!!preparation&&preparation.ready===true&&!preparation.pending&&!preparation.running&&!preparation.restoring&&!busy;
  root.querySelectorAll('[data-tw-stage]').forEach(function(b){
   b.setAttribute('aria-current',b.dataset.twStage===current?'step':'false');
   b.setAttribute('aria-describedby','tw-next');
   var reason=!authenticated?'Sign in to start an analysis.':pending?'Wait for the current navigation to finish.':busy?'A workspace update is running. Wait before switching steps.':b.dataset.twStage==='canvas'&&!canvasReady?canvasReadiness():'';
   var waiting=!!queued&&queued.stage===b.dataset.twStage;
   if(waiting)reason=queuedMessage(queued.stage);
   b.disabled=!!reason;
   if(reason)b.setAttribute('aria-label',(b.querySelector('strong')||b).textContent.trim()+'. '+reason);else b.removeAttribute('aria-label');
   if(reason&&busyOnly(b.dataset.twStage))b.dataset.twBusyLock='true';else delete b.dataset.twBusyLock;
   if(waiting){b.dataset.twQueued='true';b.setAttribute('aria-busy','true');b.title=reason;}
   else if(b.dataset.twQueued){delete b.dataset.twQueued;b.removeAttribute('aria-busy');b.removeAttribute('title');}
  });
  if(lockedFocus)setTimeout(restoreLockedFocus,0);
  var title=document.getElementById('tw-screen-title'),help=document.getElementById('tw-screen-help'),progress=document.getElementById('tw-progress');if(title)title.textContent=e[2];if(help)help.textContent=helpText(e);if(progress){var stageScreens=screens.filter(function(item){return stage(item[1])===current;});progress.textContent=current==='review'?'02 / REVIEW':current.toUpperCase()+' · '+(stageScreens.indexOf(e)+1)+' OF '+stageScreens.length;}
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
  else if(queued&&!queued.sent)announce(queuedMessage(queued.stage));
  else if(pending)announce('Opening the requested screen…');
  else if(busy)announce('A workspace update is running. Wait before switching steps.');
  else if(!canvasReady&&(screen==='review-single'||(next&&!next.disabled)))announce(canvasReadiness());
  else if(!canvasReady&&screen==='data-choice')announce('Open a saved analysis or upload an abundance matrix before opening Canvas.');
  else if(!pending&&next&&(!next.disabled||screen==='data-choice'||screen==='canvas'))announce('');
  if(screen!==paintedScreen){paintedScreen=screen;requestAnimationFrame(function(){if(window.jQuery)jQuery(root).trigger('shown');window.dispatchEvent(new Event('resize'));});if(authenticated&&title&&document.activeElement!==title)title.focus({preventScroll:true});}
  maybeRequestRestoredReview();
  drainQueue();
  var s=state(),key=JSON.stringify(s);if(key!==last){last=key;window.dispatchEvent(new CustomEvent('team-workspace-state',{detail:s}));}
 }
 function navigate(id,prepareReviewEntry,fromQueue){
  // Any other navigation is a newer intent than a queued stage click.
  if(!fromQueue&&queued&&!queued.sent)queued=null;
  if(!authenticated||pending||busy||!screens.some(function(x){return x[0]===id;}))return false;
  if(id==='canvas'&&(!preparation||preparation.ready!==true||preparation.pending||preparation.running||preparation.restoring)){announce(canvasReadiness(),true);return false;}
  var e=entry(id);if(e[1]===legacy && !(id==='canvas' && (document.body.dataset.guideAnalysis==='true'||document.body.dataset.guideToolPage==='true'))){screen=id;paint();return true;}
  var token=++navSequence;pending={id:id,token:token,prepareReviewEntry:prepareReviewEntry===true&&id==='review-single'};
  if(fromQueue&&queued&&queued.sent)queued.token=token;
  send('team_workspace_nav',{step:e[1],token:token});paint();announce('Opening the requested screen…');
  setTimeout(function(){if(pending&&pending.token===token)announce('Waiting for the server…');},1800);return true;
 }
 function next(event){paint();var i=screens.findIndex(function(x){return x[0]===screen;}),button=document.querySelector('[data-tw-next]');if(i<0||i>=screens.length-1||!authenticated||(button&&button.disabled))return false;
  if(screen==='data-metadata'&&!document.querySelector('#guide_experiment_next button[data-guide-step="2"]')){announce('Confirm metadata or choose “Continue without additional metadata” first.',true);return false;}
  if(screen==='review-single'){if(!preparation||preparation.ready!==true||preparation.pending||preparation.running||preparation.restoring||busy){announce(preparation&&preparation.restoring?'Restoring your saved session…':preparation&&(preparation.running||preparation.pending)||busy?'Updating…':'Wait for the data update to finish before continuing to Canvas.',true);return false;}}
  var target=screens[i+1][0],prepareReviewEntry=!!(event&&event.isTrusted&&screen==='data-metadata'&&target==='review-single');if(prepareReviewEntry)resumeEntryPending=false;return navigate(target,prepareReviewEntry);}
 function back(){var i=screens.findIndex(function(x){return x[0]===screen;});return i>0?navigate(screens[i-1][0]):false;}
 function go(name){var id=STAGE_IDS[name];return id?navigate(id):false;}
 // Send a queued stage click once: idle, signed in, no route in flight, and the
 // stage allowed. Canvas keeps waiting while Review's automatic preparation is
 // pending, running or restoring (Esc or another step cancels the wait).
 function drainQueue(){
  if(!queued||queued.sent||busy||pending)return;
  if(queued.stage==='canvas'&&preparation&&(preparation.running||preparation.restoring||preparation.pending))return;
  var q=queued;q.sent=true;
  if(!navigate(q.id,false,true)&&queued===q){queued=null;paint();}
 }
 function stageButton(el){return el&&el.closest?el.closest('[data-tw-stage],.ts-steps .ts-step[data-stage]'):null;}
 function stageOf(b){return b?b.dataset.twStage||b.dataset.stage||'':'';}
 function requestStage(name){
  if(!STAGE_IDS[name])return false;
  var b=document.querySelector('#team-workspace [data-tw-stage="'+name+'"]');
  if(b&&!b.disabled)return go(name);
  if(queued&&!queued.sent&&queued.stage===name)return true;
  if(busyOnly(name)){queued={stage:name,id:STAGE_IDS[name],sent:false};paint();return true;}
  // A click on any other locked stage withdraws a waiting request.
  if(queued&&!queued.sent){queued=null;paint();}
  return false;
 }
 function cancelQueue(){if(!queued||queued.sent)return false;queued=null;paint();return true;}
 function restoreLockedFocus(){
  var b=lockedFocus;if(!b)return;
  if(!b.isConnected||!b.getClientRects().length){lockedFocus=null;return;}
  if(b.disabled)return;
  lockedFocus=null;
  if(!document.activeElement||document.activeElement===document.body)b.focus({preventScroll:true});
 }
 function disconnectedNotice(show){
  var notice=document.getElementById('team_library_disconnected');
  if(!notice){
   notice=document.createElement('section');notice.id='team_library_disconnected';notice.className='tw-disconnected-notice';notice.setAttribute('role','alert');
   var title=document.createElement('h2');title.textContent='Connection lost';notice.appendChild(title);
   var message=document.createElement('p');var local=sessionOnly();message.textContent=local?'The network connection or this session has disconnected. Reload to continue. Work not downloaded as a session ZIP will be lost when you reload.':'The network connection or this session has disconnected. Reload and sign in to continue. Unsaved changes will be lost when you reload.';notice.appendChild(message);
   var button=document.createElement('button');button.type='button';button.textContent=local?'Reload':'Reload and sign in';button.addEventListener('click',function(){window.location.reload();});notice.appendChild(button);
   document.body.appendChild(notice);
  }
  notice.hidden=!show;
 }
 function connectionDiagnostics(){
  if(new URLSearchParams(window.location.search).get('connectionDiagnostics')!=='1')return;
  var log=document.createElement('pre');log.id='team-connection-diagnostics';log.style.cssText='position:fixed;bottom:4px;left:4px;z-index:100000;background:white;color:#172332;border:1px solid #bbc8d4;font:13px monospace;max-width:90vw;max-height:110px;overflow:auto';document.body.appendChild(log);
  function record(name,detail){var row=new Date().toISOString()+' '+name+' '+(detail||'');log.textContent=(log.textContent+'\n'+row).split('\n').slice(-12).join('\n');console.info('[Team connection]',row);}
  function attach(){var socket=window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.$socket;if(!socket||socket.__teamObserved)return;socket.__teamObserved=true;record('socket-attached','state='+socket.readyState);socket.addEventListener('close',function(e){record('socket-close','code='+e.code+' clean='+e.wasClean);});socket.addEventListener('error',function(){record('socket-error');});}
  window.addEventListener('beforeunload',function(){record('beforeunload');});window.addEventListener('pagehide',function(e){record('pagehide','persisted='+e.persisted);});
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.tc-preview-pdf'))record('pdf-click');},true);
  if(window.jQuery)jQuery(document).on('shiny:connected',attach).on('shiny:disconnected',function(){record('shiny-disconnected');});attach();
 }
 function init(){if(!document.getElementById('team-workspace'))return;connectionDiagnostics();window.TeamWorkspace={go:go,next:next,back:back,state:state,request:requestStage};
  document.querySelectorAll('[data-tw-stage]').forEach(function(b){b.addEventListener('click',function(){go(b.dataset.twStage);});});
  // Disabled step buttons let clicks through (pointer-events:none), so a click
  // during a busy lock reaches the step bar; find the step under the pointer.
  document.addEventListener('click',function(event){
   var nav=event.target&&event.target.closest&&event.target.closest('.tw-steps,.ts-steps');if(!nav||stageButton(event.target))return;
   var hit=Array.from(nav.querySelectorAll('[data-tw-stage],.ts-step[data-stage]')).find(function(b){var r=b.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;});
   if(hit)requestStage(stageOf(hit));
  });
  // Chrome blurs a focused button when it becomes disabled. Remember the step
  // so Enter/Space still reach it, and give focus back when it unlocks.
  document.addEventListener('focusout',function(event){var b=stageButton(event.target);if(b&&!event.relatedTarget&&b.disabled)lockedFocus=b;},true);
  document.addEventListener('focusin',function(event){if(lockedFocus&&event.target!==lockedFocus)lockedFocus=null;},true);
  document.addEventListener('pointerdown',function(){lockedFocus=null;},true);
  document.addEventListener('keydown',function(event){
   if(event.key==='Escape'){if(cancelQueue())announce('Step change cancelled.',true);return;}
   if((event.key!=='Enter'&&event.key!==' ')||event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
   // Still focused but disabled (before Chrome's blur), or blurred to <body>.
   var active=document.activeElement,b=stageButton(active);
   if(!(b&&b.disabled))b=lockedFocus&&(!active||active===document.body)?lockedFocus:null;
   // preventDefault also stops the keypress that would activate a refocused button.
   if(b){event.preventDefault();requestStage(stageOf(b));}
  },true); // capture: Chrome does not bubble key events from a disabled button
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
  new MutationObserver(paint).observe(document.body,{attributes:true,attributeFilter:['data-guide-step','data-guide-analysis','data-guide-tool-page']});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-auth-state',function(x){/* only a literal true unlocks: a string, number, array or object never does */authenticated=!!x&&x.authenticated===true;window.dispatchEvent(new CustomEvent('team-auth-changed',{detail:{authenticated:authenticated,sessionOnly:!!x&&x.sessionOnly===true}}));paint();});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-review-restore-ready',function(x){if(window.console&&console.info)console.info('[Team review] restore ready received',{ready:!!(x&&x.ready===true),resumePending:resumeEntryPending,legacyStep:legacy,authenticated:authenticated,busy:busy});if(x&&x.ready===true&&resumeEntryPending){resumeRestoreReady=true;paint();}});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-review-entry-diagnostic',function(x){if(window.console&&console.info)console.info('[Team review] server entry diagnostic',JSON.stringify(x||{}));});
  if(window.Shiny)Shiny.addCustomMessageHandler('team-navigation-receipt',function(x){
   if(!pending||x.token!==pending.token)return;
   pending.ack=x;
   if(!x.accepted){pending=null;screen=({1:'data-matrix',2:'review-single',3:'review-single',4:'review-single'})[x.step]||screen;paint();announce(x.reason||'Prepare the current data before continuing.',true);}
   else if(legacy===Number(x.step)){var completed=pending;screen=completed.id;pending=null;if(completed.prepareReviewEntry)requestReviewEntry('next');paint();}
  });
  window.addEventListener('team-preparation-state',function(e){preparation=e.detail;paint();});
  if(window.jQuery)jQuery(document).on('shiny:busy',function(){busy=true;paint();}).on('shiny:idle',function(){busy=false;paint();});
  new MutationObserver(reconcileIdle).observe(document.documentElement,{attributes:true,attributeFilter:['class']});

  if(window.jQuery){jQuery(document).on('shiny:connected',function(){disconnectedNotice(false);reconcileIdle();send('team_workspace_ready',Date.now());paint();});jQuery(document).on('shiny:disconnected',function(){authenticated=false;disconnectedNotice(true);paint();});jQuery(document).on('shiny:value',function(){requestAnimationFrame(paint);});}
  if(window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.isConnected())send('team_workspace_ready',Date.now());paint();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
