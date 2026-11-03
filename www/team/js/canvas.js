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
    function open(panel,node){var fresh=anchors.get(panel)!==node;anchors.set(panel,node);if(fresh&&window.innerWidth>=640&&window.TeamCanvasViewport&&TeamCanvasViewport.focusNodeForPanel)TeamCanvasViewport.focusNodeForPanel(node,Number(panel.dataset.floatingWidth)||320);place(panel,node);watch();schedule();}
    function close(panel){anchors.delete(panel);panel.style.visibility='';if(!anchors.size){if(frame!==null){cancelAnimationFrame(frame);frame=null;}unwatch();}else watch();}
    return {place:place,open:open,close:close};
  })();
  var root, board, list, status, search, records = new Map(), paletteClock = 0, pendingAdds = new Map(), sequence = 0, selectedRecord = null, preparation = null, shinyBusy = false, preparationGeneration = 0, activityGeneration = 0, syncTimer = null, syncEpoch = 0, restorePending = new Map(), ackWaiters = new Map(), applyingRestore = false, checkpointActive = false;
  var restoreReceipt = null, restoreBuilding = false, restoreFailed = false, restoreRetryButton = null;
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
    }
    window.dispatchEvent(new CustomEvent('team-canvas-restore-status', {detail:detail}));
  }
  function finishRestoreIfReady() {
    if (restoreReceipt && !restoreBuilding && !restoreFailed && !restorePending.size && !instanceRequests.size) restoreStatus('success');
  }
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
  var selector = '.html-widget-output[id], .shiny-plot-output[id]';
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
  var instanceRequests = new Map(), instanceClipboard = null, lastInstanceRequest = null;
  function sourceKey(r) { return r && r.instance ? r.instance.source : r && r.el.id; }
  function instancesConnected(){return !!(window.Shiny&&Shiny.shinyapp&&Shiny.shinyapp.$socket);}
  function instanceSupported(id) { return /^cell_(lipid|profile|class|comparison)_plot$/.test(id) || /^(results_dashboard|qc_pca_tab|barchart|heatmap_barchart_tab|volcano_tab|lsea_tab|structural_tab|structural_grid_tab|logratio_tab|group_comparison_tab|fla_tab|longitudinal_tab|pathway_tab|cellular_org_tab)-/.test(id); }
  // Last non-empty value of every input, so a selectize caught mid-reload (blank,
  // options cleared) can still be copied or saved with the user's real choice.
  var lastSelections = {};
  if (window.jQuery) jQuery(document).on('shiny:inputchanged', function (e) { if (typeof e.value !== 'string' || !e.value) return; var el = document.getElementById(e.name); if (el && el.selectize && !el.multiple) lastSelections[e.name] = e.value; });
  function instanceValues(namespace, allowed) {
    var values={}, all=window.Shiny && Shiny.shinyapp && Shiny.shinyapp.$inputValues || {};
    Object.keys(all).forEach(function(key){
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
  function parkInstance(id) { if(window.Shiny && Shiny.setInputValue) Shiny.setInputValue('team_canvas_instance_park',id,{priority:'event'}); }
  function requestInstance(source, copied, saved) {
    // New adds and pastes only; a saved card still restores.
    if (!saved && heldPlot(source)) { tell(plotTitle(source) + ' is temporarily unavailable. ' + heldPlot(source).reason); return false; }
    if(!instanceSupported(source)) { tell('Open this dedicated view to configure its data. Independent canvas copies are available for analysis modules.'); return false; }
    if(!window.Shiny||!Shiny.setInputValue)return false;
    if(Array.from(records.values()).filter(function(r){return !!r.node;}).length+illustrations.size+instanceRequests.size>=40){tell('This workspace supports 40 figures. Remove a figure before adding another.');return false;}
    var family=source.slice(0,source.indexOf('-')), suffix=source.slice(family.length+1);
    var id=saved?saved.instance.id:'tcinstance_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
    var instance=saved?saved.instance:{id:id,source:source,inputs:copied?copied.inputs:(source.indexOf('-')<0?cellSourceValues():instanceValues(family))};
    var request={instance:instance,source:source,saved:saved||null,copy:copied||null,timer:null};
    var heavy=/^(logratio_tab|group_comparison_tab|fla_tab)$/.test(family), remaining=heavy?120000:30000, wallDeadline=Date.now()+(heavy?300000:120000);
    // One active-time budget covers acknowledgement, mounting and hydration.
    // Count observed intervals only: a blocked browser or busy server is not
    // evidence that the instance has stopped making progress.
    function deadline(){
      if(instanceRequests.get(id)!==request)return;
      if(!shinyBusy && !document.documentElement.classList.contains('shiny-busy')) remaining-=250;
      if(remaining<=0 || Date.now()>=wallDeadline){instanceRequests.delete(id);if(request.saved)restoreStatus('failed');parkInstance(id);tell('The independent plot did not load in time. Check its analysis data and try again.');return;}
      request.timer=setTimeout(deadline,250);
    }
    instanceRequests.set(id,request);
    request.timer=setTimeout(deadline,250);
    Shiny.setInputValue('team_canvas_instance_create',instance,{priority:'event'});lastInstanceRequest=id;
    tell('Creating an independent '+plotTitle(source)+'…'); return true;
  }
  function setInstanceInputs(instance, onlyKeys) {
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
    if(request.saved)restoreStatus('failed');
    clearTimeout(request.timer);instanceRequests.delete(request.instance.id);parkInstance(request.instance.id);
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
  function instanceReady(message, attempt) {
    var request=message&&instanceRequests.get(message.id);if(!request)return;
    try { initializeInstance(message,attempt,request); } catch(error) { failInstance(request,error); }
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
          ready=(outputDrawnAt[el.id]||0)>value||(!plotly&&now-start>3000);
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
    if(!el){if(attempt===15){var host=document.getElementById(message.id+'_host');if(host){setInstanceInputs(request.instance);openInstanceControls({instance:request.instance,label:plotTitle(request.source),el:{id:message.id+'-'+suffix}});tell('Choose this plot’s data in its independent settings panel.');}}setTimeout(function(){instanceReady(message,(attempt||0)+1);},100);return;}
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
      var r={el:el,label:plotTitle(request.source),node:null,dynamic:!!wrapper,wrapper:wrapper,instance:request.instance,allowedInputs:message.allowedInputs||null};
      records.set(el.id,r);watchRender(r);clearTimeout(request.timer);instanceRequests.delete(message.id);
      var csvSource=csvByPlot[request.source];if(csvSource)csvByPlot[el.id]=message.id+(request.source.indexOf('-')<0?'-'+csvSource:csvSource.slice(request.source.indexOf('-')));
      if(request.saved){settleRestored(el,message.id,message.generation);restorePending.set(el.id,request.saved);hydratePending();trackRestoredInputs(r,request.instance.inputs);}
      else {if(request.copy){rememberGeometry();geometryGesture=true;r.largeHeatmapAdapted=true;r.visual=JSON.parse(JSON.stringify(request.copy.visual||{}));r.statisticsCopy=request.copy.statistics||null;r.hydrating=true;}try{add(r);if(request.copy&&r.node){r.labelInput.value=request.copy.label;r.labelHeading.textContent=request.copy.label;r.node.style.width=request.copy.width+'px';r.node.style.height=request.copy.height+'px';r.hydrating=false;resize(r);}}finally{if(request.copy)geometryGesture=false;}if(request.copy&&r.node)presentNewNode(r.node,r.el.id);}
      var opened=document.getElementById(message.id+'_host');if(opened&&opened.classList.contains('is-open')&&r.node)TeamCanvasFloatingPanel.open(opened,r.node);
      renderList();changed();
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
    if (!el.classList.contains('html-widget-output')) return false;
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
  function heldPlot(id) { return window.TeamCanvasCatalog && typeof TeamCanvasCatalog.held === 'function' ? TeamCanvasCatalog.held(id) : null; }
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
    if (heldPlot(id)) { tell(plotTitle(id) + ' is temporarily unavailable. ' + heldPlot(id).reason); return false; }
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
  var widgetGuarded=false;
  function guardWidgetResize() {
    if(widgetGuarded)return;
    var reg=window.Shiny&&Shiny.outputBindings&&Shiny.outputBindings.getBindings&&Shiny.outputBindings.getBindings(); if(!reg)return;
    reg.forEach(function(entry){
      var w=entry.binding, isPlotly=w&&(w.name==='plotly'||entry.id==='plotly'||entry.name==='plotly'||(typeof w.find==='function'&&String(w.find).indexOf('plotly')>=0)||(w.className&&String(w.className).indexOf('plotly')>=0));
      if(!isPlotly||!w.resize||w.resize.teamLogical)return;
      var original=w.resize, logical=function(el,width,height,instance){
        if(el&&el.closest&&el.closest('#team-canvas-root .tc-node')&&el.clientWidth&&el.clientHeight){width=el.clientWidth;height=el.clientHeight;}
        return original.call(this,el,width,height,instance);
      };
      logical.teamLogical=true;w.resize=logical;widgetGuarded=true;
    });
  }
  // camera: called because the canvas view changed (zoom, card box observer), not the content.
  function resize(r, camera) {
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
      if(!r.hydrating && !applyingRestore){var grows=r.node.offsetWidth<1000 || r.node.offsetHeight<1050;r.node.style.width=Math.max(1000,r.node.offsetWidth)+'px';r.node.style.height=Math.max(1050,r.node.offsetHeight)+'px';if(grows)arrange();}
    }
    var viewScale = window.TeamCanvasViewport ? window.TeamCanvasViewport.scale : 1;
    var plotTop = (r.el.getBoundingClientRect().top - r.node.getBoundingClientRect().top) / viewScale + content.scrollTop;
    // Dashboard heatmaps have a colorbar and long categorical axes. Their
    // selectors can occupy most of a saved card, so keep the plot usable and
    // let the card scroll instead of shrinking Plotly into its margins.
    var minHeight = isClassHeatmap(r.el.id) ? 750 : sourceKey(r) === 'results_dashboard-plot_heat' ? 420 : 160;
    if(square){if(r.heatOriginalMinWidth===undefined)r.heatOriginalMinWidth=r.el.style.minWidth;var hm=gd._fullLayout && gd._fullLayout.margin || gd.layout.margin || {};r.el.style.minWidth=Math.max(520,gd.data[0].x.length*16+(hm.l||0)+(hm.r||0))+'px';}
    else if(rectHeat){if(r.heatOriginalMinWidth===undefined)r.heatOriginalMinWidth=r.el.style.minWidth;r.el.style.minWidth=Math.max(800,Number(denseHorizontal?heat.naturalHeight:heat.naturalWidth)||800)+'px';}
    else if(r.heatOriginalMinWidth!==undefined){r.el.style.minWidth=r.heatOriginalMinWidth;delete r.heatOriginalMinWidth;}
    var height = square ? gd.data[0].y.length*16+210 : large ? (denseHorizontal?heat.naturalWidth:heat.naturalHeight) : Math.max(minHeight, r.node.clientHeight - plotTop - 24);
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
      }).catch(function () {}).finally(function(){r.squareResizePending=false;if(square&&gd.data&&gd.data[0]){r.heatResizePlot=gd;r.heatResizeWidth=r.el.clientWidth;r.heatResizeX=gd.data[0].x.length;r.heatResizeY=gd.data[0].y.length;}});
    }
    // Shiny uses resize to measure outputs and rerender static plots at their new dimensions.
    if(heightChanged)window.dispatchEvent(new Event('resize'));
  }
  function moveNode(node, head) {
    head.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button,input,label')) return;
      event.preventDefault(); head.setPointerCapture(event.pointerId);
      var startX = event.clientX, startY = event.clientY, left = node.offsetLeft, top = node.offsetTop;
      var scrollView = board.closest(".tc-scroll"), scrollX = scrollView ? scrollView.scrollLeft : 0, scrollY = scrollView ? scrollView.scrollTop : 0;
      function move(e) {
        node.style.left = Math.max(0, left + (e.clientX - startX + (scrollView ? scrollView.scrollLeft - scrollX : 0)) / (window.TeamCanvasViewport ? window.TeamCanvasViewport.scale : 1)) + 'px';
        node.style.top = Math.max(0, top + (e.clientY - startY + (scrollView ? scrollView.scrollTop - scrollY : 0)) / (window.TeamCanvasViewport ? window.TeamCanvasViewport.scale : 1)) + 'px';
        expandBoard();
      }
      function done() { changed(); head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', done); head.removeEventListener('pointercancel', done); }
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', done); head.addEventListener('pointercancel', done);
    });
    head.addEventListener('keydown', function (e) {
      var dx = e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0;
      var dy = e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0;
      if (!dx && !dy) return; e.preventDefault(); node.style.left = Math.max(0,node.offsetLeft + dx) + 'px'; node.style.top = Math.max(0,node.offsetTop + dy) + 'px'; expandBoard(); changed();
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
    if(fresh){creationOrder=creationOrder.filter(function(key){return key!==id;});creationOrder.unshift(id);}
    else if(creationOrder.indexOf(id)<0)creationOrder.push(id);
  }
  function arrange() {
    var nodes=Array.from(board.querySelectorAll('.tc-node:not(.tc-tab-hidden)')).sort(function(a,b){return creationOrder.indexOf(a.dataset.canvasOrderId)-creationOrder.indexOf(b.dataset.canvasOrderId);});
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
    var viewHeight=scroll?Math.max(1,scroll.clientHeight):900, avgW=30, avgH=30, maxW=30;
    if(nodes.length){avgW=nodes.reduce(function(a,n){return a+n.offsetWidth;},0)/nodes.length;avgH=nodes.reduce(function(a,n){return a+n.offsetHeight;},0)/nodes.length;maxW=Math.max.apply(null,nodes.map(function(n){return n.offsetWidth;}));}
    var columns=Math.max(1,Math.min(nodes.length||1,Math.ceil(Math.sqrt((nodes.length||1)*(available/viewHeight)*(avgH/Math.max(1,avgW)))-0.25)));
    // Room for one wider card (e.g. a heatmap) per row, so it does not drop to a row of its own.
    var width=Math.max(available/scale,30+columns*(avgW+30)+(maxW-avgW)+1), x=30,y=30,rowHeight=0;
    // Pack complete cards left-to-right with a shared row baseline. Oversized
    // cards get their own row; existing dimensions and scientific inputs stay intact.
    nodes.forEach(function(node){
      if(x>30 && x+node.offsetWidth+30>width){x=30;y+=rowHeight+30;rowHeight=0;}
      node.style.left=x+'px';node.style.top=y+'px';x+=node.offsetWidth+30;rowHeight=Math.max(rowHeight,node.offsetHeight);
    });
    expandBoard();changed();
  }
  function presentNewNode(node,id) {
    registerCreation(node,id,true);arrange();
    if(window.TeamCanvasViewport && typeof window.TeamCanvasViewport.focusNode==='function')requestAnimationFrame(function(){requestAnimationFrame(function(){if(node.isConnected)window.TeamCanvasViewport.focusNode(node,{topLeft:true,readable:sourceKey(records.get(id))==='results_dashboard-plot_heat'});});});
  }
  function add(r) {
    if (!r) return false;
    var blocked=blockedPlot(r.el.id);
    if (blocked) { tell(r.label + ' is unavailable. ' + blocked.reason); return false; }
    if (r.node) return true;
    if ((r.dynamic && !r.wrapper) || !r.el.isConnected || (dynamicOutput(r.el) && !r.wrapper)) return false;
    var card = r.el.closest('.rd-card');
    var target = card && card.querySelectorAll(selector).length === 1 ? card : r.el;
    if (r.wrapper) target = r.wrapper;
    var bar = target === r.el && r.el.previousElementSibling && r.el.previousElementSibling.classList.contains('plot-export-bar') ? r.el.previousElementSibling : null;
    var home = document.createElement('div'); home.className = 'tc-home'; home.textContent = r.label + ' is on the figure canvas.'; target.before(home);
    var barHome = null;
    if (bar) { barHome = document.createComment('Plot export controls'); bar.before(barHome); }
    var node = document.createElement('article'); node.className = 'tc-node'; node.dataset.plotId = r.el.id;
    // Full class names, legends and sample labels need room before raster capture.
    var roomyHeatmap=isClassHeatmap(r.el.id)||sourceKey(r)==='results_dashboard-plot_heat';
    var initialWidth = roomyHeatmap ? 1000 : 620, initialHeight = roomyHeatmap ? 1100 : 720;
    if (roomyHeatmap) { node.style.width = initialWidth + 'px'; node.style.height = initialHeight + 'px'; }
    var index = sequence++, x, y, occupied = Array.from(board.querySelectorAll('.tc-node:not(.tc-tab-hidden)'));
    do {
      x = 30 + (index % 2) * (initialWidth + 30); y = 30 + Math.floor(index / 2) * (initialHeight + 30); index++;
    } while (occupied.some(function (other) {
      return x < other.offsetLeft + other.offsetWidth + 20 && x + initialWidth + 20 > other.offsetLeft &&
        y < other.offsetTop + other.offsetHeight + 20 && y + initialHeight + 20 > other.offsetTop;
    }));
    sequence = Math.max(sequence, index); node.style.left = x + 'px'; node.style.top = y + 'px';
    var head = document.createElement('div'); head.className = 'tc-node-head'; head.tabIndex = 0; head.setAttribute('aria-label', 'Move ' + r.label + ' with arrow keys');
    var heading = document.createElement('strong'); heading.textContent = r.label; head.appendChild(heading);
    var tool = toolFor(r.el);
    if(sourceKey(r)==='results_dashboard-plot_heat'){var enlarge=document.createElement('button');enlarge.type='button';enlarge.textContent='Enlarge plot';enlarge.addEventListener('click',function(event){event.stopPropagation();rememberGeometry();node.style.width=Math.max(1000,node.offsetWidth)+'px';node.style.height=Math.max(1100,node.offsetHeight)+'px';arrange();resize(r);if(window.TeamCanvasViewport&&TeamCanvasViewport.focusNode)TeamCanvasViewport.focusNode(node,{readable:true});});head.appendChild(enlarge);}
    if(r.instance){var dataButton=document.createElement('button');dataButton.type='button';dataButton.textContent='Data & settings';dataButton.dataset.canvasDataSettings='';dataButton.addEventListener('click',function(){openInstanceControls(r,true);});head.appendChild(dataButton);}
    if(instanceSupported(sourceKey(r))){var copyButton=document.createElement('button');copyButton.type='button';copyButton.textContent='Copy';copyButton.addEventListener('click',function(){copyRecord(r);});head.appendChild(copyButton);var duplicateButton=document.createElement('button');duplicateButton.type='button';duplicateButton.textContent='Duplicate';duplicateButton.addEventListener('click',function(){copyRecord(r);pasteRecord();});head.appendChild(duplicateButton);}
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
    node.append(head, settings, content); board.appendChild(node);
    if (!r.hydrating) node.dataset.teamFresh='true';
    r.paletteInherit = !r.hydrating;
    r.node = node; r.target = target; r.home = home; r.bar = bar; r.barHome = barHome; r.originalHeight = originalHeight; r.originalHeightPriority = originalHeightPriority;
    registerCreation(node,r.el.id,!r.hydrating);
    r.editInputs = settingsBody.querySelectorAll('input'); r.labelInput = title; r.labelHeading = heading; r.backgroundInput = color; r.content = content; r.finishButton = finish; r.markInput = markColor;
    if (window.TeamPlotEditor) {
      settingsBody.hidden = true; settingsBody.style.display = 'none';
      var editorHost = document.createElement('div'); settings.appendChild(editorHost);
      r.plotEditor = TeamPlotEditor.mount({container:editorHost,getPlot:function(){return plotFor(r);},isLocked:function(){return !!r.snapshot;},getState:function(){return r.visual.editor || {};},onChange:function(state){notePaletteEdit(r,r.visual.editor,state);r.paletteInherit=false;r.visual.editor=state; scheduleAppearance(r);}});
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
    remove.addEventListener('click', function () { restore(r); });
    moveNode(node, head);
    // The observer also fires when only the canvas zoom changes; that is camera, not a document
    // change, so it must not start a save (each save re-renders the library panel in Shiny).
    if (window.ResizeObserver) { r.observer = new ResizeObserver(function () { expandBoard(); resize(r, true); var size = node.offsetWidth + 'x' + node.offsetHeight; if (size !== r.observedSize) { r.observedSize = size; changed(); } }); r.observer.observe(node); }
    board.classList.add('has-nodes'); expandBoard(); renderList();
    requestAnimationFrame(function () { resize(r); if (!r.hydrating && r.visual && Object.keys(r.visual).length) applyAppearance(r); inheritPaletteWhenReady(r); });
    if(!r.hydrating)presentNewNode(node,r.el.id);
    selectNode();
    if(r.instance&&window.jQuery)jQuery(r.el).trigger('shown');
    tell('Added ' + r.label + '. Use its existing plot download controls and data download when available.'); changed(); return true;
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
    if (Array.from(board.querySelectorAll('.tc-node')).length >= 40) { tell('A canvas supports at most 40 items.'); return false; }
    var node=document.createElement('article'); node.className='tc-node tc-illustration'; node.dataset.illustrationId=id; node.dataset.nodeKind='illustration';
    node.style.left=(saved&&Number.isFinite(saved.x)?saved.x:30+(sequence%2)*380)+'px'; node.style.top=(saved&&Number.isFinite(saved.y)?saved.y:30+Math.floor(sequence/2)*330)+'px';
    node.style.width=(saved&&Number.isFinite(saved.width)?saved.width:340)+'px'; node.style.height=(saved&&Number.isFinite(saved.height)?saved.height:260)+'px'; sequence++;
    if(!saved){var occupied=Array.from(board.querySelectorAll('.tc-node:not(.tc-tab-hidden)')),px=30,py=30;while(occupied.some(function(o){return px<o.offsetLeft+o.offsetWidth+20&&px+360>o.offsetLeft&&py<o.offsetTop+o.offsetHeight+20&&py+280>o.offsetTop;})){px+=370;if(px>1140){px=30;py+=290;}}node.style.left=px+'px';node.style.top=py+'px';}
    var head=document.createElement('div'); head.className='tc-node-head'; head.tabIndex=0; head.setAttribute('aria-label','Move '+item.title+' illustration with arrow keys');
    var heading=document.createElement('strong'); heading.textContent=(saved&&saved.label)||item.title; head.appendChild(heading);
    var remove=document.createElement('button'); remove.type='button'; remove.textContent='Remove'; remove.addEventListener('click',function(){ if(r.observer) r.observer.disconnect(); node.remove(); illustrations.delete(key); expandBoard(); changed(); renderList(); }); head.appendChild(remove);
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
    r.observer = window.ResizeObserver ? new ResizeObserver(function(){ expandBoard(); changed(); }) : null;
    if (r.observer) r.observer.observe(node);
    registerCreation(node,key,!saved); moveNode(node,head); board.classList.add('has-nodes'); expandBoard(); renderList(); if(!saved)presentNewNode(node,key); changed(); return true;
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
  var deResultsReady = null;
  function deReady() {
    if (deResultsReady !== null) return deResultsReady;
    function chosen(id){var el=document.getElementById(id);if(!el)return null;var x=el.selectize?el.selectize.getValue():(window.jQuery?jQuery(el).val():el.value);return Array.isArray(x)?x.length>0:!!x;}
    var ref=chosen('data_hub-deReferenceGroups'),comp=chosen('data_hub-deComparisonGroups');
    return ref===null||comp===null?true:ref&&comp;
  }
  function plotNeeds(r) { return window.TeamCanvasCatalog && typeof TeamCanvasCatalog.needs === 'function' ? TeamCanvasCatalog.needs(sourceKey(r)) : null; }
  function awaitingInput(r) {
    var need=plotNeeds(r);
    if (need && need.kind==='de' && !deReady()) return true;
    if (shinyBusy || document.documentElement.classList.contains('shiny-busy') || r.el.classList.contains('recalculating')) return false;
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
  function watchRender(r) {
    if (r.renderObserver) r.renderObserver.disconnect();
    var sequence = r.revision, expected = preparation && preparation.revision, signaled = false, settled = false, timer;
    r.renderRevision = null;
    function settle() {
      if (settled || !signaled || !r.el.isConnected || !preparationOK() || shinyBusy || preparation.revision !== expected || r.revision !== sequence) return;
      var gd = plotFor(r), img = r.el.querySelector('img');
      if ((gd && gd.data && gd.data.length && gd._fullLayout) || (img && img.complete && img.naturalWidth && img.naturalHeight)) {
        settled = true;
        if (r.editorSourceReset && window.TeamPlotEditor && TeamPlotEditor.resetSource) { TeamPlotEditor.resetSource(gd); r.editorSourceReset=false; }
        if (r.plotEditor) r.plotEditor.refresh();
        inheritPaletteWhenReady(r);
        r.renderRevision = expected; r.sourceError = false; if (r.renderObserver) r.renderObserver.disconnect();
        if (r.node && r.statistics && window.TeamCanvasStatistics) TeamCanvasStatistics.rendered(r);
        if (r.node && sourceKey(r)==='results_dashboard-plot_heat') resize(r);
        if (r.hydrating && !r.snapshot && r.node) { r.hydrating = false; scheduleAppearance(r); tell('The saved figure settings were applied to the current result.'); }
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
    var wasArchived = !!(r.snapshot && r.snapshot.archived);
    if (r.preview) r.preview.remove(); r.preview = null; r.snapshot = null;
    if (wasArchived) { r.hydrating = true; if (figureCurrent(r)) { r.hydrating = false; scheduleAppearance(r); } }
    r.node.classList.remove('tc-finished', 'tc-stale'); restoreSnapshotSource(r);
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
    var image = document.createElement('img'); image.src = snapshot.url; image.alt = r.label + ' frozen figure'; preview.appendChild(image);
    var exports = document.createElement('div'); exports.className = 'tc-snapshot-exports';
    ['PNG','SVG','PDF'].forEach(function (format) { var button = document.createElement('button'); button.type = 'button'; button.textContent = format; button.addEventListener('click', function () { exportSnapshot(r, format); }); exports.appendChild(button); });
    preview.appendChild(exports); parkSnapshotSource(r); r.node.appendChild(preview);
    r.preview = preview; r.snapshot = snapshot; r.node.classList.add('tc-finished');
    r.finishButton.textContent = 'Edit'; r.finishButton.setAttribute('aria-pressed','true');
  }
  function groupComparisonProvenance(r) {
    if(sourceKey(r)!=='group_comparison_tab-comparisonPlot')return null;
    var value=window.TeamGroupComparison && TeamGroupComparison.provenance && TeamGroupComparison.provenance(r.el.id);
    var keys=['gcTest','gcBaseline','gcScale','gcReference','gcAdjustment','gcSignature'];
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==keys.length || keys.some(function(k){return typeof value[k]!=='string'||!value[k].length||value[k].length>1000;}) || !/^[a-f0-9]{64}$/i.test(value.gcSignature)) throw new Error('Confirm the Group comparison settings and wait for the current result before finishing.');
    var out={};keys.forEach(function(k){out[k]=value[k];});return out;
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
        // Settle Plotly at its logical CSS size, independently of canvas viewport zoom.
        await Promise.resolve(Plotly.Plots.resize(gd));
        if (r.node !== captureNode || !guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
        var rect = gd.getBoundingClientRect(), computed = getComputedStyle(gd);
        var viewScale = window.TeamCanvasViewport && Number(window.TeamCanvasViewport.scale) > 0 ? Number(window.TeamCanvasViewport.scale) : 1;
        var width = gd.clientWidth || parseFloat(computed.width) || rect.width / viewScale;
        var height = gd.clientHeight || parseFloat(computed.height) || rect.height / viewScale;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) throw new Error('Plot is not ready.');
        var capture=function(){return Plotly.toImage(gd, {format:'svg', width:Math.round(width), height:Math.round(height)});};
        if(sourceKey(r)==='group_comparison_tab-comparisonPlot') {
          if(!window.TeamGroupComparison || typeof TeamGroupComparison.withExportGeometry!=='function') throw new Error('Group comparison export is not ready. Try again.');
          url=await TeamGroupComparison.withExportGeometry(gd,capture);
        } else url=await capture();
      } else if (source && source.complete && source.naturalWidth && source.naturalHeight) {
        var c = document.createElement('canvas'); c.width = source.naturalWidth; c.height = source.naturalHeight; c.getContext('2d').drawImage(source,0,0); url = c.toDataURL('image/png');
      } else throw new Error('Plot is not ready.');
      if (r.node !== captureNode || !guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
      if (typeof url !== 'string' || url.length > 4 * 1024 * 1024) throw new Error('This figure is too large to finish and save. The live plot remains editable; reduce its size or use its existing download controls.');
      if (r.statistics && window.TeamCanvasStatistics && TeamCanvasStatistics.busy(r)) throw new Error('The violin statistics changed while finishing. Try again.');
      if(groupProvenance && JSON.stringify(groupComparisonProvenance(r))!==JSON.stringify(groupProvenance)) throw new Error('The Group comparison changed while finishing. Try again.');
      showSnapshot(r, {url:url, stale:false, createdAt:new Date().toISOString(), provenance:Object.assign({preparationRevision:revision}, r.statistics && window.TeamCanvasStatistics ? TeamCanvasStatistics.provenance(r) : {},groupProvenance||{}), preparationRevision:revision, preparationGeneration:generation, renderGeneration:renderGeneration});
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
    if (!r.node) return;
    if(r.instance)closeInstanceControls(document.getElementById(r.instance.id+'_host'));
    if (!r.home.isConnected) { tell('The original view changed; ' + r.label + ' remains on the canvas.'); return; }
    if (r.observer) r.observer.disconnect();
    if (r.plotEditor) { r.plotEditor.destroy(); r.plotEditor=null; }
    if (r.statistics && window.TeamCanvasStatistics) TeamCanvasStatistics.detach(r);
    restoreSnapshotSource(r);
    // Module content parked by the shell goes home usable: clear the card-only marks.
    if (r.target) r.target.querySelectorAll('.tc-figure-chrome,.tc-figure-park').forEach(function (el) { el.classList.remove('tc-figure-chrome', 'tc-figure-park'); el.inert = false; });
    // Card plots run with an explicit logical size; give the returned plot back its autosize.
    var returned = r.el && (r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot'));
    if (returned && returned.layout && returned.layout.autosize === false && window.Plotly) { try { window.Plotly.relayout(returned, {autosize: true, width: null, height: null}); } catch (ignore) {} }
    if(r.canvasCopyNote){r.canvasCopyNote.textContent=r.canvasCopyOriginal;r.canvasCopyNote=null;}
    if (r.originalHeight) r.el.style.setProperty('height', r.originalHeight, r.originalHeightPriority); else r.el.style.removeProperty('height');
    if (r.home.isConnected) { r.home.replaceWith(r.target); }
    if (r.bar && r.barHome && r.barHome.isConnected) r.barHome.replaceWith(r.bar);
    r.node.remove(); r.node = null;
    if(r.instance){if(window.jQuery)jQuery(r.el).trigger('hidden');parkInstance(r.instance.id);}
    if (selectedRecord === r) { selectedRecord = null; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:null})); }
    board.classList.toggle('has-nodes', !!board.querySelector('.tc-node')); expandBoard(); renderList();
    window.dispatchEvent(new Event('resize')); tell('Returned ' + r.label + ' to its original view.'); changed();
  }
  function unsafeSvgReference(value) {
    // Strip only exact, local URL references. Optional-quote negative
    // lookaheads can backtrack and reject safe url('#id') references.
    var withoutLocal = value.replace(/url\(\s*(['"]?)#[A-Za-z0-9_.:-]+\1\s*\)/gi, '');
    return /[\\@]|\/\*/.test(value) || /url\s*\(/i.test(withoutLocal) || /javascript:/i.test(value);
  }
  function checkedImage(url) {
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
  function nodeState(r) {
    var n = r.node, snap = r.snapshot, finished = null;
    if (snap) { finished = {url:snap.url,createdAt:snap.createdAt,stale:!!snap.stale}; if (snap.provenance) finished.provenance = snap.provenance; }
    var state={id:r.el.id,label:r.labelInput.value || r.label,x:parseFloat(n.style.left)||0,y:parseFloat(n.style.top)||0,width:parseFloat(n.style.width)||parseFloat(getComputedStyle(n).width)||620,height:parseFloat(n.style.height)||parseFloat(getComputedStyle(n).height)||720,visual:Object.assign({},r.visual),finished:finished,insight:r.insight || null};
    if(r.instance)state.instance={id:r.instance.id,source:r.instance.source,inputs:restoredInputs(r,instanceValues(r.instance.id,r.allowedInputs))};
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
  function collectState() {
    var nodes = Array.from(records.values()).filter(function (r) { return !!r.node; }).map(nodeState).concat(Array.from(illustrations.values()).map(illustrationNodeState));
    restorePending.forEach(function (n) { nodes.push(n); });
    nodes.sort(function(a,b){return creationOrder.indexOf(a.id)-creationOrder.indexOf(b.id);});
    var raw = {version:'1', libraryHidden:root.querySelector('.tc-layout').classList.contains('tc-library-hidden'), nodes:nodes, document:documentForNodes(documentState,nodes)};
    var tabs = window.TeamCanvasTabs ? TeamCanvasTabs.serialize(nodes.map(function(n){return n.id;})) : null; if (tabs) raw.tabs = tabs;
    var result = validateState(raw);
    if (new TextEncoder().encode(JSON.stringify(result)).length > 24 * 1024 * 1024) throw new Error('The figure workspace is too large to save. Remove or resize a saved figure.');
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
  function changed() {
    if (applyingRestore) return;
    rememberGeometry();
    syncEpoch++; clearTimeout(syncTimer);
    // Team autosave listens to this lightweight signal.  It intentionally carries
    // no data; the validated canvas state is collected only when a save starts.
    window.dispatchEvent(new CustomEvent('team-canvas-changed', {detail:{epoch:syncEpoch}}));
    if (!checkpointActive) syncTimer = setTimeout(function () { sendBackground(); }, 350);
  }
  async function settledState() {
    if(instanceRequests.size)throw new Error('Wait for the independent plots to finish loading before saving.');
    for (var i=0; i<10; i++) {
      var epoch = syncEpoch, active = Array.from(records.values()).filter(function (r) { return !!r.node; });
      var finishes = await Promise.all(active.map(function (r) { return r.finishPromise || Promise.resolve(true); }));
      if (finishes.some(function (ok) { return ok === false; })) throw new Error('A figure could not be finished. Review it before saving.');
      await Promise.all(active.map(flushAppearance));
      if (epoch === syncEpoch) return {state:collectState(),epoch:epoch};
    }
    throw new Error('The figure workspace is still changing. Try saving again.');
  }
  function token() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  function sendBackground() {
    if (checkpointActive || !window.Shiny || !Shiny.setInputValue) return;
    settledState().then(function (captured) {
      if (checkpointActive || captured.epoch !== syncEpoch) return;
      Shiny.setInputValue('team_canvas_state', {token:token(),state:captured.state}, {priority:'event'});
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
        Shiny.setInputValue('team_canvas_state', {token:id,state:captured.state}, {priority:'event'});
        await ack;
        if (captured.epoch === syncEpoch) { succeeded = true; return {token:id}; }
      }
      throw new Error('The figure workspace kept changing while saving. Try again.');
    } finally {
      checkpointActive = false;
      if (!succeeded) { clearTimeout(syncTimer); syncTimer = setTimeout(sendBackground,350); }
    }
  }
  function hydratePending() {
    if (!restorePending.size) return;
    var waiting = [], withheld = [];
    restorePending.forEach(function (saved, id) {
      var blocked=blockedPlot(id);
      if (blocked) { restorePending.delete(id); withheld.push(saved.label || plotTitle(id)); return; }
      var r = records.get(id);
      if (saved.instance && instanceRequests.has(saved.instance.id)) { waiting.push(saved.label);return; }
      if (!r || !r.el.isConnected || (r.dynamic && !r.wrapper) || (dynamicOutput(r.el) && !r.wrapper)) { waiting.push(saved.label); return; }
      applyingRestore = true;
      try {
        r.largeHeatmapAdapted=true;
        r.insight = saved.insight ? validateInsight(saved.insight) : null;
        r.visual = Object.assign({}, saved.visual); r.hydrating = true; r.statisticsSaved = saved.statistics || null; add(r);
        if (!r.node) { waiting.push(saved.label); return; }
        r.node.style.left = saved.x + 'px'; r.node.style.top = saved.y + 'px'; r.node.style.width = saved.width + 'px'; r.node.style.height = saved.height + 'px';
        r.labelInput.value = saved.label; r.labelHeading.textContent = saved.label; r.displayTitle = saved.label;
        r.editInputs.forEach(function (input) { var key = input.dataset.visualKey; if (saved.visual[key] !== undefined) input.value = saved.visual[key]; });
        if (saved.visual.background) { r.backgroundInput.value = saved.visual.background; r.content.style.backgroundColor = saved.visual.background; }
        if (saved.finished) showSnapshot(r, {url:saved.finished.url, createdAt:saved.finished.createdAt, stale:saved.finished.stale, provenance:saved.finished.provenance, archived:true});
        restorePending.delete(id); expandBoard();
      } finally { applyingRestore = false; }
    });
    if (waiting.length) tell('Saved plots awaiting their analysis (source analysis replaced or not yet mounted): ' + waiting.join(', ') + '. Open the relevant analysis to load them.');
    if (withheld.length) { restoreStatus('failed'); tell('Skipped saved plot' + (withheld.length===1?'':'s') + ' with unvalidated scale: ' + withheld.join(', ') + '. Use Dashboard → Feature distributions while this view is checked.'); }
    finishRestoreIfReady();
  }
  function restoreState(input, receipt) {
    restoreReceipt = typeof receipt === 'string' && receipt ? receipt : null;
    restoreFailed = false; restoreBuilding = true; restoreStatus('pending');
    var state = validateState(input);
    creationOrder=state.nodes.map(function(node){return node.id;});
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
      illustrations.forEach(function (r) { if (r.observer) r.observer.disconnect(); if (r.node) r.node.remove(); }); illustrations.clear();
      documentState=state.document || null;
      restorePending.clear(); state.nodes.forEach(function (n) { restorePending.set(n.id,n); });
      var hidden = state.libraryHidden, layout = root.querySelector('.tc-layout'), toggle = root.querySelector('.tc-library-toggle');
      layout.classList.toggle('tc-library-hidden', hidden); toggle.setAttribute('aria-expanded', String(!hidden)); toggle.textContent = hidden ? 'Show library' : 'Hide library';
    } finally { applyingRestore = false; }
    state.nodes.forEach(function(n){if(n.instance)requestInstance(n.instance.source,null,n);});
    syncEpoch++; hydratePending(); expandBoard();
    // Saved geometry lets the viewport frame the workspace before the plots arrive.
    // Tabs first: the camera frames the active tab's cards only (all cards without tabs).
    var shownFirst = window.TeamCanvasTabs ? TeamCanvasTabs.restore(state.tabs || null, state.nodes.map(function (n) { return n.id; })) : null;
    window.dispatchEvent(new CustomEvent('team-canvas-restored', {detail:{nodes:state.nodes.filter(function (n) { return !shownFirst || shownFirst.indexOf(n.id) >= 0; }).map(function (n) { return {x:n.x, y:n.y, width:n.width, height:n.height}; })}}));
    window.dispatchEvent(new Event('team-document-restored'));
    state.nodes.filter(function (n) { return n.kind === 'illustration'; }).forEach(function (n) { restorePending.delete(n.id); if(!addIllustration(n.assetId,n)) restoreStatus('failed'); });
    restoreBuilding = false;
    if (withheld.length) restoreStatus('failed'); else finishRestoreIfReady();
    if (withheld.length) tell('Skipped saved plot' + (withheld.length===1?'':'s') + ' with unvalidated scale: ' + withheld.join(', ') + '. Use Dashboard → Feature distributions while this view is checked.');
    else if (cancelled.length) tell('Saved figure workspace restored. Cleared queued adds for ' + cancelled.join(', ') + '. Saved figures are archived until edited.');
    else if (!restorePending.size) tell('Saved figure workspace restored. Saved figures are archived until edited.');
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
    document.addEventListener('keydown',function(event){if(!root.contains(event.target)||!(event.metaKey||event.ctrlKey)||event.altKey||event.target.closest('input,textarea,select,[contenteditable=true]'))return;if(event.key.toLowerCase()==='c'&&copyRecord(selectedRecord))event.preventDefault();else if(event.key.toLowerCase()==='v'&&pasteRecord())event.preventDefault();});
    board.addEventListener('pointerdown',function(event){
      if(!event.target.closest('.tc-node'))return;
      rememberGeometry(); geometryGesture=true;
    });
    function finishGeometryGesture(){if(!geometryGesture)return;geometryGesture=false;rememberGeometry();}
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
    search.addEventListener('input', renderList);
    root.querySelector('.tc-reset').addEventListener('click', function () { documentState=null; var cancelled=clearAllQueuedAdds(); records.forEach(restore); illustrations.forEach(function (r) { if (r.observer) r.observer.disconnect(); if (r.node) r.node.remove(); }); illustrations.clear(); if (restorePending.size) { restorePending.clear(); changed(); tell('Returned all plots and cleared plots awaiting their analysis.'); } else if (cancelled.length) tell('Returned all plots and cancelled queued adds for ' + cancelled.join(', ') + '.'); else { changed(); tell('Returned all plots and illustrations to the library.'); } });
    root.querySelector('.tc-arrange').addEventListener('click', arrange);
    root.querySelector('.tc-library-toggle').addEventListener('click', function () {
      var hidden = root.querySelector('.tc-layout').classList.toggle('tc-library-hidden');
      this.setAttribute('aria-expanded', String(!hidden)); this.textContent = hidden ? 'Show library' : 'Hide library';
      window.dispatchEvent(new Event('resize')); changed();
    });
    if (window.Shiny && Shiny.addCustomMessageHandler) {
      Shiny.addCustomMessageHandler('team-canvas-instance-ready',function(message){instanceReady(message,0);});
      Shiny.addCustomMessageHandler('team-canvas-instance-settled',function(m){if(!m||!m.id)return;settledInstances[m.id]={generation:m.generation,at:++messageSequence};window.dispatchEvent(new CustomEvent('team-canvas-instance-settled',{detail:m.id}));});
      Shiny.addCustomMessageHandler('team-canvas-de-state',function(message){deResultsReady=!!(message&&message.ready);});
      Shiny.addCustomMessageHandler('team-canvas-instance-error',function(message){var request=instanceRequests.get(message.id);if(request){if(request.saved)restoreStatus('failed');clearTimeout(request.timer);parkInstance(message.id);}instanceRequests.delete(message.id);tell(message.message||'Could not create an independent plot.');});
      Shiny.addCustomMessageHandler('team-preparation-state', function (state) { window.dispatchEvent(new CustomEvent('team-preparation-state', {detail:state})); });
      Shiny.addCustomMessageHandler('team-canvas-state-ack', function (message) {
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
      if (!instanceRequests.size) return;
      instanceRequests.forEach(function (request) { clearTimeout(request.timer); if (request.saved) restoreStatus('failed'); });
      instanceRequests.clear(); tell('The connection was lost while independent plots were loading. Reconnect and retry.');
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
      addIllustration: function (id) { return addIllustration(id); },
      // Re-fit a card's plot to its frame (the shell parks module content around it).
      fitPlot:function(id){var r=records.get(id);if(r&&r.node)resize(r);},
      fitAllPlots:function(){records.forEach(function(r){if(r.node)resize(r, true);});},
      // Read-only card state for the shell's status chips and export warning.
      cardStatus:function(id){var r=records.get(id);if(!r||!r.node)return null;if(r.snapshot)return r.snapshot.stale?'finished-stale':'finished';if(r.sourceError)return 'error';if(!preparationOK())return preparation&&(preparation.running||preparation.restoring)?'updating':'pending';if(awaitingInput(r))return 'waiting';return figureCurrent(r)?'current':'updating';},
      catalogSource:function(id){var r=records.get(id);return r?sourceKey(r):null;},
      insightSupported:function(id){var r=records.get(id);return !!(r&&r.instance&&(r.instance.source.indexOf('results_dashboard-')===0||/^cell_(lipid|profile|class|comparison)_plot$/.test(r.instance.source)));},
      copyPlot:function(id){return copyRecord(records.get(id));},
      // Canvas tabs: an independent copy that leaves the Copy/Paste clipboard alone; returns its instance id.
      copyPlotAsInstance:function(id){var copied=copyData(records.get(id));if(!copied)return false;lastInstanceRequest=null;return requestInstance(copied.source,copied)&&lastInstanceRequest?lastInstanceRequest:false;},
      creationOrder:function(){return creationOrder.slice();},pastePlot:pasteRecord,duplicatePlot:function(id){return copyRecord(records.get(id))&&pasteRecord();},
      addPlot: function (id) { if(instancesConnected()&&instanceSupported(id))return requestInstance(id); if (blockedPlot(id)) { tell(plotTitle(id) + ' is unavailable. ' + blockedPlot(id).reason); return false; } if (!records.has(id)) discover(); var r = records.get(id); if (!r || (r.dynamic && !r.wrapper) || !r.el.isConnected) return false; return add(r); },
      addCatalogPlot: function (id) { if (heldPlot(id)) { tell(plotTitle(id) + ' is temporarily unavailable. ' + heldPlot(id).reason); return false; } if(instancesConnected()&&instanceSupported(id))return requestInstance(id); if (routeOnlyPlot(id)) { tell('Use Open export studio to configure this publication preview.'); return false; } if (blockedPlot(id)) { tell(plotTitle(id) + ' is unavailable. ' + blockedPlot(id).reason); return false; } if (!records.has(id)) discover(); var r=records.get(id); if (!r || (r.dynamic && !r.wrapper) || !r.el.isConnected) return false; return add(r); },
      queuePlot: function (id, route) { if(instancesConnected()&&instanceSupported(id))return requestInstance(id); if (blockedPlot(id)) { tell(plotTitle(id) + ' is unavailable. ' + blockedPlot(id).reason); return false; } return queueAdd(id,route); },
      cancelQueuedAdd: function (id) { return clearQueuedAdd(id,'Cancelled queued add for “' + plotTitle(id) + '”.'); },
      previewState: function () {
        reconcileIdle();
        var state=collectState(), nodes=Array.from(records.values()).filter(function (r) { return !!r.node; }).concat(Array.from(illustrations.values()));
        var documentItems=state.document && Array.isArray(state.document.items) ? state.document.items : [];
        var hasContent=nodes.length > 0 || documentItems.length > 0;
        var settled=!instanceRequests.size && !shinyBusy && !(window.Shiny && Shiny.shinyapp && document.documentElement.classList.contains('shiny-busy')) && !pendingAdds.size && !restorePending.size;
        function usable(r) {
          if (r.kind === 'illustration') return !!r.snapshot && checkedImage(r.snapshot.url);
          if (!r.snapshot || r.snapshot.stale || !checkedImage(r.snapshot.url)) return false;
          var image=r.preview && r.preview.querySelector('img');
          if (!r.preview || !r.preview.isConnected || !image || !r.preview.contains(image) || image.getAttribute('src') !== r.snapshot.url) return false;
          if (r.snapshot.archived) return true;
          return snapshotGuard(r,r.snapshot,activityGeneration);
        }
        // The figure page composes the usable (finished, current) figures; live
        // or stale cards are reported by id so the page can list them.
        var usableIds=[], unusable=[];
        nodes.forEach(function (r) { var id=r.kind==='illustration'?r.id:r.el.id; if (usable(r)) usableIds.push(id); else unusable.push({id:id,label:(r.labelInput&&r.labelInput.value)||r.label||id,reason:!r.snapshot?'live':r.snapshot.stale?'stale':'invalid'}); });
        var ready=settled && hasContent && !unusable.length;
        var queuedNames=Array.from(pendingAdds.values()).map(function (pending) { return pending.label; });
        return {state:state,ready:ready,settled:settled,blank:!hasContent,usableIds:usableIds,unusable:unusable,archived:nodes.filter(function (r) { return !!(r.snapshot && r.snapshot.archived); }).length,message:ready?'Finished figures are ready for preview.':instanceRequests.size?'Independent plots are still loading. Wait before opening the preview.':shinyBusy?'The analysis is updating. Wait for it to finish before previewing.':pendingAdds.size?'Queued add' + (queuedNames.length===1?'':'s') + ' not ready: ' + queuedNames.join(', ') + '. Cancel in the catalog or wait up to 90 seconds.':restorePending.size?'Saved plots are waiting for their analysis to load.':!hasContent?'Add a plot or drawing before opening the preview.':nodes.some(function (r) { return !r.snapshot; })?'Finish every canvas plot before opening the preview.':'A finished figure is stale or no longer valid. Review it before previewing.'};
      },
      // Canvas tabs: snapshot before a tab edit, then save (navigation only saves).
      tabsWillChange: function () { rememberGeometry(); },
      tabsChanged: function (navigation) { if (navigation) { if (!geometryReplay && !geometryGesture && board) geometryLast = geometryState(); if (!applyingRestore) { syncEpoch++; window.dispatchEvent(new CustomEvent('team-canvas-changed', {detail:{epoch:syncEpoch}})); if (!checkpointActive) { clearTimeout(syncTimer); syncTimer = setTimeout(function () { sendBackground(); }, 350); } } return; } changed(); },
      deselect: function () { if (!selectedRecord) return; selectedRecord = null; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:null})); },
      selected: function () { return selectedRecord && selectedRecord.node ? {id:selectedRecord.el.id, title:selectedRecord.displayTitle || selectedRecord.label} : null; },
      getInsight: function(id){var r=records.get(id),saved=restorePending.get(id),note=saved?saved.insight:r?r.insight:undefined;return note?validateInsight(note):saved||r?null:undefined;},
      setInsight: function(id,value){var r=records.get(id),saved=restorePending.get(id);if(!r&&!saved)return false;var note=value==null?null:validateInsight(value);if(saved)saved.insight=note;if(r)r.insight=note;if(saved||(r&&r.node))changed();return true;},
      getGroupComparison: function(id){var r=records.get(id),saved=restorePending.get(id),v=saved?saved.visual:r?r.visual:null;return v&&v.groupComparison?validateGroupComparison(v.groupComparison):null;},
      setGroupComparison: function(id,value){var r=records.get(id),saved=restorePending.get(id),owner=saved?saved.instance:r&&r.instance;if(!owner||owner.source!=='group_comparison_tab-comparisonPlot')return false;var v=validateGroupComparison(value),old=saved?saved.visual.groupComparison:r.visual&&r.visual.groupComparison;if(JSON.stringify(old)===JSON.stringify(v))return true;if(saved)saved.visual.groupComparison=v;if(r){r.visual=r.visual||{};r.visual.groupComparison=v;staleSnapshot(r);}changed();return true;},
      reapplyGroupComparisonEditor: function(id){var r=records.get(id);if(!r||!r.node||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot')return Promise.resolve(false);var gd=plotFor(r);if(!gd)return Promise.resolve(false);if(window.TeamPlotEditor&&TeamPlotEditor.resetSource)TeamPlotEditor.resetSource(gd);if(r.plotEditor)r.plotEditor.refresh();if(!r.visual||!r.visual.editor)return Promise.resolve(true);r.appearancePending=true;return flushAppearance(r).then(function(){return true;});},
      invalidateGroupComparison: function(id){var r=records.get(id);if(!r||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot')return false;r.revision=(r.revision||0)+1;staleSnapshot(r);watchRender(r);return true;},
      clearGroupComparisonPanelColors: function(id,feature){var r=records.get(id);if(!r||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot'||typeof feature!=='string'||!feature.length||feature.length>500)return false;var editor=r.visual&&r.visual.editor;if(!editor||!Array.isArray(editor.traces))return true;var modified=false;editor.traces.forEach(function(t){var prefix='source:group-comparison:';if(typeof t.sourceKey!=='string'||!t.sourceKey.startsWith(prefix))return;try{var parts=JSON.parse(t.sourceKey.slice(prefix.length));if(!Array.isArray(parts)||parts[0]!==feature||parts[2]!=='violin')return;['fillColor','fillOpacity','lineColor'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(t,k)){delete t[k];modified=true;}});}catch(ignore){}});if(modified){staleSnapshot(r);if(r.plotEditor)r.plotEditor.refresh();changed();}return true;},
      clearGroupComparisonPanelVisibility: function(id,feature,condition){var r=records.get(id);if(!r||!r.instance||r.instance.source!=='group_comparison_tab-comparisonPlot'||typeof feature!=='string'||!feature.length||feature.length>500||typeof condition!=='string'||!condition.length||condition.length>500)return false;var editor=r.visual&&r.visual.editor;if(!editor||!Array.isArray(editor.traces))return true;var key='source:group-comparison:'+JSON.stringify([feature,condition,'violin']),modified=false;editor.traces.forEach(function(t){if(t.sourceKey===key&&Object.prototype.hasOwnProperty.call(t,'hidden')){delete t.hidden;modified=true;}});if(modified){staleSnapshot(r);if(r.plotEditor)r.plotEditor.refresh();changed();}return true;},
      getDocument: function(){return documentState ? JSON.parse(JSON.stringify(documentState)) : null;},
      setDocument: function(state){documentState=validateDocument(state,collectState().nodes);changed();},
      checkpoint: checkpoint, serialize: collectState, restore: restoreState
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
        var same=!actualChange && !r.hydrating && r.sourceSignature===signature && r.sourcePreparationRevision===sourceRevision && r.renderRevision===sourceRevision;
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
      if (/shiny\.silent\.error/.test(types) || err.message==='') { r.sourceWaiting = true; return; }
      r.revision = (r.revision || 0) + 1; r.renderRevision = null; r.sourceError = true; r.sourceSignature = null;
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
