(function () {
  'use strict';
  function init() {
    if (!document.getElementById('team-workspace') || !window.Shiny) return;
    var dirty=false, revision=0, savedRevision=0, inflight=null, inflightRevision=null, requestSequence=0, writable=false, loaded=false;
    var debounce=null, maximum=null, retry=null, watchdog=null, logoutWait=null;
    var restored=false, restoreSettling=true, lastPreparation=null, pendingPreparation=null, pendingFile=false, confirmedScientific=false, replayLogout=false;
    var canvasRestore=null, canvasRestoreFailed=false;
    // The server restores a checkpoint in stages: files first (loaded=true), the
    // canvas last. Hold autosave from the first restoring context until the
    // document is restored, so the files are not mistaken for a new dataset.
    var opening=false, openingFallback=null, busyRetries=0;
    var openingWatchdog=null;
    function endOpening(){opening=false;clearTimeout(openingFallback);openingFallback=null;clearTimeout(openingWatchdog);openingWatchdog=null;}
    function authenticated(){return document.body.dataset.teamAuthenticated==='true';}
    // Session-only Team (no project library, workspace.R): no checkpoint exists to save to, so no save
    // is ever requested and the slot always reads "Not saved: local session" - never "Saved" or
    // "Save failed". Only a session ZIP restore in progress (or its failure) is shown instead.
    var sessionOnly=window.LIPIDOMIC_TEAM_SESSION_ONLY===true;
    var LOCAL='Not saved: local session', LOCAL_TITLE='This local session has no project library: nothing is saved automatically. Use Save & export to download a session ZIP.';
    function status(text,state){
      if(sessionOnly&&!(state==='restoring'||(state==='error'&&/could not be restored/.test(text)))){text=LOCAL;state='local';}
      var n=document.getElementById('team-autosave-status');if(n){n.textContent=text;n.dataset.state=state;n.title=state==='saved'?'Your private checkpoint is verified on the server.':state==='local'?LOCAL_TITLE:text;}}
    function clearTimers(){clearTimeout(debounce);clearTimeout(maximum);clearTimeout(retry);debounce=maximum=retry=null;}
    function arm(reason){
      if(opening||canvasRestore||!dirty||inflight!==null||!authenticated()||!writable||!loaded)return;
      status('Unsaved changes · Autosave on','dirty');
      clearTimeout(debounce);debounce=setTimeout(function(){save(reason);},15000);
      if(!maximum)maximum=setTimeout(function(){save('continuous editing');},60000);
    }
    function schedule(reason){
      if(sessionOnly||!authenticated()||!writable||!loaded)return false;
      dirty=true;revision++;
      arm(reason);return true;
    }
    function save(reason){
      if(sessionOnly)return;
      if(opening||canvasRestore||inflight!==null||!dirty||!authenticated()||!writable||!loaded)return;
      clearTimers();inflightRevision=revision;inflight='save-'+(++requestSequence);status('Saving…','saving');
      // Commit the focused Shiny input before requesting the canvas/ZIP barrier.
      var focused=document.activeElement;
      if(focused&&focused.matches('input,textarea,select')&&focused.type!=='file')focused.dispatchEvent(new Event('change',{bubbles:true}));
      Shiny.setInputValue('team_library_autosave_request',{revision:inflight,reason:reason||'change'},{priority:'event'});
      clearTimeout(watchdog);watchdog=setTimeout(function(){result({revision:inflight,ok:false,message:'Save response timed out.'});},135000);
    }
    function result(message){
      if(!message||inflight===null||String(message.revision)!==inflight)return;
      clearTimeout(watchdog);var committed=inflightRevision;inflight=null;inflightRevision=null;
      // The server's own wording for a concurrent save (project_library.R); no extra flag needed there.
      var busyReply=message.busy===true||/already in progress/i.test(String(message.message||''));
      if(message.ok!==true&&busyReply&&busyRetries<24){
        // Another save is still running on the server: nothing failed. Retry
        // shortly; the server ends a stuck save after 120 s, then failures show.
        busyRetries++;status('Saving…','saving');
        clearTimeout(retry);retry=setTimeout(function(){save('retry');},5000);return;
      }
      busyRetries=0;
      if(message.ok===true){
        savedRevision=committed;
        if(savedRevision===revision){dirty=false;clearTimers();status('Saved · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+(message.near_limit===true?' · Records near size limit':''),'saved');
          var s=document.getElementById('team-autosave-status');if(s&&message.near_limit===true)s.title='Project records are near the size limit for one checkpoint. Later runs may not save; a session copy from Save & export keeps everything.';}
        else {status('Unsaved changes · Autosave on','dirty');debounce=setTimeout(function(){save('edits during save');},1000);}
      } else if(message.permanent===true){
        // A deterministic records rejection: retrying the same state cannot
        // succeed. Stop the loop; the next real edit tries once more.
        clearTimers();status('Not saved · Project records too large','error');
        var p=document.getElementById('team-autosave-status');if(p)p.title=String(message.message||'This change is not saved; your work stays in this tab.');
      } else {
        status('Save failed · Retrying','error');
        var n=document.getElementById('team-autosave-status');if(n)n.title=String(message.message||'Your changes are still in this tab. Keep it open to retry.');
        clearTimeout(retry);retry=setTimeout(function(){save('retry');},15000);
      }
    }
    Shiny.addCustomMessageHandler('team-autosave-result',result);
    function canvasRestoreStatus(message){
      if(!message||typeof message.token!=='string'||!message.token)return;
      if(message.status==='pending'){
        canvasRestore=message.token;canvasRestoreFailed=false;clearTimers();clearTimeout(watchdog);inflight=null;inflightRevision=null;
        status('Restoring figure workspace…','restoring');return;
      }
      if(canvasRestore!==message.token)return;
      if(message.status==='failed'){canvasRestoreFailed=true;status('Figure workspace could not be restored · Autosave paused','error');return;}
      if(message.status==='success'&&!canvasRestoreFailed){canvasRestore=null;if(dirty)arm('restore complete');else status('Saved workspace restored','saved');}
    }
    Shiny.addCustomMessageHandler('team-canvas-restore-status',function(message){canvasRestoreStatus(message);window.dispatchEvent(new CustomEvent('team-canvas-server-restore-status',{detail:message}));});
    window.addEventListener('team-canvas-restore-status',function(e){canvasRestoreStatus(e.detail);});
    var lastContext=null, restoringNow=false;
    // autosave_restore_gate.R sends this just before each context message (same flush, same order).
    Shiny.addCustomMessageHandler('team-autosave-restoring',function(m){restoringNow=!!(m&&m.restoring===true);});
    function context(c,replay){
      if(!c)return;if(replay)restoringNow=false;else lastContext=c;var wasLoaded=loaded;loaded=c.loaded===true;writable=c.writable===true;
      if(!authenticated()){if(!dirty)status('','');return;}
      if(!writable){status(dirty?'Access changed · Unsaved changes':'View-only access','readonly');clearTimers();return;}
      if(c.restoring===true||restoringNow){endOpening();opening=true;clearTimers();status('Opening saved workspace…','restoring');
        // Safety net: if no later context or canvas restore ever ends the opening, resume after 180 s.
        openingWatchdog=setTimeout(function(){if(!opening||canvasRestore)return;opening=false;clearTimeout(openingFallback);openingFallback=null;context(Object.assign({},lastContext,{restoring:false}),true);},180000);
        return;}
      if(opening&&!canvasRestore&&!openingFallback){
        // The canvas restore normally follows at once. A restore that stopped
        // with an error never sends it: resume normal autosave after a pause.
        openingFallback=setTimeout(function(){openingFallback=null;if(!opening||canvasRestore)return;opening=false;
          // Replay the last context as production would have handled it: drains an upload or prepared data
          // queued while opening, then arms a save if anything is unsaved.
          var had=pendingFile||pendingPreparation!==null;context(lastContext);if(!had&&!dirty&&inflight===null&&loaded&&writable)status('Autosave ready','idle');},30000);
      }
      if(opening&&!canvasRestore){status('Opening saved workspace…','restoring');return;}
      if(canvasRestore){status(canvasRestoreFailed?'Figure workspace could not be restored · Autosave paused':'Restoring figure workspace…',canvasRestoreFailed?'error':'restoring');return;}
      if(!loaded){clearTimers();if(!dirty)status('Autosave ready','idle');return;}
      if(pendingFile){pendingFile=false;schedule('file upload');}
      if(pendingPreparation!==null&&!restoreSettling){if(schedule('prepared data')){lastPreparation=pendingPreparation;pendingPreparation=null;confirmedScientific=false;}}
      if(dirty&&inflight===null){arm('access restored');return;}
      if(!wasLoaded&&!restored&&!canvasRestore){schedule('new dataset');}
      else if(!dirty&&inflight===null&&restored)status('Saved workspace restored','saved');
    }
    // Shiny requires a one-argument handler (it throws otherwise and autosave never starts).
    Shiny.addCustomMessageHandler('team-autosave-context',function(c){context(c);});
    // Native user edits, never Shiny hydration or restoration messages. Canvas
    // ResizeObservers also fire on mount: ignore them until a real interaction.
    document.addEventListener('click',function(e){
      if(e.target.closest&&e.target.closest('#team_library_resume')){restoreSettling=true;}
    },true);
    function inputEdited(e){
      if(!e.isTrusted||!e.target||!e.target.matches('input,textarea,select'))return;
      if(e.target.closest('.team-library,#lipidomic-assistant-root'))return;
      if(e.target.type==='search'||e.target.type==='password')return;
      restoreSettling=false;
      if(e.target.type==='file' && !loaded){pendingFile=true;return;}
      schedule('control edit');
    }
    document.addEventListener('input',inputEdited,true);document.addEventListener('change',inputEdited,true);
    // canvas.js marks the changes made only by mounting a restored checkpoint's
    // deferred plots (loaded progressively after a restore) as restoreHydration: not an edit.
    window.addEventListener('team-canvas-changed',function(e){if(!restoreSettling&&!(e&&e.detail&&e.detail.restoreHydration===true))schedule('canvas edit');});
    window.addEventListener('team-document-restored',function(){
      endOpening();busyRetries=0;restored=true;restoreSettling=true;dirty=false;revision++;savedRevision=revision;inflight=null;inflightRevision=null;clearTimeout(watchdog);clearTimers();lastPreparation=null;pendingPreparation=null;pendingFile=false;confirmedScientific=false;
      if(!canvasRestore)status('Saved workspace restored','saved');
    });
    document.addEventListener('pointerdown',function(e){if(e.isTrusted)restoreSettling=false;},true);
    document.addEventListener('keydown',function(e){if(e.isTrusted)restoreSettling=false;},true);
    window.addEventListener('team-confirmed-scientific-edit',function(){confirmedScientific=true;restoreSettling=false;});
    window.addEventListener('team-preparation-state',function(e){
      var p=e.detail||{};if(!p.ready||p.pending||p.running)return;
      var sig=String(p.revision);if(lastPreparation===sig)return;
      var first=lastPreparation===null;
      if(!restoreSettling&&(!first||!restored||confirmedScientific)){
        if(schedule('prepared data')){lastPreparation=sig;confirmedScientific=false;}else pendingPreparation=sig;
      } else lastPreparation=sig;
    });
    window.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')save('leaving tab');});
    function replay(button){replayLogout=true;try{button.click();}finally{replayLogout=false;}}
    document.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('[data-tw-logout],#team_library_logout');
      if(!b||replayLogout||(!dirty&&inflight===null))return;
      e.preventDefault();e.stopImmediatePropagation();if(logoutWait)return;
      save('sign out');var started=Date.now();
      logoutWait=setInterval(function(){
        if(!dirty&&inflight===null){clearInterval(logoutWait);logoutWait=null;replay(b);return;}
        if(Date.now()-started<10000)return;
        clearInterval(logoutWait);logoutWait=null;
        if(window.confirm('Changes are not saved yet. Sign out without saving them?')){
          dirty=false;inflight=null;clearTimers();clearTimeout(watchdog);replay(b);
        }
      },100);
    },true);
    window.addEventListener('beforeunload',function(e){if(dirty||inflight!==null||(opening&&(pendingFile||pendingPreparation!==null))){e.preventDefault();e.returnValue='';}});
    if(window.jQuery)jQuery(document).on('shiny:disconnected',function(){if(dirty||inflight!==null)status('Disconnected · Unsaved changes','offline');});
    if(sessionOnly)status(LOCAL,'local');
    window.TeamAutosave={schedule:schedule,requestSave:save,state:function(){return{sessionOnly:sessionOnly,dirty:dirty,revision:revision,savedRevision:savedRevision,inflight:inflight!==null,restorePending:!!canvasRestore||opening};}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
}());
