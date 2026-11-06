(function () {
  'use strict';
  function init() {
    if (!document.getElementById('team-workspace') || !window.Shiny) return;
    var dirty=false, revision=0, savedRevision=0, inflight=null, inflightRevision=null, requestSequence=0, writable=false, loaded=false;
    var debounce=null, maximum=null, retry=null, watchdog=null, logoutWait=null;
    var restored=false, restoreSettling=true, lastPreparation=null, pendingPreparation=null, pendingFile=false, confirmedScientific=false, replayLogout=false;
    var canvasRestore=null, canvasRestoreFailed=false;
    function authenticated(){return document.body.dataset.teamAuthenticated==='true';}
    function status(text,state){var n=document.getElementById('team-autosave-status');if(n){n.textContent=text;n.dataset.state=state;n.title=state==='saved'?'Your private checkpoint is verified on the server.':text;}}
    function clearTimers(){clearTimeout(debounce);clearTimeout(maximum);clearTimeout(retry);debounce=maximum=retry=null;}
    function arm(reason){
      if(canvasRestore||!dirty||inflight!==null||!authenticated()||!writable||!loaded)return;
      status('Unsaved changes · Autosave on','dirty');
      clearTimeout(debounce);debounce=setTimeout(function(){save(reason);},15000);
      if(!maximum)maximum=setTimeout(function(){save('continuous editing');},60000);
    }
    function schedule(reason){
      if(!authenticated()||!writable||!loaded)return false;
      dirty=true;revision++;
      arm(reason);return true;
    }
    function save(reason){
      if(canvasRestore||inflight!==null||!dirty||!authenticated()||!writable||!loaded)return;
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
      if(message.ok===true){
        savedRevision=committed;
        if(savedRevision===revision){dirty=false;clearTimers();status('Saved · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),'saved');}
        else {status('Unsaved changes · Autosave on','dirty');debounce=setTimeout(function(){save('edits during save');},1000);}
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
    Shiny.addCustomMessageHandler('team-autosave-context',function(c){
      if(!c)return;var wasLoaded=loaded;loaded=c.loaded===true;writable=c.writable===true;
      if(!authenticated()){if(!dirty)status('','');return;}
      if(!writable){status(dirty?'Access changed · Unsaved changes':'View-only access','readonly');clearTimers();return;}
      if(canvasRestore){status(canvasRestoreFailed?'Figure workspace could not be restored · Autosave paused':'Restoring figure workspace…',canvasRestoreFailed?'error':'restoring');return;}
      if(!loaded){clearTimers();if(!dirty)status('Autosave ready','idle');return;}
      if(pendingFile){pendingFile=false;schedule('file upload');}
      if(pendingPreparation!==null&&!restoreSettling){if(schedule('prepared data')){lastPreparation=pendingPreparation;pendingPreparation=null;confirmedScientific=false;}}
      if(dirty&&inflight===null){arm('access restored');return;}
      if(!wasLoaded&&!restored&&!canvasRestore){schedule('new dataset');}
      else if(!dirty&&inflight===null&&restored)status('Saved workspace restored','saved');
    });
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
    window.addEventListener('team-canvas-changed',function(){if(!restoreSettling)schedule('canvas edit');});
    window.addEventListener('team-document-restored',function(){
      restored=true;restoreSettling=true;dirty=false;revision++;savedRevision=revision;inflight=null;inflightRevision=null;clearTimeout(watchdog);clearTimers();lastPreparation=null;pendingPreparation=null;pendingFile=false;confirmedScientific=false;
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
    window.addEventListener('beforeunload',function(e){if(dirty||inflight!==null){e.preventDefault();e.returnValue='';}});
    if(window.jQuery)jQuery(document).on('shiny:disconnected',function(){if(dirty||inflight!==null)status('Disconnected · Unsaved changes','offline');});
    window.TeamAutosave={schedule:schedule,requestSave:save,state:function(){return{dirty:dirty,revision:revision,savedRevision:savedRevision,inflight:inflight!==null,restorePending:!!canvasRestore};}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
}());
