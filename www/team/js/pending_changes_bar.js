// Guided Team flow: the persistent "Changes pending" bar (R/frontends/team/pending_changes_bar.R)
// replaces the exclusion/restore toasts (they are never shown), keeps "Continue to My question" blocked until the
// prepared data is updated, and clears earlier notifications when the step changes.
(function(){
  'use strict';
  var SUPPRESSED=['Exclusion scheduled','Sample restored for the next preparation'];
  // The guided design guards (R/frontends/team/guided_workflow.R) show one of these warnings and move the step in the
  // same handler: a fresh one explains the step change and stays. Every other notification goes.
  var GUARDS=['Choose an existing workbook or upload abundance files in Experiment first.',
    'Statistical comparisons are unavailable because this prepared run includes synthetic averaged samples.',
    'For statistical comparisons, establish whether samples are independent or matched.',
    'This tool currently uses an unpaired test.',
    'Longitudinal is unavailable for this study.'];
  var FRESH_MS=1500;
  function guard(text){return GUARDS.some(function(p){return text.indexOf(p)===0;});}
  var REASON_ID='tw-continue-reason',REASON='Update prepared data first.';
  var CONTINUE='#guide_quality_next button[data-guide-step="4"]';
  var focusWasInBar=false;
  // Last bar button that had focus: the bar is a renderUI, so a re-render replaces it.
  var barFocus=null;

  function clean(text){return String(text||'').replace(/\s+/g,' ').trim();}
  function htmlText(html){
    if(!html)return '';
    // DOMParser keeps the server markup inert while reading its text.
    return clean(new DOMParser().parseFromString(String(html),'text/html').body.textContent);
  }
  function suppressed(text){return SUPPRESSED.some(function(p){return text.indexOf(p)===0;});}

  // The scheduling toasts are removed as soon as they reach the page, before they paint: the bar
  // (or, after Undo, the Quality table) shows the same change. Shiny may insert the toast before
  // its text, so the message event marks its id first.
  var incoming={};
  if(window.jQuery)window.jQuery(document).on('shiny:message',function(e){
    var n=e&&e.message&&e.message.notification;
    if(n&&n.type==='show'&&n.message&&n.message.id&&suppressed(htmlText(n.message.html)))incoming['shiny-notification-'+n.message.id]=true;
  });

  function watchToast(el){
    var content=el.querySelector('.shiny-notification-content-text')||el;
    if(!el.dataset.twShownAt)el.dataset.twShownAt=String(Date.now());
    if(!(incoming[el.id]||suppressed(clean(content.textContent))))return;
    delete incoming[el.id];
    el.remove();
  }
  function watchPanel(panel){
    if(!panel||panel.dataset.twWatched)return;
    panel.dataset.twWatched='true';
    panel.querySelectorAll('.shiny-notification').forEach(watchToast);
    new MutationObserver(function(records){
      records.forEach(function(r){r.addedNodes.forEach(function(node){
        if(node.nodeType!==1)return;
        // Shiny may fill the toast text after inserting it; recheck the toast that received it.
        var host=node.closest('.shiny-notification');
        if(host)watchToast(host);
        else node.querySelectorAll('.shiny-notification').forEach(watchToast);
      });});
    }).observe(panel,{childList:true,subtree:true});
  }
  function dismissStale(){
    var now=Date.now(),api=window.Shiny&&window.Shiny.notifications;
    document.querySelectorAll('#shiny-notification-panel .shiny-notification').forEach(function(el){
      // A running withProgress stays, and so does a fresh design-guard warning (see GUARDS).
      if(el.matches('.shiny-progress-notification')||el.querySelector('.shiny-progress-notification'))return;
      var text=clean((el.querySelector('.shiny-notification-content-text')||el).textContent);
      if(guard(text)&&now-Number(el.dataset.twShownAt||now)<FRESH_MS)return;
      var id=el.id.replace(/^shiny-notification-/,'');
      if(api&&typeof api.remove==='function'&&id)api.remove(id);else el.remove();
    });
  }

  function pending(){return !!document.querySelector('#tw-pending-bar [data-tw-pending="true"]');}
  function sync(){
    var on=pending();
    document.body.classList.toggle('tw-changes-pending',on);
    document.querySelectorAll(CONTINUE).forEach(function(b){
      var reason=document.getElementById(REASON_ID);
      if(on){
        if(!b.classList.contains('tw-continue-blocked')){
          b.dataset.twLabel=b.textContent;
          b.textContent='Continue to My question →';
          b.classList.add('tw-continue-blocked');
          b.setAttribute('aria-disabled','true');
          b.setAttribute('aria-describedby',REASON_ID);
          b.title=REASON;
        }
        if(!reason){reason=document.createElement('span');reason.id=REASON_ID;reason.className='tw-continue-reason';reason.textContent=REASON;}
        if(b.nextElementSibling!==reason)b.after(reason);
      }else if(b.classList.contains('tw-continue-blocked')){
        b.textContent=b.dataset.twLabel||b.textContent;
        delete b.dataset.twLabel;
        b.classList.remove('tw-continue-blocked');
        b.removeAttribute('aria-disabled');b.removeAttribute('aria-describedby');b.removeAttribute('title');
      }
    });
    if(!on){var stale=document.getElementById(REASON_ID);if(stale)stale.remove();}
    var lost=!document.activeElement||document.activeElement===document.body;
    var replaced=lost&&barFocus&&!barFocus.isConnected;
    // A re-render of the shown bar: return focus to the same button, else to its first one.
    if(on&&replaced){
      var buttons=Array.prototype.slice.call(document.querySelectorAll('#tw-pending-bar button'));
      var same=buttons.find(function(b){
        return barFocus.hasAttribute('data-tw-pending-undo')?b.dataset.twPendingUndo===barFocus.dataset.twPendingUndo:
          barFocus.hasAttribute('data-tw-pending-update')&&b.dataset.twPendingUpdate===barFocus.dataset.twPendingUpdate;
      })||buttons[0];
      if(same)same.focus();
    }
    // The bar's buttons disappear with it; keep keyboard users on the page they are reading.
    if(!on&&(focusWasInBar||replaced)&&lost){
      var heading=document.querySelector('.tab-pane.active .guide-heading h2');
      if(heading){heading.setAttribute('tabindex','-1');heading.focus();}
    }
    if(!on){focusWasInBar=false;barFocus=null;}
  }

  function existingUndo(id){
    return Array.prototype.find.call(document.querySelectorAll('button[id^="qc_pca_tab-guided_undo_"]'),function(b){return b.dataset.sample===id;});
  }
  document.addEventListener('focusin',function(e){
    var t=e.target;barFocus=t&&t.closest&&t.closest('#tw-pending-bar button')?t:null;
  });
  // Focus left on purpose (the button is still in the page): nothing to restore. Checked after
  // the current task so a removal by a re-render is still seen by sync().
  document.addEventListener('focusout',function(e){
    var t=e.target;setTimeout(function(){if(barFocus===t&&t.isConnected)barFocus=null;},0);
  });
  // Capture phase: a blocked Continue never reaches the guided step handler.
  document.addEventListener('click',function(e){
    var target=e.target&&e.target.closest?e.target:null;if(!target)return;
    var blocked=target.closest('button.tw-continue-blocked');
    if(blocked){
      e.preventDefault();e.stopImmediatePropagation();
      var update=document.querySelector('#tw-pending-bar .tw-pending-update');if(update)update.focus();
      return;
    }
    var bar=target.closest('#tw-pending-bar');if(!bar)return;
    var updateBtn=target.closest('[data-tw-pending-update]'),undoBtn=target.closest('[data-tw-pending-undo]');
    if(updateBtn){
      focusWasInBar=true;
      var run=document.getElementById(updateBtn.dataset.twPendingUpdate);
      if(run&&!run.disabled)run.click();
      else if(window.Shiny&&window.Shiny.setInputValue)window.Shiny.setInputValue('guide_focus_request',updateBtn.dataset.twPendingUpdate,{priority:'event'});
    }else if(undoBtn){
      focusWasInBar=true;
      var id=undoBtn.dataset.twPendingUndo,undo=existingUndo(id);
      if(undo)undo.click();
      else if(window.Shiny&&window.Shiny.setInputValue)window.Shiny.setInputValue('qc_pca_tab-guided_qc_undo',id,{priority:'event'});
    }
  },true);

  function init(){
    var bar=document.getElementById('tw-pending-bar'),context=document.getElementById('guide-context');
    if(!bar)return;
    // Sit directly under the run summary strip it complements.
    if(context&&context.nextElementSibling!==bar)context.after(bar);
    var observer=new MutationObserver(sync);
    observer.observe(bar,{childList:true,subtree:true});
    var next=document.getElementById('guide_quality_next');
    if(next)observer.observe(next,{childList:true,subtree:true});
    watchPanel(document.getElementById('shiny-notification-panel'));
    new MutationObserver(function(records){
      records.forEach(function(r){
        if(r.type==='childList')r.addedNodes.forEach(function(node){if(node.id==='shiny-notification-panel')watchPanel(node);});
        else if(r.attributeName==='data-guide-step'&&r.oldValue!==document.body.getAttribute('data-guide-step'))dismissStale();
      });
    }).observe(document.body,{childList:true,attributes:true,attributeOldValue:true,attributeFilter:['data-guide-step']});
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
