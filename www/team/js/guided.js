/* The guided shell moves existing bound controls; it never clones input IDs. */
(function () {
  'use strict';
  var current = {step:1,tool:'',goal:'overview'}, paintedPage=null;
  var designFields=['guide_unit','guide_design_type','guide_design_confirm','data_hub-selectedColumns'];
  var focusFields=designFields.concat(['data_hub-files','sample_metadata_import-file','data_hub-openMetadataMappingBtn','data_hub-runAnalysis']);
  function focusDesignField(id) {
    if(focusFields.indexOf(id)===-1)return;
    var attempts=0;
    function reveal(){
      var el=document.getElementById(id);
      if(el){var collapse=el.closest('.accordion-collapse');if(collapse&&!collapse.classList.contains('show')){collapse.classList.add('show');var toggle=el.closest('.accordion-item').querySelector('.accordion-button');if(toggle){toggle.classList.remove('collapsed');toggle.setAttribute('aria-expanded','true');}}}
      var fileField=el&&el.matches('input[type="file"]')?el.closest('.shiny-input-container'):null;
      var visibleTarget=fileField&&(fileField.querySelector('.btn-file, label.btn, button')||fileField);
      if(!el||!(visibleTarget||el).getClientRects().length){if(++attempts<90)requestAnimationFrame(reveal);return;}
      document.querySelectorAll('.guide-field-focus').forEach(function(e){e.classList.remove('guide-field-focus');});
      var field=fileField||el.closest('.shiny-input-container')||el;field.classList.add('guide-field-focus');
      var focusable=visibleTarget||(el.matches('input,select,textarea,button')?el:el.querySelector('input,select,textarea,button'));
      if(focusable)focusable.focus({preventScroll:true});
      field.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    requestAnimationFrame(function(){requestAnimationFrame(reveal);});
  }
  function send(name,value) { if(window.Shiny) Shiny.setInputValue(name,value,{priority:'event'}); }
  function moveControls() {
    var run=document.getElementById('dock_panel_pipeline'),target=document.getElementById('guide-run-controls');
    if(run&&target&&run.parentNode!==target)target.appendChild(run);
    [['#data_hub-columnSelectorUI','#guide-sample-selection'],['#data_hub-deMethod','#guide-contrast-controls']].forEach(function(pair){
      var el=document.querySelector(pair[0]),dest=document.querySelector(pair[1]);
      var item=el&&el.closest('.accordion-item');
      if(item&&dest&&item.parentNode!==dest){dest.appendChild(item);var open=pair[1]!=='#guide-sample-selection';var collapse=item.querySelector('.accordion-collapse');if(collapse)collapse.classList.toggle('show',open);var b=item.querySelector('.accordion-button');if(b){b.classList.toggle('collapsed',!open);b.setAttribute('aria-expanded',String(open));}}
    });
  }
  function ensureNarrowControlsToggle() {
    var toolbar=document.getElementById('guide-analysis-toolbar');
    var sidebar=document.getElementById('main_sidebar');
    if(!toolbar||!sidebar||document.getElementById('guide-narrow-controls'))return;
    var button=document.createElement('button');
    button.id='guide-narrow-controls';button.type='button';button.className='guide-button guide-narrow-controls';
    button.textContent='Plot controls';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','main_sidebar');
    var close=document.createElement('button');close.type='button';close.className='guide-narrow-controls-close';close.textContent='Close plot controls';
    close.onclick=function(){setOpen(false,true);};sidebar.insertBefore(close,sidebar.firstChild);
    function updateOffset(){
      var navbar=document.querySelector('.navbar');
      var bottom=navbar?navbar.getBoundingClientRect().bottom:0;
      document.body.style.setProperty('--guide-sidebar-top',Math.max(0,Math.min(window.innerHeight-80,bottom))+'px');
    }
    function focusables(){
      return Array.from(sidebar.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function(el){return !el.disabled&&!el.inert&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';});
    }
    function setOpen(open,focus){
      updateOffset();
      document.body.classList.toggle('guide-narrow-controls-open',open);
      sidebar.inert=!open;button.setAttribute('aria-expanded',String(open));
      if(open){if(window.activateDockTab)window.activateDockTab('plot_controls');if(window.expandSidebar)window.expandSidebar($(sidebar));close.focus();}
      if(!open&&focus){
        if(button.getClientRects().length)button.focus();
        else{
          var heading=document.querySelector('.guide-page .guide-heading h2');
          if(heading){heading.tabIndex=-1;heading.focus();}
        }
      }
      window.dispatchEvent(new Event('resize'));
    }
    window.openGuideControls=function(){if(window.matchMedia('(max-width:899px)').matches)setOpen(true,false);};
    window.closeGuideControls=function(restoreFocus){if(document.body.classList.contains('guide-narrow-controls-open'))setOpen(false,restoreFocus);};
    button.onclick=function(){
      var open=!document.body.classList.contains('guide-narrow-controls-open');
      setOpen(open,true);
    };
    sidebar.addEventListener('keydown',function(e){
      if(!window.matchMedia('(max-width:899px)').matches||!document.body.classList.contains('guide-narrow-controls-open'))return;
      var selectize=e.target.closest('.selectize-control');
      var dropdown=selectize&&selectize.querySelector('.selectize-dropdown');
      var menuOpen=!!(dropdown&&dropdown.getClientRects().length&&getComputedStyle(dropdown).display!=='none');
      if(e.key==='Escape'){
        // Selectize uses Escape to close its own menu before the drawer closes.
        if(menuOpen)return;
        e.preventDefault();setOpen(false,true);return;
      }
      if(e.key!=='Tab'||menuOpen||e.target.closest('.selectize-dropdown'))return;
      var items=focusables(),first=items[0],last=items[items.length-1];
      if(!first)return;
      if(e.shiftKey&&(document.activeElement===first||!sidebar.contains(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!sidebar.contains(document.activeElement))){e.preventDefault();first.focus();}
    });
    function syncNarrow(){
      var narrow=window.matchMedia('(max-width:899px)').matches;
      updateOffset();
      if(!narrow){sidebar.inert=false;document.body.classList.remove('guide-narrow-controls-open');button.setAttribute('aria-expanded','false');}
      else if(!document.body.classList.contains('guide-narrow-controls-open'))sidebar.inert=true;
    }
    window.addEventListener('resize',syncNarrow);window.addEventListener('scroll',updateOffset,{passive:true});syncNarrow();
    toolbar.appendChild(button);
  }
  function paint() {
    document.body.classList.add('guided-app');
    document.body.dataset.guideStep=current.step;
    document.body.dataset.guideGoal=current.goal;
    document.body.dataset.guideExperimentStage=current.experimentStage||'';
    document.body.dataset.guidePreparationStage=current.preparationStage||'';
    document.querySelectorAll('.guide-goals .action-button').forEach(function(b){b.setAttribute('aria-pressed',String(b.id==='guide_goal_'+current.goal));});
    var detail=document.getElementById('tertiary_subsubtab_bar'),toolbar=document.getElementById('guide-analysis-toolbar');
    if(detail&&toolbar&&detail.previousElementSibling!==toolbar)toolbar.after(detail);
    var hasPlotControls=!!current.tool&&!['Publication Export Studio','App Info','Lexicon','About & Citation','Run comparison'].includes(current.tool);
    document.body.dataset.guideAnalysis=hasPlotControls?'true':'false';
    document.querySelectorAll('#guide-navigation [data-guide-step]').forEach(function(b){
      b.setAttribute('aria-current',Number(b.dataset.guideStep)===Number(current.step)?'step':'false');
    });
    moveControls();
    ensureNarrowControlsToggle();
    if(window.LipidomicHelp)window.LipidomicHelp.setContext(current);
    designFields.forEach(function(id){
      var el=document.getElementById(id);if(!el)return;
      var invalid=!!current.designAttempted&&(current.designIssues||[]).some(function(issue){return issue.id===id;});
      el.setAttribute('aria-invalid',String(invalid));if(document.getElementById(id+'_help'))el.setAttribute('aria-describedby',id+'_help');
      var field=el.closest('.shiny-input-container');if(field)field.classList.toggle('guide-field-invalid',invalid);
    });
    var page=current.step+':'+current.tool;
    if(page!==paintedPage){
      paintedPage=page;
      if(window.matchMedia('(max-width:760px)').matches){
        var activeStep=document.querySelector('#guide-navigation .guide-step[aria-current="step"]');
        if(activeStep)requestAnimationFrame(function(){activeStep.scrollIntoView({inline:'center',block:'nearest'});});
      }
      if(window.closeGuideControls)window.closeGuideControls(true);
      else document.body.classList.remove('guide-narrow-controls-open');
      var narrowSidebar=document.getElementById('main_sidebar');
      var narrowButton=document.getElementById('guide-narrow-controls');
      if(narrowSidebar&&window.matchMedia('(max-width:899px)').matches)narrowSidebar.inert=true;
      if(narrowButton)narrowButton.setAttribute('aria-expanded','false');
      var main=document.querySelector('.bslib-sidebar-layout:has(> #main_sidebar) > .main');
      if(main)main.scrollTop=0;
    }
    if(hasPlotControls && window.dockActivePlotControls){window.dockActivePlotControls(current.tool);window.activateDockTab('plot_controls');}
    window.dispatchEvent(new Event('resize'));
  }
  // A rendered receipt binds the user's checkbox action to the visible design token.
  $(document).on('change','#guide_design_confirm',function(){
    var el=document.getElementById('guide-current-review-token');
    send('guide_review_receipt',{checked:!!this.checked,token:el?el.dataset.guideReviewToken:'',nonce:Date.now()});
  });
  $(document).on('click','#data_hub-runAnalysis',function(){document.body.classList.add('guide-preparing');});
  $(document).on('shiny:idle',function(){document.body.classList.remove('guide-preparing');});
  $(document).on('click','button[data-guide-focus]',function(){send('guide_focus_request',this.dataset.guideFocus);});
  $(document).on('input change','#guide_unit,#guide_design_type,#guide_design_confirm,#data_hub-selectedColumns input',function(){var field=this.closest('.shiny-input-container');if(field)field.classList.remove('guide-field-focus');});
  $(document).on('click','button[data-guide-step]',function(){send('guide_step',Number(this.dataset.guideStep));});
  $(document).on('click','button[data-guide-tool]',function(){send('guide_open_tool',this.dataset.guideTool);});
  $(document).on('shiny:connected',function(){
    Shiny.addCustomMessageHandler('guide-state',function(msg){current=msg;paint();});
    Shiny.addCustomMessageHandler('guide-focus',function(msg){focusDesignField(msg.id);});paint();
    ['pointToDifferentialExpressionMenu','pointToCutoffsMenu','pointToLog2FCFilter'].forEach(function(name){window[name]=function(e){if(e)e.preventDefault();send('guide_step',4);};});
    window.navigateToDataUpload=function(){send('guide_step',1);};
    window.navigateToSessionRestore=function(){send('guide_step',1);};
    // Existing quick-access links to preparation now return to its dedicated page.
    var original=window.pointToElement;
    if(original)window.pointToElement=function(selector){
      var el=document.querySelector(selector);
      if(el&&el.closest('.guide-page')){send('guide_step',el.closest('[data-value="Preparation"]')?3:el.closest('[data-value="Design"]')?2:4);return;}
      return original.apply(this,arguments);
    };
  });
  $(function(){paint();});
  $(document).on('shiny:value',function(e){if(e.name==='data_hub-columnSelectorUI')moveControls();});
})();

Shiny.addCustomMessageHandler("guide-qc-prepare-enabled", function(message) { var button = document.getElementById("data_hub-runAnalysis"); if (button) { button.disabled = !message.enabled; button.setAttribute("aria-disabled", String(!message.enabled)); } });
