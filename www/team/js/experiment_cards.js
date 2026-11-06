// Guided Team flow, Experiment step (R/guided_workflow.R guide_experiment_ui): the page opens on two equal
// cards, "Start a new analysis" and "Resume a saved checkpoint". Choosing one reveals that path. Steps 2 and 3
// stay collapsed until an abundance matrix exists. Existing controls are moved, never cloned: every input and
// output keeps its ID and its Shiny binding.
(function(){
  'use strict';
  var stepBodies=[];
  var choice='';
  var hadMatrix=null;

  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function byId(id){return document.getElementById(id);}
  function hasMatrix(){
    var stage=document.body.dataset.guideExperimentStage||'';
    if(stage)return stage!=='needs_abundance';
    return !!document.querySelector('#guide_experiment_summary .guide-next-task');
  }
  function library(){return document.querySelector('.team-library');}

  function card(id,path,title,body){
    var b=el('button','tx-exp-card');b.type='button';b.id=id;
    b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',path);
    b.appendChild(el('span','tx-exp-card-title',title));
    var text=el('span','tx-exp-card-text',body);text.id=id+'-text';b.appendChild(text);
    b.addEventListener('click',function(){choose(id==='tx-exp-card-new'?'new':'resume');});
    return b;
  }

  // Shiny suspends outputs it last saw hidden and re-checks them on jQuery 'shown'/'hidden' events:
  // send one whenever a path or a step body really changes visibility.
  function notify(node,shown){
    if(!window.jQuery)return;
    var $node=window.jQuery(node);
    if($node&&typeof $node.trigger==='function')$node.trigger(shown?'shown':'hidden');
  }
  // Shows the chosen path and hides the other; the cards stay so the user can switch.
  function choose(which){
    choice=which;
    var paths={new:byId('guide-experiment-abundance'),resume:byId('tx-exp-resume')};
    Object.keys(paths).forEach(function(k){
      var p=paths[k];if(!p)return;
      var hide=k!==which;if(p.classList.contains('tx-exp-path-hidden')===hide)return;
      p.classList.toggle('tx-exp-path-hidden',hide);notify(p,!hide);
    });
    var cards={new:byId('tx-exp-card-new'),resume:byId('tx-exp-card-resume')};
    Object.keys(cards).forEach(function(k){if(cards[k])cards[k].setAttribute('aria-expanded',String(k===which));});
    document.body.dataset.txExperimentPath=which;
    syncLibraryPath();
  }

  // The project library (project_library.R) sits in the page header and saves checkpoints from every step.
  // On the Experiment step it is part of the Resume path: hidden until Resume is chosen, then moved into that
  // path (after its title, before the ZIP controls), so the keyboard runs card 1, card 2, then the library.
  // On any other step it goes back to its header slot, shown as before. Moved, never cloned.
  var libraryHome=null;
  function onExperiment(){var step=document.body.dataset.guideStep;return !step||String(step)==='1';}
  function syncLibraryPath(){
    var lib=library(),box=byId('tx-exp-library');if(!lib||!box)return;
    if(!libraryHome){libraryHome=document.createComment('team-library-home');lib.before(libraryHome);}
    var inResume=onExperiment()&&choice==='resume',show=!onExperiment()||inResume;
    var focused=lib.contains(document.activeElement)?document.activeElement:null,moved=false;
    if(inResume&&lib.parentNode!==box){box.appendChild(lib);moved=true;}
    else if(!inResume&&lib.parentNode===box&&libraryHome.parentNode){libraryHome.before(lib);moved=true;}
    if(focused&&moved&&focused.isConnected)focused.focus({preventScroll:true});
    var was=!lib.classList.contains('tx-exp-path-hidden');
    if(was!==show)lib.classList.toggle('tx-exp-path-hidden',!show);
    if(was!==show||(moved&&show))notify(lib,show);
  }

  function setStepOpen(entry,open){
    var changed=entry.body.hidden===open;
    entry.body.hidden=!open;entry.toggle.setAttribute('aria-expanded',String(open));
    entry.panel.classList.toggle('tx-exp-step-collapsed',!open);
    if(changed)notify(entry.body,open);
  }
  // Steps 2 and 3: the h3 becomes a disclosure button over the step's existing content.
  function collapsible(panelId,n){
    var panel=byId(panelId),heading=panel&&panel.querySelector(':scope > h3');
    if(!panel||!heading)return;
    var toggle=el('button','tx-exp-step-toggle');toggle.type='button';
    toggle.appendChild(el('span','tx-exp-step-label',heading.textContent));
    toggle.appendChild(el('span','tx-exp-step-note','Opens when your abundance matrix is loaded'));
    heading.textContent='';heading.appendChild(toggle);
    var body=el('div','tx-exp-step-body');body.id='tx-exp-step-body-'+n;
    while(heading.nextSibling)body.appendChild(heading.nextSibling);
    panel.appendChild(body);toggle.setAttribute('aria-controls',body.id);
    var entry={panel:panel,toggle:toggle,body:body};
    // Steps 2-3 stay closed until a matrix exists (the note says so); the toggle is marked unavailable meanwhile.
    toggle.setAttribute('aria-disabled',String(!hasMatrix()));
    toggle.addEventListener('click',function(){if(body.hidden&&!hasMatrix())return;setStepOpen(entry,body.hidden);});
    stepBodies.push(entry);
  }

  function syncMatrix(){
    var now=hasMatrix();
    document.body.classList.toggle('tx-exp-has-matrix',now);
    if(now===hadMatrix)return;
    hadMatrix=now;
    stepBodies.forEach(function(entry){entry.toggle.setAttribute('aria-disabled',String(!now));setStepOpen(entry,now);});
    // A matrix restored without a choice (a reconnect, a restored session) shows its summary.
    if(now&&!choice)choose('new');
  }
  // "Files over 90 MB" only matters when the lab server lists workbooks; it points at that list.
  function syncWorkbooks(){
    var list=byId('guide_local_experiments'),any=!!(list&&list.querySelector('.guide-panel'));
    document.body.classList.toggle('tx-exp-has-workbooks',any);
  }
  function syncLibrary(){
    var box=byId('tx-exp-library'),lib=library();
    if(box)box.hidden=!lib;
    var text=byId('tx-exp-card-resume-text');
    if(text)text.textContent=lib?'Open a checkpoint from your project library or a session ZIP you saved earlier.':'Open a session ZIP you saved earlier from Share.';
  }

  // Server focus requests (guide-focus, guided.js) can target a control inside a hidden path or a collapsed
  // step: open it first, guided.js then focuses the field once it has a box.
  function reveal(id){
    var target=id&&byId(id);if(!target)return;
    if(byId('guide-experiment-abundance')&&byId('guide-experiment-abundance').contains(target))choose('new');
    else if(byId('tx-exp-resume')&&byId('tx-exp-resume').contains(target))choose('resume');
    stepBodies.forEach(function(entry){if(entry.body.contains(target))setStepOpen(entry,true);});
  }

  // window[name] becomes an accessor: an assignment stores the new function, a read returns it wrapped so
  // the chosen path opens first. Where the property cannot be redefined, re-wrap after each shiny:connected
  // (queued behind guided.js's own handler for that event).
  function wrapped(fn,which){
    if(typeof fn!=='function'||fn.txExpReveal)return fn;
    var w=function(){choose(which);return fn.apply(this,arguments);};w.txExpReveal=true;return w;
  }
  function keepReveal(name,which){
    var current=wrapped(window[name],which),d=Object.getOwnPropertyDescriptor(window,name);
    if(!d||d.configurable){
      try{Object.defineProperty(window,name,{configurable:true,enumerable:true,get:function(){return current;},set:function(fn){current=wrapped(fn,which);}});return;}catch(e){/* fall through */}
    }
    window[name]=current;
    if(window.jQuery)jQuery(document).on('shiny:connected',function(){setTimeout(function(){window[name]=wrapped(window[name],which);},0);});
  }
  function init(){
    var abundance=byId('guide-experiment-abundance');
    if(!abundance||byId('tx-exp-choice'))return;
    var page=abundance.parentNode;
    var zip=byId('data_hub-import_session_file'),details=zip&&zip.closest('details');

    var choiceBox=el('div','tx-exp-choice');choiceBox.id='tx-exp-choice';
    choiceBox.setAttribute('role','group');choiceBox.setAttribute('aria-label','How do you want to start?');
    choiceBox.appendChild(card('tx-exp-card-new','guide-experiment-abundance','Start a new analysis','Upload an Excel or CSV abundance matrix. Original files are kept unchanged.'));
    choiceBox.appendChild(card('tx-exp-card-resume','tx-exp-resume','Resume a saved checkpoint','Open a session ZIP you saved earlier from Share.'));

    var resume=el('section','guide-panel tx-exp-path tx-exp-path-hidden');resume.id='tx-exp-resume';
    var title=el('h3','','Resume a saved checkpoint');title.id='tx-exp-resume-title';resume.appendChild(title);
    resume.setAttribute('aria-labelledby',title.id);
    // Holds the project library itself while Resume is open on this step (syncLibraryPath).
    var lib=el('div','tx-exp-library');lib.id='tx-exp-library';lib.hidden=true;
    resume.appendChild(lib);
    // The ZIP restore controls move out of the bottom disclosure into this path; the emptied disclosure hides.
    if(details){
      Array.prototype.slice.call(details.childNodes).forEach(function(n){if(n.nodeName!=='SUMMARY')resume.appendChild(n);});
      details.classList.add('tx-exp-path-hidden','tx-exp-old-resume');
    }

    abundance.classList.add('tx-exp-path','tx-exp-path-hidden');
    page.insertBefore(choiceBox,abundance);
    page.insertBefore(resume,abundance);

    var limit=abundance.querySelector('.guide-upload-limit');
    if(limit)limit.textContent='Files over 90 MB? Open them from the lab server below.';

    collapsible('guide-experiment-metadata',2);
    collapsible('guide-experiment-design',3);

    syncLibrary();syncWorkbooks();syncMatrix();syncLibraryPath();
    // guided.js paints the server's step and matrix stage on <body>.
    new MutationObserver(function(){syncMatrix();syncLibraryPath();}).observe(document.body,{attributes:true,attributeFilter:['data-guide-experiment-stage','data-guide-step']});
    var summary=byId('guide_experiment_summary');
    if(summary)new MutationObserver(syncMatrix).observe(summary,{childList:true,subtree:true});
    var list=byId('guide_local_experiments');
    if(list)new MutationObserver(syncWorkbooks).observe(list,{childList:true,subtree:true});
    // tour_guide.js entry points that scroll to or open these file inputs. guided.js assigns them again on
    // every shiny:connected (and tour_guide.js may too), so the reveal wraps whatever is assigned, whenever.
    [['navigateToDataUpload','new'],['navigateToSessionRestore','resume']].forEach(function(pair){keepReveal(pair[0],pair[1]);});
    if(window.jQuery)jQuery(document).on('shiny:message',function(e){
      var custom=e.message&&e.message.custom,focus=custom&&custom['guide-focus'];
      if(focus&&focus.id)reveal(focus.id);
    });
  }

  window.TeamExperimentCards={choose:function(which){if(which==='new'||which==='resume')choose(which);},reveal:reveal};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
