(function () {
  'use strict';
  // Panels live in screen coordinates while plots live in a panned/scaled
  // canvas. Keep the original bound controls intact and track only geometry.
  window.TeamCanvasFloatingPanel = (function(){
    var anchors=new Map(),frame=null;
    function style(panel,key,value){if(panel.style[key]!==value)panel.style[key]=value;}
    function place(panel,node){
      if(!panel||!node||!panel.isConnected||!node.isConnected)return null;
      var margin=12,gap=12,vw=window.innerWidth,vh=window.innerHeight,rect=node.getBoundingClientRect(),scroll=node.closest('.tc-scroll'),clip=scroll&&scroll.getBoundingClientRect();
      var visible=rect.right>margin&&rect.left<vw-margin&&rect.bottom>margin&&rect.top<vh-margin;
      if(clip)visible=visible&&rect.right>clip.left&&rect.left<clip.right&&rect.bottom>clip.top&&rect.top<clip.bottom;
      style(panel,'visibility',visible?'visible':'hidden');
      if(!visible)return {visible:false};
      var mobile=vw<640,width=Math.min(Number(panel.dataset.floatingWidth)||320,vw-margin*2);
      style(panel,'position','fixed');style(panel,'boxSizing','border-box');style(panel,'right','auto');style(panel,'bottom','auto');style(panel,'height','auto');style(panel,'width',Math.round(width)+'px');
      var top=Math.max(margin,rect.top,clip?clip.top:margin),bottom=Math.min(vh-margin,clip?clip.bottom:vh-margin),height,left,side;
      if(mobile){left=margin;top=margin;side='bottom';}
      else{side='right';left=Math.max(margin,Math.min(vw-width-margin,rect.right+gap));}
      // Reserve the minimap's live bounds instead of covering its navigation.
      var canvasRoot=node.closest('#team-canvas-root'),navigation=canvasRoot&&canvasRoot.querySelector('.tc-navigation');
      var mapRect=navigation&&navigation.getBoundingClientRect();
      if(mapRect&&mapRect.width>0&&mapRect.height>0&&mapRect.bottom>margin&&mapRect.top<vh-margin&&left<mapRect.right+gap&&left+width>mapRect.left-gap){
        if(!mobile&&mapRect.top-top<180&&mapRect.left-width-gap>=margin){left=mapRect.left-width-gap;}
        else{bottom=Math.min(bottom,mapRect.top-gap);if(bottom-top<120)top=Math.max(margin,bottom-180);}
      }
      var available=mobile?Math.max(24,bottom-margin):Math.max(80,bottom-top-gap);
      style(panel,'maxHeight',Math.round(Math.min(mobile?vh*.5:(panel.querySelector('#tc-inspector-tab-statistics[aria-selected="true"]')?720:520),available))+'px');style(panel,'overflow','auto');
      height=panel.getBoundingClientRect().height;
      if(mobile)top=Math.max(margin,Math.min(vh-margin,bottom)-height);
      style(panel,'left',Math.round(left)+'px');style(panel,'top',Math.round(top)+'px');panel.dataset.floatingSide=side;
      return {visible:true,left:left,top:top,width:width,side:side};
    }
    // Placement runs when geometry can have changed (resize, scroll, the panel or
    // its card resizing, moving or restyling, canvas zoom), at most once per frame,
    // instead of an unconditional per-frame loop while a panel is open. A slow
    // check catches anything those signals miss (e.g. CSS transitions).
    var watchers=null;
    function tick(){frame=null;anchors.forEach(function(node,panel){if(!panel.isConnected||!node.isConnected||panel.hidden||getComputedStyle(panel).display==='none'){if(panel.isConnected&&!node.isConnected)panel.style.visibility='hidden';anchors.delete(panel);return;}place(panel,node);});if(!anchors.size)unwatch();}
    function schedule(){if(frame===null&&anchors.size)frame=requestAnimationFrame(tick);}
    function watch(){
      if(!watchers){
        watchers={resize:new (window.ResizeObserver||function(){this.observe=this.disconnect=function(){};})(schedule),mutations:new MutationObserver(schedule),timer:setInterval(schedule,500)};
        window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,{capture:true,passive:true});
      }
      watchers.resize.disconnect();watchers.mutations.disconnect();
      anchors.forEach(function(node,panel){
        watchers.resize.observe(panel);watchers.resize.observe(node);
        var scroll=node.closest('.tc-scroll'),board=node.closest('.tc-board');if(scroll)watchers.resize.observe(scroll);
        watchers.mutations.observe(node,{attributes:true,attributeFilter:['style','class']});
        if(board)watchers.mutations.observe(board,{attributes:true,attributeFilter:['style']});
      });
    }
    function unwatch(){if(!watchers)return;watchers.resize.disconnect();watchers.mutations.disconnect();clearInterval(watchers.timer);window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,{capture:true});watchers=null;}
    // A panel re-anchored by pressing a card (selection on pointerdown) does not move the camera:
    // the press may be the start of a header drag, and the click that ends it is framed by canvas_viewport.js
    // (ux40, animated), so it stays pressed through that click. A press on a card control (Edit, ⋯, a footer
    // button, the resize grip) leaves the camera too: the panel opens on that press, and moving the card
    // between press and release sent the click (or the resize) elsewhere. The keyboard or code still reveal the card.
    var cardPressed=false;
    document.addEventListener('pointerdown',function(e){var t=e.target;cardPressed=!!(t&&t.closest&&t.closest('.tc-node'));},true);
    ['pointerup','pointercancel'].forEach(function(type){document.addEventListener(type,function(){setTimeout(function(){cardPressed=false;},0);},true);});window.addEventListener('blur',function(){cardPressed=false;});
    function open(panel,node){var fresh=anchors.get(panel)!==node;anchors.set(panel,node);if(fresh&&!cardPressed&&window.innerWidth>=640&&window.TeamCanvasViewport&&TeamCanvasViewport.focusNodeForPanel)TeamCanvasViewport.focusNodeForPanel(node,Number(panel.dataset.floatingWidth)||320);place(panel,node);watch();schedule();}
    function close(panel){anchors.delete(panel);panel.style.visibility='';if(!anchors.size){if(frame!==null){cancelAnimationFrame(frame);frame=null;}unwatch();}else watch();}
    return {place:place,open:open,close:close};
  })();
  var root, board, list, status, search, records = new Map(), paletteClock = 0, pendingAdds = new Map(), sequence = 0, selectedRecord = null, preparation = null, shinyBusy = false, preparationGeneration = 0, activityGeneration = 0, syncTimer = null, syncEpoch = 0, restorePending = new Map(), ackWaiters = new Map(), applyingRestore = false, checkpointActive = false;
  var restoreReceipt = null, restoreBuilding = false, restoreFailed = false, restoreRetryButton = null, editedDuringRestore = false;
  function showRestoreRetry() {
    if (!restoreRetryButton) return;
    restoreRetryButton.hidden = false; restoreRetryButton.disabled = false;
    tell('The saved figure workspace did not fully restore. Autosave is paused. Retry the saved workspace.');
  }
  function restoreStatus(value) {
    if (!restoreReceipt) return;
    if (value === 'failed') { restoreFailed = true; showRestoreRetry(); }
    if (value === 'pending' && restoreRetryButton) { restoreRetryButton.hidden = true; restoreRetryButton.disabled = false; }
    var detail = {status:value, token:restoreReceipt};
    if (value === 'success') {
      Shiny.setInputValue('team_canvas_restore_complete', {ok:true, token:restoreReceipt}, {priority:'event'});
      restoreReceipt = null;
      // The server refused background states while the restore was pending (its copy
      // is the restored checkpoint): an edit made meanwhile is sent now.
      // (An analyst's copy still loading sends it when it mounts.)
      if (editedDuringRestore && !checkpointActive && !editRequests()) { clearTimeout(syncTimer); backgroundDue = true; syncTimer = setTimeout(function () { sendBackground(); }, 350); }
      editedDuringRestore = false;
    }
    window.dispatchEvent(new CustomEvent('team-canvas-restore-status', {detail:detail}));
  }
  // The restore waits for its own cards only: every restored node mounted and no
  // restored copy's request in flight. An analyst's new copy, which is not part of
  // the checkpoint, never holds the receipt (it could mount last, after the final
  // restored card, and nothing would complete the restore then).
  function restoredRequests() { var n=0; instanceRequests.forEach(function (request) { if (request.saved) n++; }); return n; }
  function finishRestoreIfReady() {
    if (restoreReceipt && !restoreBuilding && !restoreFailed && !restorePending.size && !restoredRequests()) restoreStatus('success');
  }
  // Independent copies of a restored checkpoint are requested progressively, not
  // all at once: one at a time in idle time while the Canvas is hidden (Review
  // keeps the server first), a few at a time once it is shown (its active tab
  // first). Only that scheduling differs from an immediate restore: each copy is
  // requested exactly as before (requestInstance with its saved node) and mounts at
  // its saved place. The restore stays pending until every copy has mounted, or
  // fails through restoreStatus('failed') and its Retry, as before. Until a copy
  // mounts its saved node stays in restorePending verbatim, so every save holds it.
  // deferredNodes: node ids owned by this schedule (queued or in flight);
  // deferredQueue: the ids not yet requested, in the checkpoint's creation order.
  var deferredNodes = new Set(), deferredQueue = [], deferredTimer = null, deferredIdle = null, deferredBusySince = 0, lazyHydration = null, mountingDeferred = false, mountNotice = false;
  var deferredHiddenConcurrency = 1, deferredShownConcurrency = 3, deferredBusyWait = 15000;
  // Requests that carry an analyst's new data (copy, paste, add). A restored
  // copy's request does not: its saved node is still in restorePending.
  function editRequests() { var n=0; instanceRequests.forEach(function (request) { if (!request.saved) n++; }); return n; }
  function deferredInFlight() { var n=0; instanceRequests.forEach(function (request) { if (request.deferred) n++; }); return n; }
  // Figures the next save holds: mounted cards, illustrations, every restored node
  // not mounted yet and the analyst's own copies still loading. A new figure is
  // refused when this reaches 40; a restored node already holds its place.
  function figureCount() { return Array.from(records.values()).filter(function (r) { return !!r.node; }).length + illustrations.size + restorePending.size + editRequests(); }
  function canvasShown() { return !!root && root.isConnected && root.getClientRects().length > 0; }
  function serverBusy() { return shinyBusy || document.documentElement.classList.contains('shiny-busy'); }
  function cancelDeferredTimers() {
    clearTimeout(deferredTimer); deferredTimer = null;
    if (deferredIdle !== null) { if (window.cancelIdleCallback) cancelIdleCallback(deferredIdle); else clearTimeout(deferredIdle); deferredIdle = null; }
  }
  function scheduleDeferred(delay) {
    if (!deferredQueue.length || deferredTimer || deferredIdle !== null) return;
    deferredTimer = setTimeout(function () { deferredTimer = null; pumpDeferred(); }, delay == null ? 250 : delay);
  }
  // Drops every scheduled copy and its request (a newer restore or Reset replaces them).
  function stopDeferredRestore() {
    cancelDeferredTimers(); deferredQueue = []; deferredBusySince = 0;
    instanceRequests.forEach(function (request, id) { if (!request.deferred) return; clearTimeout(request.timer); instanceRequests.delete(id); parkInstance(id); });
    deferredNodes.clear(); endLazyHydration(false);
  }
  // Reset: every independent plot still loading is cancelled, restored or not.
  function cancelInstanceRequests() {
    stopDeferredRestore();
    instanceRequests.forEach(function (request, id) { clearTimeout(request.timer); instanceRequests.delete(id); parkInstance(id); });
    // Their skeleton cards go too, failed ones included.
    if (board) board.querySelectorAll('.tc-node-placeholder').forEach(function (ph) { dropPlaceholder({placeholder:ph}); });
  }
  function nextDeferred(shown) {
    if (shown && window.TeamCanvasTabs && typeof TeamCanvasTabs.activeIds === 'function') {
      var active = TeamCanvasTabs.activeIds(), index = deferredQueue.findIndex(function (id) { return active.indexOf(id) >= 0; });
      if (index > 0) return deferredQueue.splice(index, 1)[0];
    }
    return deferredQueue.shift();
  }
  function requestDeferred(shown) {
    while (deferredQueue.length) {
      var id = nextDeferred(shown), saved = restorePending.get(id);
      if (!saved || !saved.instance) { deferredNodes.delete(id); continue; }
      if (instanceRequests.has(saved.instance.id)) continue;
      if (!window.Shiny || !Shiny.setInputValue || !instancesConnected()) { deferredQueue.unshift(id); return false; }
      if (requestInstance(saved.instance.source, null, saved)) { var request = instanceRequests.get(saved.instance.id); if (request) request.deferred = true; return true; }
      // Not requestable (as an immediate restore would find it): the restore fails as before.
      deferredNodes.delete(id); restoreStatus('failed');
    }
    return false;
  }
  function pumpDeferred() {
    if (!deferredQueue.length) return;
    if (restoreBuilding || !instancesConnected()) { scheduleDeferred(500); return; }
    var shown = canvasShown(), limit = shown ? deferredShownConcurrency : deferredHiddenConcurrency;
    if (deferredInFlight() >= limit) { scheduleDeferred(); return; }
    if (shown) { while (deferredQueue.length && deferredInFlight() < limit && requestDeferred(true)); scheduleDeferred(); return; }
    // Hidden: only while the server is idle (bounded, so a server that never idles
    // still gets every copy), then in the browser's idle time.
    var forced = false;
    if (serverBusy()) {
      if (!deferredBusySince) deferredBusySince = Date.now();
      if (Date.now() - deferredBusySince < deferredBusyWait) { scheduleDeferred(); return; }
      forced = true;
    }
    // The server can become busy (Review's preparation) before the idle callback
    // runs: it is checked again there, and the bounded busy wait resumes.
    var run = function () {
      deferredIdle = null;
      if (!forced && serverBusy() && !canvasShown()) { pumpDeferred(); return; }
      deferredBusySince = 0;
      if (deferredInFlight() < (canvasShown() ? deferredShownConcurrency : deferredHiddenConcurrency)) requestDeferred(canvasShown());
      scheduleDeferred();
    };
    deferredIdle = window.requestIdleCallback ? requestIdleCallback(run, {timeout:2000}) : setTimeout(run, 50);
  }
  function startDeferredRestore() {
    if (!deferredQueue.length || restoreBuilding) return false;
    endLazyHydration(false); lazyHydration={userTouched:false,quietSince:0,timer:null}; lazyHydration.timer=setTimeout(watchLazyHydration,250);
    scheduleDeferred(canvasShown() ? 0 : 750);
    return true;
  }
  // The Canvas shown: what is left is requested at its higher concurrency now.
  function deferredShown() { if (deferredQueue.length && canvasShown() && deferredIdle === null) { cancelDeferredTimers(); pumpDeferred(); } }
  // Places a restored card among the board's cards in the checkpoint's node order
  // (as a restore mounts its other cards), whatever order the copies mounted in.
  function placeInCreationOrder(node, id) {
    var mine = creationOrder.indexOf(id); if (mine < 0) return;
    var before = Array.from(board.children).find(function (other) { return other !== node && other.classList.contains('tc-node') && creationOrder.indexOf(other.dataset.canvasOrderId) > mine; });
    if (before && node.nextElementSibling !== before) board.insertBefore(node, before);
  }
  // While those copies mount and draw, and nobody has touched the page, the canvas
  // changes only by hydration: the change signal says so (autosave ignores it, as
  // it ignores a restore's own mounting) and no background state is echoed. The
  // first trusted pointerdown, keydown, click, input or change anywhere, or any
  // call that edits the canvas, ends that: every later change counts as an edit.
  function lazyHydrationQuiet() { return !!lazyHydration && !lazyHydration.userTouched; }
  function watchLazyHydration() {
    var h=lazyHydration; if (!h) return;
    var loading=deferredQueue.length>0 || deferredInFlight()>0 || !!board.querySelector('.tc-restore-settling');
    if (loading) h.quietSince=0;
    else if (!h.quietSince) h.quietSince=Date.now();
    else if (Date.now()-h.quietSince>=1000) { endLazyHydration(true); return; }
    h.timer=setTimeout(watchLazyHydration,250);
  }
  function endLazyHydration(finished) {
    var h=lazyHydration; if (!h) return; clearTimeout(h.timer); lazyHydration=null;
    if (finished) deferredNodes.forEach(function (id) { if (!restorePending.has(id)) deferredNodes.delete(id); });
    if (finished && !h.userTouched && !checkpointActive) { clearTimeout(syncTimer); sendBackground(); }
  }
  function touchLazyHydration(event) { if (event.isTrusted && lazyHydration) lazyHydration.userTouched=true; }
  function editDuringHydration() { if (lazyHydration) lazyHydration.userTouched=true; }
  // Hosts of a previous server session (after a disconnect) are never bound again:
  // a request for the same id in a new session removes the old one first.
  function dropStaleHost(id) { var host=document.getElementById(id+'_host'); if (!host || host.dataset.tcStale !== 'true') return; if (window.Shiny && Shiny.unbindAll) { try { Shiny.unbindAll(host); } catch (ignore) {} } host.remove(); }
  // The state the server holds (the restored checkpoint, then each accepted
  // background state). A background send of the same state is skipped.
  var serverStateKey = null, backgroundKeys = new Map();
  var queuedAddTtl = 90000;
  var canvasDimensionDebug = new URLSearchParams(window.location.search).get('team_canvas_debug') === '1';
  function dimensionTrace(r,event,values) {
    if(!canvasDimensionDebug||!r||!r.el)return;
    var entries=r.dimensionTrace||(r.dimensionTrace=[]);
    entries.push(Object.assign({event:event,time:Date.now()},values||{}));
    if(entries.length>16)entries.shift();
    r.el.setAttribute('data-team-canvas-dimension-trace',JSON.stringify(entries));
  }

  // Illustrations are Team-only decorative/scientific-context assets. They are
  // intentionally kept separate from plot records so their edits never mark a
  // measured result stale.
  var illustrations = new Map(), documentState = null;
  // .tc-lazy-unbound: a restored Plotly copy waiting to mount (lazy mount, below).
  var selector = '.html-widget-output[id], .shiny-plot-output[id], .tc-lazy-unbound[id]';
  var tableOutputIds = new Set(['guide_metadata','guide_history','bqcFilteredTable','bqcTable','diffAcylTable','tableBiomarkers','corrTable','summaryTable','ledger_table']);
  // Explicit matches to download controls declared beside the corresponding outputs.
  var csvByPlot = {
    'results_dashboard-plot_violin':'results_dashboard-dl_violin',
    'results_dashboard-plot_pca':'results_dashboard-dl_pca',
    'results_dashboard-plot_comp':'results_dashboard-dl_comp',
    'results_dashboard-plot_dist':'results_dashboard-dl_dist',
    'results_dashboard-plot_heat':'results_dashboard-dl_heat',
    'barchart-barPlotUnfiltered':'barchart-downloadBarCSV_Unfiltered',
    'barchart-barPlotFiltered':'barchart-downloadBarCSV_Filtered',
    'barchart-donutPlotUnfiltered':'barchart-downloadDonutCSV_Unfiltered',
    'barchart-donutPlotFiltered':'barchart-downloadDonutCSV_Filtered',
    'volcano_tab-volcanoPlot':'volcano_tab-downloadTable',
    'lsea_tab-lseaPlot':'lsea_tab-downloadTable',
    'heatmap_barchart_tab-heatmapPlot':'heatmap_barchart_tab-downloadHeatmapCSV',
    'heatmap_barchart_tab-heatmapSDPlot':'heatmap_barchart_tab-downloadHeatmapSDCSV',
    'heatmap_barchart_tab-filteredHeatmapPlot':'heatmap_barchart_tab-downloadFilteredHeatmapCSV',
    'heatmap_barchart_tab-filteredHeatmapSDPlot':'heatmap_barchart_tab-downloadFilteredHeatmapSDCSV',
    'heatmap_barchart_tab-violin_plot_render':'heatmap_barchart_tab-download_violin_csv',
    'structural_grid_tab-heatmapPlot':'structural_grid_tab-downloadHeatmapCSV',
    'structural_grid_tab-dotplotPlot':'structural_grid_tab-downloadDotplotCSV',
    'structural_grid_tab-mergedPlot':'structural_grid_tab-downloadMergedCSV',
    'structural_grid_tab-diffAllPlot':'structural_grid_tab-downloadDiffAllCSV',
    'structural_tab-summaryPlot':'structural_tab-downloadSummaryCSV',
    'structural_tab-propPlotPlot':'structural_tab-downloadPropCSV',
    'structural_tab-diffAcylPlot':'structural_tab-downloadDiffAcylCSV',
    'logratio_tab-logratioPlot':'logratio_tab-downloadCSV',
    'fla_tab-logratioPlot':'fla_tab-downloadLedger',
    'fla_tab-plotVolcano':'fla_tab-dl_volcano_csv',
    'fla_tab-plotCircos':'fla_tab-downloadCorrCSV',
    'longitudinal_tab-macroclass_plot':'longitudinal_tab-downloadCSV',
    'longitudinal_tab-subclass_plot':'longitudinal_tab-downloadCSV',
    'longitudinal_tab-index_plot':'longitudinal_tab-downloadCSV',
    'longitudinal_tab-struct_plot':'longitudinal_tab-downloadCSV',
    'longitudinal_tab-allmetrics_plot':'longitudinal_tab-downloadCSV',
    'pathway_tab-pathwayPlot':'pathway_tab-downloadPlotCSV',
    'qc_pca_tab-sampleCorrPlot':'qc_pca_tab-downloadSampleCorrCSV',
    'qc_pca_tab-guided_qc_plot':'qc_pca_tab-guided_qc_plot_csv',
    'cellular_org_tab-stressPlot':'cellular_org_tab-downloadStressCSV',
    'cellular_org_tab-cpiPlot':'cellular_org_tab-downloadCpiCSV',
    'cellular_org_tab-polarPlot':'cellular_org_tab-downloadPolarCSV',
    'cell_lipid_plot':'cell_lipid_csv',
    'cell_profile_plot':'cell_profile_csv',
    'cell_class_plot':'cell_class_profile_csv',
    'cell_comparison_plot':'cell_comparison_csv'
  };
  var instanceRequests = new Map(), instanceClipboard = null, lastInstanceRequest = null, instanceRequestSequence = 0;
  function sourceKey(r) { return r && r.instance ? r.instance.source : r && r.el.id; }
  function instancesConnected(){return !!(window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.$socket);}
  function instanceSupported(id) { return /^cell_(lipid|profile|class|comparison)_plot$/.test(id) || /^(results_dashboard|qc_pca_tab|barchart|heatmap_barchart_tab|volcano_tab|lsea_tab|structural_tab|structural_grid_tab|logratio_tab|group_comparison_tab|fla_tab|longitudinal_tab|pathway_tab|cellular_org_tab)-/.test(id); }
  // Last non-empty value of every input, so a selectize caught mid-reload (blank,
  // options cleared) can still be copied or saved with the user's real choice.
  var lastSelections = {};
  if (window.jQuery) jQuery(document).on('shiny:inputchanged', function (e) { if (typeof e.value !== 'string' || !e.value) return; var el = document.getElementById(e.name); if (el && el.selectize && !el.multiple) lastSelections[e.name] = e.value; });
  // keysByNamespace (optional): input names grouped once per collectState by their text before the first '-'.
  function instanceValues(namespace, allowed, keysByNamespace) {
    var values={}, all=window.Shiny && Shiny.shinyapp && Shiny.shinyapp.$inputValues || {};
    (keysByNamespace && namespace.indexOf('-')<0 ? keysByNamespace.get(namespace) || [] : Object.keys(all)).forEach(function(key){
      if(key.indexOf(namespace+'-')!==0)return;
      var local=key.slice(namespace.length+1).replace(/:[A-Za-z][A-Za-z0-9_.]*$/,''), value=all[key], el=document.getElementById(namespace+'-'+local);
      if(allowed && !allowed.includes(local))return;
      if(!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(local)||!el||el.matches('button,input[type=file],.action-button')||el.closest('.shiny-file-input-progress')||/plotly_|_brush$|_click$|_hover$|_selected$/.test(local))return;
      if(window.jQuery){var bound=jQuery(el).data('shiny-input-binding');if(bound&&typeof bound.getValue==='function'){try{value=bound.getValue(el);}catch(ignore){}}}
      // An empty single selectize is transient: a server-side update clears it
      // while its options reload. Copying that blank would pin the new plot to
      // no selection (its data then fails req()), so let the copy choose its default.
      if(el.selectize&&!el.multiple&&(value===''||value===null)&&(!Object.keys(el.selectize.options||{}).length||el.selectize.loading)){var remembered=lastSelections[namespace+'-'+local];if(remembered==null)return;value=remembered;}
      if(value===null||['string','number','boolean'].includes(typeof value)||(Array.isArray(value)&&value.every(function(x){return ['string','number','boolean'].includes(typeof x);})))values[local]=value;
    });
    return JSON.parse(JSON.stringify(values));
  }
  function cellSourceValues() {
    var values={}, all=window.Shiny && Shiny.shinyapp && Shiny.shinyapp.$inputValues || {};
    ['cell_group_column','cell_reference_group','cell_comparison_group','cell_class','cell_explore_level','cell_lipid','cell_sample','cell_profile_view'].forEach(function(key){
      var el=document.getElementById(key),value=all[key];
      if(!el)return;
      if(window.jQuery){var binding=jQuery(el).data('shiny-input-binding');if(binding&&typeof binding.getValue==='function'){try{value=binding.getValue(el);}catch(ignore){}}}
      if(value===null||['string','number','boolean'].includes(typeof value)||(Array.isArray(value)&&value.every(function(x){return ['string','number','boolean'].includes(typeof x);})))values[key]=value;
    });
    return values;
  }
  function parkInstance(id) { lazyForgetInstance(id); if(window.Shiny && Shiny.setInputValue) Shiny.setInputValue('team_canvas_instance_park',id,{priority:'event'}); }
  function requestInstance(source, copied, saved, placeholder) {
    if(!instanceSupported(source)) { tell('Open this dedicated view to configure its data. Independent canvas copies are available for analysis modules.'); return false; }
    if(!window.Shiny||!Shiny.setInputValue)return false;
    // A restored copy is already one of the workspace's figures (its saved node).
    if(!saved&&figureCount()>=40){tell('This workspace supports 40 figures. Remove a figure before adding another.');return false;}
    var family=source.slice(0,source.indexOf('-')), suffix=source.slice(family.length+1);
    var id=saved?saved.instance.id:'tcinstance_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
    // A restored copy is created from a copy of its saved instance: the server's
    // reply rewrites the request's inputs, and the saved node stays as saved until it mounts.
    var instance=saved?JSON.parse(JSON.stringify(saved.instance)):{id:id,source:source,inputs:copied?copied.inputs:(source.indexOf('-')<0?cellSourceValues():instanceValues(family))};
    // The server echoes the token in its reply, so a reply to an earlier request
    // for the same id (a cancelled restore, a retry) never initializes this one.
    var request={instance:instance,source:source,saved:saved||null,copy:copied||null,timer:null,token:'r'+(++instanceRequestSequence)+'_'+Math.random().toString(36).slice(2,8)};
    var heavy=/^(logratio_tab|group_comparison_tab|fla_tab)$/.test(family), remaining=heavy?120000:30000, wallDeadline=Date.now()+(heavy?300000:120000);
    // One active-time budget covers acknowledgement, mounting and hydration.
    // Count observed intervals only: a blocked browser or busy server is not
    // evidence that the instance has stopped making progress.
    function deadline(){
      if(instanceRequests.get(id)!==request)return;
      if(!shinyBusy && !document.documentElement.classList.contains('shiny-busy')) remaining-=250;
      if(remaining<=0 || Date.now()>=wallDeadline){instanceRequests.delete(id);if(!dropUndoRequest(request)&&request.saved)restoreStatus('failed');failPlaceholder(request);parkInstance(id);tell('The independent plot did not load in time. Check its analysis data and try again.');return;}
      request.timer=setTimeout(deadline,250);
    }
    dropStaleHost(id);
    // A restored copy's Plotly output binds only once its card nears the view (lazyMount).
    if(saved&&lazyEnabled())lazyPending.add(id+'-'+suffix);
    instanceRequests.set(id,request);
    // A new copy is an edit at once (autosave keeps it while it is Generating; see pendingCopyNodes).
    if(!saved){request.placeholder=showPlaceholder(request,placeholder);changed();}
    request.timer=setTimeout(deadline,250);
    Shiny.setInputValue('team_canvas_instance_create',Object.assign({},instance,{request:request.token}),{priority:'event'});lastInstanceRequest=id;
    if(!(saved&&gateQuiet()))tell('Creating an independent '+plotTitle(source)+'…'); return true;
  }
  // bslib's accordion binding accepts only {method,...} messages and rejects anything
  // else as an unhandled promise rejection ("Method not yet implemented: undefined").
  // A plain {value} message (how Team replays a saved setting, here and through the
  // server's sendInputMessage) or {selected} (Shiny's update*Input) means "exactly
  // these panels open"; apply it as bslib's own "set". Any other method-less message
  // carries nothing an accordion can use and is ignored instead of thrown.
  function accordionMessage(data) {
    if (!data || data.method != null) return data;
    var has = function (k) { return Object.prototype.hasOwnProperty.call(data, k); };
    var v = has('value') ? data.value : has('selected') ? data.selected : undefined;
    if (v === undefined) return null;
    return {method:'set', values:v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]};
  }
  function adaptAccordionMessages() {
    if (!window.Shiny || !Shiny.inputBindings || typeof Shiny.inputBindings.getBindings !== 'function') return false;
    // Registered as "bslib.accordion", but the registry does not expose names reliably:
    // recognise the binding by its own accordion methods.
    var entry = Shiny.inputBindings.getBindings().find(function (b) { var x = b && b.binding; return b && (b.name === 'bslib.accordion' || (x && typeof x._setItems === 'function' && typeof x._getItemInfo === 'function' && typeof x._isAutoClosing === 'function')); });
    if (!entry) return false;
    var binding = entry.binding;
    if (binding.tcValueMessages) return true;
    var receive = binding.receiveMessage;
    binding.receiveMessage = function (el, data) {
      var message = accordionMessage(data);
      return message ? receive.call(this, el, message) : Promise.resolve();
    };
    binding.tcValueMessages = true;
    return true;
  }
  if (!adaptAccordionMessages() && window.jQuery) jQuery(document).one('shiny:connected', adaptAccordionMessages);
  function setInstanceInputs(instance, onlyKeys) {
    adaptAccordionMessages();
    Object.keys(instance.inputs||{}).forEach(function(key){
      if(onlyKeys && !onlyKeys.includes(key))return;
      var id=instance.id+'-'+key, value=instance.inputs[key], el=document.getElementById(id);
      if(el&&el.selectize&&value!=null){var selectize=el.selectize;(Array.isArray(value)?value:[value]).forEach(function(item){var key=String(item);if(!selectize.options[key]){var option={};option[selectize.settings.valueField||'value']=item;option[selectize.settings.labelField||'label']=key;selectize.addOption(option);}});selectize.setValue(value,true);}
      if(el && window.jQuery){var binding=jQuery(el).data('shiny-input-binding');if(binding){try{binding.receiveMessage(el,{value:value});}catch(e){try{binding.setValue(el,value);}catch(ignore){}}}}
      // One coalesced batch: each copy's outputs are computed once from all of its settings.
      Shiny.setInputValue(id,value);
    });
  }
  function restoreDashboardControls(host){
    (host.teamDashboardFields||[]).forEach(function(item){if(item.home.parentNode)item.home.replaceWith(item.field);if(item.style===null)item.field.removeAttribute('style');else item.field.setAttribute('style',item.style);});
    host.teamDashboardFields=null;var fields=host.querySelector('.tc-instance-data-fields');if(fields)fields.remove();host.classList.remove('is-dashboard-compact');
  }
  function compactDashboardControls(host,r){
    var source=r.instance.source, isDashboard=source.indexOf('results_dashboard-')===0, isCell=/^cell_(lipid|profile|class|comparison)_plot$/.test(source);
    if(!isDashboard&&!isCell)return;
    restoreDashboardControls(host);
    var kind=source.slice('results_dashboard-plot_'.length),keys=['color_by'];
    if(isDashboard){
      if(kind==='violin')keys.push('violin_lipid');
      if(kind==='pca')keys.push('pca_transform','pca_scale');
      if(kind==='heat')keys.push('top_n');
    }else {
      keys=source==='cell_profile_plot'?['cell_sample','cell_profile_view']:
        source==='cell_lipid_plot'?['cell_class','cell_lipid','cell_sample']:
        source==='cell_class_plot'?['cell_group_column','cell_reference_group','cell_comparison_group']:
        ['cell_group_column','cell_reference_group','cell_comparison_group','cell_class','cell_explore_level','cell_lipid'];
    }
    var fields=document.createElement('div');fields.className='tc-instance-data-fields';host.appendChild(fields);host.teamDashboardFields=[];
    keys.forEach(function(key){var input=document.getElementById(r.instance.id+'-'+key);if(!input)return;var field=input.closest('.shiny-input-container')||input.closest('.form-group')||input.parentElement;if(!field)return;var home=document.createComment('Independent plot data control');field.before(home);host.teamDashboardFields.push({field:field,home:home,style:field.getAttribute('style')});field.style.width='100%';field.style.maxWidth='100%';fields.appendChild(field);});
    host.classList.add('is-dashboard-compact');
  }
  function closeInstanceControls(host){
    if(!host)return;var focusInside=host.contains(document.activeElement),record=records.get(host.dataset.anchorOutput);TeamCanvasFloatingPanel.close(host);host.inert=true;host.setAttribute('aria-hidden','true');restoreDashboardControls(host);host.classList.remove('is-open');host.style.cssText='position:absolute;left:-100000px;top:0;width:900px';if(focusInside&&record&&record.node){var trigger=record.node.querySelector('[data-canvas-data-settings]');if(trigger)trigger.focus();}
  }
  function openInstanceControls(r,focusControls) {
    var host=document.getElementById(r.instance.id+'_host');if(!host)return;
    document.querySelectorAll('.tc-instance-host.is-open').forEach(function(x){if(x!==host)closeInstanceControls(x);});
    if(!host.querySelector('.tc-instance-panel-head')){
      var head=document.createElement('div');head.className='tc-instance-panel-head';
      var title=document.createElement('strong');title.textContent='Data & settings · '+r.label;
      var close=document.createElement('button');close.type='button';close.textContent='Close';close.addEventListener('click',function(){closeInstanceControls(host);});head.append(title,close);host.prepend(head);
      host.addEventListener('keydown',function(event){if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();closeInstanceControls(host);}});
    }
    compactDashboardControls(host,r);
    host.classList.add('is-open');host.style.cssText='display:block';host.inert=false;host.setAttribute('aria-hidden','false');host.setAttribute('role','dialog');host.setAttribute('aria-label','Data & settings · '+r.label);host.dataset.floatingWidth=host.classList.contains('is-dashboard-compact')?'320':'480';host.dataset.anchorOutput=r.el&&r.el.id||'';
    var anchor=r.node||Array.from(board.querySelectorAll('.tc-node')).find(function(node){return node.dataset.plotId===r.el.id;});
    // A not-yet-configured dynamic output has no canvas node yet. Its temporary
    // settings anchor is the catalog, then switches to its plot once it exists.
    TeamCanvasFloatingPanel.open(host,anchor||root.querySelector('.tc-catalog'));
    window.dispatchEvent(new CustomEvent('team-canvas-panel-open',{detail:{kind:'data',id:r.el&&r.el.id||null}}));
    if(focusControls){var first=Array.from(host.querySelectorAll('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')).find(function(el){return el.getClientRects().length&&!el.closest('[hidden],[inert]')&&getComputedStyle(el).visibility!=='hidden';});if(first)first.focus();else host.querySelector('.tc-instance-panel-head button').focus();}
  }
  function copyData(r) {
    if(!r||!r.node)return null;
    var source=sourceKey(r);if(!instanceSupported(source))return null;
    return {source:source,inputs:r.instance?instanceValues(r.instance.id,r.allowedInputs):(source.indexOf('-')<0?cellSourceValues():instanceValues(source.split('-')[0],r.allowedInputs)),visual:JSON.parse(JSON.stringify(r.visual||{})),label:r.labelInput.value||r.label,width:r.node.offsetWidth,height:r.node.offsetHeight,statistics:r.statistics&&window.TeamCanvasStatistics?TeamCanvasStatistics.copyState(r):null};
  }
  function copyRecord(r) {
    var copied=copyData(r);if(!copied)return false;instanceClipboard=copied;
    var pasteButton=root.querySelector('.tc-paste-plot'); if(pasteButton) pasteButton.disabled=false;
    tell('Copied '+instanceClipboard.label+'. Paste creates an independent plot with these data settings.');return true;
  }
  function pasteRecord() { return instanceClipboard?requestInstance(instanceClipboard.source,JSON.parse(JSON.stringify(instanceClipboard))):false; }
  function failInstance(request, error) {
    if(instanceRequests.get(request.instance.id)!==request)return;
    if(!dropUndoRequest(request)&&request.saved)restoreStatus('failed');
    clearTimeout(request.timer);instanceRequests.delete(request.instance.id);failPlaceholder(request);parkInstance(request.instance.id);
    if(error && window.console)console.error('Independent plot could not be initialized:',error);
    tell('The independent plot could not be initialized. Try duplicating it again.');
  }
  function waitInstanceInputs(request,done){
    var stable=0,host=document.getElementById(request.instance.id+'_host'), lastMismatch='', retries=0, nextRetry=0;
    function equivalent(a,b){function empty(x){return x==null||x===''||(Array.isArray(x)&&x.length===0);}if(empty(a)&&empty(b))return true;if(Array.isArray(a)||Array.isArray(b))return JSON.stringify([].concat(a))===JSON.stringify([].concat(b));return a===b||(typeof a==='number'&&String(a)===String(b));}
    function check(){
      try { checkInputs(); } catch(error) { failInstance(request,error); }
    }
    function checkInputs(){
      if(instanceRequests.get(request.instance.id)!==request)return;
      var host=document.getElementById(request.instance.id+'_host');
      if(request.userEdited){done();return;}
      var matching=true,mismatched=[],all=Shiny.shinyapp.$inputValues||{};
      Object.keys(request.instance.inputs||{}).forEach(function(key){
        var id=request.instance.id+'-'+key,el=document.getElementById(id),expected=request.instance.inputs[key];
        if(!el){matching=false;mismatched.push(key);return;}
        var binding=window.jQuery&&jQuery(el).data('shiny-input-binding'),actual=binding&&binding.getValue?binding.getValue(el):all[id];
        var wire=Object.prototype.hasOwnProperty.call(all,id)?all[id]:all[id+':shiny.number'];
        if(!equivalent(actual,expected)||!equivalent(wire,expected)){matching=false;mismatched.push(key);}
      });
      // Only this instance's stable inputs determine when it can mount.
      // Live rendering and export readiness are checked separately.
      // Count observed checks, not wall time: a blocked event loop supplies no
      // evidence that a control remained unsettled during that interval.
      if(matching){stable++;}else{stable=0;}
      if(stable>=7){done();return;}
      if(!matching){
        var signature=mismatched.slice().sort().join('|');
        if(signature!==lastMismatch){lastMismatch=signature;retries=0;nextRetry=0;}
        if(retries<6 && Date.now()>=nextRetry){setInstanceInputs(request.instance,mismatched);nextRetry=Date.now()+Math.min(16000,1000*Math.pow(2,retries));retries++;}
      }
      setTimeout(check,100);
    }
    if(host){host.addEventListener('pointerdown',function(){request.userEdited=true;},{once:true});host.addEventListener('keydown',function(){request.userEdited=true;},{once:true});}
    check();
  }
  // A reply belongs to the request that sent it (its token, when the server echoes
  // one), and every retry of that reply stays bound to that request object.
  function replyRequest(message){
    var request=message&&instanceRequests.get(message.id);if(!request)return null;
    // Every request carries a token: a reply without it, or with another, is not this request's.
    if(request.token&&message.request!==request.token)return null;
    return request;
  }
  function instanceReady(message, attempt, bound) {
    var request=bound||replyRequest(message);if(!request||instanceRequests.get(message.id)!==request)return;
    try { initializeInstance(message,attempt,request); } catch(error) { failInstance(request,error); }
  }
  // The server's error for a copy: a failed creation request, or (no request in
  // flight) a mounted copy whose analysis stopped. The server sends the token of
  // the copy's latest creation request: an error carrying another one (an earlier,
  // cancelled request for this id) leaves the request and the mounted card alone.
  function instanceError(message) {
    if(!message)return;
    var request=instanceRequests.get(message.id);
    if(request&&request.token&&message.request!==request.token)return;
    if(request){if(!dropUndoRequest(request)&&request.saved)restoreStatus('failed');clearTimeout(request.timer);failPlaceholder(request);parkInstance(message.id);instanceRequests.delete(message.id);}
    else {
      var mounted=Array.from(records.values()).filter(function(r){return r.instance&&r.instance.id===message.id&&r.node;});
      // A mounted copy keeps the token of the request that created it.
      if(mounted.some(function(r){return r.requestToken&&message.request!==r.requestToken;}))return;
      // A mounted copy whose analysis failed no longer shows a current result.
      mounted.forEach(function(r){r.revision=(r.revision||0)+1;r.renderRevision=null;r.sourceError=true;r.sourceWaiting=false;r.sourceSignature=null;if(r.statistics&&window.TeamCanvasStatistics)TeamCanvasStatistics.sourceChanged(r);if(!r.hydrating)staleSnapshot(r);});
    }
    tell(message.message||'Could not create an independent plot.');
  }
  // A restored copy stays hidden (same size, spinner) until the browser has drawn a
  // render that matches its saved settings. The server confirms, per creation
  // generation, when it holds every saved setting ('team-canvas-instance-settled',
  // sent ahead of that flush's output values). After that signal the card is shown
  // once a new value for its output has been drawn by Plotly, or once that flush
  // ends (shiny:idle) without a new value: the render already shown is current.
  // The copy's render often arrives before its card is mounted, so the order of the
  // signal and of each output's latest value is kept. 45 s is only a fallback.
  // Plotly's completed draws of each copy are recorded from its first value (shiny:value
  // fires before the binding renders), so a draw that finished before mounting counts.
  var settledInstances = {}, outputValueAt = {}, outputDrawnAt = {}, idleAt = 0, messageSequence = 0;
  if (window.jQuery) jQuery(document).on('shiny:value', function (e) {
    outputValueAt[e.name] = ++messageSequence;
    var target = /^tcinstance_/.test(e.name) && document.getElementById(e.name);
    if (target && !target.tcDrawWatch) { target.tcDrawWatch = true; jQuery(target).on('plotly_afterplot', function () { outputDrawnAt[e.name] = ++messageSequence; }); }
  }).on('shiny:idle', function () { idleAt = ++messageSequence; });
  // A copy's controls that its module renders on the server (renderUI) first arrive with
  // the module's defaults while the copy's own settings are already on their way. Binding
  // that markup sends the defaults too; when the renderUI re-renders the very control it
  // reads (barchart's column subset), the two values then chase each other indefinitely,
  // each echo re-rendering the control and re-sending the other value. That loop kept the
  // server and browser saturated after a reopen, so restored Plotly cards waited behind it.
  // Writing the copy's settings into the markup before it binds sends one value only.
  // Only checkbox and radio groups are seeded: their bound value is read from the markup.
  function seedRenderedControls(html, instance) {
    if (html.indexOf(instance.id + '-') < 0) return null;
    var template = document.createElement('template'), changed = false;
    template.innerHTML = html;
    Object.keys(instance.inputs || {}).forEach(function (key) {
      var group = template.content.getElementById(instance.id + '-' + key);
      if (!group || !(group.classList.contains('shiny-input-checkboxgroup') || group.classList.contains('shiny-input-radiogroup'))) return;
      var saved = instance.inputs[key], values = (Array.isArray(saved) ? saved : saved == null ? [] : [saved]).map(String);
      var boxes = Array.from(group.querySelectorAll('input[type=checkbox],input[type=radio]'));
      if (group.classList.contains('shiny-input-radiogroup') && !boxes.some(function (box) { return values.indexOf(box.value) >= 0; })) return;
      boxes.forEach(function (box) {
        var on = values.indexOf(box.value) >= 0;
        if (box.hasAttribute('checked') === on) return;
        changed = true;
        if (on) box.setAttribute('checked', 'checked'); else box.removeAttribute('checked');
      });
    });
    return changed ? template.innerHTML : null;
  }
  if (window.jQuery) jQuery(document).on('shiny:value', function (e) {
    if (!/^tcinstance_/.test(e.name) || !e.value || typeof e.value.html !== 'string') return;
    var request = instanceRequests.get(e.name.slice(0, e.name.indexOf('-')));
    if (!request || request.userEdited || !request.instance) return;
    var html = seedRenderedControls(e.value.html, request.instance);
    if (html !== null) e.value.html = html;
  });
  // The plotly R binding turns every listed Plotly event into a Shiny input
  // ('plotly_afterplot-<source>', 'plotly_relayout-<source>'). Drawing and resizing a canvas
  // copy fires both many times; each became a server round trip plus Shiny's page-wide
  // conditional re-check (about 14 s of main thread for 16 cards). The server reads only
  // plotly_click (R/utils_plot_events.R) and no browser code reads these inputs, so a copy's
  // value drops the two draw-time names before its binding renders (shiny:value precedes the
  // render). Traces, layout and pixels are unchanged; graph-div listeners (gd.on) still fire,
  // and click, hover and selection stay registered.
  var DRAW_TIME_EVENTS = ['plotly_afterplot', 'plotly_relayout'];
  if (window.jQuery) jQuery(document).on('shiny:value', function (e) {
    var el = (e.binding && e.binding.el) || (/^tcinstance_/.test(e.name || '') && document.getElementById(e.name)), x = e.value && typeof e.value === 'object' ? e.value.x : null;
    if (!/^tcinstance_/.test(e.name || '') || !el || !el.classList || !el.classList.contains('plotly') || !x) return;
    if (Array.isArray(x.shinyEvents)) x.shinyEvents = x.shinyEvents.filter(function (name) { return DRAW_TIME_EVENTS.indexOf(name) < 0; });
    // A Canvas card's image exports are its own (plot_exports.js: checked against the card's
    // revision before anything is published). Plotly's camera ("Download plot as a png")
    // downloads whatever is drawn when its conversion ends, unchecked: it is not offered.
    var config = x.config && typeof x.config === 'object' ? x.config : (x.config = {});
    var removed = Array.isArray(config.modeBarButtonsToRemove) ? config.modeBarButtonsToRemove : [];
    if (removed.indexOf('toImage') < 0) config.modeBarButtonsToRemove = removed.concat('toImage');
  });
  // Lazy mount (W16b). A restored copy's Plotly output is left unbound until its card first
  // comes near the view (one viewport around it), the person works with it, or a capture
  // needs it (export, Finish). Nothing is held: Shiny keeps the latest value or error of an
  // unbound output itself, and binding it (Shiny.bindAll) renders that current state through
  // Shiny's own path. Mounted once, a card is an ordinary card for good (never unbound
  // again). ?team_canvas_lazy=0 (or no IntersectionObserver) binds every output at once.
  // Every capture of a lazy card (image exports, data downloads, Finish, the properties
  // panel's export rows) goes through ensureMounted: bound, not recalculating, the drawn
  // traces those of Shiny's current value, its saved presentation applied, current; else
  // refused. ?team_canvas_assert=1 makes any capture of an unmounted or unclean lazy card throw.
  var lazyPending = new Set(), lazyCards = new Map(), lazyObserver = null;
  var LAZY_LABEL = 'Plot not drawn yet. It is drawn when it comes into view or you work with it.';
  var LAZY_WAIT_MS = 60000, LAZY_REFUSED = 'This plot is still updating. Export it again when it has finished.';
  function lazyEnabled() { return !!window.IntersectionObserver && new URLSearchParams(window.location.search).get('team_canvas_lazy') !== '0'; }
  function lazyAsserting() { return window.TEAM_CANVAS_ASSERT_MOUNTED === true || new URLSearchParams(window.location.search).get('team_canvas_assert') === '1'; }
  function lazyApp() { return window.Shiny && Shiny.shinyapp; }
  // The output is unbound and waits for its card to mount.
  function lazyUnmounted(id) { var s = lazyCards.get(id); return !!(s && !s.mounted); }
  // A value or error for an unmounted copy reaches the Canvas's listeners when it arrives,
  // on the copy's element, exactly as for a bound output (Shiny announces it on the document
  // when no binding exists): records, statistics and presentation follow it in real time;
  // mounting later only draws. Shiny's own default (storing it) is unchanged.
  var lazyLastSeen = {};
  if (window.jQuery) jQuery(document).on('shiny:value shiny:error', function (e) {
    if (e.target !== document || !e.name || !lazyUnmounted(e.name)) return;
    var el = document.getElementById(e.name); if (!el) return;
    // A value equivalent to the one the card already has (same data, same preparation) is not
    // a new result: an eager card would take the equivalent-render path once drawn, but an
    // unmounted card is still hydrating, so announcing it would read as a change (and drop
    // verified statistics). Shiny keeps it; mounting draws it.
    var rev = preparation && preparation.revision, last = lazyLastSeen[e.name];
    if (e.type === 'shiny:error') delete lazyLastSeen[e.name];
    else {
      var sig = plotlySourceSignature({el:el}, e.value);
      lazyLastSeen[e.name] = {sig:sig, rev:rev};
      if (last && sig != null && last.sig === sig && last.rev === rev) return;
    }
    jQuery(el).trigger(e.type === 'shiny:value' ? jQuery.Event('shiny:value', {name:e.name, value:e.value}) : jQuery.Event('shiny:error', {name:e.name, error:e.error}));
  });
  // A card's kept export links ("Save PNG file") hold an image of the revision their export
  // started on. Every image export of a Canvas card records the card's revision when it starts
  // (exportRevision) and publishes only if it is unchanged; its link carries that revision and
  // is checked again when clicked (below). Once Canvas has handled a value or error for a card
  // (a new render or not), links whose revision is no longer current are withdrawn, wherever
  // they are (the card, or a bar the properties panel holds).
  function withdrawStaleLinks(id) {
    document.querySelectorAll('a.plot-export-fallback[data-card-id]').forEach(function (a) {
      if (a.dataset.cardId === id && !exportCurrent({cardId:a.dataset.cardId, revision:a.dataset.revision})) a.remove();
    });
  }
  if (window.jQuery) jQuery(document).on('shiny:value shiny:error', function (e) {
    var id = e.target !== document && (e.name || (e.target && e.target.id));
    if (!id || !records.has(id)) return;
    setTimeout(function () { withdrawStaleLinks(id); }, 0);
  });
  // Leaves a copy's output unbound (Shiny keeps whatever it receives meanwhile). Until it
  // mounts it also goes without htmlwidgets' class: each new instance host is inserted into
  // <body> and Shiny then binds the whole body, which would bind it again. The Canvas and
  // the export bar know it by .tc-lazy-unbound instead.
  function lazyUnbind(el) {
    Shiny.unbindAll(el, true);
    // Shiny's progress for an unbound output reaches no element: the class it set at binding
    // would stay. Binding again restores it if the output is still recalculating then.
    el.classList.remove('recalculating'); el.classList.add('tc-lazy-unbound');
    el.classList.remove('html-widget-output');
  }
  // A copy's host arrives with its first value in the same server flush; Shiny would bind
  // the inserted output and draw that value at once. Its markup is changed before insertion
  // instead, so the output is never bound until it mounts.
  if (window.jQuery) jQuery(document).on('shiny:message', function (e) {
    var insert = e.message && e.message['shiny-insert-ui'], html = insert && insert.content && insert.content.html;
    if (!lazyPending.size || typeof html !== 'string') return;
    var ids = Array.from(lazyPending).filter(function (id) { return html.indexOf(id) >= 0; });
    if (!ids.length) return;
    var template = document.createElement('template'); template.innerHTML = html;
    var changed = false;
    ids.forEach(function (id) {
      var el = template.content.getElementById(id);
      if (!el || !el.classList.contains('plotly') || !el.classList.contains('html-widget-output')) return;
      el.classList.remove('html-widget-output'); el.classList.add('tc-lazy-unbound');
      lazyPending.delete(id); lazyCards.set(id, {mounted:false}); changed = true;
    });
    if (changed) insert.content.html = template.innerHTML;
  });
  if (window.jQuery) jQuery(document).on('shiny:bound', function (e) {
    var el = e.target, id = el && el.id, app = lazyApp();
    if (e.bindingType !== 'output' || !id || !app) return;
    var nothingYet = app.$values[id] === undefined && app.$errors[id] === undefined;
    if (lazyPending.has(id)) {
      lazyPending.delete(id);
      // Only Plotly copies, and only before anything was received for them.
      if (!e.binding || e.binding.name !== 'plotly' || !nothingYet) return;
      lazyUnbind(el); lazyCards.set(id, {mounted:false});
      return;
    }
    // Bound again by a Shiny.bindAll over it (not lazyMount). With nothing received it
    // simply stays unbound. Otherwise Shiny has drawn its current state: the card is mounted
    // from then on.
    var s = lazyCards.get(id), r = s && records.get(id);
    if (!s || s.mounted || s.binding) return;
    if (nothingYet) { lazyUnbind(el); return; }
    s.mounted = true; el.classList.remove('tc-lazy-unbound'); el.classList.add('html-widget-output');
    if (r) {
      if (lazyObserver && r.node) lazyObserver.unobserve(r.node);
      lazyMarks(r, false);
      if (r.node) requestAnimationFrame(function () { if (r.node) resize(r); });
    }
  });
  function lazyForgetInstance(instanceId) {
    lazyPending.forEach(function (id) { if (id.indexOf(instanceId + '-') === 0) lazyPending.delete(id); });
    Array.from(lazyCards.keys()).forEach(function (id) {
      if (id.indexOf(instanceId + '-') !== 0) return;
      var r = records.get(id); if (lazyObserver && r && r.node) lazyObserver.unobserve(r.node);
      lazyCards.delete(id);
    });
  }
  function lazyMarks(r, on) {
    if (!r.node) return;
    r.node.classList.toggle('tc-lazy-dormant', on);
    if (on) { r.node.setAttribute('aria-busy', 'true'); r.el.classList.add('tc-lazy-placeholder'); if (!r.el.hasAttribute('aria-label') && !r.el.hasAttribute('role')) { r.el.setAttribute('role', 'img'); r.el.setAttribute('aria-label', LAZY_LABEL); } }
    else { r.node.removeAttribute('aria-busy'); r.el.classList.remove('tc-lazy-placeholder'); if (r.el.getAttribute('aria-label') === LAZY_LABEL) { r.el.removeAttribute('aria-label'); r.el.removeAttribute('role'); } }
  }
  // Binds the card's output once: Shiny's bind draws its current value (or shows its error).
  // The Canvas's listeners already heard every value and error as it arrived (below).
  function lazyMount(r) {
    var id = r && r.el && r.el.id, s = id && lazyCards.get(id), app = lazyApp();
    if (!s || s.mounted || !app || !r.el.isConnected) return;
    s.mounted = true;
    if (lazyObserver && r.node) lazyObserver.unobserve(r.node);
    lazyMarks(r, false);
    r.el.classList.remove('tc-lazy-unbound'); r.el.classList.add('html-widget-output');
    s.binding = true;
    Promise.resolve(Shiny.bindAll(r.el.parentNode)).then(function () { if (r.node) resize(r); }).catch(function () {});
  }
  function lazyAttach(r) {
    if (!lazyUnmounted(r.el.id) || !r.node) return;
    // A plot inside a module's renderUI is re-bound by it: drawn at once, as before.
    if (r.dynamic) { lazyMount(r); return; }
    lazyMarks(r, true);
    if (!r.lazyListening) {
      r.lazyListening = true;
      ['pointerdown','focusin','keydown'].forEach(function (type) { r.node.addEventListener(type, function (event) { if (event.isTrusted) lazyMount(r); }, true); });
    }
    var scroll = board && board.closest('.tc-scroll');
    if (!lazyObserver && scroll) lazyObserver = new IntersectionObserver(function (entries) {
      // A finished figure shows its saved image: its live plot mounts on Edit (or when worked with).
      entries.forEach(function (entry) { if (!entry.isIntersecting) return; var rr = records.get(entry.target.dataset.plotId); if (rr && !rr.snapshot) lazyMount(rr); });
    }, {root:scroll, rootMargin:'100% 100% 100% 100%'});
    if (lazyObserver) lazyObserver.observe(r.node); else lazyMount(r);
  }
  // What the card shows must be Shiny's current value: every trace's type and x, y, z values
  // (numbers to 10 significant digits). Presentation restyles traces but keeps these, except
  // the axis swap (plot_editor.js), which exchanges x and y.
  function lazyTraceSignature(data, swapped) {
    var norm = function (v) {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? +v.toPrecision(10) : String(v);
      if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.prototype.map.call(v, norm);
      return typeof v === 'object' ? null : v;
    };
    // plot_editor.js's rule, exactly: a rectangular matrix is transposed, any other is kept.
    var transpose = function (m) { return Array.isArray(m) && m.length && m.every(function (row) { return Array.isArray(row) && row.length === m[0].length; }) ? m[0].map(function (_, i) { return m.map(function (row) { return row[i]; }); }) : m; };
    return JSON.stringify((Array.isArray(data) ? data : []).map(function (t) {
      // plot_editor.js transposes z too for these types when it swaps the axes.
      var z = swapped && ['heatmap', 'contour', 'histogram2d'].indexOf(t.type) >= 0 ? transpose(t.z) : t.z;
      return [t.type || '', norm(swapped ? t.y : t.x), norm(swapped ? t.x : t.y), norm(z)];
    }));
  }
  var lazySourceSignatures = new WeakMap();
  function lazySourceSignature(value, swapped) {
    var cached = lazySourceSignatures.get(value), key = swapped ? 'swapped' : 'plain';
    if (!cached) { cached = {}; lazySourceSignatures.set(value, cached); }
    if (!(key in cached)) cached[key] = lazyTraceSignature(value.x.data, swapped);
    return cached[key];
  }
  // A Canvas card's export revision: its render revision (r.revision: a new value, an error or
  // a Group Comparison data change; an equivalent value is not one), its presentation and its
  // statistics display.
  function stableJSON(v) {
    if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stableJSON(v[k]); }).join(',') + '}';
    return v === undefined ? 'null' : JSON.stringify(v);
  }
  function lazyExportEpoch(r) { return [r.revision || 0, stableJSON(r.visual || {}), stableJSON(r.statistics && r.statistics.presentation || null)].join('|'); }
  function exportRevision(el) {
    var node = el && el.closest && el.closest('.tc-node'), r = node && records.get(node.dataset.plotId);
    return r && r.node && r.el ? {cardId:r.el.id, revision:lazyExportEpoch(r)} : null;
  }
  function exportCurrent(token) {
    if (!token) return true;
    var r = records.get(token.cardId);
    return !!(r && r.node && lazyExportEpoch(r) === token.revision);
  }
  // Mounted and clean: what any capture of the card may read.
  function lazyClean(r) {
    var app = lazyApp(), id = r && r.el && r.el.id; if (!app || !r.node) return false;
    var s = lazyCards.get(id); if (!s) return true; // never lazy: unchanged behaviour
    var binding = app.$bindings[id]; if (!s.mounted || !binding || binding.el !== r.el) return false;
    if (r.el.classList.contains('recalculating') || app.$errors[id] !== undefined) return false;
    var value = app.$values[id], gd = r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot');
    if (!value || !value.x || !gd || !gd.data || !gd._fullLayout) return false;
    // The cheap conditions first; the full comparison only once they hold.
    if (r.hydrating || r.appearancePending || !figureCurrent(r)) return false;
    var swapped = !!(window.TeamPlotEditor && TeamPlotEditor.isSwapped && TeamPlotEditor.isSwapped(gd));
    return lazyTraceSignature(gd.data) === lazySourceSignature(value, swapped);
  }
  // The one way a capture reaches a lazy card: mounts it, resolves true once clean, false
  // (refused) if it is not clean within LAZY_WAIT_MS.
  function ensureMounted(r) {
    if (!r || !r.node) return Promise.resolve(false);
    lazyMount(r);
    return new Promise(function (resolve) {
      var start = Date.now();
      (function check() {
        if (!r.node) { resolve(false); return; }
        if (lazyClean(r)) { resolve(true); return; }
        if (Date.now() - start > (Number(window.TEAM_CANVAS_LAZY_WAIT_MS) || LAZY_WAIT_MS)) { resolve(false); return; }
        setTimeout(check, 100);
      })();
    });
  }
  function lazyRecordForPlot(el) {
    var node = el && el.closest && el.closest('.tc-node');
    return node ? records.get(node.dataset.plotId) || null : null;
  }
  // Test mode: a capture reading a lazy card that is not mounted and clean throws.
  function lazyAssertClean(target) {
    if (!lazyAsserting()) return;
    var r = target && target.el ? target : lazyRecordForPlot(target);
    if (r && lazyCards.has(r.el.id) && !lazyClean(r)) {
      var message = 'Lazy mount: a capture read card ' + r.el.id + ' before it was mounted and clean.';
      (window.TEAM_CANVAS_ASSERT_FAILURES = window.TEAM_CANVAS_ASSERT_FAILURES || []).push(message);
      throw new Error(message);
    }
  }
  // Plotly's own camera (modebar "Download plot") is a capture too.
  var LAZY_CAPTURES = '.plot-export-button,.tc-csv,.gc-download,.shiny-download-link,a[download],.modebar-btn[data-attr="toImage"],.modebar-btn[data-title^="Download plot"]';
  function lazyCaptureRecord(control) {
    var node = control.closest('.tc-node');
    if (node) return records.get(node.dataset.plotId) || null;
    return control.closest('#tc-selection-inspector') ? selectedRecord : null;
  }
  document.addEventListener('click', function (event) {
    var t = event.target, control = t && t.closest && t.closest(LAZY_CAPTURES + ',.tc-node-head button');
    if (!control || control.closest('.tc-snapshot-exports')) return;
    // A kept image link of a Canvas card ("Save PNG file", also clicked by its export when it
    // finishes) is the image of the export that made it: refused and removed once the card's
    // revision has changed since that export started, wherever the link is. Every card.
    if (control.classList.contains('plot-export-fallback') && control.dataset.cardId) {
      var made = {cardId:control.dataset.cardId, revision:control.dataset.revision};
      var owner = records.get(made.cardId);
      if (!exportCurrent(made) || (owner && lazyCards.has(made.cardId) && !lazyClean(owner))) {
        event.preventDefault(); event.stopImmediatePropagation(); control.remove();
        tell('Plot changed \u2014 export again.');
      }
      return;
    }
    var r = lazyCaptureRecord(control);
    if (!r || !r.node || !lazyCards.has(r.el.id)) return;
    var finishing = control === r.finishButton;
    if (!finishing && !control.matches(LAZY_CAPTURES)) return;
    // Edit on a finished figure shows the live plot: it mounts, then proceeds as before.
    if (finishing && r.snapshot) { lazyMount(r); return; }
    if (lazyClean(r)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    ensureMounted(r).then(function (clean) {
      if (!clean) { tell(finishing ? 'This plot is still updating. Finish it again when it has finished.' : LAZY_REFUSED); return; }
      // Plotly rebuilds its modebar when it draws: the camera is found again in the card.
      var target = control.isConnected ? control : (control.classList.contains('modebar-btn') && r.node ? r.node.querySelector('.modebar-btn[data-title="' + (control.getAttribute('data-title') || '').replace(/"/g, '') + '"]') : null);
      if (target) target.click();
    });
  }, true);
  // Working in the properties panel mounts the card it shows.
  ['pointerdown','focusin','keydown'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (!event.isTrusted || !event.target || !event.target.closest || !event.target.closest('#tc-selection-inspector')) return;
      if (selectedRecord && selectedRecord.node) lazyMount(selectedRecord);
    }, true);
  });
  // Opening the Canvas of a restored workspace: one "Preparing your canvas" dialog (the
  // Team busy dialog, foreground.js, rendered by busy_presentation.js) instead of cards
  // appearing one by one. Display only: it reads the restore and the cards, changes no
  // state, data, export or save. It opens on the first showing of the Canvas after each
  // restore (or when a restore starts while it is shown) if the Canvas is not ready yet:
  // every restored figure mounted (its card) and every
  // card in view drawn and settled. Saved plots whose analysis is not available count as
  // done (awaiting). It fades out once ready, and closes anyway after GATE_CAP_MS (cards
  // still loading keep their own spinner), on a restore failure or a lost connection:
  // nobody is ever held. Escape does nothing meanwhile (the busy dialog's rule).
  var restoreGeneration = 0, gateGeneration = 0, gate = null, gateWasShown = false, gateAwaitingTold = '';
  var GATE_LABEL = 'Preparing your canvas\u2026', GATE_CAP_MS = 60000, GATE_TICK_MS = 250;
  function gateInView(r) {
    var scroll = board && board.closest('.tc-scroll'); if (!scroll || !r.node || !r.node.getClientRects().length) return false;
    var v = scroll.getBoundingClientRect(), n = r.node.getBoundingClientRect();
    return n.right > v.left && n.left < v.right && n.bottom > v.top && n.top < v.bottom;
  }
  // A mounted card is done when it needs nothing more for the opening view.
  function gateCardDone(r) {
    if (r.sourceError || !gateInView(r)) return true;
    // A finished figure in view: its saved image has loaded (or failed: nothing to wait for).
    if (r.snapshot) { var image = r.preview && r.preview.querySelector('img'); return !image || image.complete; }
    if (lazyUnmounted(r.el.id)) return false; // in view: it mounts and draws now
    if (r.el.classList.contains('tc-restore-settling') || r.el.classList.contains('recalculating')) return false;
    try { if (awaitingInput(r)) return true; } catch (ignore) {}
    if (r.el.classList.contains('shiny-output-error') || r.el.querySelector('.shiny-output-error')) return true;
    return gateDrawn(r.el) && !r.hydrating && !r.appearancePending;
  }
  function gateDrawn(el) {
    var gd = el.classList.contains('js-plotly-plot') ? el : el.querySelector('.js-plotly-plot');
    if (gd) return !!(gd.data && gd._fullLayout);
    return networkDrawn(el) || !!el.querySelector('img[src],svg,canvas');
  }
  // A saved figure not mounted: loading (queued or requested) or awaiting its analysis.
  function gateAwaiting(id, saved) {
    if (deferredNodes.has(id)) return false;
    if (saved && saved.instance && instanceRequests.has(saved.instance.id)) return false;
    return true;
  }
  function gateProgress() {
    var done = 0, total = 0, awaiting = [];
    records.forEach(function (r) { if (!r.node) return; total++; if (gateCardDone(r)) done++; });
    restorePending.forEach(function (saved, id) { total++; if (gateAwaiting(id, saved)) { done++; awaiting.push(saved.label || id); } });
    return {done:done, total:total, awaiting:awaiting};
  }
  function gateTellAwaiting(labels) {
    var text = labels.length ? 'Some saved figures will appear once their analysis is ready: ' + labels.join(', ') + '.' : '';
    if (!text || text === gateAwaitingTold) return;
    gateAwaitingTold = text; tell(text);
  }
  function gateClose(reason) {
    var g = gate; if (!g || g.closing) return; g.closing = true;
    clearInterval(g.ticker); if (g.watch) { g.watch.disconnect(); g.watch = null; }
    var dialog = document.getElementById('team-foreground');
    // Open (and counting as open: no awaiting message) until the dialog has closed.
    var finish = function () { if (gate === g) gate = null; if (root) root.removeAttribute('aria-busy'); if (dialog) dialog.classList.remove('tc-gate-closing'); if (window.TeamBusy) TeamBusy.end(g.token); if (reason !== 'failed') { if (gateGeneration !== restoreGeneration) gateOpen(); if (!gate) gateTellAwaiting(gateProgress().awaiting); } };
    // Fades out once when ready and nothing else holds the dialog.
    if (reason === 'ready' && dialog && window.TeamBusy && TeamBusy.pending() === 1 && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { dialog.classList.add('tc-gate-closing'); g.fade = setTimeout(finish, 220); }
    else finish();
  }
  // An output error of the Canvas (a figure's, mounted or not yet): not a silent req(), a
  // cancelled output, or a validate()/need() message (an expected state, counted as done).
  var gateErrorGeneration = -1, gateRestoreIds = new Set();
  function gateErrorType(cls) { return /shiny-output-error-(shiny\.silent\.error|validation|shiny\.output\.cancel)/.test(cls || ''); }
  function gateCanvasOutput(el) {
    if (!el || !el.id) return false;
    // Only this restore's figures (by saved id, or an independent copy's namespace): an
    // unrelated output's error does not close the dialog.
    var id = el.id, found = gateRestoreIds.has(id);
    if (!found) gateRestoreIds.forEach(function (key) { if (key.slice(-1) === '-' && id.indexOf(key) === 0) found = true; });
    return found;
  }
  function gateErrorShown() {
    return Array.prototype.some.call(document.querySelectorAll('.shiny-output-error'), function (el) { return !gateErrorType(el.className) && gateCanvasOutput(el); });
  }
  if (window.jQuery) jQuery(document).on('shiny:error', function (e) {
    var err = e.error || {}, types = [].concat(err.type || []).join(' ');
    if (!err.message || /shiny\.silent\.error|validation|shiny\.output\.cancel/.test(types)) return;
    if (gateCanvasOutput(e.target)) gateErrorGeneration = restoreGeneration;
  });
  function gateTick() {
    var g = gate; if (!g) return;
    if (restoreFailed || !canvasShown()) { gateClose('failed'); return; }
    // Another operation in the dialog failed, or a figure shows an error: the dialog gives way
    // so its message (Dismiss) and the card's error are reachable at once.
    var dialog = document.getElementById('team-foreground');
    if (dialog && dialog.classList.contains('has-error')) { gateClose('failed'); return; }
    var failed = gateErrorGeneration === restoreGeneration; records.forEach(function (r) { if (r.node && r.sourceError && gateCanvasOutput(r.el)) failed = true; });
    if (failed || gateErrorShown()) { gateClose('failed'); return; }
    var p = gateProgress(); g.done = Math.max(g.done, p.done); g.total = Math.max(g.total, p.total);
    if (p.done >= p.total && !restoreBuilding) { gateClose('ready'); return; }
    if (Date.now() - g.start > GATE_CAP_MS) gateClose('cap');
  }
  function gateOpen() {
    // A new restore while the dialog is up: the same dialog now stands for it (its count and
    // its 60 s start over). One arriving while it fades opens it again once it has closed.
    if (gate) {
      if (restoreGeneration && gateGeneration !== restoreGeneration && (!gate.closing || gate.fade)) {
        // Fading out: it stays open instead (no second opening).
        if (gate.closing) {
          clearTimeout(gate.fade); gate.fade = null; gate.closing = false;
          var fading = document.getElementById('team-foreground'); if (fading) fading.classList.remove('tc-gate-closing');
          gate.ticker = setInterval(gateTick, GATE_TICK_MS); gateWatchErrors(gate);
        }
        var q = gateProgress(); gateGeneration = restoreGeneration; gateAwaitingTold = '';
        gate.start = Date.now(); gate.done = q.done; gate.total = q.total;
      }
      return;
    }
    if (restoreFailed || !restoreGeneration || gateGeneration === restoreGeneration || !canvasShown()) return;
    // No busy dialog on this page (foreground.js absent): figures awaiting their analysis are
    // still named, as before the dialog existed.
    if (!window.TeamBusy) { gateTellAwaiting(gateProgress().awaiting); return; }
    gateGeneration = restoreGeneration; gateAwaitingTold = '';
    // A figure already shows an error: no dialog over it (the awaiting ones are still named).
    if (gateErrorGeneration === restoreGeneration || gateErrorShown()) { gateTellAwaiting(gateProgress().awaiting); return; }
    var p = gateProgress();
    if (p.done >= p.total && !restoreBuilding) { gateTellAwaiting(p.awaiting); return; }
    gate = {token:TeamBusy.begin(GATE_LABEL), start:Date.now(), done:p.done, total:p.total};
    if (root) root.setAttribute('aria-busy', 'true');
    gate.ticker = setInterval(gateTick, GATE_TICK_MS); gateWatchErrors(gate);
  }
  // Another operation failing in the busy dialog closes this one at once (before its
  // Dismiss can be pressed), not at the next tick.
  function gateWatchErrors(g) {
    var dialog = document.getElementById('team-foreground'); if (!dialog || !window.MutationObserver) return;
    g.watch = new MutationObserver(function (changes) {
      var failed = dialog.classList.contains('has-error') || changes.some(function (m) { return /\bhas-error\b/.test(m.oldValue || ''); });
      if (gate === g && failed) gateClose('failed');
    });
    g.watch.observe(dialog, {attributes:true, attributeFilter:['class'], attributeOldValue:true});
  }
  // Restored figures load quietly once the Canvas has been opened for their restore (the
  // dialog, or a Canvas that was ready at once, stands for them): no message per card.
  function gateQuiet() { return !!gate || (!!restoreGeneration && gateGeneration === restoreGeneration); }
  // The Canvas becoming shown (or a restore while it is shown) opens the dialog once.
  function gateWatch() { var shown = canvasShown(); if (shown && !gateWasShown) gateOpen(); gateWasShown = shown; }
  if (window.jQuery) jQuery(document).on('shiny:disconnected', function () { gateClose('failed'); });
  function settleRestored(el, instanceId, generation){
    el.classList.add('tc-restore-settling');
    var start=Date.now();
    function signal(){var s=settledInstances[instanceId];return s&&s.generation===generation?s.at:0;}
    (function tick(){
      var now=Date.now(),settled=signal(),value=outputValueAt[el.id]||0,ready=false;
      if(settled&&!el.classList.contains('recalculating')){
        if(value>settled){
          // That value must have been drawn (non-Plotly outputs: short grace period).
          var plotly=el.classList.contains('plotly')||el.classList.contains('js-plotly-plot')||!!el.querySelector('.js-plotly-plot');
          // An unmounted lazy card draws that value when it mounts: its arrival is enough.
          ready=(outputDrawnAt[el.id]||0)>value||(!plotly&&now-start>3000)||lazyUnmounted(el.id);
        } else ready=idleAt>settled;
      }
      if(ready||now-start>45000||!el.isConnected){
        requestAnimationFrame(function(){el.classList.remove('tc-restore-settling');});
        return;
      }
      setTimeout(tick,100);
    })();
  }
  function initializeInstance(message, attempt, request) {
    var suffix=request.source.slice(request.source.indexOf('-')+1), el=document.getElementById(message.id+'-'+suffix);
    if(!el){if(attempt===15){var host=document.getElementById(message.id+'_host');if(host){setInstanceInputs(request.instance);openInstanceControls({instance:request.instance,label:plotTitle(request.source),el:{id:message.id+'-'+suffix}});tell('Choose this plot’s data in its independent settings panel.');}}setTimeout(function(){instanceReady(message,(attempt||0)+1,request);},100);return;}
    request.instance.inputs=message.inputs||{};setInstanceInputs(request.instance);
    // Inputs are sent before mounting or restoring appearance. The next server
    // flush then computes the copy using its own selection, never its sibling's.
    waitInstanceInputs(request,function mount(){
      // A renderUI boundary around the output (Violin's scrollable_plot_ui) re-renders
      // while the copy's inputs settle and replaces the element found above. Mounting
      // that detached element silently did nothing, so the card never appeared and the
      // request timed out. Mount the live element, or wait (under the request's own
      // deadline) for the next one.
      // A retry belongs to this request only: a cancelled or re-created copy with the
      // same id has its own request and settling check.
      if(instanceRequests.get(message.id)!==request)return;
      var live=document.getElementById(message.id+'-'+suffix);
      if(!live){setTimeout(mount,100);return;}
      el=live;
      var wrapper=el.parentElement&&el.parentElement.closest('.shiny-html-output');
      var r={el:el,label:plotTitle(request.source),node:null,dynamic:!!wrapper,wrapper:wrapper,instance:request.instance,allowedInputs:message.allowedInputs||null,requestToken:request.token||null};
      records.set(el.id,r);watchRender(r);clearTimeout(request.timer);instanceRequests.delete(message.id);
      var csvSource=csvByPlot[request.source];if(csvSource)csvByPlot[el.id]=message.id+(request.source.indexOf('-')<0?'-'+csvSource:csvSource.slice(request.source.indexOf('-')));
      // A restored copy whose live element cannot be placed (or that throws while
      // placed) fails the restore: its node must not stay pending with no request.
      if(request.saved){try{settleRestored(el,message.id,message.generation);restorePending.set(el.id,request.saved);hydratePending();trackRestoredInputs(r,request.instance.inputs);}finally{if(restorePending.get(el.id)===request.saved)restoreStatus('failed');}if(request.deferred)scheduleDeferred(0);}
      else {r.placeholder=request.placeholder;if(request.copy){rememberGeometry();geometryGesture=true;r.largeHeatmapAdapted=true;r.squareHeatmapAdapted=true;r.visual=JSON.parse(JSON.stringify(request.copy.visual||{}));r.statisticsCopy=request.copy.statistics||null;r.hydrating=true;}try{add(r);if(request.copy&&r.node){r.labelInput.value=request.copy.label;r.labelHeading.textContent=request.copy.label;r.node.style.width=request.copy.width+'px';r.node.style.height=request.copy.height+'px';r.hydrating=false;resize(r);}}finally{if(request.copy)geometryGesture=false;dropPlaceholder(request);}if(request.copy&&r.node)presentNewNode(r.node,r.el.id);}
      var opened=document.getElementById(message.id+'_host');if(opened&&opened.classList.contains('is-open')&&r.node)TeamCanvasFloatingPanel.open(opened,r.node);
      renderList();mountingDeferred=!!request.deferred;try{changed();}finally{mountingDeferred=false;}
    });
  }
  function humanize(id) {
    var name = id.split('-').slice(1).join(' ') || id;
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b(output|plot|chart|ui)\b/ig, '').replace(/\s+/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Plot';
  }
  function labelFor(el) {
    var card = el.closest('.rd-card'), title = card && card.querySelector('h3');
    if (title) return title.textContent.trim();
    var pane = el.closest('.tab-pane'), name = '';
    if (pane && pane.id) {
      var tab = Array.from(document.querySelectorAll('[data-bs-target], [href]')).find(function (x) {
        return x.getAttribute('data-bs-target') === '#' + pane.id || x.getAttribute('href') === '#' + pane.id;
      });
      if (tab) name = tab.textContent.trim();
    }
    return (name ? name + ' · ' : '') + humanize(el.id);
  }
  var toolNames = {heatmap_barchart_tab:'Heatmap', barchart:'Composition', volcano_tab:'Volcano Plot', lsea_tab:'LSEA', structural_tab:'Structural', structural_grid_tab:'Structural Grid', logratio_tab:'Violin Plots', fla_tab:'Functional Ratios', pathway_tab:'Lipid Pathways', cellular_org_tab:'Cellular Organization', longitudinal_tab:'Longitudinal', qc_pca_tab:'Quality Check'};
  function toolFor(el) {
    if (['structural_tab-propPlotPlot','structural_tab-diffAcylPlot'].includes(el.id)) return 'Main Class & Acyl Chain Proportions';
    return toolNames[el.id.split('-')[0]] || null;
  }
  function routeFor(el) { if (el.id.indexOf('cell_') === 0) return {step:6}; var tool = toolFor(el); return tool ? {tool:tool} : null; }
  function openRoute(route) { if (!route || !window.Shiny || !Shiny.setInputValue) return false; try { if (route.step) Shiny.setInputValue('guide_step',route.step,{priority:'event'}); else if (route.input) Shiny.setInputValue(route.input,Date.now(),{priority:'event'}); else if (route.tool) Shiny.setInputValue('guide_open_tool',route.tool,{priority:'event'}); else return false; return true; } catch (error) { return false; } }
  var extraRoutes = [
    {id:'pathway_tab-pathwayVisNetwork',title:'Lipid pathways · interactive network',route:{tool:'Lipid Pathways'}},
    {id:'cell-show-route',title:'3D cell · interactive and comparison plots',route:{step:6}}
  ];
  function dynamicOutput(el) { return !!el.parentElement && !!el.parentElement.closest('.shiny-html-output'); }
  function isPlotOutput(el) {
    if (!el || !el.id || tableOutputIds.has(el.id)) return false;
    if (el.classList.contains('shiny-plot-output')) return true;
    if (!el.classList.contains('html-widget-output') && !el.classList.contains('tc-lazy-unbound')) return false;
    if (el.classList.contains('datatables') || el.matches('.dataTables_wrapper, .dataTable') || el.querySelector('.datatables, .dataTables_wrapper, table')) return false;
    return true; // Includes Plotly, visNetwork, and other non-table graph widgets.
  }
  function plotOutputsIn(node) { return Array.from(node.querySelectorAll(selector)).filter(isPlotOutput); }
  function hasRenderedPlot(el) {
    if (!el || !el.isConnected) return false;
    return !!el.querySelector('img[src],svg,canvas') || el.matches('.js-plotly-plot') && !!(el.data && el.data.length);
  }
  function dynamicWrapper(el) {
    if (!el || !el.parentElement) return null;
    var wrapper = el.parentElement.closest('.shiny-html-output');
    // Moving an inner output wrapper out of an outer renderUI boundary is unsafe:
    // Shiny can replace that ancestor and recreate this same output ID in the source.
    if (wrapper && wrapper.parentElement && wrapper.parentElement.closest('.shiny-html-output')) return null;
    var outputs=wrapper && Array.from(wrapper.querySelectorAll(selector));
    return wrapper && outputs.length === 1 && isPlotOutput(outputs[0]) && outputs[0] === el ? wrapper : null;
  }
  function blockedPlot(id) { return window.TeamCanvasCatalog && typeof TeamCanvasCatalog.blocked === 'function' ? TeamCanvasCatalog.blocked(id) : null; }
  function routeOnlyPlot(id) { var item=window.TeamCanvasCatalog && TeamCanvasCatalog.get(id); return item && item.routeOnly || null; }
  function plotTitle(id) { var item=window.TeamCanvasCatalog && typeof TeamCanvasCatalog.get === 'function' ? TeamCanvasCatalog.get(id) : null; var r=records.get(id); return item && item.title || r && r.label || id; }
  function catalogRoute(id) {
    var item=window.TeamCanvasCatalog && typeof TeamCanvasCatalog.get === 'function' ? TeamCanvasCatalog.get(id) : null;
    if (item && item.route) {
      if (item.route.indexOf('step:')===0) return {step:Number(item.route.slice(5))};
      if (item.route.indexOf('input:')===0) return {input:item.route.slice(6)};
      return {tool:item.route};
    }
    var r=records.get(id); return r ? routeFor(r.el) : null;
  }
  function clearQueuedAdd(id, message) {
    var pending=pendingAdds.get(id); if (!pending) return false;
    clearTimeout(pending.timer); pendingAdds.delete(id); renderList();
    if (message) tell(message);
    return true;
  }
  function clearAllQueuedAdds() {
    var names=Array.from(pendingAdds.values()).map(function (pending) { return pending.label; });
    pendingAdds.forEach(function (pending) { clearTimeout(pending.timer); });
    pendingAdds.clear(); renderList(); return names;
  }
  function queueAdd(id, route) {
    if (routeOnlyPlot(id)) { tell('Use Open export studio to configure this publication preview.'); return false; }
    var blocked=blockedPlot(id);
    if (blocked) { tell(plotTitle(id) + ' is unavailable. ' + blocked.reason); return false; }
    var name=plotTitle(id);
    route=catalogRoute(id);
    if (!route) { tell('No safe analysis route is available for “' + name + '”. Open its analysis directly.'); return false; }
    if (records.has(id)) { var current=records.get(id); if (current.node) { tell(name + ' is already on the canvas.'); return false; } if (current.el.isConnected && (current.dynamic && !current.wrapper || dynamicOutput(current.el) && !current.wrapper)) { tell(name + ' could not be queued because its nested or shared dynamic panel cannot be moved safely. Open the analysis to view it.'); return false; } }
    var pending={label:name,route:route,expiresAt:Date.now()+queuedAddTtl,timer:null};
    var previous=pendingAdds.get(id); if (previous) clearTimeout(previous.timer);
    pendingAdds.set(id,pending);
    pending.timer=setTimeout(function () { clearQueuedAdd(id,'Queued add expired for “' + name + '”. Open the analysis and try again if you still want this plot.'); },queuedAddTtl);
    if (!openRoute(route)) { clearQueuedAdd(id,'Could not open the analysis for “' + name + '”. The queued add was cleared.'); return false; }
    renderList(); tell('Queued “' + name + '”. Open its analysis; cancel it in the catalog if you change your mind. This request expires after 90 seconds.');
    return true;
  }
  function resolveQueuedAdds() {
    Array.from(pendingAdds.keys()).forEach(function (id) {
      var r=records.get(id); if (!r || !r.el.isConnected) return;
      var blocked=blockedPlot(id);
      if (blocked) { clearQueuedAdd(id,'Could not add “' + plotTitle(id) + '”. ' + blocked.reason + ' The queued add was cleared.'); return; }
      if ((r.dynamic && !r.wrapper) || (dynamicOutput(r.el) && !r.wrapper)) { clearQueuedAdd(id,'Could not add “' + plotTitle(id) + '”: this plot is inside a nested or shared dynamic panel. The queued add was cleared; open the analysis to view it.'); return; }
      clearQueuedAdd(id);
      if (!add(r)) tell('Could not add “' + plotTitle(id) + '”. Open the analysis to view it, then try again.');
    });
  }
  function removeDuplicate(r) {
    // Preserve the saved layout and any frozen image if Shiny replaces the source.
    var saved = null;
    try { saved = validateState({version:'1',libraryHidden:false,nodes:[nodeState(r)]}).nodes[0]; }
    catch (error) { tell('The source changed and its current figure settings could not be preserved: ' + error.message); }
    if (saved) restorePending.set(saved.id, saved);
    // A replacement exists in the source view. Drop the old bound subtree, never export it.
    if (r.observer) r.observer.disconnect();
    if (r.renderObserver) r.renderObserver.disconnect();
    if (window.Shiny && Shiny.unbindAll) Shiny.unbindAll(r.target, true);
    r.target.remove(); if (r.bar) r.bar.remove(); if (r.barHome) r.barHome.remove();
    if (r.home) r.home.remove(); r.node.remove(); r.node = null;
    if (selectedRecord === r) { selectedRecord = null; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:null})); }
    board.classList.toggle('has-nodes', !!board.querySelector('.tc-node')); expandBoard();
    changed();
    tell(saved ? 'The source analysis replaced ' + r.label + '. Its previous figure is kept in this session; save the workspace to preserve it, then open the analysis for the current output.' : 'The source analysis replaced ' + r.label + '. Its previous canvas plot was removed; open the analysis to use the current output.');
  }
  function portalPlotSettings() {
    var dock = root.querySelector('.tc-settings-dock');
    if (!dock || dock.querySelector('.rd-controls')) return;
    var controls = document.querySelector('.rd-dashboard .rd-controls');
    if (!controls) return;
    // Move the existing bound controls: do not clone Shiny inputs or their IDs.
    var home = document.createComment('Dashboard plot settings are in the figure workspace');
    controls.before(home); dock.appendChild(controls);
  }
  function discover() {
    portalPlotSettings();
    Array.from(document.querySelectorAll(selector)).filter(isPlotOutput).forEach(function (el) {
      var existing = records.get(el.id);
      if (el.closest('.publication-canvas-frame,.tc-instance-host')) return;
      if (existing && existing.node && existing.wrapper && existing.wrapper.contains(el) && existing.el !== el) {
        // renderUI replaced the inner plot. Keep its complete bound UI output mounted.
        existing.el = el; existing.dynamic = dynamicOutput(el); existing.wrapper = dynamicWrapper(el);
        existing.revision = (existing.revision || 0) + 1;
        if (existing.snapshot) staleSnapshot(existing);
        return;
      }
      if (root.contains(el)) return;
      if (existing && existing.node && existing.el !== el) {
        removeDuplicate(existing);
        records.set(el.id, {el: el, label: labelFor(el), node: null, dynamic: true});
        return;
      }
      // Shiny can settle/reparent the same output without replacing its element.
      // Recheck an unmounted output so an initially shared boundary is not cached.
      if (existing && !existing.node && existing.el === el) {
        existing.dynamic = dynamicOutput(el); existing.wrapper = dynamicWrapper(el);
      }
      if (existing && (existing.node || existing.el.isConnected)) return;
      var wrapper = dynamicWrapper(el);
      records.set(el.id, {el: el, label: labelFor(el), node: null, dynamic:dynamicOutput(el), wrapper:wrapper});
    });
    renderList();
    hydratePending();
    resolveQueuedAdds();
  }
  function renderList() {
    if (window.TeamCanvasCatalog && typeof window.TeamCanvasCatalog.render === 'function') {
      window.TeamCanvasCatalog.render({list:list,filter:search.value,records:records,pending:pendingAdds,routeFor:routeFor,
        onAdd:function (id) { if(instancesConnected()&&instanceSupported(id))return requestInstance(id);var r=records.get(id); if (r && (!r.dynamic || r.wrapper)) add(r); },
        repeatable:function(id){return instancesConnected()&&instanceSupported(id);},
        onQueue:function (id,route) { if(instancesConnected()&&instanceSupported(id))return requestInstance(id);queueAdd(id,route); },
        onCancel:function (id) { clearQueuedAdd(id,'Cancelled queued add for “' + plotTitle(id) + '”.'); },
        onRoute:function (route,message) { openRoute(route); tell(message || 'Open the analysis to view this plot. This dynamic panel cannot be moved onto the canvas safely.'); }});
      return;
    }
    var filter = search.value.toLowerCase().trim(); list.replaceChildren();
    var matches = Array.from(records.values()).filter(function (r) { return (r.label + ' ' + r.el.id).toLowerCase().includes(filter); });
    function rank(r) {
      var featured = {'results_dashboard-plot_pca':0, 'results_dashboard-plot_violin':1, 'results_dashboard-plot_dist':2, 'results_dashboard-plot_comp':3, 'results_dashboard-plot_heat':4};
      return Object.prototype.hasOwnProperty.call(featured, r.el.id) ? featured[r.el.id] : 10;
    }
    matches.sort(function (a,b) { return rank(a) - rank(b) || a.label.localeCompare(b.label); });
    matches.forEach(function (r) {
      var button = document.createElement('button');
      button.type = 'button'; button.textContent = r.label;
      if (r.dynamic) {
        var hint = document.createElement('small'); hint.textContent = 'Open analysis · dynamically generated plot'; button.appendChild(hint);
        var route = routeFor(r.el); button.disabled = !route;
        button.addEventListener('click', function () { openRoute(route); });
      } else { button.disabled = !!r.node || !r.el.isConnected; button.addEventListener('click', function () { add(r); }); }
      list.appendChild(button);
    });
    var routes = extraRoutes.filter(function (r) { return r.title.toLowerCase().includes(filter); });
    routes.forEach(function (r) { var button = document.createElement('button'); button.type = 'button'; button.textContent = r.title; var hint = document.createElement('small'); hint.textContent = 'Open analysis · interactive view'; button.appendChild(hint); button.addEventListener('click', function () { openRoute(r.route); }); list.appendChild(button); });
    if (!matches.length && !routes.length) { var p = document.createElement('p'); p.textContent = 'No plots found. Some plots appear after their analysis is opened.'; list.appendChild(p); }
  }
  function tell(message) { status.textContent = message; }
  function isClassHeatmap(id) { var r=records.get(id);id=sourceKey(r)||id;return /^heatmap_barchart_tab-(heatmapPlot|heatmapSDPlot|filteredHeatmapPlot|filteredHeatmapSDPlot)$/.test(id); }
  // Plotly's responsive resize re-enables autosize and measures the element
  // through the canvas CSS zoom, so a zoomed-out canvas redrew card plots at
  // the zoomed size and they stayed small afterwards. Inside canvas cards,
  // resize to the element's logical size instead.
  function guardPlotlyResize() {
    var P=window.Plotly; if(!P||!P.Plots||P.Plots.resize.teamLogical)return;
    var original=P.Plots.resize;
    var logical=function(gd){
      var g=typeof gd==='string'?document.getElementById(gd):gd, card=g&&g.closest&&g.closest('#team-canvas-root .tc-node');
      // Heatmap geometries manage their own size (square cells, dense rectangles).
      if(!card||!g._fullLayout||!g.clientWidth||!g.clientHeight||(g.layout&&g.layout.meta&&g.layout.meta.teamHeatmap))return original.apply(this,arguments);
      var w=g.clientWidth,h=g.clientHeight,update={};
      if(g.layout.autosize!==false)update.autosize=false;
      if(Math.abs(g._fullLayout.width-w)>1)update.width=w;
      if(Math.abs(g._fullLayout.height-h)>1)update.height=h;
      if(update.autosize===false){update.width=w;update.height=h;}
      return Object.keys(update).length?P.relayout(g,update):Promise.resolve(g);
    };
    logical.teamLogical=true;P.Plots.resize=logical;
  }
  // Shiny's onResize hands htmlwidgets the size as seen through the canvas
  // zoom (a 592 px card at 40% arrived as 237 px), and the plotly binding
  // relayouts to it. Inside canvas cards use the element's logical size.
  // Shiny also calls it whenever an output crosses the browser viewport (pan) or its
  // on-screen box changes (zoom): a card whose plot already has its logical size is
  // left alone. Each of those was a full Plotly redraw, on-screen or not (54 in 30 s
  // of pan/zoom with 24 cards). Real size changes still relayout here and in resize().
  var widgetGuarded=false;
  function guardWidgetResize() {
    if(widgetGuarded)return;
    var reg=window.Shiny&&Shiny.outputBindings&&Shiny.outputBindings.getBindings&&Shiny.outputBindings.getBindings(); if(!reg)return;
    reg.forEach(function(entry){
      var w=entry.binding, isPlotly=w&&(w.name==='plotly'||entry.id==='plotly'||entry.name==='plotly'||(typeof w.find==='function'&&String(w.find).indexOf('plotly')>=0)||(w.className&&String(w.className).indexOf('plotly')>=0));
      if(!isPlotly||!w.resize||w.resize.teamLogical)return;
      var original=w.resize, logical=function(el,width,height,instance){
        if(el&&el.closest&&el.closest('#team-canvas-root .tc-node')&&el.clientWidth&&el.clientHeight){width=el.clientWidth;height=el.clientHeight;
          var full=el._fullLayout;if(full&&Math.abs(full.width-width)<=1&&Math.abs(full.height-height)<=1)return;}
        return original.call(this,el,width,height,instance);
      };
      logical.teamLogical=true;w.resize=logical;widgetGuarded=true;
    });
  }
  // camera: called because the canvas view changed (zoom, card box observer), not the content.
  function resize(r, camera) {
    // The shell's card footer (card_frame.js) sits under the content: the plot leaves it room.
    // Kept inside resize: tests evaluate this function's source on its own.
    function footSpace(node) { var foot = node && node.querySelector ? node.querySelector(':scope > .tc-card-foot') : null; var h = foot ? Number(foot.offsetHeight) : 0; return isFinite(h) && h > 0 ? h : 0; }
    guardPlotlyResize();guardWidgetResize();
    if (!r.node || r.snapshot) return;
    var content = r.node.querySelector('.tc-content');
    var gd = r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot');
    var heat=gd && gd.layout && gd.layout.meta && gd.layout.meta.teamHeatmap;
    var square=sourceKey(r)==='results_dashboard-plot_heat' && heat && heat.geometry==='square-horizontal' && gd.data && gd.data[0] && Array.isArray(gd.data[0].x) && Array.isArray(gd.data[0].y);
    var rectHeat=sourceKey(r)==='results_dashboard-plot_heat' && heat && heat.geometry==='rectangular' && Number.isFinite(heat.naturalHeight);
    var large=rectHeat && heat.rowCount>60;
    var denseHorizontal=large && gd.data && gd.data[0] && Array.isArray(gd.data[0].x) && gd.data[0].x.length===heat.rowCount && gd.data[0].x.length>(gd.data[0].y||[]).length;
    if(rectHeat && !r.largeHeatmapAdapted){
      r.largeHeatmapAdapted=true;
      // Explicit saved/copied dimensions belong to the user. Adapt new cards;
      // existing cards keep their frame while the full-size map scrolls inside.
      if(!r.hydrating && !applyingRestore){var grows=r.node.offsetWidth<1000 || r.node.offsetHeight<1050;r.node.style.width=Math.max(1000,r.node.offsetWidth)+'px';r.node.style.height=Math.max(1050,r.node.offsetHeight)+'px';if(grows)grownByContent(r.node);}
    }
    var viewScale = window.TeamCanvasViewport ? window.TeamCanvasViewport.scale : 1;
    var plotTop = (r.el.getBoundingClientRect().top - r.node.getBoundingClientRect().top) / viewScale + content.scrollTop;
    // Dashboard heatmaps have a colorbar and long categorical axes. Their
    // selectors can occupy most of a saved card, so keep the plot usable and
    // let the card scroll instead of shrinking Plotly into its margins.
    var minHeight = isClassHeatmap(r.el.id) ? 750 : sourceKey(r) === 'results_dashboard-plot_heat' ? 420 : 160;
    if(square){if(r.heatOriginalMinWidth===undefined)r.heatOriginalMinWidth=r.el.style.minWidth;var hm=gd._fullLayout && gd._fullLayout.margin || gd.layout.margin || {};r.el.style.minWidth=Math.max(520,gd.data[0].x.length*16+(hm.l||0)+(hm.r||0))+'px';if(r.el.style.setProperty){r.el.style.setProperty('min-height',(gd.data[0].y.length*16+210)+'px','important');r.heatSquareMinHeight=true;}}
    else if(rectHeat){if(r.heatOriginalMinWidth===undefined)r.heatOriginalMinWidth=r.el.style.minWidth;r.el.style.minWidth=Math.max(800,Number(denseHorizontal?heat.naturalHeight:heat.naturalWidth)||800)+'px';}
    else if(r.heatOriginalMinWidth!==undefined){r.el.style.minWidth=r.heatOriginalMinWidth;delete r.heatOriginalMinWidth;}
    // The 420px CSS floor protects a first draw; a drawn square map uses its own height.
    if(!square&&r.heatSquareMinHeight){r.el.style.removeProperty('min-height');delete r.heatSquareMinHeight;}
    // A small square map draws at its natural 16px cells (about 520x250). A new
    // card opened at the roomy 1000x1100 heatmap size left it in one corner, so
    // fit a fresh card to the map once. Saved, restored and copied frames belong
    // to the user and are never changed here.
    if(square && !r.squareHeatmapAdapted){
      r.squareHeatmapAdapted=true;
      if(!r.hydrating && !applyingRestore && r.node.offsetWidth>=1000 && r.node.offsetHeight>=1100){
        r.node.style.width=Math.max(620,(parseFloat(r.el.style.minWidth)||520)+40)+'px';
        r.squareHeatmapFit=true;
      }
    }
    // A framed card's footer already separates the plot from the card edge: 16 px of slack, not 24.
    var foot = footSpace(r.node);
    var height = square ? gd.data[0].y.length*16+210 : large ? (denseHorizontal?heat.naturalWidth:heat.naturalHeight) : Math.max(minHeight, r.node.clientHeight - plotTop - (foot ? 16 : 24) - foot);
    // A canvas zoom never changes a card's logical size, but under CSS zoom borders, text and
    // inner scroll offsets snap to device pixels, so plotTop (and the height derived from it)
    // moves between zoom levels: a few pixels, or hundreds for a card whose content scrolls
    // (group comparison). Each such "change" re-laid out every Plotly card, dispatched a window
    // resize (Shiny re-measures every output) and re-rendered static plots in R on every zoom
    // step. So a camera refit after a zoom keeps the height computed at the zoom where the
    // card last really fitted; at a fixed zoom a wobble within one device pixel is ignored
    // too. Card resizes and content changes (explicit fits) still refit.
    var currentHeight = parseFloat(r.el.style.height), nodeSize = r.node.style.width + 'x' + r.node.style.height;
    var sameNode = r.fitNodeSize === nodeSize, zoomOnly = !!camera && sameNode && r.fitScale !== undefined && r.fitScale !== viewScale;
    var slack = sameNode ? Math.min(12, Math.ceil(1.5 / (viewScale > 0 ? viewScale : 1))) : 0;
    r.fitNodeSize = nodeSize; if (!zoomOnly) r.fitScale = viewScale;
    if (!square && !large && Number.isFinite(currentHeight) && (zoomOnly || Math.abs(currentHeight - Math.round(height)) <= slack)) height = currentHeight;
    var desired = Math.round(height) + 'px';
    var heightChanged=r.el.style.height !== desired;
    // A figure with a fixed layout size ignores Plots.resize: follow the card frame in both directions.
    var full=gd && gd._fullLayout, offFrame=!!(full && !square && !large && (Math.abs(full.width-r.el.clientWidth)>1 || Math.abs(full.height-Math.round(height))>1));
    if (!heightChanged && !square && !offFrame && !(rectHeat && gd._fullLayout && Math.abs(gd._fullLayout.width-r.el.clientWidth)>1)) return;
    if (square && !heightChanged && !r.squareResizePending && r.heatResizePlot===gd && r.heatResizeWidth===r.el.clientWidth && r.heatResizeX===gd.data[0].x.length && r.heatResizeY===gd.data[0].y.length) {
      var currentFull=gd._fullLayout||{}, currentSize=currentFull._size, currentDomain=gd.layout.xaxis&&gd.layout.xaxis.domain, currentY=gd.layout.yaxis&&gd.layout.yaxis.domain;
      var currentTarget=currentSize&&currentSize.w>0?Math.min(1,gd.data[0].x.length*16/currentSize.w):null;
      if(currentTarget!==null && currentDomain && currentY && Math.abs(currentDomain[0])<1e-5 && Math.abs(currentDomain[1]-currentTarget)<1e-5 && Math.abs(currentY[0])<1e-5 && Math.abs(currentY[1]-1)<1e-5 && Number(currentFull.height)===Math.round(height)) return;
    }
    dimensionTrace(r,'resize',{before:parseFloat(r.el.style.height)||0,after:Math.round(height),plotTop:plotTop,nodeHeight:r.node.clientHeight});
    r.el.style.height = desired;
    if (gd && gd.data && window.Plotly && !r.squareResizePending) {
      r.squareResizePending=true;
      // Heatmap geometries keep Plotly's own resize; other cards get an explicit size below.
      Promise.resolve(square||rectHeat?window.Plotly.Plots.resize(gd):null).then(function(){
        if(rectHeat && r.node && gd.layout){var denseUpdates={};if(Math.abs((gd._fullLayout||{}).height-height)>1)denseUpdates.height=height;if(Math.abs((gd._fullLayout||{}).width-r.el.clientWidth)>1)denseUpdates.width=r.el.clientWidth;if(Object.keys(denseUpdates).length)return window.Plotly.relayout(gd,denseUpdates);return;}
        // Plotly's autosize measures through the canvas CSS zoom (a 40% view drew a
        // 592 px plot at 237 px and kept it). Card plots use an explicit size in
        // logical pixels instead, so zooming never shrinks them.
        if(!square && r.node && gd.layout && gd._fullLayout && r.el.clientWidth>0){var frame={};if(gd.layout.autosize!==false)frame.autosize=false;if(Math.abs(gd._fullLayout.width-r.el.clientWidth)>1)frame.width=r.el.clientWidth;if(Math.abs(gd._fullLayout.height-Math.round(height))>1)frame.height=Math.round(height);if(Object.keys(frame).length){if(frame.autosize===false){frame.width=r.el.clientWidth;frame.height=Math.round(height);}return window.Plotly.relayout(gd,frame);}return;}
        if(!square || !r.node || !gd.layout || !gd.data || !gd.data[0])return;
        // Plotly may retain an explicit layout width different from the CSS
        // output width. Use the renderer's actual drawable width, not the
        // surrounding card, when assigning a 16px categorical domain.
        var full=gd._fullLayout || {}, margin=full.margin || gd.layout.margin || {}, width=full._size && full._size.w || r.el.clientWidth-(margin.l||0)-(margin.r||0);
        var target=width>0 ? Math.min(1,gd.data[0].x.length*16/width) : 1, domain=gd.layout.xaxis && gd.layout.xaxis.domain, ydomain=gd.layout.yaxis && gd.layout.yaxis.domain;
        var updates={};
        if(!domain || Math.abs(domain[0])>1e-5 || Math.abs(domain[1]-target)>1e-5) updates['xaxis.domain']=[0,target];
        if(!ydomain || Math.abs(ydomain[0])>1e-5 || Math.abs(ydomain[1]-1)>1e-5) updates['yaxis.domain']=[0,1];
        if(Number(full.height)!==Math.round(height)) updates.height=Math.round(height);
        if(Object.keys(updates).length) return window.Plotly.relayout(gd,updates);
      }).catch(function () {}).finally(function(){r.squareResizePending=false;
        // Measure the drawn card once: header plus content, with no empty tail.
        if(r.squareHeatmapFit&&r.node&&content){r.squareHeatmapFit=false;var box=r.node.getBoundingClientRect(),top=box.top,scale=(window.TeamCanvasViewport&&TeamCanvasViewport.scale)||1,bottom=0;
        // The card's module controls are parked far off to the left (card_figure.css), not hidden: they are not part of the drawn card.
        Array.prototype.forEach.call(content.querySelectorAll('*'),function(e){var b=e.getBoundingClientRect();if(b.height>0&&b.width>0&&!(b.right<box.left))bottom=Math.max(bottom,b.bottom);});if(bottom>top)r.node.style.height=Math.max(420,Math.ceil((bottom-top)/scale+content.scrollTop+20+footSpace(r.node)))+'px';grownByContent(r.node);}if(square&&gd.data&&gd.data[0]){r.heatResizePlot=gd;r.heatResizeWidth=r.el.clientWidth;r.heatResizeX=gd.data[0].x.length;r.heatResizeY=gd.data[0].y.length;}
        // A resize that arrived while this one ran used the older size: fit once more now.
        if(r.resizeAgain){r.resizeAgain=false;if(r.node&&!r.snapshot)resize(r);}});
    } else if (gd && gd.data && window.Plotly) r.resizeAgain = true;
    // Shiny uses resize to measure outputs and rerender static plots at their new dimensions.
    // One window resize per frame, after every card of that frame has its new height: a
    // restore of 17 cards dispatched 30-47 of them in one task, and each made every widget
    // listener re-measure the page between two card writes (forced layout each time).
    if(heightChanged && !resize.windowQueued){resize.windowQueued=true;requestAnimationFrame(function(){resize.windowQueued=false;window.dispatchEvent(new Event('resize'));});}
  }
  function moveNode(node, head) {
    head.addEventListener('pointerdown', function (event) {
      // Primary button of the primary pointer only; later events must come from that same pointer.
      if (event.button !== 0 || event.isPrimary === false || event.target.closest('button,input,label,select,textarea,a')) return;
      var pointerId = event.pointerId;
      event.preventDefault(); head.setPointerCapture(pointerId);
      var moved = false, ended = false;
      var startX = event.clientX, startY = event.clientY, left = node.offsetLeft, top = node.offsetTop;
      var scrollView = board.closest(".tc-scroll"), scrollX = scrollView ? scrollView.scrollLeft : 0, scrollY = scrollView ? scrollView.scrollTop : 0;
      function move(e) {
        if (e.pointerId !== pointerId) return;
        moved = true;
        node.style.left = Math.max(0, left + (e.clientX - startX + (scrollView ? scrollView.scrollLeft - scrollX : 0)) / (window.TeamCanvasViewport ? window.TeamCanvasViewport.scale : 1)) + 'px';
        node.style.top = Math.max(0, top + (e.clientY - startY + (scrollView ? scrollView.scrollTop - scrollY : 0)) / (window.TeamCanvasViewport ? window.TeamCanvasViewport.scale : 1)) + 'px';
        expandBoard();
      }
      function done(e) {
        if (ended || e.pointerId !== pointerId) return; ended = true;
        head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', done); head.removeEventListener('pointercancel', done); head.removeEventListener('lostpointercapture', done);
        try { if (head.hasPointerCapture(pointerId)) head.releasePointerCapture(pointerId); } catch (ignore) {}
        if (moved) changed();
      }
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', done); head.addEventListener('pointercancel', done); head.addEventListener('lostpointercapture', done);
    });
    head.addEventListener('keydown', function (e) {
      if (e.target !== head) return;
      var dx = e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0;
      var dy = e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0;
      if (!dx && !dy) return; e.preventDefault();
      // Shift+arrows resize the card (10 px; with Alt, 1 px).
      if (e.shiftKey) { resizeByKey(node, e.altKey ? Math.sign(dx) : dx, e.altKey ? Math.sign(dy) : dy); return; } keyBurst(node); node.style.left = Math.max(0,node.offsetLeft + dx) + 'px'; node.style.top = Math.max(0,node.offsetTop + dy) + 'px'; expandBoard(); changed();
    });
  }
  // Keyboard moves and resizes: one undo step per burst of key presses (a pause of 700 ms ends
  // it). The end of the burst is the keyboard "drop": overlaps around every card the burst
  // moved or resized settle once, inside that same undo step.
  var keyResizeTimer = 0, keyBurstNodes = [];
  function keyBurst(node) {
    if (!keyResizeTimer) { rememberGeometry(); geometryGesture = true; }
    if (keyBurstNodes.indexOf(node) < 0) keyBurstNodes.push(node);
    clearTimeout(keyResizeTimer);
    keyResizeTimer = setTimeout(endKeyBurst, 700);
  }
  function endKeyBurst() { clearTimeout(keyResizeTimer); keyResizeTimer = 0; var nodes = keyBurstNodes; keyBurstNodes = []; settleOverlaps(nodes, function () { geometryGesture = false; rememberGeometry(); }); }
  // Any other history write (a click on the board, Undo/Redo, Tidy up) first ends an open key
  // burst: it settles and is recorded now, as its own single step.
  function flushKeyBurst() { if (!keyResizeTimer) return; endKeyBurst(); if (settleQueue) runSettle(); }
  function resizeByKey(node, dx, dy) {
    var cs = getComputedStyle(node), minW = parseFloat(cs.minWidth) || 330, minH = parseFloat(cs.minHeight) || 250;
    keyBurst(node);
    if (dx) node.style.width = Math.min(4000, Math.max(minW, node.offsetWidth + dx)) + 'px';
    if (dy) node.style.height = Math.min(4000, Math.max(minH, node.offsetHeight + dy)) + 'px';
    expandBoard(); changed();
  }
  // Card geometry is explicit, saved state: nothing moves a card on its own (render, plot
  // mount, Shiny update, image load, restore, timers). Only a person's action settles overlaps:
  // the drop at the end of a drag, the end of a resize, an added card, Tidy up. Then only the
  // cards that actually overlap move, each once, by the least distance that clears it, all in one
  // animation frame (every read first, then every write), animated for 150 ms (none with reduced
  // motion). The anchors (the card just dropped, resized or added) never move.
  var LAYOUT_GAP = 20, LAYOUT_MS = 150, settleQueue = null;
  function layoutReduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  // Logical boxes of the shown cards. Position comes from the card's own style (its final value
  // even while a move animates); size from the rendered box (CSS minimums can exceed the style).
  function layoutBoxes() {
    return Array.from(board.querySelectorAll('.tc-node:not(.tc-tab-hidden)')).map(function (n) {
      var x = parseFloat(n.style.left), y = parseFloat(n.style.top);
      return {node:n, x:Number.isFinite(x) ? x : n.offsetLeft, y:Number.isFinite(y) ? y : n.offsetTop, w:n.offsetWidth, h:n.offsetHeight};
    });
  }
  function boxesOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  // Pure: which boxes move, and where. Anchors stay. A box overlapping a fixed box (an anchor, or
  // a box already moved) takes the shortest of the four moves that clear it by LAYOUT_GAP without
  // touching any fixed box, never past the board's top or left edge; it is then fixed and checked
  // in turn. Boxes that overlap nothing never move. Returns [{box, x, y}].
  function resolveOverlapBoxes(boxes, anchors) {
    var fixed = anchors.slice(), queue = anchors.slice(), moved = [], guard = 0;
    function clear(b, x, y) { return fixed.every(function (f) { return f === b || !boxesOverlap({x:x - LAYOUT_GAP + 1, y:y - LAYOUT_GAP + 1, w:b.w + 2 * LAYOUT_GAP - 2, h:b.h + 2 * LAYOUT_GAP - 2}, f); }); }
    while (queue.length && guard++ < 500) {
      var a = queue.shift();
      boxes.forEach(function (b) {
        if (fixed.indexOf(b) >= 0 || !boxesOverlap(a, b)) return;
        // Down, right, up, left: equal distances prefer down, then right.
        var options = [[b.x, a.y + a.h + LAYOUT_GAP], [a.x + a.w + LAYOUT_GAP, b.y], [b.x, a.y - LAYOUT_GAP - b.h], [a.x - LAYOUT_GAP - b.w, b.y]]
          .filter(function (p) { return p[0] >= 0 && p[1] >= 0; })
          .map(function (p) { return {x:p[0], y:p[1], d:Math.abs(p[0] - b.x) + Math.abs(p[1] - b.y)}; });
        var best = null;
        options.forEach(function (p) { if (clear(b, p.x, p.y) && (!best || p.d < best.d)) best = p; });
        if (!best) {
          // Hemmed in: straight down, below every fixed box it would meet there.
          var y = a.y + a.h + LAYOUT_GAP, again = true, tries = 0;
          while (again && tries++ < 100) { again = false; fixed.forEach(function (f) { if (f !== b && boxesOverlap({x:b.x, y:y, w:b.w, h:b.h}, {x:f.x - LAYOUT_GAP + 1, y:f.y - LAYOUT_GAP + 1, w:f.w + 2 * LAYOUT_GAP - 2, h:f.h + 2 * LAYOUT_GAP - 2})) { y = f.y + f.h + LAYOUT_GAP; again = true; } }); }
          best = {x:b.x, y:y};
        }
        b.x = best.x; b.y = best.y; fixed.push(b); queue.push(b); moved.push({box:b, x:b.x, y:b.y});
      });
    }
    return moved;
  }
  // Writes card positions in one pass, animated unless the person prefers reduced motion.
  function applyLayout(moves) {
    if (!moves.length) return;
    var animate = !layoutReduced();
    moves.forEach(function (m) {
      var n = m.node || m.box.node;
      if (animate) { n.classList.add('tc-layout-moving'); clearTimeout(n.tcLayoutTimer); n.tcLayoutTimer = setTimeout(function () { n.classList.remove('tc-layout-moving'); }, LAYOUT_MS + 40); }
      n.style.left = Math.round(m.x) + 'px'; n.style.top = Math.round(m.y) + 'px';
    });
    expandBoard();
    // The board's size reads rendered boxes: measure again once the move has finished.
    if (animate) setTimeout(function () { if (board) expandBoard(); }, LAYOUT_MS + 50);
  }
  // Settles overlaps around the anchors in the next animation frame (once for every action of
  // that frame), then runs each `after` (the end of the action's undo step).
  function settleOverlaps(anchors, after) {
    if (!settleQueue) {
      settleQueue = {anchors:[], after:[]};
      var run = function () { if (settleQueue && settleQueue.frame === frame) runSettle(); };
      var frame = requestAnimationFrame(run); settleQueue.frame = frame;
      // A background tab runs no frames: settle anyway shortly after.
      settleQueue.fallback = setTimeout(run, 250);
    }
    (anchors || []).forEach(function (n) { if (n && settleQueue.anchors.indexOf(n) < 0) settleQueue.anchors.push(n); });
    if (after) settleQueue.after.push(after);
  }
  function runSettle() {
    var q = settleQueue; settleQueue = null; clearTimeout(q.fallback);
    var moves = [];
    if (board) {
      var boxes = layoutBoxes(), anchors = boxes.filter(function (b) { return q.anchors.indexOf(b.node) >= 0; });
      if (anchors.length) moves = resolveOverlapBoxes(boxes, anchors);
    }
    if (moves.length) { editDuringHydration(); applyLayout(moves); }
    q.after.forEach(function (f) { try { f(); } catch (e) { if (window.console) console.error(e); } });
    if (moves.length) changed();
  }
  // An added or enlarged card (a person's action): neighbours it now covers make room.
  function settleGrown(node) { editDuringHydration(); settleOverlaps([node]); expandBoard(); changed(); }
  // A card resized by its own first draw (no action): the board grows, no other card moves.
  function grownByContent(node) { editDuringHydration(); expandBoard(); changed(); }
  // Card size observers: the board is measured once per frame for all of them (each card's
  // observer measuring every card in turn read and wrote layout N times per frame).
  var expandQueued = false;
  function scheduleExpandBoard() { if (expandQueued) return; expandQueued = true; requestAnimationFrame(function () { expandQueued = false; if (board) expandBoard(); }); }
  // Native CSS resize implementations use device deltas differently under transforms.
  // Use the same screen-to-world conversion as header dragging, including scroll during capture.
  function resizeNode(node) {
    var handle=document.createElement('button');handle.type='button';handle.className='tc-node-resize';
    handle.setAttribute('aria-label','Resize card');handle.title='Drag to resize; use arrow keys to adjust';node.appendChild(handle);
    handle.addEventListener('pointerdown',function(e){
      if(e.button!==0)return;e.preventDefault();handle.setPointerCapture(e.pointerId);
      var min=getComputedStyle(node),x=e.clientX,y=e.clientY,w=parseFloat(min.width)||node.offsetWidth,h=parseFloat(min.height)||node.offsetHeight,scroll=board.closest('.tc-scroll');
      var sx=scroll?scroll.scrollLeft:0,sy=scroll?scroll.scrollTop:0;
      var minW=parseFloat(min.minWidth)||330,minH=parseFloat(min.minHeight)||250;
      function move(ev){
        var z=window.TeamCanvasViewport?TeamCanvasViewport.scale:1;
        node.style.width=Math.max(minW,w+(ev.clientX-x+(scroll?scroll.scrollLeft-sx:0))/z)+'px';
        node.style.height=Math.max(minH,h+(ev.clientY-y+(scroll?scroll.scrollTop-sy:0))/z)+'px';expandBoard();
      }
      function end(){changed();handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);}
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
    });
    // Arrow keys on the handle resize like Shift+arrows on the header (one undo step per key burst).
    handle.addEventListener('keydown',function(e){
      var dx=e.key==='ArrowRight'?10:e.key==='ArrowLeft'?-10:0,dy=e.key==='ArrowDown'?10:e.key==='ArrowUp'?-10:0;
      if(!dx&&!dy)return;e.preventDefault();e.stopPropagation();resizeByKey(node,dx,dy);
    });
  }
  function expandBoard() {
    var width = 1320, height = 780;
    board.querySelectorAll('.tc-node').forEach(function (node) { width = Math.max(width, node.offsetLeft + node.offsetWidth + 40); height = Math.max(height, node.offsetTop + node.offsetHeight + 40); });
    // Saved figures still waiting for their plot keep their room, so the restored camera stays put.
    restorePending.forEach(function (n) { width = Math.max(width, n.x + n.width + 40); height = Math.max(height, n.y + n.height + 40); });
    board.style.width = width + 'px'; board.style.height = height + 'px';
  }
  // The checkpoint node-array order is the durable newest-first creation order.
  var creationOrder=[];
  function registerCreation(node,id,fresh) {
    node.dataset.canvasOrderId=id;
    if(fresh){editDuringHydration();creationOrder=creationOrder.filter(function(key){return key!==id;});creationOrder.unshift(id);}
    else if(creationOrder.indexOf(id)<0)creationOrder.push(id);
  }
  // Tidy up (the toolbar's on-demand pack): the shown cards in the person's own reading order
  // (rows top to bottom, each left to right), packed left to right in rows that fit the visible
  // width. Sizes, styles and scientific inputs never change. One undo step, offered in the shared
  // canvas toast; the same step is on the toolbar's Undo and Ctrl+Z.
  function readingOrder(boxes) {
    var sorted = boxes.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }), rows = [];
    sorted.forEach(function (b) {
      var row = rows[rows.length - 1];
      // Same row: its top is above the middle of the row's shortest card.
      if (row && b.y < row.top + row.minH / 2) { row.items.push(b); row.minH = Math.min(row.minH, b.h); }
      else rows.push({top:b.y, minH:b.h, items:[b]});
    });
    return rows.reduce(function (all, row) { return all.concat(row.items.sort(function (a, b) { return a.x - b.x; })); }, []);
  }
  function tidyLayout() {
    var boxes = readingOrder(layoutBoxes());
    var scroll=board.closest('.tc-scroll'), scale=window.TeamCanvasViewport&&Number(window.TeamCanvasViewport.scale)>0?Number(window.TeamCanvasViewport.scale):1;
    var available=scroll?scroll.clientWidth:1320;
    if(scroll){
      var viewport=scroll.getBoundingClientRect();
      document.querySelectorAll('.tc-navigation,.companion-dock').forEach(function(overlay){
        if(!overlay.getClientRects().length || getComputedStyle(overlay).visibility==='hidden')return;
        var rect=overlay.getBoundingClientRect();
        // Reserve only visible blockers in the right half that overlap this
        // viewport. Its measured width already excludes the library gutter.
        if(rect.width>0 && rect.height>0 && rect.bottom>viewport.top && rect.top<viewport.bottom && rect.left>=viewport.left+viewport.width/2 && rect.left<viewport.right && rect.right>viewport.left){available=Math.min(available,Math.max(1,rect.left-viewport.left-12));}
      });
    }
    // Fill the viewport's shape: choose the number of columns from the cards' average
    // size and the viewport aspect, so Fit all shows a readable grid rather than a
    // single column. The visible width is only a lower bound.
    var viewHeight=scroll?Math.max(1,scroll.clientHeight):900, avgW=30, avgH=30, maxW=30, n=boxes.length;
    if(n){avgW=boxes.reduce(function(a,b){return a+b.w;},0)/n;avgH=boxes.reduce(function(a,b){return a+b.h;},0)/n;maxW=Math.max.apply(null,boxes.map(function(b){return b.w;}));}
    var columns=Math.max(1,Math.min(n||1,Math.ceil(Math.sqrt((n||1)*(available/viewHeight)*(avgH/Math.max(1,avgW)))-0.25)));
    // Room for one wider card (e.g. a heatmap) per row, so it does not drop to a row of its own.
    var width=Math.max(available/scale,30+columns*(avgW+30)+(maxW-avgW)+1), x=30,y=30,rowHeight=0, moves=[];
    // Complete cards left to right on a shared row baseline; an oversized card gets its own row.
    boxes.forEach(function(b){
      if(x>30 && x+b.w+30>width){x=30;y+=rowHeight+30;rowHeight=0;}
      if(b.x!==x||b.y!==y)moves.push({node:b.node,x:x,y:y});
      x+=b.w+30;rowHeight=Math.max(rowHeight,b.h);
    });
    return moves;
  }
  function tidyUp() {
    editDuringHydration(); flushKeyBurst();
    if (settleQueue) runSettle();
    rememberGeometry();
    var before = geometryLast, moves = tidyLayout();
    if (!moves.length) { tell('The cards are already tidy.'); if (window.TeamCanvasFeedback) TeamCanvasFeedback.show('The cards are already tidy.', {ms:3000, quiet:true}); return; }
    applyLayout(moves); changed();
    var tidied = geometryLast, count = moves.length;
    tell('Tidied up ' + count + ' card' + (count === 1 ? '' : 's') + '.');
    if (!window.TeamCanvasFeedback) return;
    TeamCanvasFeedback.show('Tidied up ' + count + ' card' + (count === 1 ? '' : 's') + '.', {quiet:true, undo:function () {
      // Undo is this step only: once the canvas has changed since, the toolbar's Undo history applies.
      if (!board || !tidied || !sameGeometry(geometryState(), tidied) || !geometryPast.length || !sameGeometry(geometryPast[geometryPast.length - 1], before)) {
        TeamCanvasFeedback.show('The canvas changed after Tidy up. Use Undo in the toolbar.', {error:true, ms:6000});
        return;
      }
      replayGeometry(false); TeamCanvasFeedback.show('Restored the layout before Tidy up.', {ms:3000, quiet:true});
    }});
  }
  // The size a new card opens at. fixed: set on the card (otherwise canvas.css's 620 × 720).
  function newCardSize(id, source) {
    var roomyHeatmap=isClassHeatmap(id)||source==='results_dashboard-plot_heat';
    // Multi-panel stress violins (three panels per row) were designed for an
    // 840px plot; a 620px card squeezed their panel titles into each other.
    var widePanels=source==='cellular_org_tab-stressPlot';
    // Raster figures with many labels (network, acyl chain proportions) open larger so their text stays legible.
    var bigRaster=/^structural_tab-(networkPlot|propPlotPlot)$/.test(source);
    // Shell cards show only title, plot and footer (card_frame.js): a composition card opens compact,
    // at RC4's 380 px maximum so the figure keeps as much height as the card allows.
    var compactCard=document.body.classList.contains('ts-shell-app')&&/^(results_dashboard-plot_(comp|dist)|barchart-(bar|donut)Plot(Unf|F)iltered)$/.test(source);
    return {width:roomyHeatmap ? 1000 : bigRaster ? 900 : widePanels ? 900 : 620, height:roomyHeatmap ? 1100 : bigRaster ? 860 : compactCard ? (source==='results_dashboard-plot_comp' ? 560 : 380) : 720, fixed:roomyHeatmap || widePanels || compactCard || bigRaster};
  }
  // The first free place in the two-column grid, clear of every visible card and skeleton card.
  function freeSpot(width, height) {
    var index = sequence++, x, y, occupied = Array.from(board.querySelectorAll('.tc-node:not(.tc-tab-hidden), .tc-node-placeholder'));
    do {
      x = 30 + (index % 2) * (width + 30); y = 30 + Math.floor(index / 2) * (height + 30); index++;
    } while (occupied.some(function (other) {
      return x < other.offsetLeft + other.offsetWidth + 20 && x + width + 20 > other.offsetLeft &&
        y < other.offsetTop + other.offsetHeight + 20 && y + height + 20 > other.offsetTop;
    }));
    sequence = Math.max(sequence, index); return {x:x, y:y};
  }
  // A new copy (Add, Duplicate, Paste) shows its card at once where and at the size add()
  // opens it: a skeleton card (card_status.css) that the mounted card replaces in place.
  // A failed request leaves it with Retry (the same request again, same place) and Remove.
  function showPlaceholder(request, ph) {
    if (!board) return null;
    if (!ph) {
      var size = request.copy ? {width:request.copy.width, height:request.copy.height} : newCardSize(request.source, request.source), spot = freeSpot(size.width, size.height);
      ph = document.createElement('article'); ph.className = 'tc-node-placeholder';
      ph.style.left = spot.x + 'px'; ph.style.top = spot.y + 'px'; ph.style.width = size.width + 'px'; ph.style.height = size.height + 'px';
      var head = document.createElement('div'); head.className = 'tc-node-head'; var title = document.createElement('strong'); title.textContent = request.copy ? request.copy.label : plotTitle(request.source); head.appendChild(title);
      var body = document.createElement('div'); body.className = 'tc-card-skeleton'; body.setAttribute('role', 'status');
      var text = document.createElement('span'); text.className = 'tc-card-skeleton-text'; body.appendChild(text);
      ph.append(head, body); board.appendChild(ph); board.classList.add('has-nodes');
      if (window.TeamCanvasViewport && typeof TeamCanvasViewport.focusNode === 'function') TeamCanvasViewport.focusNode(ph, {topLeft:spot.x <= 40 && spot.y <= 40, readable:request.source === 'results_dashboard-plot_heat'});
    }
    ph.classList.remove('is-failed'); ph.setAttribute('aria-busy', 'true');
    ph.querySelectorAll('.tc-card-skeleton button').forEach(function (b) { b.remove(); });
    ph.querySelector('.tc-card-skeleton-text').textContent = 'Generating ' + plotTitle(request.source) + '…';
    return ph;
  }
  function failPlaceholder(request) {
    var ph = request.placeholder; if (!ph || !ph.isConnected) return;
    ph.classList.add('is-failed'); ph.removeAttribute('aria-busy');
    var body = ph.querySelector('.tc-card-skeleton');
    body.querySelector('.tc-card-skeleton-text').textContent = 'Could not generate ' + plotTitle(request.source) + '.';
    var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry';
    retry.addEventListener('click', function () { if (!requestInstance(request.source, request.copy, null, ph)) dropPlaceholder({placeholder:ph}); });
    var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
    remove.addEventListener('click', function () { dropPlaceholder({placeholder:ph}); });
    body.append(retry, remove);
  }
  function dropPlaceholder(request) {
    if (!request.placeholder) return;
    request.placeholder.remove(); request.placeholder = null;
    board.classList.toggle('has-nodes', !!board.querySelector('.tc-node, .tc-node-placeholder'));
  }
  function presentNewNode(node,id) {
    registerCreation(node,id,true);settleGrown(node);
    if(window.TeamCanvasViewport && typeof window.TeamCanvasViewport.focusNode==='function')requestAnimationFrame(function(){requestAnimationFrame(function(){if(node.isConnected)window.TeamCanvasViewport.focusNode(node,{topLeft:node.offsetLeft<=40&&node.offsetTop<=40,readable:sourceKey(records.get(id))==='results_dashboard-plot_heat'});});});
  }
  function add(r) {
    if (!r) return false;
    var blocked=blockedPlot(r.el.id);
    if (blocked) { tell(r.label + ' is unavailable. ' + blocked.reason); return false; }
    if (r.node) return true;
    if ((r.dynamic && !r.wrapper) || !r.el.isConnected || (dynamicOutput(r.el) && !r.wrapper)) return false;
    // A new figure is refused at 40 figures, as instance requests are. Only a
    // restored node, whose place restorePending holds, is exempt. (A copy's own
    // request held its place until this mount, so the count has room for it.)
    if (!restorePending.has(r.el.id) && figureCount() >= 40) { tell('This workspace supports 40 figures. Remove a figure before adding another.'); return false; }
    var card = r.el.closest('.rd-card');
    var target = card && card.querySelectorAll(selector).length === 1 ? card : r.el;
    if (r.wrapper) target = r.wrapper;
    var bar = target === r.el && r.el.previousElementSibling && r.el.previousElementSibling.classList.contains('plot-export-bar') ? r.el.previousElementSibling : null;
    var home = document.createElement('div'); home.className = 'tc-home'; home.textContent = r.label + ' is on the figure canvas.'; target.before(home);
    var barHome = null;
    if (bar) { barHome = document.createComment('Plot export controls'); bar.before(barHome); }
    var node = document.createElement('article'); node.className = 'tc-node'; node.dataset.plotId = r.el.id;
    // Full class names, legends and sample labels need room before raster capture.
    var size = newCardSize(r.el.id, sourceKey(r)), placeholder = r.placeholder && r.placeholder.isConnected ? r.placeholder : null; r.placeholder = null;
    if (size.fixed) { node.style.width = size.width + 'px'; node.style.height = size.height + 'px'; }
    // A copy's skeleton card (showPlaceholder) already holds its place: the card opens exactly there.
    var spot = placeholder ? {x:parseFloat(placeholder.style.left)||0, y:parseFloat(placeholder.style.top)||0} : freeSpot(size.width, size.height);
    node.style.left = spot.x + 'px'; node.style.top = spot.y + 'px';
    var head = document.createElement('div'); head.className = 'tc-node-head'; head.tabIndex = 0; head.setAttribute('aria-label', 'Move ' + r.label + ' with arrow keys');
    var heading = document.createElement('strong'); heading.textContent = r.label; head.appendChild(heading);
    var tool = toolFor(r.el);
    if(sourceKey(r)==='results_dashboard-plot_heat'){var enlarge=document.createElement('button');enlarge.type='button';enlarge.textContent='Enlarge plot';enlarge.addEventListener('click',function(event){event.stopPropagation();rememberGeometry();node.style.width=Math.max(1000,node.offsetWidth)+'px';node.style.height=Math.max(1100,node.offsetHeight)+'px';settleGrown(node);resize(r);if(window.TeamCanvasViewport&&TeamCanvasViewport.focusNode)TeamCanvasViewport.focusNode(node,{readable:true});});head.appendChild(enlarge);}
    if(r.instance){var dataButton=document.createElement('button');dataButton.type='button';dataButton.textContent='Data & settings';dataButton.dataset.canvasDataSettings='';dataButton.addEventListener('click',function(){openInstanceControls(r,true);});head.appendChild(dataButton);}
    if(instanceSupported(sourceKey(r))){var copyButton=document.createElement('button');copyButton.type='button';copyButton.textContent='Copy';copyButton.addEventListener('click',function(){copyRecord(r);});head.appendChild(copyButton);var duplicateButton=document.createElement('button');duplicateButton.type='button';duplicateButton.textContent='Duplicate';duplicateButton.addEventListener('click',function(){var copied=copyData(r);if(copied)requestInstance(copied.source,copied);});head.appendChild(duplicateButton);}
    if (tool && !r.instance) { var controls = document.createElement('button'); controls.type = 'button'; controls.textContent = 'Controls'; controls.title = 'Open analysis controls'; controls.addEventListener('click', function () { if (window.Shiny) Shiny.setInputValue('guide_open_tool', tool, {priority:'event'}); }); head.appendChild(controls); }
    var finish = document.createElement('button'); finish.type = 'button'; finish.textContent = 'Finish plot'; finish.setAttribute('aria-pressed','false');
    var liveOnlyWidget = r.el.classList.contains('html-widget-output') && !r.el.classList.contains('plotly') && !r.el.querySelector('.js-plotly-plot');
    if (liveOnlyWidget) { finish.disabled = true; finish.textContent = 'Live only'; finish.title = 'This interactive output can be added live; frozen figure capture is not supported for this output type.'; }
    head.appendChild(finish);
    var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = r.instance ? 'Remove' : 'Return'; remove.title = r.instance ? 'Remove this independent canvas plot' : 'Return plot to its original location'; head.appendChild(remove);
    var edit = document.createElement('div'); edit.className = 'tc-edit';
    var titleLabel = document.createElement('label'); titleLabel.textContent = 'Label ';
    var title = document.createElement('input'); title.type = 'text'; title.value = r.label; titleLabel.appendChild(title); edit.appendChild(titleLabel);
    var colorLabel = document.createElement('label'); colorLabel.textContent = 'Background ';
    var color = document.createElement('input'); color.type = 'color'; color.value = '#ffffff'; colorLabel.appendChild(color); edit.appendChild(colorLabel);
    var content = document.createElement('div'); content.className = 'tc-content';
    var originalHeight = r.el.style.getPropertyValue('height');
    var originalHeightPriority = r.el.style.getPropertyPriority('height');
    {
      var csvId = csvByPlot[r.el.id];
      var csvSource = csvId && document.getElementById(csvId);
      var csvAlreadyMoved = csvSource && target.contains(csvSource);
      if (csvId && !csvAlreadyMoved) {
        var csv = document.createElement('button'); csv.type = 'button'; csv.className = 'tc-csv'; csv.textContent = 'Plot data (CSV)';
        csv.addEventListener('click', function () {
          var source = document.getElementById(csvId);
          var href=source && source.tagName === 'A' && source.getAttribute('href');
          if (!shinyBusy && source && source.tagName === 'A' && href && href !== '#' && !/^javascript:/i.test(href)) source.click();
          else tell('The analysis data download is not ready yet.');
        });
        content.appendChild(csv);
      } else if (!csvId && !csvAlreadyMoved && sourceKey(r)!=='group_comparison_tab-comparisonPlot') {
        var unavailableCsv = document.createElement('p'); unavailableCsv.className = 'tc-export-note';
        unavailableCsv.textContent = 'No data CSV is linked to this plot. Use the analysis export controls when available.';
        content.appendChild(unavailableCsv);
      }
    }
    var settings = document.createElement('details'); settings.className = 'tc-settings';
    var summary = document.createElement('summary'); summary.textContent = 'Plot appearance'; settings.appendChild(summary);
    var settingsBody = document.createElement('div'); settingsBody.className = 'tc-edit'; settings.appendChild(settingsBody);
    var visual = r.visual || (r.visual = {});
    function field(label, type, key, placeholder) {
      var wrap = document.createElement('label'); wrap.textContent = label + ' ';
      var input = document.createElement('input'); input.type = type; input.dataset.visualKey = key;
      if (placeholder) input.placeholder = placeholder;
      if (type === 'color') input.value = visual[key] || '#235c77';
      else if (visual[key] !== undefined) input.value = visual[key];
      if (type === 'number') { input.min = '8'; input.max = '48'; input.step = '1'; }
      function update() { if (type === 'number' && input.value === '') delete visual[key]; else visual[key] = type === 'number' ? Number(input.value) : input.value; scheduleAppearance(r); }
      input.addEventListener('input', update);
      input.addEventListener('change', update);
      wrap.appendChild(input); settingsBody.appendChild(wrap); return input;
    }
    field('Plot title', 'text', 'plotTitle', 'Current title');
    field('X axis', 'text', 'xTitle', 'Current label');
    field('Y axis', 'text', 'yTitle', 'Current label');
    field('Font size', 'number', 'fontSize', 'Current size');
    field('Text color', 'color', 'fontColor');
    var markColor = field('Uniform mark color', 'color', 'markColor');
    var note = document.createElement('p'); note.className = 'tc-settings-note';
    note.textContent = 'Plotly plots only. Uniform mark color is available for one trace with a single color. Use the shared palette for group and per-point colors.';
    settingsBody.appendChild(note);
    if (bar) content.appendChild(bar); content.appendChild(target);
    // The dashboard's shared copy refers to a control above the original card.
    // In Canvas the control lives in Data & settings instead. Restore the copy on return.
    if (sourceKey(r) === 'results_dashboard-plot_violin') { var note=target.querySelector('.rd-card-sub'); var notes=target.querySelectorAll('.rd-card-sub'); note=Array.from(notes).find(function(el){return el.textContent.indexOf('Uses Color samples by above.')===0;}); if(note){r.canvasCopyNote=note;r.canvasCopyOriginal=note.textContent;note.textContent=note.textContent.replace('Uses Color samples by above.',r.instance ? 'Choose the sample grouping in Data & settings.' : 'Choose the sample grouping in the dashboard controls.');} }
    settings.insertBefore(edit, settingsBody);
    node.append(head, settings, content); if (placeholder) placeholder.replaceWith(node); else board.appendChild(node);
    if (!r.hydrating) node.dataset.teamFresh='true';
    r.paletteInherit = !r.hydrating;
    r.node = node; r.target = target; r.home = home; r.bar = bar; r.barHome = barHome; r.originalHeight = originalHeight; r.originalHeightPriority = originalHeightPriority;
    registerCreation(node,r.el.id,!r.hydrating);
    r.editInputs = settingsBody.querySelectorAll('input'); r.labelInput = title; r.labelHeading = heading; r.backgroundInput = color; r.content = content; r.finishButton = finish; r.markInput = markColor;
    if (window.TeamPlotEditor) {
      settingsBody.hidden = true; settingsBody.style.display = 'none';
      var editorHost = document.createElement('div'); settings.appendChild(editorHost);
      r.plotEditor = TeamPlotEditor.mount({container:editorHost,getPlot:function(){return plotFor(r);},isLocked:function(){return !!r.snapshot;},onLocked:function(){var m='Choose Edit first to change a finished plot.';if(window.TeamCanvasFeedback&&typeof TeamCanvasFeedback.show==='function')TeamCanvasFeedback.show(m);else tell(m);},getState:function(){return r.visual.editor || {};},onChange:function(state){notePaletteEdit(r,r.visual.editor,state);r.paletteInherit=false;r.visual.editor=state; scheduleAppearance(r);}});
      settings.addEventListener('toggle',function(){if(settings.open && r.plotEditor)r.plotEditor.refresh();});
    }
    if (window.TeamCanvasStatistics && r.instance && TeamCanvasStatistics.supports(r.instance.source)) {
      var savedStatistics=r.statisticsSaved||null, copiedStatistics=r.statisticsCopy||null; r.statisticsSaved=null; r.statisticsCopy=null;
      try { TeamCanvasStatistics.attach(r,{plot:function(){return plotFor(r);},changed:changed,tell:tell,
        current:function(){return !!r.node&&sourceCurrent(r)&&!r.el.classList.contains('recalculating');},
        exportAllowed:function(){return !!r.node&&sourceCurrent(r)&&!r.el.classList.contains('recalculating');},
        // Withdrawn p-values must not survive in a frozen image presented as current.
        withdrawn:function(){if(!r.snapshot)return;if(!r.snapshot.archived)staleSnapshot(r);else if(r.preview)r.preview.querySelector('.tc-snapshot-status').textContent='Saved checkpoint figure. Its statistics no longer match the current data; choose Edit to regenerate.';}},savedStatistics,copiedStatistics); }
      catch (error) { if (r.statistics) TeamCanvasStatistics.detach(r); tell('Saved violin statistics could not be restored. Review the Statistics tab to compute them again.'); }
    }
    refreshMarkAvailability(r);
    function selectNode() { selectedRecord = r; r.displayTitle = title.value || r.label; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:{id:r.el.id, title:r.displayTitle}})); }
    node.addEventListener('pointerdown', selectNode); node.addEventListener('focusin', selectNode);
    title.addEventListener('input', function () { heading.textContent = title.value || r.label; selectNode(); changed(); });
    color.addEventListener('input', function () { content.style.backgroundColor = color.value; visual.background = color.value; scheduleAppearance(r); });
    finish.addEventListener('click', function () {
      if (r.snapshot) { editSnapshot(r); return; }
      var token = window.TeamBusy && TeamBusy.begin('Finishing your figure…');
      var operation = finishSnapshot(r); r.finishPromise = operation;
      operation.finally(function () { if (r.finishPromise === operation) r.finishPromise = null; if(token)TeamBusy.end(token); });
    });
    remove.addEventListener('click', function (event) { removeFromCanvas(r, event); });
    moveNode(node, head); resizeNode(node);
    // The observer also fires when only the canvas zoom changes; that is camera, not a document
    // change, so it must not start a save (each save re-renders the library panel in Shiny).
    if (window.ResizeObserver) { r.observer = new ResizeObserver(function () { scheduleExpandBoard(); resize(r, true); var size = node.offsetWidth + 'x' + node.offsetHeight; if (size !== r.observedSize) { r.observedSize = size; changed(); } }); r.observer.observe(node); }
    board.classList.add('has-nodes'); expandBoard(); renderList();
    requestAnimationFrame(function () { resize(r); if (!r.hydrating && r.visual && Object.keys(r.visual).length) applyAppearance(r); inheritPaletteWhenReady(r); });
    if(!r.hydrating)presentNewNode(node,r.el.id);
    selectNode();
    if(r.instance&&window.jQuery)jQuery(r.el).trigger('shown');
    lazyAttach(r);
    if (!(r.hydrating && gateQuiet())) tell('Added ' + r.label + '. Use its existing plot download controls and data download when available.'); changed(); return true;
  }
  function illustrationEntry(id) {
    var api = window.TeamIllustrations;
    var item = api && Array.isArray(api.list) ? api.list.find(function (x) { return x && x.id === id; }) : null;
    return item && typeof item.id === 'string' && typeof item.title === 'string' ? item : null;
  }
  function safeIllustrationSvg(id, color, labelText) {
    var api = window.TeamIllustrations, svg = api && typeof api.svg === 'function' ? api.svg(id, color, labelText) : null;
    if (typeof svg !== 'string' || svg.length > 500000 || !/^<svg[\s>]/i.test(svg) || /<script|foreignObject|iframe|object|embed|on[a-z]+\s*=|javascript:/i.test(svg)) throw new Error('Illustration asset is not safe.');
    var doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (!doc.documentElement || doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Illustration asset is not valid SVG.');
    var encoded='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); if (!checkedImage(encoded)) throw new Error('Illustration asset is not safe.');
    return svg;
  }
  function illustrationNodeState(r) {
    var n = r.node, snap = r.snapshot;
    return {kind:'illustration', assetVersion:'1', id:r.id, assetId:r.assetId, label:r.labelInput.value || r.label,
      x:parseFloat(n.style.left)||0,y:parseFloat(n.style.top)||0,width:parseFloat(n.style.width)||320,height:parseFloat(n.style.height)||260,
      visual:{background:r.visual.background || '#ffffff'}, color:r.color,
      finished:snap ? {url:snap.url,createdAt:snap.createdAt,stale:false} : null};
  }
  function addIllustration(id, saved) {
    var item = illustrationEntry(id); if (!item) { tell('This illustration is not available.'); return false; }
    if (saved && saved.kind !== 'illustration') return false;
    var key = saved && saved.id;
    if (!key) do { key='illustration_'+id+'_'+(++sequence); } while(illustrations.has(key) || restorePending.has(key));
    if (illustrations.has(key)) return false;
    var color = (saved && saved.color) || item.defaultColor || '#235c77';
    if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#235c77';
    if ((saved ? board.querySelectorAll('.tc-node').length : figureCount()) >= 40) { tell('A canvas supports at most 40 items.'); return false; }
    var node=document.createElement('article'); node.className='tc-node tc-illustration'; node.dataset.illustrationId=id; node.dataset.nodeKind='illustration';
    node.style.left=(saved&&Number.isFinite(saved.x)?saved.x:30+(sequence%2)*380)+'px'; node.style.top=(saved&&Number.isFinite(saved.y)?saved.y:30+Math.floor(sequence/2)*330)+'px';
    node.style.width=(saved&&Number.isFinite(saved.width)?saved.width:340)+'px'; node.style.height=(saved&&Number.isFinite(saved.height)?saved.height:260)+'px'; sequence++;
    if(!saved){var occupied=Array.from(board.querySelectorAll('.tc-node:not(.tc-tab-hidden)')),px=30,py=30;while(occupied.some(function(o){return px<o.offsetLeft+o.offsetWidth+20&&px+360>o.offsetLeft&&py<o.offsetTop+o.offsetHeight+20&&py+280>o.offsetTop;})){px+=370;if(px>1140){px=30;py+=290;}}node.style.left=px+'px';node.style.top=py+'px';}
    var head=document.createElement('div'); head.className='tc-node-head'; head.tabIndex=0; head.setAttribute('aria-label','Move '+item.title+' illustration with arrow keys');
    var heading=document.createElement('strong'); heading.textContent=(saved&&saved.label)||item.title; head.appendChild(heading);
    var remove=document.createElement('button'); remove.type='button'; remove.textContent='Remove'; remove.addEventListener('click',function(event){ function drop(){ if(!node.isConnected||illustrations.get(key)!==r)return null; if(r.observer) r.observer.disconnect(); node.remove(); illustrations.delete(key); board.classList.toggle('has-nodes', !!board.querySelector('.tc-node')); expandBoard(); changed(); renderList(); return true; } removeWithFeedback(event,node,r.labelInput.value||r.label,'remove',drop,illustrationNodeState(r),key); }); head.appendChild(remove);
    var content=document.createElement('div'); content.className='tc-content'; content.style.backgroundColor=(saved&&saved.visual&&saved.visual.background)||'#ffffff';
    var img=document.createElement('img'); img.alt=item.title+' illustration'; img.draggable=false; content.appendChild(img);
    var edit=document.createElement('div'); edit.className='tc-edit';
    var label=document.createElement('label'); label.textContent='Label '; var title=document.createElement('input'); title.type='text'; title.value=heading.textContent; title.maxLength=512; label.appendChild(title); edit.appendChild(label);
    var bg=document.createElement('input'); bg.value='#ffffff';
    var colorLabel=document.createElement('label'); colorLabel.textContent='Accent '; var accent=document.createElement('input'); accent.type='color'; accent.value=color; colorLabel.appendChild(accent); edit.appendChild(colorLabel);
    content.appendChild(edit); node.append(head,content); board.appendChild(node);
    var r={id:key,kind:'illustration',assetId:id,label:item.title,labelInput:title,labelHeading:heading,node:node,content:content,visual:{background:'#ffffff'},color:accent.value,snapshot:null}; illustrations.set(key,r); bg.value='#ffffff'; content.style.backgroundColor='#ffffff';
    function render(){ try { img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(safeIllustrationSvg(id,r.color,title.value)); } catch(e){ tell(e.message); } }
    render(); title.addEventListener('input',function(){heading.textContent=title.value||item.title;render();changed();});
    accent.addEventListener('input',function(){r.color=accent.value;render();changed();});
    var finish=document.createElement('button'); finish.type='button'; finish.textContent='Finish';
    function editIllustration(){ if (node.querySelector('.tc-snapshot')) node.querySelector('.tc-snapshot').remove(); node.classList.remove('tc-finished'); finish.textContent='Finish'; finish.onclick=freezeIllustration; r.snapshot=null; changed(); }
    function freezeIllustration(savedAt, archived) {
      try {
        var url = archived ? archived.url : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(safeIllustrationSvg(id,r.color,title.value));
        if (!checkedImage(url)) throw new Error('The saved illustration is not safe.');
        r.snapshot={url:url,createdAt:typeof savedAt==='string'?savedAt:new Date().toISOString(),stale:false};
        var preview=document.createElement('div'); preview.className='tc-snapshot';
        var p=document.createElement('p'); p.className='tc-snapshot-status'; p.textContent='Illustration snapshot saved. Edit to update.'; preview.appendChild(p);
        var frozen=document.createElement('img'); frozen.src=url; frozen.alt=item.title+' saved illustration'; preview.appendChild(frozen);
        var dl=document.createElement('button'); dl.type='button'; dl.textContent=url.indexOf('data:image/png')===0?'PNG':'SVG';
        dl.addEventListener('click',async function(){try{var blob=await (await fetch(url)).blob();saveFile(blob,(title.value||item.title).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.'+dl.textContent.toLowerCase());}catch(e){tell('The illustration could not be downloaded. Please try again.');}});
        preview.appendChild(dl); node.appendChild(preview); node.classList.add('tc-finished'); finish.textContent='Edit'; finish.onclick=editIllustration; changed();
      } catch(e){tell(e.message);}
    }
    finish.onclick=freezeIllustration; head.insertBefore(finish,remove);
    if (saved && saved.finished) freezeIllustration(saved.finished.createdAt, saved.finished);
    r.observer = window.ResizeObserver ? new ResizeObserver(function(){ scheduleExpandBoard(); var size=node.offsetWidth+'x'+node.offsetHeight; if(size!==r.observedSize){ r.observedSize=size; changed(); } }) : null;
    if (r.observer) r.observer.observe(node);
    // Copy and paste act on the selected plot: selecting an illustration leaves no plot selected.
    node.addEventListener('pointerdown',function(){selectedRecord=null;});
    registerCreation(node,key,!saved); moveNode(node,head); resizeNode(node); board.classList.add('has-nodes'); expandBoard(); renderList(); if(!saved)presentNewNode(node,key); changed(); return true;
  }
  function saveFile(blob, name, container, valid) {
    // Chromium and WebKit can ignore a download initiated from a detached
    // anchor. Attach the transient trigger to the document for every canvas
    // figure export, then remove it after the click has been dispatched.
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name;
    if (container) {
      var old = container.querySelector('.tc-export-fallback');
      if (old) { URL.revokeObjectURL(old.href); old.remove(); }
      link.className = 'tc-export-fallback plot-export-button';
      link.textContent = 'Save ' + name.split('.').pop().toUpperCase() + ' file';
      link.addEventListener('click', function (event) {
        if (valid && !valid()) {
          event.preventDefault(); URL.revokeObjectURL(url); link.remove();
          tell('The figure is out of date or the analysis is updating. Choose Edit and finish it again.');
        }
      });
      container.appendChild(link);
    } else { link.style.display = 'none'; document.body.appendChild(link); }
    link.click(); if (!container) link.remove();
    setTimeout(function () { link.remove(); URL.revokeObjectURL(url); }, 600000);
  }
  function preparationSignature(state) { return JSON.stringify(state ? state.revision : null); }
  function preparationOK() { return !!preparation && preparation.ready === true && !preparation.pending && !preparation.running && preparation.revision != null; }
  // A plot that drew nothing because its analysis is waiting for an input (a
  // silent req() in the module, or a differential plot without cohorts) is not
  // "Up to date": it needs settings. Shiny's own busy state still reads Updating.
  var deResultsReady = null, designReady = null, inferenceGate = null, timePointsReady = null;
  function deReady() {
    if (deResultsReady !== null) return deResultsReady;
    function chosen(id){var el=document.getElementById(id);if(!el)return null;var x=el.selectize?el.selectize.getValue():(window.jQuery?jQuery(el).val():el.value);return Array.isArray(x)?x.length>0:!!x;}
    var ref=chosen('data_hub-deReferenceGroups'),comp=chosen('data_hub-deComparisonGroups');
    return ref===null||comp===null?true:ref&&comp;
  }
  // Module defects with a known cause (Max list) show an explanation instead of R's raw
  // message. Shiny writes the error text right after shiny:error, so it is replaced then.
  var knownErrors = [
    {source:'barchart-donutPlotFiltered', match:/invalid 'type' \(closure\)/,
     text:'The filtered donut cannot be drawn yet: a known defect in the composition module stops it before drawing (its column count is never set for the filtered view). The filtered bar chart and the unfiltered donut show the same data. Reported for a fix in the module.'}
  ];
  function explainKnownError(r, message) {
    var known = knownErrors.find(function (k) { return k.source === sourceKey(r) && k.match.test(String(message || '')); });
    if (!known) return;
    setTimeout(function () { if (r.el.classList.contains('shiny-output-error')) { r.el.textContent = known.text; r.el.classList.add('tc-known-module-error'); r.el.setAttribute('data-raw-error', String(message).slice(0, 300)); } }, 0);
  }
  function plotNeeds(r) { return window.TeamCanvasCatalog && typeof TeamCanvasCatalog.needs === 'function' ? TeamCanvasCatalog.needs(sourceKey(r), r.el.id) : null; }
  function awaitingInput(r) {
    var need=plotNeeds(r);
    if (need && (need.kind==='de' || need.kind==='design') && !deReady()) return true;
    // A view that waits for an explicit run (structural analysis) shows its own message image: it is not up to date.
    if (need && need.kind==='run') return true;
    if (shinyBusy || document.documentElement.classList.contains('shiny-busy') || r.el.classList.contains('recalculating')) return false;
    if (window.TeamGroupComparison && typeof TeamGroupComparison.awaitingConfirmation === 'function' && TeamGroupComparison.awaitingConfirmation(r.el.id)) return true;
    return !!r.sourceWaiting || (!hasRenderedPlot(r.el) && !!r.el.querySelector('.empty-plot-overlay'));
  }
  function figureCurrent(r) { return preparationOK() && !shinyBusy && !(window.Shiny && Shiny.shinyapp && document.documentElement.classList.contains('shiny-busy')) && !r.sourceError && r.renderRevision === preparation.revision; }
  function sourceCurrent(r) { return preparationOK() && !r.sourceError && r.renderRevision===preparation.revision; }
  function guard(r, revision, generation, renderGeneration) {
    // Capture/export belongs to this record and prepared run. Autosave and
    // unrelated outputs may toggle Shiny's global busy/activity state.
    return !!r.node && sourceCurrent(r) && preparation.revision===revision && preparationGeneration===generation && (r.revision||0)===renderGeneration;
  }
  function plotlySourceSignature(r, value) {
    if (!r.el.classList.contains('plotly')) return null;
    try {
      if (typeof value === 'string') value = JSON.parse(value);
      var x = value && value.x;
      if (!x || !Array.isArray(x.data) || !x.layout || typeof x.layout !== 'object' || Array.isArray(x.layout)) return null;
      function canonical(item) {
        if (Array.isArray(item)) return item.map(canonical);
        if (item && typeof item === 'object') {
          var out = {}; Object.keys(item).sort().forEach(function (key) { out[key] = canonical(item[key]); }); return out;
        }
        return item;
      }
      var layout = {};
      Object.keys(x.layout).forEach(function (key) { if (!['width','height','autosize','margin'].includes(key)) layout[key] = x.layout[key]; });
      // Team dashboard sample labels are thinned for width. Ignore only the
      // selected ticks when a complete, unchanged map proves their meaning.
      if (['results_dashboard-plot_comp','results_dashboard-plot_dist','results_dashboard-plot_heat'].includes(sourceKey(r))) {
        var proof = layout.meta && layout.meta.teamCanvasSampleLabels, axis = layout.xaxis;
        if (proof && Array.isArray(proof.values) && Array.isArray(proof.labels) && proof.values.length === proof.labels.length &&
            axis && axis.type === 'category' && axis.categoryorder === 'array' && axis.tickmode === 'array' &&
            Array.isArray(axis.categoryarray) && Array.isArray(axis.tickvals) && Array.isArray(axis.ticktext) && axis.tickvals.length === axis.ticktext.length) {
          var map = new Map(), valid = proof.values.length > 0;
          proof.values.forEach(function (value, i) {
            if (typeof value !== 'string' || typeof proof.labels[i] !== 'string' || map.has(value)) valid = false;
            else map.set(value, proof.labels[i]);
          });
          var categories = new Set(axis.categoryarray);
          if (categories.size !== axis.categoryarray.length || axis.categoryarray.some(function (v) { return !map.has(v); })) valid = false;
          var previousTick = -1;
          axis.tickvals.forEach(function (value, i) {
            var position = axis.categoryarray.indexOf(value);
            if (!categories.has(value) || !map.has(value) || map.get(value) !== axis.ticktext[i] || position <= previousTick) valid = false;
            previousTick = position;
          });
          if (valid) { layout.xaxis = Object.assign({}, axis); delete layout.xaxis.tickvals; delete layout.xaxis.ticktext; }
        }
      }
      return JSON.stringify(canonical({data:x.data,layout:layout}));
    } catch (error) { return null; }
  }
  function watchEquivalentRender(r, signature) {
    if (r.equivalentObserver) r.equivalentObserver.disconnect();
    var revision = r.revision, generation = preparationGeneration, timer, done = false;
    function finish() {
      if (done) return;
      done = true; if (r.equivalentObserver) r.equivalentObserver.disconnect();
      if (r.node && !r.hydrating && r.sourceSignature === signature && r.revision === revision && preparationGeneration === generation && Object.keys(r.visual || {}).length) {
        scheduleAppearance(r);
      }
      // Plotly replaced the figure; restore the still-current annotations.
      if (r.node && r.statistics && window.TeamCanvasStatistics && r.revision === revision) TeamCanvasStatistics.draw(r);
    }
    function signal() { clearTimeout(timer); timer = setTimeout(finish, 120); }
    r.equivalentObserver = new MutationObserver(signal);
    r.equivalentObserver.observe(r.el, {childList:true,subtree:true,attributes:true,attributeFilter:['src']});
    var gd = plotFor(r); if (gd && typeof gd.once === 'function') gd.once('plotly_afterplot', signal);
  }
  // visNetwork draws into a sized <canvas> inside .vis-network; it has neither Plotly
  // data nor an <img>, so without this its card stayed "Updating…" after drawing.
  function networkDrawn(el) {
    var canvas = el && el.querySelector('.vis-network canvas');
    return !!(canvas && canvas.width > 0 && canvas.height > 0);
  }
  function watchRender(r) {
    if (r.renderObserver) r.renderObserver.disconnect();
    var sequence = r.revision, expected = preparation && preparation.revision, signaled = false, settled = false, timer;
    r.renderRevision = null;
    function settle() {
      // A network draws (or redraws into its card) without a DOM change or event
      // this watcher hears; once Shiny is idle, its drawn canvas is the current result.
      if (!signaled && networkDrawn(r.el)) signaled = true;
      if (settled || !signaled || !r.el.isConnected || !preparationOK() || shinyBusy || preparation.revision !== expected || r.revision !== sequence) return;
      var gd = plotFor(r), img = r.el.querySelector('img');
      if ((gd && gd.data && gd.data.length && gd._fullLayout) || (img && img.complete && img.naturalWidth && img.naturalHeight) || networkDrawn(r.el)) {
        settled = true;
        if (r.editorSourceReset && window.TeamPlotEditor && TeamPlotEditor.resetSource) { TeamPlotEditor.resetSource(gd); r.editorSourceReset=false; }
        if (r.plotEditor) r.plotEditor.refresh();
        inheritPaletteWhenReady(r);
        r.renderRevision = expected; r.sourceError = false; if (r.renderObserver) r.renderObserver.disconnect();
        if (r.node && r.statistics && window.TeamCanvasStatistics) TeamCanvasStatistics.rendered(r);
        if (r.node && sourceKey(r)==='results_dashboard-plot_heat') resize(r);
        if (r.hydrating && !r.snapshot && r.node) { r.hydrating = false; scheduleAppearance(r); if (!gateQuiet()) tell('The saved figure settings were applied to the current result.'); }
        else if (r.replayPresentation && r.node) { r.replayPresentation = false; scheduleAppearance(r); }
      }
    }
    function signal() { signaled = true; clearTimeout(timer); timer = setTimeout(settle, 120); }
    r.settleRender = settle;
    r.renderObserver = new MutationObserver(signal);
    r.renderObserver.observe(r.el, {childList:true,subtree:true,attributes:true,attributeFilter:['src']});
    var gd = plotFor(r); if (gd && typeof gd.once === 'function') gd.once('plotly_afterplot', signal);
    r.el.addEventListener('load', signal, {capture:true, once:true});
  }
  function staleSnapshot(r) {
    if (!r.snapshot || !r.node || r.snapshot.archived) return;
    var fallback = r.preview && r.preview.querySelector('.tc-export-fallback');
    if (fallback) { URL.revokeObjectURL(fallback.href); fallback.remove(); }
    r.snapshot.stale = true; changed(); r.node.classList.add('tc-stale');
    if (!r.preview) return;
    r.preview.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    r.preview.querySelector('.tc-snapshot-status').textContent = 'The analysis changed or is updating. This frozen figure needs review. Choose Edit to see the current result.';
  }
  function preparationSnapshotStatus(r, ready) {
    if (!r.snapshot || r.snapshot.archived || r.snapshot.stale || !r.node || !r.preview) return;
    var caption=r.preview.querySelector('.tc-snapshot-status');
    if (!ready) {
      if (r.preparationCaption == null) r.preparationCaption=caption.textContent;
      r.node.classList.add('tc-stale');
      r.preview.querySelectorAll('button').forEach(function (b) { b.disabled=true; });
      caption.textContent='Preparation has pending changes. This frozen figure cannot be exported until the current result is ready.';
    } else if (r.preparationCaption != null && guard(r,r.snapshot.preparationRevision,r.snapshot.preparationGeneration,r.snapshot.renderGeneration)) {
      caption.textContent=r.preparationCaption; r.preparationCaption=null; r.node.classList.remove('tc-stale');
      r.preview.querySelectorAll('button').forEach(function (b) { b.disabled=false; });
    }
  }
  function logicalOutputDimension(el,dimension) {
    var style=getComputedStyle(el), value=parseFloat(style.getPropertyValue(dimension));
    if(style.boxSizing!=='border-box'){
      var sides=dimension==='width'?['Left','Right']:['Top','Bottom'];
      sides.forEach(function(side){value+=(parseFloat(style['padding'+side])||0)+(parseFloat(style['border'+side+'Width'])||0);});
    }
    return Math.round(value);
  }
  function parkSnapshotSource(r) {
    if (!r.content || r.parkedSourceStyle) return;
    var outputSize={width:logicalOutputDimension(r.el,'width'),height:logicalOutputDimension(r.el,'height')};
    var computed=getComputedStyle(r.content), dimensions={width:computed.width,height:computed.height,padding:computed.padding,boxSizing:computed.boxSizing}, saved={};
    ['width','height','min-width','max-width','min-height','max-height','padding','box-sizing','flex'].forEach(function(key){saved[key]={value:r.content.style.getPropertyValue(key),priority:r.content.style.getPropertyPriority(key)};});
    r.parkedSourceStyle=saved;
    r.parkedOutputStyle={};
    ['width','height','min-width','max-width','min-height','max-height','box-sizing','flex'].forEach(function(key){r.parkedOutputStyle[key]={value:r.el.style.getPropertyValue(key),priority:r.el.style.getPropertyPriority(key)};});
    // Nested card padding can change at responsive breakpoints. The captured
    // output itself must retain its logical device dimensions until Edit.
    ['width','height'].forEach(function(key){r.el.style.setProperty(key,outputSize[key]+'px','important');});
    r.el.style.setProperty('box-sizing','border-box','important');r.el.style.setProperty('flex','none','important');
    ['min-width','min-height'].forEach(function(key){r.el.style.setProperty(key,'0','important');});
    ['max-width','max-height'].forEach(function(key){r.el.style.setProperty(key,'none','important');});
    // Keep Shiny's logical source dimensions exact while its live DOM is offscreen.
    ['width','height'].forEach(function(key){r.content.style.setProperty(key,dimensions[key]);});
    r.content.style.setProperty('padding',dimensions.padding);
    r.content.style.setProperty('box-sizing',dimensions.boxSizing);
    r.content.style.setProperty('min-width','0');r.content.style.setProperty('max-width','none');
    r.content.style.setProperty('min-height','0');r.content.style.setProperty('max-height','none');
    r.content.style.setProperty('flex','none');
  }
  function restoreSnapshotSource(r) {
    if(!r.content||!r.parkedSourceStyle)return;
    Object.keys(r.parkedSourceStyle).forEach(function(key){var saved=r.parkedSourceStyle[key];if(saved.value)r.content.style.setProperty(key,saved.value,saved.priority);else r.content.style.removeProperty(key);});
    if(r.parkedOutputStyle)Object.keys(r.parkedOutputStyle).forEach(function(key){var saved=r.parkedOutputStyle[key];if(saved.value)r.el.style.setProperty(key,saved.value,saved.priority);else r.el.style.removeProperty(key);});
    r.parkedOutputStyle=null; r.parkedSourceStyle=null;
  }
  function editSnapshot(r) {
    if (!r.node) return;
    var wasArchived = !!(r.snapshot && (r.snapshot.archived || r.snapshot.undone));
    if (r.preview) r.preview.remove(); r.preview = null; r.snapshot = null;
    if (wasArchived) { r.hydrating = true; if (figureCurrent(r)) { r.hydrating = false; scheduleAppearance(r); } }
    r.node.classList.remove('tc-finished', 'tc-stale', 'tc-snapshot-defect'); restoreSnapshotSource(r);
    r.finishButton.textContent = 'Finish plot'; r.finishButton.setAttribute('aria-pressed', 'false');
    if (!wasArchived) resize(r); tell(wasArchived ? 'Review the current prepared result before finishing this plot again.' : 'Editing the current live plot.'); changed();
  }
  function showSnapshot(r, snapshot) {
    var preview = document.createElement('div'); preview.className = 'tc-snapshot';
    var caption = document.createElement('p'); caption.className = 'tc-snapshot-status';
    caption.textContent = snapshot.archived ? 'Saved checkpoint figure. Edit to regenerate with current data.' :
      snapshot.url.indexOf('data:image/svg+xml') === 0 ? 'Frozen figure from the current prepared result.' : 'Frozen figure from the current prepared result. SVG and PDF contain a raster image.';
    var gp=snapshot.provenance;
    if(gp && ['gcTest','gcBaseline','gcScale','gcAdjustment'].every(function(k){return typeof gp[k]==='string' && gp[k].length>0 && gp[k].length<=1000;})) caption.textContent+=' Test: '+gp.gcTest+' · Baseline: '+gp.gcBaseline+' · Scale: '+gp.gcScale+' · Adjustment: '+gp.gcAdjustment+'.';
    preview.appendChild(caption);
    // Decoded off the main thread. Not loading=lazy: a hidden (broken) image would never load,
    // and the opening gate and the collapsed-raster check wait for the load.
    var image = document.createElement('img'); image.decoding = 'async'; image.src = snapshot.url; image.alt = r.label + ' frozen figure'; preview.appendChild(image);
    // Older checkpoints may hold a figure captured at a collapsed size; Edit then Finish plot recaptures it.
    var exports = document.createElement('div'); exports.className = 'tc-snapshot-exports';
    ['PNG','SVG','PDF'].forEach(function (format) { var button = document.createElement('button'); button.type = 'button'; button.textContent = format; button.addEventListener('click', function () { exportSnapshot(r, format); }); exports.appendChild(button); });
    preview.appendChild(exports); parkSnapshotSource(r); r.node.appendChild(preview);
    r.preview = preview; r.snapshot = snapshot; r.node.classList.add('tc-finished');
    r.finishButton.textContent = 'Edit'; r.finishButton.setAttribute('aria-pressed','true');
    // A saved image from an older capture can be broken; it is flagged here, never rewritten.
    var defect = snapshotDefect(r, snapshot);
    if (defect) markSnapshotDefect(r, defect);
    // A raster whose size is only known once decoded (an SVG's size is read above).
    else image.addEventListener('load', function () { if (r.preview === preview && r.snapshot === snapshot && !snapshot.defect && snapshotLooksCollapsed(r, image)) markSnapshotDefect(r, {kind:'collapsed', width:image.naturalWidth, height:image.naturalHeight}); }, {once:true});
  }
  // Saved figures from older captures that cannot be shown as they are:
  // - collapsed: captured at the card's on-screen size under canvas zoom (a 268x92 image of a
  //   1494x720 composition card), so full-size fonts surround a collapsed plot area;
  // - clipped: a violin captured before its value axis kept the data baseline (d1e8a65), whose
  //   axis cuts the violin shapes. Captures since then carry provenance.captureVersion and are
  //   never judged as clipped.
  // The card is shown like a stale figure (no image, exports and the figure page refuse it)
  // until Edit → Finish plot regenerates it. Nothing is written back to the saved project.
  var SNAPSHOT_CAPTURE_VERSION = 2;
  var SNAPSHOT_BROKEN = 'Saved image looks broken. Choose Edit, then Finish plot to regenerate it.';
  // Decodes a data:image/svg+xml URL, or only its first `limit` characters (enough for the root tag).
  function snapshotSvgMarkup(url, limit) {
    if (typeof url !== 'string' || !/^data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,/i.test(url)) return null;
    try {
      var comma = url.indexOf(','), header = url.slice(0, comma), payload = url.slice(comma + 1);
      if (/;base64$/i.test(header)) { if (limit) payload = payload.slice(0, Math.ceil(limit / 3) * 4); return atob(payload); }
      if (!limit || payload.length <= limit) return decodeURIComponent(payload);
      // Never cut a %XX escape, or a multi-byte UTF-8 character spread over several escapes, in two.
      payload = payload.slice(0, limit).replace(/%[0-9a-f]?$/i, '');
      for (var i = 0; i < 4; i++) { try { return decodeURIComponent(payload); } catch (e) { payload = payload.replace(/%[0-9a-f]{2}$/i, ''); } }
      return null;
    } catch (e) { return null; }
  }
  // The root element's own pixel size, as the browser decodes it (naturalWidth/Height).
  function snapshotSvgSize(markup) {
    var tag = /<svg\b[^>]*>/i.exec(markup || ''); if (!tag) return null;
    function attr(name) { var m = new RegExp('\\s' + name + '\\s*=\\s*["\']\\s*([0-9.]+(?:e[+-]?[0-9]+)?)\\s*(px)?\\s*["\']', 'i').exec(tag[0]); return m ? Number(m[1]) : NaN; }
    var w = attr('width'), h = attr('height');
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? {width:w, height:h} : null;
  }
  // A violin shape that reaches outside its plot clip was cut by the axis range. Judged only where
  // the geometry is unambiguous, as Plotly writes it: absolute M/L/Q/C/Z commands (every argument
  // an x,y pair), no transform between the clipped group and the path, a clip rect with numeric
  // bounds. Anything else is left alone: a figure is never flagged on a guess.
  var NUMBER = /[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[-+]?[0-9]+)?/gi;
  function snapshotViolinClipped(markup) {
    if (!markup || !/class\s*=\s*["'][^"']*(?:\bviolin\b|&#)/.test(markup)) return false;
    var doc; try { doc = new DOMParser().parseFromString(markup, 'image/svg+xml'); } catch (e) { return false; }
    if (!doc || doc.querySelector('parsererror')) return false;
    return Array.from(doc.querySelectorAll('path.violin')).some(function (path) {
      var d = path.getAttribute('d') || '', holder = path.closest('[clip-path]');
      if (!d || /[^MLQCZ0-9.,\s+\-eE]/.test(d) || !holder) return false;
      for (var el = path; el && el !== holder; el = el.parentNode) if (el.getAttribute && el.getAttribute('transform')) return false;
      var ref = /url\(\s*["']?#([^"')\s]+)["']?\s*\)/.exec(holder.getAttribute('clip-path') || ''), clip = ref && doc.getElementById(ref[1]);
      var rects = clip ? clip.querySelectorAll('rect') : [];
      if (rects.length !== 1 || rects[0].parentNode !== clip || rects[0].getAttribute('transform') || clip.getAttribute('transform') || (clip.getAttribute('clipPathUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') return false;
      var rect = rects[0], x0 = Number(rect.getAttribute('x') || 0), y0 = Number(rect.getAttribute('y') || 0), w = Number(rect.getAttribute('width')), h = Number(rect.getAttribute('height'));
      if (![x0, y0, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return false;
      var nums = (d.match(NUMBER) || []).map(Number), tol = 1;
      if (nums.length % 2 || nums.some(function (n) { return !Number.isFinite(n); })) return false;
      for (var i = 0; i < nums.length; i += 2) if (nums[i] < x0 - tol || nums[i] > x0 + w + tol || nums[i + 1] < y0 - tol || nums[i + 1] > y0 + h + tol) return true;
      return false;
    });
  }
  // Restores show the same saved images again (checkpoint switches, undo): judge each image once,
  // within a character budget so the cache never holds many large images alive.
  var snapshotVerdicts = new Map(), snapshotVerdictChars = 0, SNAPSHOT_VERDICT_BUDGET = 8 * 1024 * 1024;
  // "violin" as written, or with any of its letters percent-encoded.
  var VIOLIN_IN_URL = /(?:v|%76)(?:i|%69)(?:o|%6f)(?:l|%6c)(?:i|%69)(?:n|%6e)/i;
  function snapshotDefect(r, snapshot) {
    if (!r || !r.node || !snapshot || typeof snapshot.url !== 'string') return null;
    var head = snapshotSvgMarkup(snapshot.url, 4096), size = snapshotSvgSize(head);
    if (size && imageLooksCollapsed(size.width, size.height, r.node)) return {kind:'collapsed', width:size.width, height:size.height};
    var stamped = snapshot.provenance && Number(snapshot.provenance.captureVersion) >= SNAPSHOT_CAPTURE_VERSION;
    // Base64 and XML character references (&#...;) can hide the text, so those are always decoded.
    if (stamped || !/^data:image\/svg\+xml/i.test(snapshot.url) || (!VIOLIN_IN_URL.test(snapshot.url) && !/;base64,/i.test(snapshot.url.slice(0, 48)) && !/(?:&|%26)(?:#|%23)/i.test(snapshot.url))) return null;
    var clipped = snapshotVerdicts.get(snapshot.url);
    if (clipped === undefined) {
      clipped = snapshotViolinClipped(snapshotSvgMarkup(snapshot.url));
      if (snapshot.url.length <= SNAPSHOT_VERDICT_BUDGET / 4) {
        while (snapshotVerdicts.size && snapshotVerdictChars + snapshot.url.length > SNAPSHOT_VERDICT_BUDGET) { var oldest = snapshotVerdicts.keys().next().value; snapshotVerdicts.delete(oldest); snapshotVerdictChars -= oldest.length; }
        snapshotVerdicts.set(snapshot.url, clipped); snapshotVerdictChars += snapshot.url.length;
      }
    }
    return clipped ? {kind:'clipped'} : null;
  }
  function markSnapshotDefect(r, defect) {
    if (!r.snapshot || !r.node || !r.preview) return;
    r.snapshot.defect = defect.kind;
    r.node.classList.add('tc-stale', 'tc-snapshot-defect'); r.preview.classList.add('tc-snapshot-broken');
    r.preview.querySelectorAll('.tc-snapshot-exports button').forEach(function (b) { b.disabled = true; });
    var caption = r.preview.querySelector('.tc-snapshot-status');
    if (caption) caption.textContent = SNAPSHOT_BROKEN + (defect.kind === 'collapsed' ? ' This saved image is much smaller than its card (' + Math.round(defect.width) + '×' + Math.round(defect.height) + ' px).' : ' Its value axis cuts off part of the violins.');
  }
  function groupComparisonProvenance(r) {
    if(sourceKey(r)!=='group_comparison_tab-comparisonPlot')return null;
    var value=window.TeamGroupComparison && TeamGroupComparison.provenance && TeamGroupComparison.provenance(r.el.id);
    var keys=['gcTest','gcBaseline','gcScale','gcReference','gcAdjustment','gcSignature'];
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==keys.length || keys.some(function(k){return typeof value[k]!=='string'||!value[k].length||value[k].length>1000;}) || !/^[a-f0-9]{64}$/i.test(value.gcSignature)) throw new Error('Confirm the Group comparison settings and wait for the current result before finishing.');
    var out={};keys.forEach(function(k){out[k]=value[k];});return out;
  }
  // A finished figure freezes Plotly's layout at the capture size. Checkpoints made
  // before plots kept their logical size under zoom captured a 1494 px composition
  // card at its on-screen size (268x92): full-size fonts around a collapsed plot
  // area. A frame is collapsed when it is below SNAPSHOT_MIN, or when the live layout
  // still differs from the card's logical frame after one relayout. The plot area is
  // not judged: heatmaps draw one or two groups at 16 px per group by design
  // (R/results_dashboard.R, rd_team_heatmap_view) and keep their own geometry.
  var SNAPSHOT_MIN = {width:160, height:120};
  var SNAPSHOT_TOO_SMALL = 'The plot frame is too small to finish a readable figure. Enlarge the card, wait for the plot to redraw, and try again.';
  var SNAPSHOT_ZOOM = 'This plot was drawn at the reduced canvas zoom, so its image is too small to finish. Zoom in to 100% and Finish again.';
  var SNAPSHOT_RESTORE_FAILED = 'The live plot could not be returned to its previous layout, so the figure was not finished. Try again.';
  function snapshotSizeUsable(width, height) { return width >= SNAPSHOT_MIN.width && height >= SNAPSHOT_MIN.height; }
  // An image below the minimum looks collapsed only when it is also less than half its
  // card's logical size in both directions (the 268x92 image of a 1494x720 card). Finish
  // refuses exactly these images, so a restored caption never leads into a refusal loop.
  function imageLooksCollapsed(w, h, node) {
    if (!w || !h || snapshotSizeUsable(w, h) || !node) return false;
    var fw = parseFloat(node.style.width) || node.offsetWidth, fh = parseFloat(node.style.height) || node.offsetHeight;
    return fw > 0 && fh > 0 && w * 2 < fw && h * 2 < fh;
  }
  function snapshotLooksCollapsed(r, image) { return imageLooksCollapsed(image.naturalWidth, image.naturalHeight, r.node); }
  function layoutOffFrame(gd, width, height) {
    var full = gd._fullLayout;
    return !!(full && full._size && (Math.abs(full.width - width) > 1 || Math.abs(full.height - height) > 1));
  }
  function layoutFrames() { return new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); }); }
  // Finish may resize and relayout the live figure to its logical frame. It records the
  // figure's own autosize/width/height before any change, and afterwards returns them,
  // unless a newer render or card resize has since taken over the layout.
  function layoutTriple(gd) { var l = gd.layout || {}, o = {}; ['autosize','width','height'].forEach(function (k) { o[k] = Object.prototype.hasOwnProperty.call(l, k) && l[k] != null ? l[k] : null; }); return o; }
  function sameTriple(a, b) { return a.autosize === b.autosize && a.width === b.width && a.height === b.height; }
  function callPlotly(call) { try { return Promise.resolve(call()); } catch (error) { return Promise.reject(error); } }
  async function restoreLiveLayout(r, gd, before, owned, renderGeneration) {
    var now = layoutTriple(gd);
    if (sameTriple(now, before)) return null;
    if (!sameTriple(now, owned) || (r.revision || 0) !== renderGeneration || plotFor(r) !== gd) return null;
    try { await callPlotly(function () { return Plotly.relayout(gd, before); }); } catch (error) { return new Error(SNAPSHOT_RESTORE_FAILED); }
    return sameTriple(layoutTriple(gd), before) ? null : new Error(SNAPSHOT_RESTORE_FAILED);
  }
  async function finishSnapshot(r) {
    if (!r.node || !sourceCurrent(r)) { tell('Wait for preparation and this plot to finish updating before finishing the figure.'); return; }
    var gd = plotFor(r), source = r.el.querySelector('img'), captureNode = r.node, renderGeneration = r.revision || 0, revision = preparation.revision, generation = preparationGeneration, activity = activityGeneration, url;
    dimensionTrace(r,'finish-start',{width:r.el.offsetWidth,height:r.el.offsetHeight,revision:r.revision||0});
    r.finishButton.disabled = true;
    try {
      var groupProvenance=groupComparisonProvenance(r);
      if (r.plotEditor && !r.plotEditor.flushPending()) throw new Error('Check the invalid appearance value before finishing the plot.');
      if (r.statistics && window.TeamCanvasStatistics && TeamCanvasStatistics.busy(r)) throw new Error('Wait for the violin statistics to finish before finishing the plot.');
      await flushAppearance(r);
      if (r.node !== captureNode || !guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
      if (gd && gd.data && gd.data.length && window.Plotly) {
        var before = layoutTriple(gd), owned = before, own = function () { owned = layoutTriple(gd); };
        try {
          // Settle Plotly at its logical CSS size, independently of canvas viewport zoom.
          try { await callPlotly(function () { return Plotly.Plots.resize(gd); }); } finally { own(); }
          if (r.node !== captureNode || !guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
          var rect = gd.getBoundingClientRect(), computed = getComputedStyle(gd);
          var viewScale = window.TeamCanvasViewport && Number(window.TeamCanvasViewport.scale) > 0 ? Number(window.TeamCanvasViewport.scale) : 1;
          var width = Math.round(gd.clientWidth || parseFloat(computed.width) || rect.width / viewScale);
          var height = Math.round(gd.clientHeight || parseFloat(computed.height) || rect.height / viewScale);
          if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) throw new Error('Plot is not ready.');
          // Capture only a plot laid out at its card's logical size; refuse a collapsed frame.
          // Team heatmaps keep their own geometry, as in production.
          if (!snapshotSizeUsable(width, height)) throw new Error(SNAPSHOT_TOO_SMALL);
          if (!(gd.layout && gd.layout.meta && gd.layout.meta.teamHeatmap) && layoutOffFrame(gd, width, height)) {
            try { await callPlotly(function () { return Plotly.relayout(gd, {autosize:false, width:width, height:height}); }); } finally { own(); }
            await layoutFrames();
            if (layoutOffFrame(gd, width, height)) throw new Error(SNAPSHOT_TOO_SMALL);
          }
          if (r.node !== captureNode || !guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
          lazyAssertClean(r);
          var capture=function(){return Plotly.toImage(gd, {format:'svg', width:width, height:height});};
          if(sourceKey(r)==='group_comparison_tab-comparisonPlot') {
            if(!window.TeamGroupComparison || typeof TeamGroupComparison.withExportGeometry!=='function') throw new Error('Group comparison export is not ready. Try again.');
            url=await TeamGroupComparison.withExportGeometry(gd,capture);
          } else url=await callPlotly(capture);
        } finally {
          // Never report a finished figure while the live layout is still Finish's own.
          var restoreError = await restoreLiveLayout(r, gd, before, owned, renderGeneration);
          if (restoreError) throw restoreError;
        }
      } else if (source && source.complete && source.naturalWidth && source.naturalHeight) {
        // A static Shiny image is judged by its logical (CSS) render size, not its bitmap,
        // whose pixels follow the device pixel ratio and the zoom it was drawn at.
        var logicalWidth = source.clientWidth || source.naturalWidth / (window.devicePixelRatio || 1), logicalHeight = source.clientHeight || source.naturalHeight / (window.devicePixelRatio || 1);
        if (!snapshotSizeUsable(logicalWidth, logicalHeight)) throw new Error(SNAPSHOT_TOO_SMALL);
        // A bitmap that would read as collapsed in its card was drawn at a reduced zoom.
        var staticScale = window.TeamCanvasViewport && Number(window.TeamCanvasViewport.scale) > 0 ? Number(window.TeamCanvasViewport.scale) : 1;
        if (imageLooksCollapsed(source.naturalWidth, source.naturalHeight, r.node)) throw new Error(staticScale < 1 ? SNAPSHOT_ZOOM : SNAPSHOT_TOO_SMALL);
        var c = document.createElement('canvas'); c.width = source.naturalWidth; c.height = source.naturalHeight; c.getContext('2d').drawImage(source,0,0); url = c.toDataURL('image/png');
      } else throw new Error('Plot is not ready.');
      if (r.node !== captureNode || !guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
      if (typeof url !== 'string' || url.length > 4 * 1024 * 1024) throw new Error('This figure is too large to finish and save. The live plot remains editable; reduce its size or use its existing download controls.');
      if (r.statistics && window.TeamCanvasStatistics && TeamCanvasStatistics.busy(r)) throw new Error('The violin statistics changed while finishing. Try again.');
      if(groupProvenance && JSON.stringify(groupComparisonProvenance(r))!==JSON.stringify(groupProvenance)) throw new Error('The Group comparison changed while finishing. Try again.');
      showSnapshot(r, {url:url, stale:false, createdAt:new Date().toISOString(), provenance:Object.assign({preparationRevision:revision, captureVersion:SNAPSHOT_CAPTURE_VERSION}, r.statistics && window.TeamCanvasStatistics ? TeamCanvasStatistics.provenance(r) : {},groupProvenance||{}), preparationRevision:revision, preparationGeneration:generation, renderGeneration:renderGeneration});
      dimensionTrace(r,'finish-complete',{width:r.el.offsetWidth,height:r.el.offsetHeight,revision:r.revision||0});
      changed();
      tell('Frozen figure ready. Source data remain available in Edit.'); return true;
    } catch (e) { dimensionTrace(r,'finish-aborted',{revision:r.revision||0,busy:!!shinyBusy,current:!!figureCurrent(r)}); tell(e.message || 'Could not finish the plot.'); return false; }
    finally { if (r.node) r.finishButton.disabled = false; }
  }
  function snapshotGuard(r, snapshot, activity) {
    if (!r.node || r.snapshot !== snapshot) return false;
    if (snapshot.archived) return true;
    return !snapshot.stale && guard(r,snapshot.preparationRevision,snapshot.preparationGeneration,snapshot.renderGeneration,activity);
  }
  function snapshotInvalid(r,snapshot) {
    return !snapshot.archived && (r.sourceError || !preparation || preparation.revision!==snapshot.preparationRevision || preparationGeneration!==snapshot.preparationGeneration || (r.revision||0)!==snapshot.renderGeneration);
  }
  async function exportSnapshot(r, format) {
    if (r.snapshot && r.snapshot.defect) { tell(SNAPSHOT_BROKEN); return; }
    if (!r.snapshot || !snapshotGuard(r, r.snapshot)) { if (r.snapshot && snapshotInvalid(r,r.snapshot)) staleSnapshot(r); tell('The figure is out of date or the analysis is updating. Choose Edit and finish it again.'); return; }
    var snapshot = r.snapshot, activity = activityGeneration, image = r.preview && r.preview.querySelector('img');
    function checkImage() {
      if (!image || !r.preview || !r.preview.contains(image) || image.getAttribute('src') !== snapshot.url) { staleSnapshot(r); throw new Error('The frozen image is missing or changed. Choose Edit and finish it again.'); }
    }
    try {
      checkImage();
      if (image.decode) await image.decode();
      checkImage();
      if (!r.snapshot || r.snapshot !== snapshot || !snapshotGuard(r,snapshot,activity)) throw new Error('The analysis changed or was busy during export. Try again.');
      var width = image.naturalWidth, height = image.naturalHeight, canvas = document.createElement('canvas');
      if (!width || !height) throw new Error('The frozen image has no usable dimensions. Choose Edit and finish it again.');
      var imageScale=format==='PNG'?Math.min(2,30000/width,30000/height):1;canvas.width=Math.round(width*imageScale);canvas.height=Math.round(height*imageScale); var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      var isSvg = snapshot.url.indexOf('data:image/svg+xml') === 0, svg;
      if (isSvg) svg = await (await fetch(snapshot.url)).text();
      checkImage();
      if (!r.snapshot || r.snapshot !== snapshot || !snapshotGuard(r,snapshot,activity)) throw new Error('The analysis changed or was busy during export. Try again.');
      var filename = (r.displayTitle || r.label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'figure'; filename += snapshot.archived ? '-saved' : '-rev' + String(snapshot.preparationRevision).replace(/[^a-z0-9_-]/gi,'-');
      if (format === 'SVG') {
        if (!isSvg) { var png = canvas.toDataURL('image/png'); svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><image width="' + width + '" height="' + height + '" href="' + png + '"/></svg>'; }
        saveFile(new Blob([svg], {type:'image/svg+xml'}), filename + '.svg', r.preview.querySelector('.tc-snapshot-exports'), function () { return snapshotGuard(r,snapshot,activity); });
      } else if (format === 'PNG') {
        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
        checkImage(); if (!snapshotGuard(r,snapshot,activity)) throw new Error('The analysis changed or was busy during export. Try again.'); if (!blob) throw new Error('Could not create the PNG image. Try another format.'); if (snapshotGuard(r,snapshot,activity)) saveFile(blob, filename + '.png', r.preview.querySelector('.tc-snapshot-exports'), function () { return snapshotGuard(r,snapshot,activity); });
      } else {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF library is unavailable.');
        if (window.TeamPdf) window.TeamPdf.ensureMinusFix();
        var pdf = new window.jspdf.jsPDF({orientation:width>=height?'landscape':'portrait',unit:'pt',format:[width,height]});
        if (isSvg && pdf.svg) await pdf.svg(new DOMParser().parseFromString(svg,'image/svg+xml').documentElement, {x:0,y:0,width:width,height:height});
        else pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,width,height);
        checkImage(); if (!snapshotGuard(r,snapshot,activity)) throw new Error('The analysis changed or was busy during export. Try again.'); if (snapshotGuard(r,snapshot,activity)) saveFile(pdf.output('blob'), filename + '.pdf', r.preview.querySelector('.tc-snapshot-exports'), function () { return snapshotGuard(r,snapshot,activity); });
      }
      tell(format + ' is ready. If the download did not start, use Save ' + format + ' file.');
    } catch (error) { if (!snapshot.archived && r.snapshot === snapshot && snapshotInvalid(r,snapshot)) staleSnapshot(r); tell(error.message || 'Could not export the frozen figure. Try another format.'); }
  }
  // A new plot starts, once its figure first renders, with the group palette of
  // the most recently re-paletted canvas plot (else the newest canvas plot that
  // has one; edit times are per session) whose figure shares at least one group
  // label with it. The new plot's state is what "Apply palette" would produce,
  // except that every group the source plot shows keeps the source's colour
  // (the editor indexes a palette by each figure's own sorted label set).
  // Continuous scales, class series and non-overlapping plots are untouched;
  // saved, copied and restored plots keep their own editor state.
  function notePaletteEdit(r, before, after) {
    before = before || {}; after = after || {};
    if (after.palette && (after.palette !== before.palette || after.greyHealthy !== before.greyHealthy)) r.paletteEditedAt = ++paletteClock;
  }
  function paletteLabel(trace) { return (trace && trace.meta && typeof trace.meta.teamCondition === 'string' && trace.meta.teamCondition) || (trace && trace.legendgroup) || (trace && trace.name) || ''; }
  function paletteLabels(gd) {
    var meta = gd.layout && gd.layout.meta, labels = meta && Array.isArray(meta.teamConditions) ? meta.teamConditions : gd.data.map(paletteLabel);
    return Array.from(new Set(labels.filter(function (l) { return typeof l === 'string' && l; }))).sort();
  }
  // Base colour per label, computed by the editor itself on a stand-in figure.
  function paletteBase(labels, palette, grey) {
    var fake = {data: labels.map(function (l) { return {type: 'bar', name: l, x: ['a'], y: [1], marker: {color: '#000000'}}; }), layout: {meta: {teamConditions: labels}}}, map = {};
    TeamPlotEditor.paletteStyle(fake, {}, palette, grey, false).traces.forEach(function (t) { if (t.color) map[labels[t.index]] = t.color.toLowerCase(); });
    return map;
  }
  // Source groups keep the source's colours; groups only the new plot shows
  // take the next palette slots after the source's, so none collide.
  function sharedPaletteColors(sourceLabels, ownLabels, palette, grey) {
    var map = paletteBase(sourceLabels, palette, grey), extra = ownLabels.filter(function (l) { return sourceLabels.indexOf(l) < 0 && !(grey && /^healthy(?:$|[_ -])/i.test(l)); });
    if (extra.length) {
      var slots = []; for (var i = 0; i < sourceLabels.length + extra.length; i++) slots.push('\u0001' + ('0000' + i).slice(-5));
      var base = paletteBase(slots, palette, grey);
      extra.forEach(function (l, k) { if (base[slots[sourceLabels.length + k]]) map[l] = base[slots[sourceLabels.length + k]]; });
    }
    return map;
  }
  function inheritPaletteWhenReady(r) {
    var gd = r.paletteInherit && !r.hydrating && r.node && plotFor(r);
    if (!gd || r.snapshot || !gd.data || !gd.data.length || !gd._fullLayout || !window.TeamPlotEditor || !TeamPlotEditor.palettes) return;
    var editor = r.visual.editor || {};
    if (editor.palette) { r.paletteInherit = false; return; }
    var candidates = [];
    Array.from(board.querySelectorAll('.tc-node[data-plot-id]')).forEach(function (node, order) {
      var source = records.get(node.dataset.plotId), sourceEditor = source && source !== r && source.node === node && source.visual && source.visual.editor, sourceGd = sourceEditor && plotFor(source);
      if (sourceEditor && TeamPlotEditor.palettes[sourceEditor.palette] && sourceGd && Array.isArray(sourceGd.data) && sourceGd.data.length) candidates.push({at: source.paletteEditedAt || 0, order: order, editor: sourceEditor, gd: sourceGd});
    });
    if (!candidates.length) { r.paletteInherit = false; return; }
    candidates.sort(function (x, y) { return y.at - x.at || y.order - x.order; });
    var probe = null, picked = null;
    for (var i = 0; i < candidates.length && !picked; i++) {
      var c = candidates[i], grey = c.editor.greyHealthy !== false, sourceLabels = paletteLabels(c.gd);
      probe = TeamPlotEditor.paletteStyle(gd, {}, c.editor.palette, grey, false).traces;
      // Plots without condition-coloured categorical series (heatmaps, class
      // compositions, loading placeholders) have nothing to recolor.
      if (probe.some(function (t) { return sourceLabels.indexOf(paletteLabel(gd.data[t.index])) >= 0; })) picked = {palette: c.editor.palette, grey: grey, labels: sourceLabels};
    }
    if (!picked) return; // a later render with group series may still inherit
    r.paletteInherit = false;
    // Same call as the editor's Apply palette button. Group comparison keeps it
    // verbatim: its restyle listener only treats that exact state as a palette
    // batch (anything else would become per-panel colour overrides).
    var next = TeamPlotEditor.paletteStyle(gd, editor, picked.palette, picked.grey);
    var ownLabels = paletteLabels(gd), own = paletteBase(ownLabels, picked.palette, picked.grey), shared = sharedPaletteColors(picked.labels, ownLabels, picked.palette, picked.grey);
    if (!(gd.layout.meta && gd.layout.meta.teamGroupComparison)) next.traces.forEach(function (t) {
      var label = paletteLabel(gd.data[t.index]), from = own[label], to = shared[label];
      if (!from || !to || from === to) return;
      var swap = {}; swap[from] = to; [0.15, 0.45, 0.60].forEach(function (f) { swap[TeamPlotEditor.darker(from, f).toLowerCase()] = TeamPlotEditor.darker(to, f); });
      ['color', 'lineColor', 'fillColor'].forEach(function (k) { var v = typeof t[k] === 'string' && swap[t[k].toLowerCase()]; if (v) t[k] = v; });
    });
    r.visual.editor = next;
    if (r.plotEditor) r.plotEditor.refresh();
    scheduleAppearance(r);
  }
  function plotFor(r) { return r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot'); }
  function scalarMarks(gd) {
    if (!gd || !gd.data || gd.data.length !== 1) return false;
    var trace = gd.data[0], color = trace.marker && trace.marker.color;
    return ['scatter','scattergl','bar','box','violin'].includes(trace.type || 'scatter') && (typeof color === 'string' || typeof color === 'number');
  }
  function refreshMarkAvailability(r) {
    if (!r.markInput) return;
    r.markInput.disabled = !scalarMarks(plotFor(r));
    r.markInput.title = r.markInput.disabled ? 'Use Colors & palettes for group or per-point colors.' : '';
  }
  function scheduleAppearance(r) {
    changed();
    clearTimeout(r.appearanceTimer);
    r.appearancePending = true;
    r.appearanceTimer = setTimeout(function () { flushAppearance(r).catch(function () { tell('Could not apply this visual edit. Try again.'); }); }, 150);
  }
  function flushAppearance(r) {
    clearTimeout(r.appearanceTimer);
    if (!r.appearancePending) return r.appearanceQueue || Promise.resolve();
    if (r.hydrating && !figureCurrent(r)) return r.appearanceQueue || Promise.resolve();
    r.appearancePending = false;
    var generation = r.appearanceGeneration || 0;
    r.appearanceQueue = (r.appearanceQueue || Promise.resolve()).catch(function () {}).then(function () {
      if (r.node && (r.appearanceGeneration || 0) === generation) return applyAppearance(r);
    });
    return r.appearanceQueue;
  }
  function clearAppearance(r) {
    clearTimeout(r.appearanceTimer); r.appearancePending = false; r.appearanceGeneration = (r.appearanceGeneration || 0) + 1;
    r.editorSourceReset = true;
    Object.keys(r.visual).forEach(function (key) { delete r.visual[key]; }); r.titleBaseline = null; r.axisBaseline = null;
    r.editInputs.forEach(function (input) { input.value = input.type === 'color' ? '#235c77' : ''; });
    r.backgroundInput.value = '#ffffff'; r.content.style.backgroundColor = '';
    if (r.snapshot) staleSnapshot(r);
    refreshMarkAvailability(r);
    if (selectedRecord === r) window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:{id:r.el.id,title:r.labelInput.value || r.label}}));
    tell('The analysis updated ' + r.label + '. Figure edits were cleared; review the new result.'); changed();
  }
  function preserveHeatmapPresentation(r) {
    clearTimeout(r.appearanceTimer); r.appearancePending = false; r.appearanceGeneration = (r.appearanceGeneration || 0) + 1;
    r.editorSourceReset = true; r.replayPresentation = true; r.titleBaseline = null; r.axisBaseline = null;
    // Paper-anchored text is independent of data coordinates. Category labels
    // refer to the previous selection and cannot safely be replayed.
    if (r.visual.editor) delete r.visual.editor.categoryLabels;
    staleSnapshot(r); changed();
  }
  function applyAppearance(r) {
    var gd = r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot');
    if (!gd || !gd.data || !window.Plotly) { tell('Appearance editing is available after a Plotly plot loads.'); return Promise.resolve(); }
    var v = r.visual || {}, layout = {};
    if (v.plotTitle !== undefined) {
      if (!r.titleBaseline) {
        var originalTitle = gd.layout && gd.layout.title;
        r.titleBaseline = {text: typeof originalTitle === 'string' ? originalTitle : (originalTitle && originalTitle.text) || '',
          marginTop: gd.layout && gd.layout.margin && gd.layout.margin.t != null ? gd.layout.margin.t : null};
      }
      layout['title.text'] = v.plotTitle || r.titleBaseline.text;
      // Dashboard plots intentionally use a 10px top margin; reserve room for the new title.
      layout['margin.t'] = v.plotTitle ? Math.max(55, r.titleBaseline.marginTop || 0) : r.titleBaseline.marginTop;
    }
    if (v.xTitle !== undefined || v.yTitle !== undefined) {
      if (!r.axisBaseline) {
        function axisTitle(axis) { var t = gd.layout && gd.layout[axis] && gd.layout[axis].title; return typeof t === 'string' ? t : (t && t.text) || ''; }
        r.axisBaseline = {x:axisTitle('xaxis'), y:axisTitle('yaxis')};
      }
      if (v.xTitle !== undefined) layout['xaxis.title.text'] = v.xTitle || r.axisBaseline.x;
      if (v.yTitle !== undefined) layout['yaxis.title.text'] = v.yTitle || r.axisBaseline.y;
    }
    if (v.fontSize >= 8 && v.fontSize <= 48) layout['font.size'] = v.fontSize;
    if (v.fontColor) layout['font.color'] = v.fontColor;
    if (v.background) { layout.paper_bgcolor = v.background; layout.plot_bgcolor = v.background; }
    var change = Object.keys(layout).length ? window.Plotly.relayout(gd, layout) : Promise.resolve();
    return Promise.resolve(change).then(function () {
      if (v.markColor && scalarMarks(gd)) return window.Plotly.restyle(gd, {'marker.color': v.markColor}, [0]);
    }).then(function () { if (window.TeamPlotEditor && v.editor) return TeamPlotEditor.apply(gd,v.editor,{strictIdentity:true}); }).then(function () { refreshMarkAvailability(r); if (r.statistics && window.TeamCanvasStatistics) return TeamCanvasStatistics.draw(r); });
  }
  function restore(r) {
    if (!r.node) return false;
    if (!applyingRestore) editDuringHydration();
    // Every teardown step is guarded: a step that throws (a plot replaced by a re-analysis, an
    // editor or statistics panel in a bad state) is logged and reported, and the card still goes.
    var problems = r.teardownErrors = [];
    function step(name, fn) { try { fn(); } catch (error) { problems.push(name + ': ' + (error && error.message || error)); if (window.console) console.error('Canvas card teardown step failed (' + name + ')', error); } }
    if(r.instance)step('controls', function () { closeInstanceControls(document.getElementById(r.instance.id+'_host')); });
    // A library plot needs its original view to go back to. An independent copy has no view to
    // return to: it is removed and parked even when its hidden host is gone (it used to stay, unremovable).
    if (!r.home.isConnected && !r.instance) { tell('The original view changed; ' + r.label + ' remains on the canvas.'); return false; }
    if (!r.home.isConnected && r.target && window.Shiny && Shiny.unbindAll) { try { Shiny.unbindAll(r.target); } catch (ignore) {} }
    if (r.observer) step('observer', function () { r.observer.disconnect(); });
    if (r.plotEditor) { step('plot editor', function () { r.plotEditor.destroy(); }); r.plotEditor=null; }
    if (r.statistics && window.TeamCanvasStatistics) step('statistics', function () { TeamCanvasStatistics.detach(r); });
    step('finished figure', function () { restoreSnapshotSource(r); });
    // The frozen figure belongs to the card: a plot added again later is live, not "Finished" with an old image.
    if (r.preview) step('finished figure', function () { r.preview.remove(); }); r.preview = null; r.snapshot = null;
    // Module content parked by the shell goes home usable: clear the card-only marks.
    if (r.target) step('card marks', function () { r.target.querySelectorAll('.tc-figure-chrome,.tc-figure-park').forEach(function (el) { el.classList.remove('tc-figure-chrome', 'tc-figure-park'); el.inert = false; }); });
    // Card plots run with an explicit logical size; give the returned plot back its autosize.
    var returned = r.el && (r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot'));
    if (!r.instance && returned && returned.layout && returned.layout.autosize === false && window.Plotly) { try { window.Plotly.relayout(returned, {autosize: true, width: null, height: null}); } catch (ignore) {} }
    if(r.canvasCopyNote){r.canvasCopyNote.textContent=r.canvasCopyOriginal;r.canvasCopyNote=null;}
    step('plot height', function () { if (r.originalHeight) r.el.style.setProperty('height', r.originalHeight, r.originalHeightPriority); else r.el.style.removeProperty('height'); });
    // Essential: if the plot cannot go back to its view, the card keeps it (nothing is lost).
    if (r.home.isConnected) { try { r.home.replaceWith(r.target); } catch (error) { if (window.console) console.error('Canvas card could not return to its original view', error); tell(r.label + ' could not go back to its original view and remains on the canvas.'); return false; } }
    if (r.bar && r.barHome && r.barHome.isConnected) step('export controls', function () { r.barHome.replaceWith(r.bar); });
    r.node.remove(); r.node = null;
    // The card is gone: whatever fails from here, the save below still runs.
    if(r.instance){step('hidden event', function () { if(window.jQuery)jQuery(r.el).trigger('hidden'); });step('park', function () { parkInstance(r.instance.id); });
      // The parked host is removed by the server and Undo mounts a new record for the copy, so
      // the old graph and record are released now (a library plot keeps its record: it goes home).
      step('plot resources', function () { var gd = plotFor(r); if (gd && window.Plotly && Plotly.purge) Plotly.purge(gd); });
      if (records.get(r.el.id) === r) records.delete(r.el.id);}
    if (selectedRecord === r) { selectedRecord = null; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:null})); }
    step('canvas', function () { board.classList.toggle('has-nodes', !!board.querySelector('.tc-node')); expandBoard(); renderList(); });
    window.dispatchEvent(new Event('resize')); tell('Returned ' + r.label + ' to its original view.'); changed();
    if (problems.length) tell('Removed ' + r.label + ', but part of its cleanup failed (' + problems.join('; ') + '). Details are in the browser console.');
    return true;
  }
  // Remove/Return and an illustration's Remove. A person's click gets visible feedback from
  // canvas_feedback.js: the card fades out, the removal runs (unchanged: same state, same save),
  // then a toast offers Undo, which brings the card back from its saved node through the
  // checkpoint restore path. Scripted clicks (canvas_tabs.js deleting a tab) stay synchronous.
  function removeFromCanvas(r, event) {
    if (!r.node) return;
    var label = (r.labelInput && r.labelInput.value) || r.label, saved = null;
    // A library plot whose original view is gone cannot go back: say so at once (no fade, no "Returned" toast).
    if (!r.instance && !r.home.isConnected && window.TeamCanvasFeedback && event && event.isTrusted) { restore(r); TeamCanvasFeedback.refuse(r.node, {label:label, kind:'return'}); return; }
    try { saved = nodeState(r); } catch (ignore) {}
    // The removal runs after the fade: a checkpoint restored meanwhile may have mounted a new card
    // for this record, which must not be removed in its place.
    var node = r.node;
    removeWithFeedback(event, node, label, r.instance ? 'remove' : 'return', function () {
      if (!r.node || r.node !== node) return null;
      var ok = restore(r); if (ok && r.instance && !r.teardownErrors.length) tell('Removed ' + label + ' from the canvas.');
      return ok && r.teardownErrors.length ? {warning:'Part of its cleanup failed; details are in the browser console.'} : ok;
    }, saved, r.el.id);
  }
  function removeWithFeedback(event, node, label, kind, commit, saved, id) {
    var feedback = window.TeamCanvasFeedback, order = creationOrder.indexOf(id);
    if (!feedback || !event || !event.isTrusted) { commit(); return; }
    // The card's tab, figure-page selection and order, taken before the removal forgets them.
    var tabs = window.TeamCanvasTabs && TeamCanvasTabs.rememberCard ? TeamCanvasTabs.rememberCard(id) : null;
    // Its figure-page item (position, size, caption): the figure page drops it once the card is gone.
    var item = documentState && Array.isArray(documentState.items) ? documentState.items.find(function (i) { return i && i.type === 'figure' && i.nodeId === id; }) : null;
    item = item ? JSON.parse(JSON.stringify(item)) : null;
    feedback.remove(node, {id:id, label:label, kind:kind, keyboard:event.detail === 0, commit:commit, finished:!!(saved && saved.finished && saved.kind !== 'illustration'), undo:saved ? function () { return restoreSavedNode(saved, order, tabs, item); } : null});
  }
  // A finished figure brought back by a local Undo (Remove/Return, Return all, loading or not) is
  // never an archived checkpoint figure: it comes back out of date (stale), its frozen image shown,
  // and is exported again only after Edit, then Finish plot. Ids pending such a restore are kept
  // here until they mount or fail; a checkpoint restore clears them.
  var localUndoIds = new Set();
  function markLocalUndo(node) {
    if (node.kind === 'illustration') return;
    if (node.finished) node.finished.stale = true;
    localUndoIds.add(node.id);
  }
  function showSavedSnapshot(r, id, finished) {
    var local = localUndoIds.has(id); localUndoIds.delete(id);
    if (!local) { showSnapshot(r, {url:finished.url, createdAt:finished.createdAt, stale:finished.stale, provenance:finished.provenance, archived:true}); return; }
    showSnapshot(r, {url:finished.url, createdAt:finished.createdAt, stale:false, provenance:finished.provenance, undone:true});
    staleSnapshot(r);
    if (r.preview) r.preview.querySelector('.tc-snapshot-status').textContent = 'Restored by Undo. Choose Edit, then Finish plot, before exporting this figure again.';
  }
  // A loading copy restored by a local Undo that fails or times out leaves nothing behind: no saved
  // node, no figure slot. Returns true when it was such a request.
  function dropUndoRequest(request) {
    var saved = request && request.saved; if (!saved || !localUndoIds.has(saved.id)) return false;
    localUndoIds.delete(saved.id);
    if (restorePending.get(saved.id) === saved) { restorePending.delete(saved.id); creationOrder = creationOrder.filter(function (key) { return key !== saved.id; }); changed(); finishRestoreIfReady(); }
    return true;
  }
  // The figure-page item saved at removal goes back with its card (a default one the page may have
  // added meanwhile is replaced), and the figure page reloads the document.
  function restoreDocumentItem(id, item) {
    if (!item || !documentState || !Array.isArray(documentState.items)) return;
    var items = documentState.items.filter(function (i) { return !(i && i.type === 'figure' && i.nodeId === id); });
    if (items.length >= 80) return;
    var copy = JSON.parse(JSON.stringify(item)), base = copy.id, n = 1;
    while (items.some(function (i) { return i && i.id === copy.id; })) copy.id = base + '-' + n++;
    // Only when it fits the page as it is now (the page setup may have changed meanwhile): otherwise
    // the figure page places the card itself.
    var candidate = Object.assign({}, documentState, {items:items.concat([copy])});
    try { validateDocument(candidate, collectState().nodes); } catch (error) { return; }
    documentState.items = candidate.items;
    window.dispatchEvent(new CustomEvent('team-canvas-document-updated'));
  }
  function restoreSavedNode(saved, order, tabs, item) {
    var copy = JSON.parse(JSON.stringify(saved)), current = records.get(copy.id);
    if (copy.finished && copy.kind !== 'illustration') copy.finished.stale = true;
    if ((current && current.node) || illustrations.has(copy.id) || restorePending.has(copy.id) || (copy.instance && instanceRequests.has(copy.instance.id))) return false;
    if (figureCount() >= 40) { tell('This workspace supports 40 figures. Remove a figure before adding another.'); return false; }
    editDuringHydration();
    // Back in its place in the creation order (the figure page's default order).
    if (order >= 0 && creationOrder.indexOf(copy.id) < 0) creationOrder.splice(Math.min(order, creationOrder.length), 0, copy.id);
    var expect = window.TeamCanvasTabs && TeamCanvasTabs.expectCard ? TeamCanvasTabs.expectCard : function () {};
    expect(copy.id, tabs);
    var ok;
    localUndoIds.add(copy.id);
    if (copy.kind === 'illustration') ok = addIllustration(copy.assetId, copy);
    else if (copy.instance) {
      // Saved like a checkpoint's copy while it loads: every save holds it and it counts toward the 40.
      restorePending.set(copy.id, copy);
      ok = requestInstance(copy.instance.source, null, copy);
      if (ok) { tell('Restoring ' + copy.label + '…'); changed(); } else if (restorePending.get(copy.id) === copy) restorePending.delete(copy.id);
    }
    else { restorePending.set(copy.id, copy); hydratePending(); ok = !!(current && current.node); if (ok) { tell('Restored ' + copy.label + ' to the canvas.'); changed(); } else restorePending.delete(copy.id); }
    if (copy.kind === 'illustration' || !copy.instance) localUndoIds.delete(copy.id);
    if (!ok) { localUndoIds.delete(copy.id); creationOrder = creationOrder.filter(function (key) { return key !== copy.id; }); expect(copy.id, null); }
    else restoreDocumentItem(copy.id, item);
    return !!ok;
  }
  function unsafeSvgReference(value) {
    // Strip only exact, local URL references. Optional-quote negative
    // lookaheads can backtrack and reject safe url('#id') references.
    var withoutLocal = value.replace(/url\(\s*(['"]?)#[A-Za-z0-9_.:-]+\1\s*\)/gi, '');
    return /[\\@]|\/\*/.test(value) || /url\s*\(/i.test(withoutLocal) || /javascript:/i.test(value);
  }
  // checkedImage is a pure function of the URL text. The figure toolbar and column
  // read previewState() on every DOM-change frame while the Canvas draws its cards,
  // and each read re-parsed every finished SVG twice (about 30 s of main thread for
  // 16 cards). The verdict is remembered per exact URL; a bounded, insertion-ordered
  // LRU cache (64 entries, at most 32 Mi key characters in total) keeps memory flat.
  // Type and the 4 MiB limit are checked first; an oversized URL is never cached. A
  // rejection is remembered as a rejection only: the cached value is the exact boolean
  // the full check returned for that URL.
  var CHECKED_IMAGE_MAX = 4 * 1024 * 1024, CHECKED_IMAGE_ENTRIES = 64, CHECKED_IMAGE_BUDGET = 32 * 1024 * 1024;
  var checkedImageVerdicts = new Map(), checkedImageChars = 0;
  function checkedImage(url) {
    if (typeof url !== 'string' || url.length > CHECKED_IMAGE_MAX) return false;
    if (checkedImageVerdicts.has(url)) { var known = checkedImageVerdicts.get(url); checkedImageVerdicts.delete(url); checkedImageVerdicts.set(url, known); return known; }
    var verdict = checkedImageNow(url) === true;
    while (checkedImageVerdicts.size && (checkedImageVerdicts.size >= CHECKED_IMAGE_ENTRIES || checkedImageChars + url.length > CHECKED_IMAGE_BUDGET)) {
      var oldest = checkedImageVerdicts.keys().next().value; checkedImageVerdicts.delete(oldest); checkedImageChars -= oldest.length;
    }
    checkedImageVerdicts.set(url, verdict); checkedImageChars += url.length;
    return verdict;
  }
  function checkedImageNow(url) {
    if (typeof url !== 'string' || url.length > 4 * 1024 * 1024) return false;
    if (/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(url)) {
      try { var binary = atob(url.slice(url.indexOf(',') + 1)); return binary.length >= 33 && binary.slice(0,8) === '\x89PNG\r\n\x1a\n' && binary.slice(12,16) === 'IHDR'; } catch (e) { return false; }
    }
    if (!/^data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,/i.test(url)) return false;
    try {
      var comma=url.indexOf(','), header=url.slice(0,comma), payload=url.slice(comma+1), markup = /;base64$/i.test(header) ? atob(payload) : decodeURIComponent(payload);
      var doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      if (doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror, script, foreignObject, iframe, object, embed')) return false;
      if (Array.from(doc.querySelectorAll('style')).some(function (el) { return unsafeSvgReference(el.textContent); })) return false;
      return Array.from(doc.querySelectorAll('*')).every(function (el) {
        return Array.from(el.attributes).every(function (a) {
          var name = a.name.toLowerCase(), value = a.value.trim();
          if (name.indexOf('on') === 0) return false;
          if (name === 'href' || name === 'xlink:href') return value.charAt(0) === '#' || /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value);
          return !unsafeSvgReference(value);
        });
      });
    } catch (e) { return false; }
  }
  function documentForNodes(value,nodes) {
    if (!value) return null;
    var copy=JSON.parse(JSON.stringify(value));
    copy.items=copy.items.filter(function(i){return i.type==='text'||i.type==='shape'||nodes.some(function(n){return n.id===i.nodeId;});});
    return copy;
  }
  function validateDocument(value,nodes) {
    function fail(){throw new Error('Invalid saved document layout.');}
    function object(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(function(k){return !keys.includes(k);}))fail();}
    function number(v,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail();return v;}
    function text(v,max){if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))fail();return v;}
    object(value,['version','layout','paper','orientation','items','paperWidth','paperHeight','showPageFurniture']);
    if(value.version!=='1'||!['free','pages','arrangement','figure1'].includes(value.layout)||!['letter','a4','custom'].includes(value.paper)||!['portrait','landscape'].includes(value.orientation)||!Array.isArray(value.items)||value.items.length>80)fail();
    if(value.showPageFurniture!==undefined && typeof value.showPageFurniture!=='boolean')fail();
    var dims;if(value.paper==='custom')dims=[number(value.paperWidth,100,3000),number(value.paperHeight,100,3000)];else {if(value.paperWidth!==undefined||value.paperHeight!==undefined)fail();dims=value.paper==='a4'?[595.28,841.89]:[612,792];if(value.orientation==='landscape')dims.reverse();}
    var ids=new Set(),items=value.items.map(function(i){
      var keys=['id','type','x','y','width','height','z'];
      object(i,keys.concat(i.type==='text'?['text','fontSize','color']:i.type==='shape'?['shape','fill','stroke','strokeWidth','radius']:['nodeId','caption']));
      if(!['figure','text','shape'].includes(i.type)||typeof i.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(i.id)||ids.has(i.id))fail();ids.add(i.id);
      var out={id:i.id,type:i.type,x:number(i.x,0,dims[0]),y:number(i.y,0,dims[1]),width:number(i.width,20,dims[0]),height:number(i.height,20,dims[1]),z:number(i.z,0,10000)};
      if(!Number.isInteger(out.z)||out.x+out.width>dims[0]+0.01||out.y+out.height>dims[1]+0.01)fail();
      if(i.type==='figure'){if(!nodes.some(function(n){return n.id===i.nodeId;}))fail();out.nodeId=i.nodeId;out.caption=text(i.caption,1000);}
      else if(i.type==='text') {out.text=text(i.text,2000);out.fontSize=number(i.fontSize,6,72);if(typeof i.color!=='string'||!/^#[0-9a-f]{6}$/i.test(i.color))fail();out.color=i.color;}
      else {
        if(!['rectangle','ellipse','line','arrow'].includes(i.shape))fail();
        ['fill','stroke'].forEach(function(key){if(typeof i[key]!=='string'||(i[key]!=='none'&&(i[key].length!==7||!/^#[0-9a-f]{6}$/i.test(i[key]))))fail();out[key]=i[key].toLowerCase();});
        out.shape=i.shape;out.strokeWidth=number(i.strokeWidth,0,20);
        if(i.radius!==undefined){out.radius=number(i.radius,0,100);if(['line','arrow'].includes(i.shape))fail();}
      }
      return out;
    });
    var output={version:'1',layout:value.layout,paper:value.paper,orientation:value.orientation,items:items};if(value.showPageFurniture!==undefined)output.showPageFurniture=value.showPageFurniture;if(value.paper==='custom'){output.paperWidth=dims[0];output.paperHeight=dims[1];}return output;
  }
  function validateInsight(value) {
    function fail(){throw new Error('Invalid saved scientific insight.');}
    var fields=['paragraph','context_label','searched_at','fingerprint','sources','stale'];
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(function(k){return !Object.prototype.hasOwnProperty.call(value,k);}))fail();
    [['paragraph',1800],['context_label',1000],['searched_at',80],['fingerprint',64]].forEach(function(rule){var v=value[rule[0]];if(typeof v!=='string'||!v.length||v.length>rule[1])fail();});
    if(/[<>]/.test(value.paragraph)||!/^[a-f0-9]{64}$/i.test(value.fingerprint)||typeof value.stale!=='boolean'||!Array.isArray(value.sources)||value.sources.length>3)fail();
    var sources=value.sources.map(function(s){
      if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join(',')!=='pmid,title,url,year'||typeof s.pmid!=='string'||!/^[1-9][0-9]{0,9}$/.test(s.pmid)||typeof s.title!=='string'||!s.title.length||s.title.length>500||/[<>]/.test(s.title)||typeof s.year!=='string'||!/^([0-9]{4})?$/.test(s.year)||s.url!=='https://pubmed.ncbi.nlm.nih.gov/'+s.pmid+'/')fail();
      return {pmid:s.pmid,title:s.title,year:s.year,url:s.url};
    });
    return {paragraph:value.paragraph,context_label:value.context_label,searched_at:value.searched_at,fingerprint:value.fingerprint,sources:sources,stale:value.stale};
  }
  function validateGroupComparison(value) {
    function fail(){throw new Error('Invalid saved group comparison settings.');}
    function object(x){return !!x && typeof x==='object' && !Array.isArray(x);}
    function name(x){return typeof x==='string' && x.length>0 && x.length<=500 && !/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x) && !['__proto__','prototype','constructor'].includes(x);}
    function list(x,max){if(!Array.isArray(x)||x.length>max||x.some(function(v){return !name(v);})||new Set(x).size!==x.length)fail();return x.slice();}
    function map(x,max){if(!object(x)||Object.keys(x).length>max||Object.keys(x).some(function(k){return !name(k);}))fail();}
    if(!object(value)||Object.keys(value).sort().join(',')!=='features,hiddenConditions,panelOff,panelStyles'||new TextEncoder().encode(JSON.stringify(value)).length>65536)fail();
    var out={features:list(value.features,500),hiddenConditions:list(value.hiddenConditions,100),panelOff:Object.create(null),panelStyles:Object.create(null)};
    map(value.panelOff,500); Object.keys(value.panelOff).forEach(function(k){out.panelOff[k]=list(value.panelOff[k],100);});
    map(value.panelStyles,500); Object.keys(value.panelStyles).forEach(function(k){var s=value.panelStyles[k];if(!object(s)||Object.keys(s).some(function(key){return !['box','colors','points','lines'].includes(key);})||!Object.prototype.hasOwnProperty.call(s,'colors')||typeof s.box!=='boolean'||typeof s.points!=='boolean')fail();function colorMap(m){map(m,100);var result=Object.create(null);Object.keys(m).forEach(function(c){if(typeof m[c]!=='string'||!/^#[0-9a-f]{6}$/i.test(m[c]))fail();result[c]=m[c];});return result;}var style={colors:colorMap(s.colors),points:s.points,box:s.box};if(s.lines!==undefined)style.lines=colorMap(s.lines);out.panelStyles[k]=style;});
    return out;
  }
  function validateState(state) {
    if (state == null) return {version:'1',libraryHidden:false,nodes:[]};
    if (typeof state !== 'object' || !['1',1].includes(state.version) || typeof state.libraryHidden !== 'boolean' || !Array.isArray(state.nodes) || state.nodes.length > 40) throw new Error('Invalid saved figure workspace.');
    var ids = new Set(), keys = ['plotTitle','xTitle','yTitle','fontSize','fontColor','markColor','background'];
    var nodes = state.nodes.map(function (n) {
      if (!n || typeof n.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,159}$/.test(n.id) || ids.has(n.id) || typeof n.label !== 'string' || n.label.length > 512) throw new Error('Invalid saved plot identity.');
      ids.add(n.id);
      ['x','y','width','height'].forEach(function (key) { if (!Number.isFinite(n[key]) || n[key] < 0 || n[key] > (key === 'x' || key === 'y' ? 1000000 : 4000)) throw new Error('Invalid saved figure size or position.'); });
      if (n.width < 240 || n.height < 220 || !n.visual || typeof n.visual !== 'object' || (Array.isArray(n.visual) && n.visual.length !== 0)) throw new Error('Invalid saved plot settings.');
      var kind = n.kind === 'illustration' ? 'illustration' : 'plot';
      var assetId = null, illustrationColor = null;
      if (kind === 'illustration') {
        if (n.assetVersion !== '1') throw new Error('Unsupported illustration asset version.');
        if (typeof n.assetId !== 'string' || !illustrationEntry(n.assetId) || typeof n.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(n.color)) throw new Error('Invalid saved illustration.');
        assetId = n.assetId; illustrationColor = n.color.toLowerCase();
      }
      var visual = {};
      keys.forEach(function (key) {
        if (n.visual[key] == null) return;
        var value = n.visual[key];
        if (key === 'fontSize') { if (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 48) throw new Error('Invalid saved font size.'); }
        else if (typeof value !== 'string' || value.length > 1000 || (['fontColor','markColor','background'].includes(key) && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value))) throw new Error('Invalid saved plot appearance.');
        visual[key] = value;
      });
      if (n.visual.editor != null) {
        if (kind !== 'plot' || !window.TeamPlotEditor) throw new Error('The saved plot editor is unavailable.');
        visual.editor = TeamPlotEditor.sanitize(n.visual.editor);
      }
      if (n.visual.groupComparison != null) {
        if (kind !== 'plot' || !n.instance || n.instance.source !== 'group_comparison_tab-comparisonPlot') throw new Error('Invalid group comparison owner.');
        visual.groupComparison=validateGroupComparison(n.visual.groupComparison);
      }
      var finished = null;
      if (n.finished != null) {
        if (!n.finished || typeof n.finished !== 'object' || !checkedImage(n.finished.url) || typeof n.finished.createdAt !== 'string' || n.finished.createdAt.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n.finished.createdAt) || !Number.isFinite(Date.parse(n.finished.createdAt)) || typeof n.finished.stale !== 'boolean') throw new Error('Invalid saved figure image.');
        finished = {url:n.finished.url, createdAt:n.finished.createdAt, stale:n.finished.stale};
        if (kind === 'illustration' && n.finished.stale) throw new Error('Illustration snapshots cannot be stale.');
        if (n.finished.provenance != null) {
          var provenance = n.finished.provenance;
          if (typeof provenance !== 'object' || Array.isArray(provenance) || Object.keys(provenance).length > 16) throw new Error('Invalid saved figure provenance.');
          finished.provenance = {};
          Object.keys(provenance).forEach(function (key) {
            var value = provenance[key];
            if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !(value === null || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 1000) || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15))) throw new Error('Invalid saved figure provenance.');
            finished.provenance[key] = value;
          });
        }
      }
      var normalized = {id:n.id,label:n.label,x:Math.round(n.x),y:Math.round(n.y),width:Math.round(n.width),height:Math.round(n.height),visual:visual,finished:finished};
      if(n.instance!=null){if(!n.instance||typeof n.instance.id!=='string'||!/^tcinstance_[a-z0-9_]{1,80}$/.test(n.instance.id)||!instanceSupported(n.instance.source)||n.id!==n.instance.id+'-'+n.instance.source.slice(n.instance.source.indexOf('-')+1)||!n.instance.inputs||typeof n.instance.inputs!=='object'||Array.isArray(n.instance.inputs)||Object.keys(n.instance.inputs).length>250||JSON.stringify(n.instance.inputs).length>512*1024)throw new Error('Invalid independent plot settings.');normalized.instance=JSON.parse(JSON.stringify(n.instance));}
      if (n.statistics != null) { if (!normalized.instance || normalized.instance.source !== 'results_dashboard-plot_violin' || !window.TeamCanvasStatistics) throw new Error('Invalid saved violin statistics.'); try { normalized.statistics = TeamCanvasStatistics.sanitize(n.statistics); } catch (e) { throw new Error('Invalid saved violin statistics.'); } }
      if (n.insight != null) { if(kind !== 'plot') throw new Error('Illustrations cannot have scientific insights.'); normalized.insight=validateInsight(n.insight); }
      if (kind === 'illustration') { normalized.kind = 'illustration'; normalized.assetVersion = '1'; normalized.assetId = assetId; normalized.color = illustrationColor; }
      return normalized;
    });
    var result={version:'1',libraryHidden:state.libraryHidden,nodes:nodes};
    if (state.document != null) result.document=validateDocument(state.document,nodes);
    // Optional canvas tabs (versioned). A bad or unknown field falls back to one tab.
    if (state.tabs != null && window.TeamCanvasTabsModel) { var tabs=TeamCanvasTabsModel.serialize(TeamCanvasTabsModel.validate(state.tabs,nodes.map(function(n){return n.id;})),nodes.map(function(n){return n.id;})); if (tabs) result.tabs=tabs; }
    return result;
  }
  function nodeState(r, keysByNamespace) {
    var n = r.node, snap = r.snapshot, finished = null;
    if (snap) { finished = {url:snap.url,createdAt:snap.createdAt,stale:!!snap.stale}; if (snap.provenance) finished.provenance = snap.provenance; }
    var state={id:r.el.id,label:r.labelInput.value || r.label,x:parseFloat(n.style.left)||0,y:parseFloat(n.style.top)||0,width:parseFloat(n.style.width)||parseFloat(getComputedStyle(n).width)||620,height:parseFloat(n.style.height)||parseFloat(getComputedStyle(n).height)||720,visual:Object.assign({},r.visual),finished:finished,insight:r.insight || null};
    if(r.instance)state.instance={id:r.instance.id,source:r.instance.source,inputs:restoredInputs(r,instanceValues(r.instance.id,r.allowedInputs,keysByNamespace))};
    if(r.statistics&&window.TeamCanvasStatistics)state.statistics=TeamCanvasStatistics.serialize(r);
    return state;
  }
  // A restored copy's control can still be empty when a save is taken (its saved value has not
  // reached the browser yet). For 60 s after it is shown, an empty control saves its saved
  // value instead, so an autosave never replaces a saved setting with nothing. Any value the
  // control does have (the analyst's edit or a valid fallback) is saved as it is.
  function emptyInputValue(x){return x==null||x===''||(Array.isArray(x)&&!x.length);}
  function restoredInputs(r,live){
    var saved=r.savedInputs;if(!saved)return live;
    if(Date.now()>r.savedInputsUntil){r.savedInputs=null;return live;}
    var out=Object.assign({},live);
    Object.keys(saved).forEach(function(key){if(emptyInputValue(out[key])&&!emptyInputValue(saved[key]))out[key]=saved[key];});
    return out;
  }
  function trackRestoredInputs(r,saved){
    r.savedInputs=JSON.parse(JSON.stringify(saved||{}));r.savedInputsUntil=Date.now()+60000;
    if(!Object.keys(r.savedInputs).length)r.savedInputs=null;
  }
  // A new copy (Add, Duplicate, Paste) still Generating has no record yet, only its request and
  // skeleton card. A save keeps it as a saved copy (its sent inputs, the skeleton's place), so a
  // checkpoint taken before it mounts restores it instead of losing it. A node that fails validation
  // is left out rather than failing the whole save.
  function pendingCopyNodes(existing) {
    var ids = new Set(existing.map(function (n) { return n.id; })), out = [];
    instanceRequests.forEach(function (request) {
      var ph = request.placeholder, inst = request.instance;
      if (request.saved || !ph || !ph.isConnected || ph.classList.contains('is-failed')) return;
      var id = inst.id + '-' + inst.source.slice(inst.source.indexOf('-') + 1);
      if (ids.has(id) || (records.get(id) && records.get(id).node)) return;
      var copy = request.copy || {};
      var n = {id:id, label:copy.label || plotTitle(inst.source), x:parseFloat(ph.style.left) || 0, y:parseFloat(ph.style.top) || 0, width:parseFloat(ph.style.width) || 620, height:parseFloat(ph.style.height) || 720, visual:copy.visual || {}, finished:null, insight:null, instance:{id:inst.id, source:inst.source, inputs:inst.inputs || {}}};
      try { out.push(validateState({version:'1', libraryHidden:false, nodes:[n]}).nodes[0]); ids.add(id); } catch (e) {}
    });
    return out;
  }
  // checkSize=false only for display reads (figure list/toolbar); saves and export keep the 24 MiB check.
  function collectState(checkSize) {
    var keysByNamespace = new Map();
    Object.keys(window.Shiny && Shiny.shinyapp && Shiny.shinyapp.$inputValues || {}).forEach(function (key) { var end = key.indexOf('-'); if (end < 0) return; var ns = key.slice(0, end); if (!keysByNamespace.has(ns)) keysByNamespace.set(ns, []); keysByNamespace.get(ns).push(key); });
    var nodes = Array.from(records.values()).filter(function (r) { return !!r.node; }).map(function (r) { return nodeState(r, keysByNamespace); }).concat(Array.from(illustrations.values()).map(illustrationNodeState));
    restorePending.forEach(function (n) { nodes.push(n); });
    nodes.sort(function(a,b){return creationOrder.indexOf(a.id)-creationOrder.indexOf(b.id);});
    pendingCopyNodes(nodes).forEach(function (n) { nodes.push(n); });
    var raw = {version:'1', libraryHidden:root.querySelector('.tc-layout').classList.contains('tc-library-hidden'), nodes:nodes, document:documentForNodes(documentState,nodes)};
    var tabs = window.TeamCanvasTabs ? TeamCanvasTabs.serialize(nodes.map(function(n){return n.id;})) : null; if (tabs) raw.tabs = tabs;
    var result = validateState(raw);
    if (checkSize !== false && new TextEncoder().encode(JSON.stringify(result)).length > 24 * 1024 * 1024) throw new Error('The figure workspace is too large to save. Remove or resize a saved figure.');
    return result;
  }
  // Presentation-only geometry history. Never replay scientific instance inputs,
  // prepared data, frozen-image validity, or server restore messages.
  var geometryPast = [], geometryFuture = [], geometryLast = null, geometryReplay = false, geometryGesture = false;
  function geometryState() {
    var state=Array.from(board.querySelectorAll('.tc-node')).map(function(node) {
      return {node:node, left:node.style.left, top:node.style.top, width:node.style.width, height:node.style.height};
    });
    state.tabs=window.TeamCanvasTabs?TeamCanvasTabs.snapshot():null;
    return state;
  }
  function sameGeometry(a,b) {
    return a.tabs===b.tabs && a.length===b.length && a.every(function(value,i) { return value.node===b[i].node && ['left','top','width','height'].every(function(key){return value[key]===b[i][key];}); });
  }
  function rememberGeometry() {
    if (!board || geometryReplay || geometryGesture) return;
    var next=geometryState();
    // Removing/restoring nodes clears history; additions retain the prior layout
    // without ever destroying or recreating a scientific plot on replay.
    if (!geometryLast || geometryLast.some(function(value){return !next.some(function(item){return item.node===value.node;});})) {
      geometryPast=[]; geometryFuture=[];
    } else if (!sameGeometry(next,geometryLast)) {
      geometryPast.push(geometryLast); if(geometryPast.length>50)geometryPast.shift(); geometryFuture=[];
    }
    geometryLast=next;
  }
  function replayGeometry(redo) {
    // A keyboard resize burst still open is recorded first, so Undo reverts it.
    flushKeyBurst();
    // An overlap settle still waiting for its frame belongs to the last action: Undo reverts it too.
    if (settleQueue) runSettle();
    rememberGeometry();
    var from=redo?geometryFuture:geometryPast, to=redo?geometryPast:geometryFuture;
    if (!from.length) return false;
    var next=from.pop(); to.push(geometryLast); geometryReplay=true;
    try {
      if(next.tabs && window.TeamCanvasTabs && next.tabs!==geometryLast.tabs)TeamCanvasTabs.applySnapshot(next.tabs);
      next.forEach(function(value){['left','top','width','height'].forEach(function(key){value.node.style[key]=value[key];});});
      // New figures remain alive when undoing the layout change caused by an
      // addition. Park them in free rows below all restored surviving cards.
      var retained=new Set(next.map(function(value){return value.node;})), bottom=30;
      next.forEach(function(value){bottom=Math.max(bottom,value.node.offsetTop+value.node.offsetHeight+30);});
      geometryState().forEach(function(value){if(retained.has(value.node))return;value.node.style.left='30px';value.node.style.top=bottom+'px';bottom+=value.node.offsetHeight+30;});
      geometryLast=geometryState(); expandBoard(); records.forEach(function(record){if(record.node)resize(record);}); changed();
    } finally { geometryReplay=false; }
    tell(redo?'Redid the last canvas change.':'Undid the last canvas change.'); return true;
  }
  // Display-only readers (figure toolbar, figure column, plot picker) share one
  // previewState() per animation frame; any canvas change drops the shared result.
  // Preview and export capture keep calling previewState() directly (always fresh).
  var framePreview = null, framePreviewTimer = 0;
  function dropFramePreview() { framePreview = null; if (framePreviewTimer) { cancelAnimationFrame(framePreviewTimer); framePreviewTimer = 0; } }
  function changed() {
    dropFramePreview();
    if (applyingRestore) return;
    rememberGeometry();
    syncEpoch++; clearTimeout(syncTimer);
    // Team autosave listens to this lightweight signal.  It intentionally carries
    // no data; the validated canvas state is collected only when a save starts.
    // Mounting a restored copy is hydration even after an edit: the copy already
    // sits in every save as its saved node. A due background send is kept.
    var hydrating = lazyHydrationQuiet() || mountingDeferred;
    if (hydrating) hydrationChanges++; else if (restoreReceipt) editedDuringRestore = true;
    window.dispatchEvent(new CustomEvent('team-canvas-changed', {detail:hydrating ? {epoch:syncEpoch, restoreHydration:true} : {epoch:syncEpoch}}));
    if (!checkpointActive && (!hydrating || (backgroundDue && !lazyHydrationQuiet()))) { backgroundDue = true; syncTimer = setTimeout(function () { sendBackground(); }, 350); }
  }
  // Changes other than hydration. A capture stays valid while restored copies
  // mount: each moves from its saved node to an equal mounted card.
  var hydrationChanges = 0, backgroundDue = false;
  function editEpoch() { return syncEpoch - hydrationChanges; }
  async function settledState() {
    // A copy still loading is saved without waiting: a restored one as its saved node,
    // a new one (still Generating) as pendingCopyNodes builds it.
    for (var i=0; i<10; i++) {
      var epoch = editEpoch(), active = Array.from(records.values()).filter(function (r) { return !!r.node; });
      var finishes = await Promise.all(active.map(function (r) { return r.finishPromise || Promise.resolve(true); }));
      if (finishes.some(function (ok) { return ok === false; })) throw new Error('A figure could not be finished. Review it before saving.');
      await Promise.all(active.map(flushAppearance));
      if (epoch === editEpoch()) return {state:collectState(),epoch:epoch};
    }
    throw new Error('The figure workspace is still changing. Try saving again.');
  }
  function token() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  function sendBackground() {
    if (checkpointActive || !window.Shiny || !Shiny.setInputValue) return;
    backgroundDue = false;
    settledState().then(function (captured) {
      if (checkpointActive || captured.epoch !== editEpoch() || lazyHydrationQuiet()) return;
      var key = JSON.stringify(captured.state);
      if (key === serverStateKey) return;
      var id = token(); backgroundKeys.clear(); backgroundKeys.set(id, key); serverStateKey = null;
      Shiny.setInputValue('team_canvas_state', {token:id,state:captured.state}, {priority:'event'});
    }).catch(function (e) { tell(e.message || 'Could not prepare the figure workspace.'); });
  }
  async function checkpoint() {
    if (!window.Shiny || !Shiny.setInputValue) throw new Error('The workspace is not connected.');
    if (checkpointActive) throw new Error('A figure workspace save is already in progress.');
    checkpointActive = true; clearTimeout(syncTimer); var succeeded = false;
    try {
      for (var i=0; i<10; i++) {
        var captured = await settledState(), id = token();
        var ack = new Promise(function (resolve,reject) {
          var timeout = setTimeout(function () { ackWaiters.delete(id); reject(new Error('Timed out saving the figure workspace.')); }, 15000);
          ackWaiters.set(id, function (message) { clearTimeout(timeout); if (message.ok) resolve(message); else reject(new Error(message.message || 'Could not save the figure workspace.')); });
        });
        backgroundKeys.clear(); serverStateKey = null;
        Shiny.setInputValue('team_canvas_state', {token:id,state:captured.state}, {priority:'event'});
        await ack;
        try { serverStateKey = JSON.stringify(captured.state); } catch (error) { serverStateKey = null; }
        if (captured.epoch === editEpoch()) { succeeded = true; backgroundDue = false; return {token:id}; }
      }
      throw new Error('The figure workspace kept changing while saving. Try again.');
    } finally {
      checkpointActive = false;
      if (!succeeded) { clearTimeout(syncTimer); syncTimer = setTimeout(sendBackground,350); }
    }
  }
  function hydratePending() {
    if (!restorePending.size) return;
    var waiting = [], waitingLoading = [], withheld = [];
    restorePending.forEach(function (saved, id) {
      var blocked=blockedPlot(id);
      if (blocked) { restorePending.delete(id); withheld.push(saved.label || plotTitle(id)); return; }
      // Queued or loading restored copies are not missing: they mount progressively.
      if (deferredNodes.has(id) && saved.instance && deferredQueue.indexOf(id) >= 0) return;
      var r = records.get(id);
      if (saved.instance && instanceRequests.has(saved.instance.id)) { waiting.push(saved.label); waitingLoading.push(true); return; }
      if (!r || !r.el.isConnected || (r.dynamic && !r.wrapper) || (dynamicOutput(r.el) && !r.wrapper)) { waiting.push(saved.label); waitingLoading.push(false); return; }
      applyingRestore = true;
      try {
        r.largeHeatmapAdapted=true;r.squareHeatmapAdapted=true;
        r.insight = saved.insight ? validateInsight(saved.insight) : null;
        r.visual = Object.assign({}, saved.visual); r.hydrating = true; r.statisticsSaved = saved.statistics || null; add(r);
        if (!r.node) { waiting.push(saved.label); waitingLoading.push(false); return; }
        r.node.style.left = saved.x + 'px'; r.node.style.top = saved.y + 'px'; r.node.style.width = saved.width + 'px'; r.node.style.height = saved.height + 'px';
        r.labelInput.value = saved.label; r.labelHeading.textContent = saved.label; r.displayTitle = saved.label;
        r.editInputs.forEach(function (input) { var key = input.dataset.visualKey; if (saved.visual[key] !== undefined) input.value = saved.visual[key]; });
        if (saved.visual.background) { r.backgroundInput.value = saved.visual.background; r.content.style.backgroundColor = saved.visual.background; }
        if (saved.finished) showSavedSnapshot(r, id, saved.finished); else localUndoIds.delete(id);
        if (deferredNodes.has(id)) {
          placeInCreationOrder(r.node, id); deferredNodes.delete(id);
          // The tabs observer reports this insertion once, in this task's mutation-observer
          // microtask (queued before the one below): that one report is hydration. The
          // notice is consumed by it, or cleared right after, so no later edit can use it.
          if (!mountNotice) { mountNotice = true; queueMicrotask(function () { mountNotice = false; }); }
        }
        restorePending.delete(id); expandBoard();
      } finally { applyingRestore = false; }
    });
    // Copies still loading are not reported (they appear as they mount); figures whose
    // analysis is not available are, once, in plain words, never under the opening dialog.
    var awaitingNow = waiting.filter(function (label, i) { return !waitingLoading[i]; });
    // (Before the Canvas is first shown after this restore, the opening reports them.)
    // Without a busy dialog on the page, each pass names them again (as before the dialog
    // existed): a card's own "Added" message must not hide the ones still awaiting.
    if (awaitingNow.length && !gate && !window.TeamBusy) { gateAwaitingTold = ''; gateTellAwaiting(awaitingNow); }
    else if (awaitingNow.length && !gate && gateGeneration === restoreGeneration) gateTellAwaiting(awaitingNow);
    if (withheld.length) { restoreStatus('failed'); tell('Skipped saved plot' + (withheld.length===1?'':'s') + ' with unvalidated scale: ' + withheld.join(', ') + '. Use Dashboard → Feature distributions while this view is checked.'); }
    finishRestoreIfReady();
  }
  function restoreState(input, receipt, localUndo) {
    // A Return all question still open describes the old canvas.
    var openReset = document.querySelector('.tc-reset-confirm'); if (openReset) openReset.remove();
    // Restore replaces nodes and illustrations directly (applyingRestore): drop the shared display read first.
    dropFramePreview();
    restoreReceipt = typeof receipt === 'string' && receipt ? receipt : null;
    restoreGeneration++;
    restoreFailed = false; restoreBuilding = true; restoreStatus('pending');
    stopDeferredRestore(); serverStateKey = null;
    var serverCopy = !!restoreReceipt && input != null;
    if (!localUndo) localUndoIds.clear();
    var state = validateState(input);
    // A local Undo (Return all): every finished figure comes back stale, never archived.
    if (localUndo) state.nodes.forEach(markLocalUndo);
    creationOrder=state.nodes.map(function(node){return node.id;});
    // The opening dialog reacts to errors of this restore's figures only.
    gateRestoreIds=new Set(); state.nodes.forEach(function(node){gateRestoreIds.add(node.id);if(node.instance&&node.instance.id)gateRestoreIds.add(node.instance.id+'-');});
    geometryPast=[]; geometryFuture=[]; geometryLast=null;
    instanceRequests.forEach(function(request){clearTimeout(request.timer);parkInstance(request.instance.id);});instanceRequests.clear();
    var cancelled=clearAllQueuedAdds();
    var withheld=[];
    state.nodes=state.nodes.filter(function (node) { var blocked=blockedPlot(node.id); if (!blocked) return true; withheld.push(node.label || plotTitle(node.id)); return false; });
    clearTimeout(syncTimer); applyingRestore = true;
    try {
      records.forEach(function (r) {
        if (r.node) { restore(r); if (r.node) throw new Error('Could not return an existing plot to its original view.'); }
        clearTimeout(r.appearanceTimer); r.appearancePending = false; r.appearanceGeneration = (r.appearanceGeneration || 0) + 1;
        if (r.renderObserver) r.renderObserver.disconnect(); r.settleRender = null; r.renderRevision = null; r.revision = (r.revision || 0) + 1;
        r.insight = null; r.visual = {}; r.hydrating = false; r.titleBaseline = null; r.axisBaseline = null; r.sourceSignature = null;
        if (r.equivalentObserver) r.equivalentObserver.disconnect();
      });
      illustrations.forEach(function (r) { if (r.observer) r.observer.disconnect(); if (r.node) r.node.remove(); }); illustrations.clear(); dropFramePreview();
      documentState=state.document || null;
      restorePending.clear(); state.nodes.forEach(function (n) { restorePending.set(n.id,n); });
      // In the Team shell the Plot library is a rail panel: it opens collapsed and then follows the
      // person's own choice this session, so a restored checkpoint's saved library state is not applied.
      var layout = root.querySelector('.tc-layout'), toggle = root.querySelector('.tc-library-toggle');
      var hidden = root.classList.contains('ts-shell') ? layout.classList.contains('tc-library-hidden') : state.libraryHidden;
      layout.classList.toggle('tc-library-hidden', hidden); toggle.setAttribute('aria-expanded', String(!hidden)); toggle.textContent = hidden ? 'Show library' : 'Hide library';
    } finally { applyingRestore = false; }
    // One request per instance namespace. A second node with a namespace already
    // queued (both pass validation: node ids differ) is not requested: it stays in
    // restorePending as saved and the restore fails (an immediate restore failed
    // creating it: the namespace already belongs to another plot).
    var namespaces = new Set(), duplicated = [];
    state.nodes.forEach(function(n){if(!n.instance)return;if(namespaces.has(n.instance.id)){duplicated.push(n.label||n.id);return;}namespaces.add(n.instance.id);deferredNodes.add(n.id);deferredQueue.push(n.id);});
    syncEpoch++; hydratePending(); expandBoard();
    // Saved geometry lets the viewport frame the workspace before the plots arrive.
    // Tabs first: the camera frames the active tab's cards only (all cards without tabs).
    var shownFirst = window.TeamCanvasTabs ? TeamCanvasTabs.restore(state.tabs || null, state.nodes.map(function (n) { return n.id; })) : null;
    window.dispatchEvent(new CustomEvent('team-canvas-restored', {detail:{nodes:state.nodes.filter(function (n) { return !shownFirst || shownFirst.indexOf(n.id) >= 0; }).map(function (n) { return {x:n.x, y:n.y, width:n.width, height:n.height}; })}}));
    // An Undo of Return all plots is a person's edit, not a loaded checkpoint (autosave.js saves it).
    window.dispatchEvent(localUndo ? new CustomEvent('team-document-restored', {detail:{localUndo:true}}) : new Event('team-document-restored'));
    state.nodes.filter(function (n) { return n.kind === 'illustration'; }).forEach(function (n) { restorePending.delete(n.id); if(!addIllustration(n.assetId,n)) restoreStatus('failed'); });
    restoreBuilding = false;
    // A restore sent by the server (canvas_state.R team_canvas_import) leaves it
    // holding exactly this checkpoint: echoing it back unchanged is skipped.
    try { serverStateKey = serverCopy && !withheld.length ? JSON.stringify(collectState()) : null; } catch (error) { serverStateKey = null; }
    if (withheld.length || duplicated.length) restoreStatus('failed'); else finishRestoreIfReady();
    if (duplicated.length) tell('Saved plot' + (duplicated.length===1?'':'s') + ' sharing another plot’s independent settings could not be restored: ' + duplicated.join(', ') + '.');
    else if (withheld.length) tell('Skipped saved plot' + (withheld.length===1?'':'s') + ' with unvalidated scale: ' + withheld.join(', ') + '. Use Dashboard → Feature distributions while this view is checked.');
    else if (cancelled.length) tell('Saved figure workspace restored. Cleared queued adds for ' + cancelled.join(', ') + '. Saved figures are archived until edited.');
    else if (!restorePending.size) tell('Saved figure workspace restored. Saved figures are archived until edited.');
    editedDuringRestore = false; startDeferredRestore();
    // A restore while the Canvas is shown opens the dialog now (otherwise: on showing it).
    if (canvasShown()) gateOpen();
  }
  function init() {
    root = document.getElementById('team-canvas-root'); if (!root) return;
    board = root.querySelector('.tc-board'); list = root.querySelector('.tc-list'); status = root.querySelector('.tc-status'); search = root.querySelector('.tc-search');
    restoreRetryButton = document.createElement('button'); restoreRetryButton.type = 'button'; restoreRetryButton.hidden = true;
    restoreRetryButton.className = 'tc-restore-retry'; restoreRetryButton.textContent = 'Retry saved workspace';
    status.insertAdjacentElement('afterend', restoreRetryButton);
    restoreRetryButton.addEventListener('click', function () {
      if (!restoreReceipt || !window.Shiny) return;
      restoreRetryButton.disabled = true; tell('Retrying the saved figure workspace…');
      Shiny.setInputValue('team_canvas_restore_retry', {token:restoreReceipt}, {priority:'event'});
    });
    window.addEventListener('team-canvas-server-restore-status', function (event) {
      var message=event.detail || {};
      if (typeof message.token !== 'string' || !message.token) return;
      if (message.status === 'pending') { restoreReceipt=message.token; restoreFailed=false; restoreRetryButton.hidden=true; restoreRetryButton.disabled=false; }
      else if (message.status === 'failed' && restoreReceipt === message.token) { restoreFailed=true; showRestoreRetry(); }
    });
    var instanceStyle=document.createElement('style');instanceStyle.textContent='.tc-instance-host.is-open{position:fixed;z-index:11000;overflow:auto;background:white;border:1px solid #ccd6da;border-radius:12px;box-shadow:0 10px 45px #22334444;padding:16px}.tc-instance-panel-head{display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;background:white;padding-bottom:12px}.tc-instance-panel-head{gap:12px;color:#172d4b}.tc-instance-panel-head strong{font:600 14px/1.4 system-ui;flex:1;overflow-wrap:anywhere}.tc-instance-panel-head button{flex-shrink:0;background:#fff;border:1px solid #cbd7e3;color:#315c89;border-radius:7px;padding:7px 10px;min-height:36px;font:inherit;cursor:pointer}.tc-instance-panel-head button:hover{background:#eef3f8}.tc-instance-panel-head button:focus-visible{outline:2px solid #315c89;outline-offset:2px}.tc-instance-host .html-widget-output,.tc-instance-host .shiny-plot-output,.tc-instance-host .rd-methods,.tc-instance-host .tc-home{display:none!important}.tc-instance-host .rd-grid{display:block}.tc-instance-host.is-dashboard-compact>.rd-dashboard,.tc-instance-host.is-dashboard-compact>.tc-cell-instance{display:none!important}.tc-instance-data-fields{display:grid;gap:12px}.tc-instance-data-fields .shiny-input-container{margin:0!important}.tc-instance-data-fields .selectize-control{width:100%}.tc-instance-host .card{min-width:0}.tc-node-head{flex-wrap:wrap}.tc-instance-host [data-guide-tool],.tc-node[data-plot-id^=tcinstance_] [data-guide-tool]{display:none!important}';document.head.appendChild(instanceStyle);
    window.addEventListener('team-canvas-panel-open',function(event){if(event.detail&&event.detail.kind==='appearance')document.querySelectorAll('.tc-instance-host.is-open').forEach(closeInstanceControls);});
    window.addEventListener('team-canvas-selection',function(event){var opened=document.querySelector('.tc-instance-host.is-open');if(!opened)return;var r=event.detail&&records.get(event.detail.id);if(!r||!r.instance){closeInstanceControls(opened);return;}if(opened.dataset.instanceId!==r.instance.id)openInstanceControls(r);else if(r.node)TeamCanvasFloatingPanel.open(opened,r.node);});
    var pasteButton=document.createElement('button');pasteButton.type='button';pasteButton.textContent='Paste plot';pasteButton.className='tc-paste-plot';pasteButton.disabled=!instanceClipboard;pasteButton.addEventListener('click',pasteRecord);root.querySelector('.tc-arrange').after(pasteButton);
    document.addEventListener('keydown',function(event){if(!root.contains(event.target)||!(event.metaKey||event.ctrlKey)||event.altKey||event.target.closest('input,textarea,select,[contenteditable=true]'))return;var figurePage=root.querySelector('#tc-preview-panel');if(figurePage&&!figurePage.hidden)return;if(event.key.toLowerCase()==='c'&&copyRecord(selectedRecord))event.preventDefault();else if(event.key.toLowerCase()==='v'&&pasteRecord())event.preventDefault();});
    // A drag or resize of a card is one gesture and one undo step: the drop (or the end of the
    // resize) settles overlaps around that card before the step is recorded.
    // A card title cut by its ellipsis shows the full title on hover (read at hover time, so every rename is covered).
    board.addEventListener('pointerover',function(event){var heading=event.target.closest&&event.target.closest('.tc-node-head>strong');if(!heading)return;var full=heading.textContent;if(heading.scrollWidth>heading.clientWidth+1){if(heading.title!==full)heading.title=full;}else if(heading.hasAttribute('title'))heading.removeAttribute('title');});
    var gestureCard=null;
    function cardFrame(node){return [node.style.left,node.style.top,node.style.width,node.style.height].join();}
    board.addEventListener('pointerdown',function(event){
      var card=event.target.closest('.tc-node');if(!card)return;
      flushKeyBurst(); rememberGeometry(); geometryGesture=true; gestureCard={node:card,frame:cardFrame(card)};
    });
    function finishGeometryGesture(){
      if(!geometryGesture)return;
      var g=gestureCard;gestureCard=null;
      var end=function(){if(gestureCard)return;geometryGesture=false;rememberGeometry();};
      if(g&&g.node.isConnected&&cardFrame(g.node)!==g.frame)settleOverlaps([g.node],end);else end();
    }
    document.addEventListener('pointerup',finishGeometryGesture);
    document.addEventListener('pointercancel',finishGeometryGesture);
    window.addEventListener('blur',finishGeometryGesture);
    document.addEventListener('keydown',function(event){
      if(event.defaultPrevented || !root.contains(event.target) || !(event.metaKey||event.ctrlKey) || event.altKey || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
      var preview=root.querySelector('#tc-preview-panel'); if(preview && !preview.hidden)return;
      var key=event.key.toLowerCase(), redo=(key==='z'&&event.shiftKey)||(key==='y'&&!event.shiftKey);
      if((key==='z'||redo) && replayGeometry(redo))event.preventDefault();
    });
    if (window.TeamCanvasViewport) window.TeamCanvasViewport.mount(root, board);
    ['pointerdown','keydown','click','input','change'].forEach(function (name) { document.addEventListener(name, touchLazyHydration, true); });
    // Showing the Canvas (Team: body[data-guide-step=5]) loads the rest of the restored copies sooner.
    var showWatch = function () { if (deferredQueue.length) deferredShown(); gateWatch(); };
    new MutationObserver(showWatch).observe(document.body, {attributes:true, attributeFilter:['data-guide-step','data-guide-analysis','data-tw-screen','data-team-stage','class','style','hidden']});
    new MutationObserver(showWatch).observe(root, {attributes:true, attributeFilter:['class','style','hidden']});
    window.addEventListener('team-workspace-state', showWatch); window.addEventListener('resize', showWatch);
    search.addEventListener('input', renderList);
    function returnAll() { documentState=null; cancelInstanceRequests(); var cancelled=clearAllQueuedAdds(); records.forEach(restore); illustrations.forEach(function (r) { if (r.observer) r.observer.disconnect(); if (r.node) r.node.remove(); }); illustrations.clear(); dropFramePreview();
      // The figure page (canvas_preview.js) keeps its own copy of the document: it drops it now,
      // so its text and shapes are neither shown nor sent back by its next save.
      window.dispatchEvent(new CustomEvent('team-canvas-document-cleared'));
      var message = restorePending.size ? 'Returned all plots and cleared plots awaiting their analysis.' : cancelled.length ? 'Returned all plots and cancelled queued adds for ' + cancelled.join(', ') + '.' : 'Returned all plots and illustrations to the library.';
      restorePending.clear(); changed(); tell(message);
      // Reset cancelled every restored card still queued or loading: nothing is left
      // to mount, so a pending restore completes now (and the reset canvas is sent).
      // A failed one keeps its Retry.
      finishRestoreIfReady(); }
    // Return all plots asks first (an in-page confirmation stating what is cleared), then offers
    // Undo for a few seconds: Undo restores the saved state taken just before, through the same
    // path as a checkpoint restore, and saves it as an edit.
    var resetConfirm = null, resetToast = null, resetToastTimer = 0;
    function resetStyle() {
      if (document.getElementById('tc-reset-style')) return;
      var st = document.createElement('style'); st.id = 'tc-reset-style';
      st.textContent = '.tc-reset-confirm,.tc-reset-toast:not(.tc-feedback-toast){position:fixed;left:50%;transform:translateX(-50%);z-index:11500;display:flex;align-items:center;flex-wrap:wrap;gap:6px;box-sizing:border-box;max-width:min(560px,calc(100vw - 32px));padding:8px 8px 8px 16px;border-radius:8px;font:13px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px rgba(20,27,36,.28)}.tc-reset-confirm{top:96px;background:#fff;color:#172d4b;border:1px solid #cbd7e3}.tc-reset-confirm p{margin:0 8px 0 0;flex:1 1 auto}.tc-reset-confirm button{min-height:32px;padding:0 12px;border-radius:6px;border:1px solid #cbd7e3;background:#fff;color:#315c89;font:600 13px/1 system-ui,sans-serif;cursor:pointer}.tc-reset-confirm .tc-reset-yes{background:#9b2c2c;border-color:#9b2c2c;color:#fff}.tc-reset-toast:not(.tc-feedback-toast){bottom:24px;background:#162230;color:#e9eff4}.tc-reset-toast:not(.tc-feedback-toast) span{flex:1 1 auto;padding:6px 8px 6px 0}.tc-reset-toast:not(.tc-feedback-toast) button{height:32px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:#9fd0ff;font:700 13px/1 system-ui,sans-serif;cursor:pointer}.tc-reset-toast:not(.tc-feedback-toast) button:hover{background:rgba(255,255,255,.12)}.tc-reset-confirm button:focus-visible,.tc-reset-toast:not(.tc-feedback-toast) button:focus-visible{outline:2px solid #315c89;outline-offset:2px}';
      document.head.appendChild(st);
    }
    function resetFocusTarget() { return [root.querySelector('[aria-label="More canvas actions"]'), root.querySelector('.tc-reset')].find(function (b) { return b && b.getClientRects().length; }); }
    function closeResetConfirm(refocus) { if (!resetConfirm) return; resetConfirm.remove(); resetConfirm = null; if (refocus) { var t = resetFocusTarget(); if (t) t.focus({preventScroll:true}); } }
    function closeResetToast() {
      clearTimeout(resetToastTimer); if (!resetToast) return;
      var shared = window.TeamCanvasFeedback;
      if (resetToast.classList.contains('tc-feedback-toast')) { if (shared && shared.current() === resetToast) shared.close(); }
      else { var hadFocus = resetToast.contains(document.activeElement); resetToast.remove(); if (hadFocus) { var t = resetFocusTarget(); if (t) t.focus({preventScroll:true}); } }
      resetToast = null;
    }
    function resetCounts() {
      var plots = 0, shown = 0; records.forEach(function (r) { if (r.node) plots++; }); restorePending.forEach(function (n) { if (n.kind !== 'illustration') plots++; });
      shown = plots + illustrations.size;
      return {plots:plots, illustrations:illustrations.size, items:shown, page:!!(documentState && documentState.items && documentState.items.length)};
    }
    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
    function showResetUndo(saved, count) {
      closeResetToast(); if (!saved) return;
      var message = count ? 'Returned ' + plural(count, 'item') : 'Cleared the figure page';
      // Armed after this task: the tabs observer reports the removed cards in a microtask (no edit).
      var epoch = null; setTimeout(function () { epoch = syncEpoch; }, 0);
      function undoReset() {
        closeResetToast();
        // Any later canvas change (a new card, a restore) makes the saved copy stale: Undo would discard it.
        if (epoch === null || syncEpoch !== epoch) { tell('The canvas changed after Return all plots, so it cannot be undone.'); return; }
        try {
          restoreState(saved, null, true); editDuringHydration(); changed(); tell('Undid Return all plots.');
          var finished = (saved.nodes || []).filter(function (n) { return n.finished && n.kind !== 'illustration'; }).length;
          if (window.TeamCanvasFeedback) TeamCanvasFeedback.show((count ? 'Restored ' + plural(count, 'item') : 'Restored the figure page') + (finished ? ' · finished figures need Finish again before export' : ''), {ms:8000, quiet:true});
        }
        catch (error) { tell(error.message || 'Could not undo Return all plots.'); }
      }
      // The same toast as Remove/Return (canvas_feedback.js); the inline one below only when that script is absent.
      if (window.TeamCanvasFeedback) {
        resetToast = TeamCanvasFeedback.show(message, {className: 'tc-reset-toast', undoClassName: 'tc-reset-undo', ms: 8000, undo: undoReset});
        return;
      }
      resetStyle();
      var toast = document.createElement('div'); toast.className = 'tc-reset-toast'; toast.setAttribute('role', 'group'); toast.setAttribute('aria-label', 'Canvas notification');
      var text = document.createElement('span'); text.textContent = message;
      var undo = document.createElement('button'); undo.type = 'button'; undo.className = 'tc-reset-undo'; undo.textContent = 'Undo';
      var dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss'); dismiss.textContent = '×';
      undo.addEventListener('click', undoReset);
      dismiss.addEventListener('click', closeResetToast);
      toast.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeResetToast(); } });
      toast.addEventListener('pointerenter', function () { clearTimeout(resetToastTimer); });
      toast.addEventListener('focusin', function () { clearTimeout(resetToastTimer); });
      toast.append(text, undo, dismiss); document.body.appendChild(toast); resetToast = toast;
      resetToastTimer = setTimeout(closeResetToast, 8000);
    }
    function confirmReset() {
      closeResetConfirm(false);
      var c = resetCounts();
      if (!c.items && !c.page && !documentState) { returnAll(); return; }
      resetStyle();
      var parts = []; if (c.plots) parts.push(plural(c.plots, 'plot')); if (c.illustrations) parts.push(plural(c.illustrations, 'illustration'));
      var question = parts.length ? 'Return all ' + parts.join(' and ') + '? This clears the figure page.' : 'Clear the figure page?';
      var box = document.createElement('div'); box.className = 'tc-reset-confirm'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'false');
      var p = document.createElement('p'); p.id = 'tc-reset-confirm-text'; p.textContent = question; box.setAttribute('aria-labelledby', p.id);
      var yes = document.createElement('button'); yes.type = 'button'; yes.className = 'tc-reset-yes'; yes.textContent = parts.length ? 'Return all' : 'Clear';
      var no = document.createElement('button'); no.type = 'button'; no.className = 'tc-reset-no'; no.textContent = 'Cancel';
      var opened = editEpoch();
      yes.addEventListener('click', function () {
        // The canvas changed while the question was open: ask again with the current counts.
        if (editEpoch() !== opened) { confirmReset(); tell('The canvas changed. Check the question again.'); return; }
        var saved = null; try { saved = collectState(); } catch (ignore) { saved = null; }
        closeResetConfirm(false); returnAll(); showResetUndo(saved, c.items);
        var t = resetFocusTarget(); if (t) t.focus({preventScroll:true});
      });
      no.addEventListener('click', function () { closeResetConfirm(true); });
      box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeResetConfirm(true); } });
      box.append(p, yes, no); document.body.appendChild(box); resetConfirm = box; no.focus();
    }
    root.querySelector('.tc-reset').addEventListener('click', confirmReset);
    var tidyButton = root.querySelector('.tc-arrange');
    // The markup's "Arrange" button is the on-demand Tidy up.
    tidyButton.textContent = 'Tidy up'; tidyButton.title = 'Pack the cards in reading order, without changing their sizes';
    tidyButton.addEventListener('click', tidyUp);
    root.querySelector('.tc-library-toggle').addEventListener('click', function () {
      var hidden = root.querySelector('.tc-layout').classList.toggle('tc-library-hidden');
      this.setAttribute('aria-expanded', String(!hidden)); this.textContent = hidden ? 'Show library' : 'Hide library';
      // In the Team shell the library is a rail panel whose saved state is not restored: no save.
      window.dispatchEvent(new Event('resize')); if (!root.classList.contains('ts-shell')) changed();
    });
    if (window.Shiny && Shiny.addCustomMessageHandler) {
      Shiny.addCustomMessageHandler('team-canvas-instance-ready',function(message){instanceReady(message,0);});
      Shiny.addCustomMessageHandler('team-canvas-instance-settled',function(m){if(!m||!m.id)return;settledInstances[m.id]={generation:m.generation,at:++messageSequence};window.dispatchEvent(new CustomEvent('team-canvas-instance-settled',{detail:m.id}));});
      Shiny.addCustomMessageHandler('team-canvas-de-state',function(message){var before=[deResultsReady,designReady,inferenceGate,timePointsReady].join('|');deResultsReady=!!(message&&message.ready);designReady=message&&typeof message.design==='boolean'?message.design:null;inferenceGate=message&&typeof message.gate==='string'?message.gate:null;timePointsReady=message&&typeof message.timepoints==='boolean'?message.timepoints:null;if(before!==[deResultsReady,designReady,inferenceGate,timePointsReady].join('|'))renderList();});
      Shiny.addCustomMessageHandler('team-canvas-instance-error',function(message){instanceError(message);});
      Shiny.addCustomMessageHandler('team-preparation-state', function (state) { window.dispatchEvent(new CustomEvent('team-preparation-state', {detail:state})); });
      Shiny.addCustomMessageHandler('team-canvas-state-ack', function (message) {
        if (message && backgroundKeys.has(message.token)) { if (message.ok) serverStateKey = backgroundKeys.get(message.token); backgroundKeys.delete(message.token); }
        var waiter = message && ackWaiters.get(message.token);
        if (waiter) { ackWaiters.delete(message.token); waiter(message); }
      });
      Shiny.addCustomMessageHandler('team-canvas-restore', function (message) { try { restoreState(message && message.state, message && message.restoreToken); } catch (error) { restoreBuilding=false; restoreStatus('failed'); tell(error.message || 'Could not restore the figure workspace.'); } });
    }
    var idleReconcilePending = false;
    function reconcileIdle() {
      if (!shinyBusy || idleReconcilePending || !window.Shiny || !Shiny.shinyapp) return;
      idleReconcilePending=true;
      queueMicrotask(function(){queueMicrotask(function(){idleReconcilePending=false;
        if(shinyBusy && !document.documentElement.classList.contains('shiny-busy')) setCanvasIdle();
      });});
    }
    function setCanvasIdle() {
      if (!shinyBusy) return;
      shinyBusy = false;
      records.forEach(function (r) {
        if (r.settleRender) r.settleRender();
        if (r.snapshot && !r.snapshot.archived && r.preview && !r.snapshot.stale && guard(r,r.snapshot.preparationRevision,r.snapshot.preparationGeneration,r.snapshot.renderGeneration)) r.preview.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      });
      window.dispatchEvent(new Event('team-canvas-idle'));
    }
    if (window.jQuery) jQuery(document).on('shiny:busy', function () {
      if (!shinyBusy) activityGeneration++; shinyBusy = true;
      reconcileIdle();
    }).on('shiny:idle', setCanvasIdle);
    if (window.jQuery) jQuery(document).on('shiny:disconnected', function () {
      // The server session ended with the connection, and a reconnection opens a
      // new one: every copy's host belongs to the old session. Hosts still loading
      // are removed; the others are marked so a later request never binds them.
      // Restored copies not requested yet stay unrequested: the restore fails as an
      // interrupted one does, with its saved nodes kept for every save. A new copy's
      // Generating card turns into the failed one (Retry, Remove).
      document.querySelectorAll('.tc-instance-host').forEach(function (host) { host.dataset.tcStale = 'true'; });
      var interrupted = deferredQueue.length > 0; cancelDeferredTimers(); deferredQueue = []; deferredBusySince = 0;
      if (!instanceRequests.size && !interrupted) return;
      instanceRequests.forEach(function (request, id) { clearTimeout(request.timer); if (request.saved) interrupted = true; failPlaceholder(request); dropStaleHost(id); });
      instanceRequests.clear(); if (interrupted) restoreStatus('failed');
      tell('The connection was lost while independent plots were loading. Reconnect and retry.');
    });
    if (window.Shiny && Shiny.shinyapp) new MutationObserver(reconcileIdle).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    window.addEventListener('team-preparation-state', function (event) {
      var previous = preparation, next = event.detail;
      var changed = preparationSignature(previous) !== preparationSignature(next);
      if (changed) preparationGeneration++;
      preparation = next;
      if (!previous || !preparation || previous.revision !== preparation.revision) records.forEach(function (r) { r.renderRevision = null; });
      if (changed) records.forEach(staleSnapshot);
      records.forEach(function (r) { preparationSnapshotStatus(r,preparationOK()); });
      if (changed && window.TeamCanvasStatistics) records.forEach(function (r) { if (r.statistics) TeamCanvasStatistics.preparationChanged(r); });
    });
    discover(); var timer;
    window.TeamCanvas = {
      // Read-only check of a saved figure image against a card frame (tests and diagnostics).
      snapshotDefectOf: function (url, width, height, provenance) {
        var probe = document.createElement('div'); probe.style.width = width + 'px'; probe.style.height = height + 'px';
        var found = snapshotDefect({node:probe}, {url:url, provenance:provenance || null}); return found ? found.kind : null;
      },
      listPlots: function () {
        var catalog = window.TeamCanvasCatalog && window.TeamCanvasCatalog.list || [];
        if (!catalog.length) return Array.from(records.values()).filter(function (r) { return r.el.isConnected; }).map(function (r) { return {id:r.el.id,title:r.label,added:!!r.node,available:!r.dynamic}; }).concat(extraRoutes.map(function (r) { return {id:r.id,title:r.title,added:false,available:false}; }));
        return catalog.map(function (item) {
          if(item.routeOnly)return {id:item.id,title:item.title,category:item.category,added:false,available:false,pending:false,routeOnly:true,status:item.routeOnly.status};
          var r=records.get(item.id), blocked=blockedPlot(item.id), pending=pendingAdds.get(item.id), canAdd=!!r && r.el.isConnected && !r.dynamic && !dynamicOutput(r.el), wrapperAdd=!!r && r.el.isConnected && !!r.wrapper;
          var mounted=canAdd||wrapperAdd;
          if(instancesConnected()&&instanceSupported(item.id))return {id:item.id,title:item.title,category:item.category,added:false,available:true,pending:false,status:'Independent copy'};
          return {id:item.id,title:item.title,category:item.category,added:!blocked&&!!(r && r.node),available:!blocked&&mounted,pending:pendingAdds.has(item.id),queuedName:pending&&pending.label,blocked:!!blocked,blockedReason:blocked&&blocked.reason,status:blocked?blocked.status:r&&r.node?'Added':pending?'Queued: '+pending.label:mounted?(hasRenderedPlot(r.el)?'Ready to add':'Add to check'):'Requires configuration'};
        }).concat(extraRoutes.filter(function (route) { return !catalog.some(function (item) { return item.id === route.id; }); }).map(function (route) { return {id:route.id,title:route.title,added:false,available:false,status:'Requires configuration'}; }));
      },
      listIllustrations: function () { return (window.TeamIllustrations && Array.isArray(window.TeamIllustrations.list) ? window.TeamIllustrations.list : []).map(function (x) { return {id:x.id,title:x.title,category:x.category || 'Illustrations'}; }); },
      addIllustration: function (id) { editDuringHydration(); return addIllustration(id); },
      // Re-fit a card's plot to its frame (the shell parks module content around it).
      // Framing changes no saved state, so it is not an edit by itself: card_frame.js and
      // card_figure.js call it while restored cards mount. A user's action that leads
      // here (a tab switch, a zoom) already counted as an edit through its own event.
      fitPlot:function(id){var r=records.get(id);if(r&&r.node)resize(r);},
      fitAllPlots:function(){records.forEach(function(r){if(r.node)resize(r, true);});},
      // Read-only card state for the shell's status chips and export warning.
      // A live card whose output has drawn something (card_status.js: Generating until then).
      cardDrawn:function(id){var r=records.get(id);return !!(r&&r.node&&hasRenderedPlot(r.el));},
      cardStatus:function(id){var r=records.get(id);if(!r||!r.node)return null;if(r.snapshot)return r.snapshot.defect?'finished-broken':r.snapshot.stale?'finished-stale':'finished';if(r.sourceError)return 'error';if(!preparationOK())return preparation&&(preparation.running||preparation.restoring)?'updating':'pending';if(awaitingInput(r))return 'waiting';if(lazyUnmounted(r.el.id)){var app=lazyApp();return app&&app.$values[r.el.id]!==undefined&&app.$errors[r.el.id]===undefined&&!serverBusy()?'current':'updating';}return figureCurrent(r)?'current':'updating';},
      catalogSource:function(id){var r=records.get(id);return r?sourceKey(r):null;},
      deReady:deReady,designReady:function(){return designReady;},inferenceGate:function(){return inferenceGate;},timePointsReady:function(){return timePointsReady;},
      insightSupported:function(id){var r=records.get(id);return !!(r&&r.instance&&(r.instance.source.indexOf('results_dashboard-')===0||/^cell_(lipid|profile|class|comparison)_plot$/.test(r.instance.source)));},
      copyPlot:function(id){return copyRecord(records.get(id));},
      // Canvas tabs: an independent copy that leaves the Copy/Paste clipboard alone; returns its instance id.
      copyPlotAsInstance:function(id){editDuringHydration();var copied=copyData(records.get(id));if(!copied)return false;lastInstanceRequest=null;return requestInstance(copied.source,copied)&&lastInstanceRequest?lastInstanceRequest:false;},
      creationOrder:function(){return creationOrder.slice();},pastePlot:function(){editDuringHydration();return pasteRecord();},duplicatePlot:function(id){editDuringHydration();return copyRecord(records.get(id))&&pasteRecord();},
      addPlot: function (id) { editDuringHydration(); if(instancesConnected()&&instanceSupported(id))return requestInstance(id); if (blockedPlot(id)) { tell(plotTitle(id) + ' is unavailable. ' + blockedPlot(id).reason); return false; } if (!records.has(id)) discover(); var r = records.get(id); if (!r || (r.dynamic && !r.wrapper) || !r.el.isConnected) return false; return add(r); },
      addCatalogPlot: function (id) { editDuringHydration(); if(instancesConnected()&&instanceSupported(id))return requestInstance(id); if (routeOnlyPlot(id)) { tell('Use Open export studio to configure this publication preview.'); return false; } if (blockedPlot(id)) { tell(plotTitle(id) + ' is unavailable. ' + blockedPlot(id).reason); return false; } if (!records.has(id)) discover(); var r=records.get(id); if (!r || (r.dynamic && !r.wrapper) || !r.el.isConnected) return false; return add(r); },
      queuePlot: function (id, route) { editDuringHydration(); if(instancesConnected()&&instanceSupported(id))return requestInstance(id); if (blockedPlot(id)) { tell(plotTitle(id) + ' is unavailable. ' + blockedPlot(id).reason); return false; } return queueAdd(id,route); },
      cancelQueuedAdd: function (id) { editDuringHydration(); return clearQueuedAdd(id,'Cancelled queued add for “' + plotTitle(id) + '”.'); },
      previewState: function (forDisplay) {
        reconcileIdle();
        var state=collectState(forDisplay === true ? false : undefined), nodes=Array.from(records.values()).filter(function (r) { return !!r.node; }).concat(Array.from(illustrations.values()));
        var documentItems=state.document && Array.isArray(state.document.items) ? state.document.items : [];
        var hasContent=nodes.length > 0 || documentItems.length > 0;
        var settled=!instanceRequests.size && !shinyBusy && !(window.Shiny && Shiny.shinyapp && document.documentElement.classList.contains('shiny-busy')) && !pendingAdds.size && !restorePending.size;
        function usable(r) {
          if (r.kind === 'illustration') return !!r.snapshot && checkedImage(r.snapshot.url);
          if (!r.snapshot || r.snapshot.stale || r.snapshot.defect || !checkedImage(r.snapshot.url)) return false;
          var image=r.preview && r.preview.querySelector('img');
          if (!r.preview || !r.preview.isConnected || !image || !r.preview.contains(image) || image.getAttribute('src') !== r.snapshot.url) return false;
          if (r.snapshot.archived) return true;
          return snapshotGuard(r,r.snapshot,activityGeneration);
        }
        // The figure page composes the usable (finished, current) figures; live
        // or stale cards are reported by id so the page can list them.
        var usableIds=[], unusable=[];
        nodes.forEach(function (r) { var id=r.kind==='illustration'?r.id:r.el.id; if (usable(r)) usableIds.push(id); else unusable.push({id:id,label:(r.labelInput&&r.labelInput.value)||r.label||id,reason:!r.snapshot?'live':(r.snapshot.stale||r.snapshot.defect)?'stale':'invalid'}); });
        var ready=settled && hasContent && !unusable.length;
        var queuedNames=Array.from(pendingAdds.values()).map(function (pending) { return pending.label; });
        return {state:state,ready:ready,settled:settled,blank:!hasContent,usableIds:usableIds,unusable:unusable,archived:nodes.filter(function (r) { return !!(r.snapshot && r.snapshot.archived); }).length,message:ready?'Finished figures are ready for preview.':instanceRequests.size?'Independent plots are still loading. Wait before opening the preview.':shinyBusy?'The analysis is updating. Wait for it to finish before previewing.':pendingAdds.size?'Queued add' + (queuedNames.length===1?'':'s') + ' not ready: ' + queuedNames.join(', ') + '. Cancel in the catalog or wait up to 90 seconds.':restorePending.size?'Saved plots are waiting for their analysis to load.':!hasContent?'Add a plot or drawing before opening the preview.':nodes.some(function (r) { return !r.snapshot; })?'Finish every canvas plot before opening the preview.':'A finished figure is stale or no longer valid. Review it before previewing.'};
      },
      previewStateForDisplay: function () {
        if (framePreview) return framePreview;
        var result = window.TeamCanvas.previewState(true);
        framePreview = result; framePreviewTimer = requestAnimationFrame(function () { framePreview = null; framePreviewTimer = 0; });
        return result;
      },
      // Canvas tabs: snapshot before a tab edit, then save (navigation only saves).
      tabsWillChange: function () { rememberGeometry(); },
      tabsChanged: function (navigation) { if (navigation) { if (!geometryReplay && !geometryGesture && board) geometryLast = geometryState(); if (!applyingRestore) {
        // Only the tabs observer's report of a restored copy's mount (the one-shot notice)
        // is hydration. Anything else here (active tab, figure order) is an edit.
        var hydrating = mountNotice; mountNotice = false;
        if (!hydrating) editDuringHydration();
        syncEpoch++; if (hydrating) hydrationChanges++; else if (restoreReceipt) editedDuringRestore = true;
        window.dispatchEvent(new CustomEvent('team-canvas-changed', {detail:hydrating ? {epoch:syncEpoch, restoreHydration:true} : {epoch:syncEpoch}}));
        if (!checkpointActive && (!hydrating || (backgroundDue && !lazyHydrationQuiet()))) { clearTimeout(syncTimer); backgroundDue = true; syncTimer = setTimeout(function () { sendBackground(); }, 350); } } return; } editDuringHydration(); changed(); },
      deselect: function () { if (!selectedRecord) return; selectedRecord = null; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:null})); },
      selected: function () { return selectedRecord && selectedRecord.node ? {id:selectedRecord.el.id, title:selectedRecord.displayTitle || selectedRecord.label} : null; },
      getInsight: function(id){var r=records.get(id),saved=restorePending.get(id),note=saved?saved.insight:r?r.insight:undefined;return note?validateInsight(note):saved||r?null:undefined;},
      setInsight: function(id,value){var r=records.get(id),saved=restorePending.get(id);if(!r&&!saved)return false;var note=value==null?null:validateInsight(value);if(saved)saved.insight=note;if(r)r.insight=note;if(saved||(r&&r.node)){editDuringHydration();changed();}return true;},
      getGroupComparison: function(id){var r=records.get(id),saved=restorePending.get(id),v=saved?saved.visual:r?r.visual:null;return v&&v.groupComparison?validateGroupComparison(v.groupComparison):null;},
      setGroupComparison: function(id,value){var r=records.get(id),saved=restorePending.get(id),owner=saved?saved.instance:r&&r.instance;if(!owner||owner.source!=='group_comparison_tab-comparisonPlot')return false;var v=validateGroupComparison(value),old=saved?saved.visual.groupComparison:r.visual&&r.visual.groupComparison;if(JSON.stringify(old)===JSON.stringify(v))return true;editDuringHydration();if(saved)saved.visual.groupComparison=v;if(r){r.visual=r.visual||{};r.visual.groupComparison=v;staleSnapshot(r);}changed();return true;},
      reapplyGroupComparisonEditor: function(id){editDuringHydration();var r=records.get(id);if(!r||!r.node||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot')return Promise.resolve(false);var gd=plotFor(r);if(!gd)return Promise.resolve(false);if(window.TeamPlotEditor&&TeamPlotEditor.resetSource)TeamPlotEditor.resetSource(gd);if(r.plotEditor)r.plotEditor.refresh();if(!r.visual||!r.visual.editor)return Promise.resolve(true);r.appearancePending=true;return flushAppearance(r).then(function(){return true;});},
      invalidateGroupComparison: function(id){editDuringHydration();var r=records.get(id);if(!r||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot')return false;r.revision=(r.revision||0)+1;staleSnapshot(r);watchRender(r);return true;},
      clearGroupComparisonPanelColors: function(id,feature){editDuringHydration();var r=records.get(id);if(!r||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot'||typeof feature!=='string'||!feature.length||feature.length>500)return false;var editor=r.visual&&r.visual.editor;if(!editor||!Array.isArray(editor.traces))return true;var modified=false;editor.traces.forEach(function(t){var prefix='source:group-comparison:';if(typeof t.sourceKey!=='string'||!t.sourceKey.startsWith(prefix))return;try{var parts=JSON.parse(t.sourceKey.slice(prefix.length));if(!Array.isArray(parts)||parts[0]!==feature||parts[2]!=='violin')return;['fillColor','fillOpacity','lineColor'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(t,k)){delete t[k];modified=true;}});}catch(ignore){}});if(modified){staleSnapshot(r);if(r.plotEditor)r.plotEditor.refresh();changed();}return true;},
      clearGroupComparisonPanelVisibility: function(id,feature,condition){editDuringHydration();var r=records.get(id);if(!r||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot'||typeof feature!=='string'||!feature.length||feature.length>500||typeof condition!=='string'||!condition.length||condition.length>500)return false;var editor=r.visual&&r.visual.editor;if(!editor||!Array.isArray(editor.traces))return true;var key='source:group-comparison:'+JSON.stringify([feature,condition,'violin']),modified=false;editor.traces.forEach(function(t){if(t.sourceKey===key&&Object.prototype.hasOwnProperty.call(t,'hidden')){delete t.hidden;modified=true;}});if(modified){staleSnapshot(r);if(r.plotEditor)r.plotEditor.refresh();changed();}return true;},
      getDocument: function(){return documentState ? JSON.parse(JSON.stringify(documentState)) : null;},
      setDocument: function(state){documentState=validateDocument(state,collectState().nodes);editDuringHydration();changed();},
      checkpoint: checkpoint, serialize: collectState, restore: restoreState,
      // Read-only progress of a restored checkpoint's copies (status chips, tests).
      // The opening dialog's count (busy_presentation.js), null when it is not open.
      // Lazy mount: bind a card's output now and resolve true once it is clean (exports, tests).
      ensureMounted: function (id) { return ensureMounted(records.get(id)); },
      isLive: function (id) { var r=records.get(id); return !!(r&&r.node&&!lazyUnmounted(r.el.id)); },
      assertClean: lazyAssertClean,
      // Image exports (plot_exports.js, group comparison): the card's revision at the start,
      // and whether it is unchanged (publish only then).
      exportRevision: exportRevision, exportCurrent: exportCurrent,
      openProgress: function () { return gate ? {done:gate.done, total:gate.total} : null; },
      restoreProgress: function () { return {queued:deferredQueue.length, loading:deferredInFlight(), pending:restorePending.size, editEpoch:editEpoch()}; }
    };
    if (window.jQuery) jQuery(document).on('shiny:inputchanged', function(event) {
      // Shiny divides physical DOM rectangles by currentCSSZoom, leaving tiny
      // fractional differences at each zoom. Device dimensions are CSS pixels.
      if(typeof event.name==='string'&&event.name.indexOf('tcinstance_')===0){records.forEach(function(item){if(item.instance&&event.name.indexOf(item.instance.id+'-')===0&&item.node)changed();});}
      var match=typeof event.name==='string'&&/^\.clientdata_output_(.+)_(width|height)$/.exec(event.name);
      var r=match&&records.get(match[1]);
      if(r&&r.node&&r.el.isConnected&&typeof event.value==='number'&&Number.isFinite(event.value)&&event.value>0){
        var measured=event.value, style=getComputedStyle(r.el), dimension=match[2], logical=logicalOutputDimension(r.el,dimension);
        if(logical>0)event.value=logical;
        dimensionTrace(r,'clientdata-'+dimension,{measured:measured,reported:event.value,computed:parseFloat(style.getPropertyValue(dimension)),offset:dimension==='width'?r.el.offsetWidth:r.el.offsetHeight});
      }
    });
    if (window.jQuery) jQuery(document).on('shiny:value', function (event) {
      var r = event.target && records.get(event.target.id);
      if (r) {
        r.sourceWaiting = false;
        dimensionTrace(r,'shiny:value',{width:event.value&&typeof event.value.width==='number'?event.value.width:null,height:event.value&&typeof event.value.height==='number'?event.value.height:null,revision:r.revision||0});
        var signature = plotlySourceSignature(r, event.value);
        var sourceRevision=preparation && preparation.revision;
        var revisionChanged=r.sourcePreparationRevision!=null && r.sourcePreparationRevision!==sourceRevision;
        // The first value may have arrived before an independent copy was
        // mounted. If it already has presentation, replay it on the first
        // observed source rather than assuming the old figure was equivalent.
        var unknownPrior=!!(r.node && r.visual && Object.keys(r.visual).length && r.sourceSignature==null && signature!==null);
        var actualChange=!!r.sourceError || revisionChanged || unknownPrior || (signature!==null && r.sourceSignature!=null && r.sourceSignature!==signature);
        // Equivalent only when both are known Plotly figures: a value with no signature (a
        // static image, an unreadable figure) is always a new render (and a new export revision).
        var same=signature!==null && !actualChange && !r.hydrating && r.sourceSignature===signature && r.sourcePreparationRevision===sourceRevision && r.renderRevision===sourceRevision;
        r.sourceSignature=signature; r.sourcePreparationRevision=sourceRevision;
        if (same) { activityGeneration++; watchEquivalentRender(r, signature); }
        else { r.revision = (r.revision || 0) + 1; watchRender(r); if (r.node && !r.hydrating && actualChange) { if (unknownPrior || (r.instance && r.instance.source.indexOf('results_dashboard-')===0) || (!revisionChanged && (sourceKey(r).indexOf('results_dashboard-')===0 || sourceKey(r)==='group_comparison_tab-comparisonPlot'))) preserveHeatmapPresentation(r); else clearAppearance(r); } if (r.statistics && window.TeamCanvasStatistics) TeamCanvasStatistics.sourceChanged(r); }
        if (r.node) setTimeout(function () { if (r.node) refreshMarkAvailability(r); }, 600);
      }
    });
    if (window.jQuery) jQuery(document).on('shiny:error', function (event) {
      var r = event.target && records.get(event.target.id);
      if (!r) return;
      // req() in a module sends an empty, silent error: the plot is waiting for
      // an input or an analysis, not failing. Its card says what it needs.
      var err=event.error||{}, types=[].concat(err.type||[]).join(' ');
      // Its previous figure is no longer the current result either: invalidate it as
      // an error would (no finishing or export of the old picture), without the
      // "could not be updated" verdict. Shiny itself treats an empty message as silent.
      if (/shiny\.silent\.error/.test(types) || err.message==='') {
        r.sourceWaiting = true; r.revision = (r.revision || 0) + 1; r.renderRevision = null; r.sourceSignature = null;
        if (r.equivalentObserver) r.equivalentObserver.disconnect();
        if (r.renderObserver) r.renderObserver.disconnect(); r.settleRender = null;
        if (r.statistics && window.TeamCanvasStatistics) TeamCanvasStatistics.sourceChanged(r);
        if (r.node && !r.hydrating) staleSnapshot(r);
        return;
      }
      r.revision = (r.revision || 0) + 1; r.renderRevision = null; r.sourceError = true; r.sourceSignature = null;
      explainKnownError(r, err.message);
    if (r.equivalentObserver) r.equivalentObserver.disconnect();
      if (r.renderObserver) r.renderObserver.disconnect(); r.settleRender = null;
      if (r.statistics && window.TeamCanvasStatistics) TeamCanvasStatistics.sourceChanged(r);
      if (r.node) { if (!r.hydrating) { if ((r.el.classList.contains('plotly')||sourceKey(r)==='group_comparison_tab-comparisonPlot') && (r.sourcePreparationRevision==null||r.sourcePreparationRevision===(preparation && preparation.revision))) preserveHeatmapPresentation(r); else clearAppearance(r); } staleSnapshot(r); tell('This plot could not be updated. Wait for a valid result before finishing or exporting it.'); }
    });
    new MutationObserver(function (changes) {
      // Reconcile replaced plot nodes even inside the mounted canvas wrapper. This is
      // how renderUI refreshes a nested plot without detaching its bound parent.
      // A replacement is always an inserted element, so only inserted subtrees are checked
      // (a whole-document query per mutation batch dominated canvas interactions on slow CPUs).
      var replaced = function (el) { var r = records.get(el.id); return r && r.node && r.el !== el; };
      var duplicate = changes.some(function (change) {
        return Array.prototype.some.call(change.addedNodes, function (node) {
          if (node.nodeType !== 1 || !node.isConnected) return false;
          if (node.matches(selector) && replaced(node)) return true;
          return Array.prototype.some.call(node.querySelectorAll(selector), replaced);
        });
      });
      if (duplicate) { discover(); return; }
      if (!changes.some(function (change) { return !root.contains(change.target); })) return;
      // Coalesce within a bounded window: unrelated live DOM updates must not
      // postpone discovery forever and leave a ready queued plot waiting.
      if (!timer) timer = setTimeout(function () { timer = null; discover(); }, 250);
    }).observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
