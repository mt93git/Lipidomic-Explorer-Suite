(function(){
  'use strict';
  var content=window.LipidomicHelpContent, current={step:1,tool:''}, panel=null, opener=null, serial=0;
  if(!content)return;
  // These orientation toggles are dynamically rendered beside the comparison
  // selectors. They share the contrast explanation and must take precedence
  // over their legacy Bootstrap tooltips.
  var controlTopics=Object.assign({},content.controls,{
    'data_hub-deOrientGroup1':'contrast',
    'data_hub-deOrientGroup2':'contrast',
    'data_hub-deOrientTimePoint':'contrast'
  });
  var seenSteps={},attentionTimer=null, speech=null, speechTimer=null, speechSeen={}, speechEnabled=true, speechAutomatic=false;
  try{speechEnabled=sessionStorage.getItem('lipidomic-companion-messages')!=='off';}catch(e){}
  var idleTimer=null,lastActivity=Date.now(),idleCounts={},idleTotal=0,idleStarted=Date.now(),lastIdleNudge=0,idleSuppressed=false;
  try{var savedNudges=JSON.parse(sessionStorage.getItem('lipidomic-companion-nudges')||'null');if(savedNudges&&savedNudges.counts&&Number.isFinite(savedNudges.total)){idleCounts=savedNudges.counts;idleTotal=savedNudges.total;idleStarted=Number(savedNudges.started)||idleStarted;lastIdleNudge=Number(savedNudges.last)||0;idleSuppressed=savedNudges.suppressed===true;}}catch(e){}
  var choice, dock=null, corner='top-right', manual=null, avoidanceBase=null, minimized=false, motion=true;
  try{corner=sessionStorage.getItem('lipidomic-companion-corner')||corner;minimized=sessionStorage.getItem('lipidomic-companion-mini')==='true';motion=sessionStorage.getItem('lipidomic-companion-motion')!=='off';}catch(e){}
  if(['bottom-right','bottom-left','top-right','top-left'].indexOf(corner)<0)corner='top-right';
  try{choice=sessionStorage.getItem('lipidomic-companion');var saved=JSON.parse(sessionStorage.getItem('lipidomic-companion-position')||'null');if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))manual=saved;}catch(e){}
  if(['neutrophil','macrophage','none'].indexOf(choice)<0)choice=Math.random()<0.5?'neutrophil':'macrophage';
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
  function remember(){try{sessionStorage.setItem('lipidomic-companion',choice);}catch(e){}}
  remember();
  var screenMessages=[null,
    ['Experiment', 'Start with a workbook or upload your abundance files. I’ll help you review the sample names next.'],
    ['Design', 'Check the sample labels and which samples belong together. Then confirm your review to continue.'],
    ['Quality', 'Choose detection, missing-value and normalization settings. Click Prepare data, then review the quality checks.'],
    ['My question', 'Choose what you want to learn. Start with the big picture if you’re exploring this experiment for the first time.'],
    ['Results', 'Hover over the plots to explore your samples. Each CSV button downloads the data behind that plot.'],
    ['3D Show', 'Drag the cell to look around, or try X-ray. Choose a measurement to explore its lipid profile beside the illustrative anatomy.'],
    ['Share', 'Save your session and export the results with their settings, so someone else can follow your analysis.']
  ];
  function nextAction(){
    if(current.tool)return null;
    if(Number(current.step)===1){
      var experiment=current.experimentStage||document.body.dataset.guideExperimentStage;
      if(experiment==='needs_abundance')return {phase:experiment,title:'Add the abundance matrix',message:'Choose the measured Excel or CSV abundance file first. Then review whether a separate metadata table is needed.',label:'Choose abundance file',kind:'server',id:'data_hub-files'};
      if(experiment==='metadata_pending')return {phase:experiment,title:'Review sample metadata',message:'The matrix is loaded. Add a matching sample metadata table, or use the visible option to continue without one.',label:'Choose metadata file',kind:'server',id:'sample_metadata_import-file'};
      if(experiment==='metadata_confirmed'||experiment==='metadata_skipped')return {phase:experiment,title:'Review the study design',message:'The matrix and metadata choice are ready. Check sample labels, selected measurements and experimental units in Design.',label:'Go to Design',kind:'step',step:2};
    }
    if(Number(current.step)===3){
      var preparation=current.preparationStage||document.body.dataset.guidePreparationStage;
      if(preparation==='not_prepared')return {phase:preparation,title:'Prepare the selected measurements',message:'Review detection, missing-value handling and normalization, then prepare the data before judging sample quality.',label:'Find Prepare data',kind:'server',id:'data_hub-runAnalysis'};
      if(preparation==='update_pending')return {phase:preparation,title:'Apply the pending decision',message:'The plots still show the previous prepared run. Update prepared data to apply your settings or confirmed sample decision.',label:'Find Update prepared data',kind:'server',id:'data_hub-runAnalysis'};
      if(preparation==='prepared'){
        var qc=document.getElementById('guide-qc-review');
        var qcStage=qc&&qc.dataset.qcAction;
        if(!qcStage){
          if(document.getElementById('qc_pca_tab-guided_qc_confirm'))qcStage='confirm';
          else if(document.getElementById('qc_pca_tab-guided_qc_reason'))qcStage=document.getElementById('qc_pca_tab-guided_qc_reason').value.trim()?'propose':'reason';
          else qcStage='review';
        }
        if(qcStage==='reason')return {phase:'qc-reason',title:'Record the evidence',message:'Only exclude a selected sample when technical or biological evidence supports that decision. Enter the reason before reviewing it.',label:'Go to reason',kind:'local',id:'qc_pca_tab-guided_qc_reason'};
        if(qcStage==='propose')return {phase:'qc-propose',title:'Review the proposed exclusion',message:'Check the selected sample and written reason before opening the confirmation.',label:'Find Review exclusion',kind:'local',id:'qc_pca_tab-guided_qc_propose'};
        if(qcStage==='confirm')return {phase:'qc-confirm',title:'Confirm only after review',message:'Read the sample, reason and remaining group count in the dialog. Confirm only if the exclusion is justified.',label:'Review confirmation',kind:'local',id:'qc_pca_tab-guided_qc_confirm'};
        return {phase:'qc-review',title:'Review sample quality',message:'Inspect the PCA and sample details. Select a point only when it needs investigation; an unusual position alone is not an exclusion.',label:'Go to quality review',kind:'local',id:'guide-qc-review'};
      }
    }
    return null;
  }
  function followAction(action){
    if(!action)return;
    noteActivity();dismissSpeech();close(false);
    if(action.kind==='server'&&window.Shiny){Shiny.setInputValue('guide_focus_request',action.id,{priority:'event'});return;}
    if(action.kind==='step'&&window.Shiny){Shiny.setInputValue('guide_step',action.step,{priority:'event'});return;}
    var target=document.getElementById(action.id);
    if(!target)return;
    if(!target.matches('button,input,textarea,select,[tabindex]'))target.tabIndex=-1;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function actionButton(action){
    var button=el('button','guide-button',action.label);button.type='button';
    button.onclick=function(){followAction(action);};return button;
  }
  function noteActivity(){lastActivity=Date.now();}
  function saveIdleNudges(){try{sessionStorage.setItem('lipidomic-companion-nudges',JSON.stringify({counts:idleCounts,total:idleTotal,started:idleStarted,last:lastIdleNudge,suppressed:idleSuppressed}));}catch(e){}}
  function busyFeedbackVisible(){
    return Array.from(document.querySelectorAll('.shiny-file-input-progress,.shiny-progress,.shiny-progress-container,.progress,[role="progressbar"],.shiny-output-error,.alert-danger,[role="alert"]')).some(function(n){
      if(!n.getClientRects().length||getComputedStyle(n).visibility==='hidden')return false;
      var r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
    });
  }
  function automaticSpeechBlocked(){
    var active=document.activeElement,assistant=window.LipidomicAssistant;
    return document.hidden||!!panel||!!(dock&&dock.classList.contains('is-dragging'))||busyFeedbackVisible()||document.body.classList.contains('assistant-chat-open')||
      !!document.querySelector('.modal.show,.modal.in,.assistant-preview')||
      !!(assistant&&typeof assistant.isNudgeBlocked==='function'&&assistant.isNudgeBlocked())||
      !!(active&&active.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
  }
  function dismissSpeech(){clearTimeout(speechTimer);if(speech){speech.remove();speech=null;}speechAutomatic=false;}
  function positionSpeech(){
    if(!speech||!dock)return;
    var r=dock.getBoundingClientRect(),w=Math.min(270,innerWidth-32),h;
    speech.style.width=w+'px';h=speech.offsetHeight;
    var center=r.left+r.width/2,cy=r.top+58,margin=12,topLimit=12;
    var navbar=document.querySelector('.navbar');if(navbar)topLimit=Math.max(topLimit,navbar.getBoundingClientRect().bottom+8);
    var controls=Array.from(document.querySelectorAll('button,input,select,textarea,a[href],.js-plotly-plot,.shiny-plot-output')).filter(function(n){
      if(dock.contains(n)||!n.getClientRects().length||getComputedStyle(n).visibility==='hidden')return false;
      var q=n.getBoundingClientRect();return q.width&&q.height&&q.right>0&&q.left<innerWidth&&q.bottom>topLimit&&q.top<innerHeight;
    }).map(function(n){return n.getBoundingClientRect();});
    var candidates=[];
    function add(x,y,side){
      if(x<margin||y<topLimit||x+w>innerWidth-margin||y+h>innerHeight-margin)return;
      var overlap=controls.reduce(function(total,q){
        var dx=Math.max(0,Math.min(x+w,q.right+4)-Math.max(x,q.left-4));
        var dy=Math.max(0,Math.min(y+h,q.bottom+4)-Math.max(y,q.top-4));
        return total+dx*dy;
      },0);
      candidates.push({x:x,y:y,side:side,overlap:overlap});
    }
    [cy-h/2,r.top,r.bottom-h].forEach(function(y){add(r.left-w-12,y,'right');add(r.right+12,y,'left');});
    [center-w/2,r.left,r.right-w].forEach(function(x){add(x,r.top-h-12,'bottom');add(x,r.bottom+12,'top');});
    candidates.sort(function(a,b){return a.overlap-b.overlap;});
    var best=candidates[0];
    if(!best&&!speechAutomatic)best={x:clamp(center-w/2,margin,Math.max(margin,innerWidth-w-margin)),y:clamp(r.top-h-12,topLimit,Math.max(topLimit,innerHeight-h-margin)),side:'bottom',overlap:0};
    if(!best||speechAutomatic&&best.overlap>0){if(speechAutomatic)dismissSpeech();return;}
    speech.dataset.tail=best.side;speech.style.left=(best.x-r.left)+'px';speech.style.top=(best.y-r.top)+'px';
    speech.style.setProperty('--tail-x',clamp(center-best.x,20,w-20)+'px');
    speech.style.setProperty('--tail-y',clamp(cy-best.y,20,h-20)+'px');
    speech.style.visibility='visible';
  }
  function sayContext(force,idle){
    if(!force&&automaticSpeechBlocked())return false;
    if(current.tool&&!force&&!idle)return false;
    var key=topicKey(), info=screenMessages[current.step],next=nextAction(),speechKey=key+(next?':'+next.phase:'');
    if(!dock||choice==='none'||minimized||!speechEnabled||(!force&&!idle&&speechSeen[speechKey]))return;
    if(current.tool){var t=content.topics[key];if(!t)return;info=[t.title, 'You’re in a specialized analysis tool. Open About '+current.tool+' for the required inputs, interpretation and limitations.'];}
    else if(next)info=[next.title,next.message];
    if(!info)return false;dismissSpeech();speechSeen[speechKey]=true;speechAutomatic=!force;
    speech=el('aside','companion-speech');speech.setAttribute('aria-label','Companion screen tip');speech.style.visibility='hidden';
    var copy=el('div','speech-copy');copy.setAttribute('role','status');copy.setAttribute('aria-live','polite');
    copy.appendChild(el('span','speech-eyebrow',current.tool?'TOOL GUIDE':'YOU ARE HERE · '+current.step+' / 7'));
    copy.appendChild(el('strong','speech-title',info[0]));copy.appendChild(el('p','',info[1]));
    if(next)copy.appendChild(actionButton(next));speech.appendChild(copy);
    var x=el('button','speech-close','×');x.type='button';x.setAttribute('aria-label','Dismiss companion message');x.onclick=function(){noteActivity();if(idle){idleSuppressed=true;saveIdleNudges();}dismissSpeech();};speech.appendChild(x);
    dock.appendChild(speech);positionSpeech();if(!speech)return;
    function expire(){clearTimeout(speechTimer);speechTimer=setTimeout(function(){if(speech&&speech.contains(document.activeElement)){expire();return;}dismissSpeech();},9000);}
    speech.addEventListener('pointerenter',function(){clearTimeout(speechTimer);});speech.addEventListener('pointerleave',expire);speech.addEventListener('focusin',function(){clearTimeout(speechTimer);});speech.addEventListener('focusout',expire);expire();return true;
  }
  function idleNudge(){
    var key=topicKey();
    if(idleSuppressed||Date.now()-idleStarted<60000||(lastIdleNudge&&Date.now()-lastIdleNudge<180000)||Date.now()-lastActivity<45000||speech||!dock||choice==='none'||minimized||!speechEnabled||idleTotal>=4||(idleCounts[key]||0)>=1||automaticSpeechBlocked())return;
    // Reuse reviewed, static screen guidance; the chat link offers details on demand.
    // Count only a bubble that found space without covering the user's controls.
    if(sayContext(false,true)){idleCounts[key]=(idleCounts[key]||0)+1;idleTotal++;lastIdleNudge=Date.now();noteActivity();saveIdleNudges();}
  }
  function startIdleNudges(){if(!idleTimer)idleTimer=setInterval(idleNudge,5000);}
  function picture(){var art=el('span','help-companion');art.setAttribute('aria-hidden','true');art.dataset.kind=choice;if(choice!=='none'&&window.LipidomicCompanionArt)art.innerHTML=window.LipidomicCompanionArt(choice);return art;}
  function topicKey(){return current.tool?'tool:'+current.tool:'step'+current.step;}
  function close(restore){if(!panel)return;var prev=opener;panel.remove();panel=null;opener=null;if(dock)dock.classList.remove('is-helping');if(prev){prev.setAttribute('aria-expanded','false');if(restore&&prev.isConnected)prev.focus();}}
  function styles(){
    if(choice==='none'||minimized||!speechEnabled)dismissSpeech();
    document.querySelectorAll('.help-companion').forEach(function(art){art.hidden=choice==='none';if(choice!=='none'&&art.dataset.kind!==choice){art.dataset.kind=choice;art.innerHTML=window.LipidomicCompanionArt(choice);}});
    document.body.classList.toggle('companion-motion-off',!motion);
    if(dock){dock.hidden=choice==='none';dock.classList.toggle('is-mini',minimized);var launcher=dock.querySelector('.companion-launcher');launcher.setAttribute('aria-label','Open companion chat'+' — '+(choice==='macrophage'?'Macrophage':'Neutrophil'));dock.querySelector('.companion-minimize').setAttribute('aria-label',minimized?'Expand companion':'Minimize companion');dock.querySelector('.companion-minimize').textContent=minimized?'+':'−';positionDock();}
  }
  function saveSetting(key,value){try{sessionStorage.setItem('lipidomic-companion-'+key,String(value));}catch(e){}}
  function clamp(n,min,max){return Math.max(min,Math.min(n,Math.max(min,max)));}
  function positionPanel(){
    if(!panel)return;if(panel.classList.contains('is-inline')){panel.style.maxHeight=Math.max(220,innerHeight-160)+'px';return;}var navbar=document.querySelector('.navbar'),navBottom=navbar?navbar.getBoundingClientRect().bottom:0,topLimit=panel.closest('.modal')?16:Math.max(16,Math.min(120,navBottom+8));var w=Math.min(390,innerWidth-24);panel.style.width=w+'px';panel.style.maxHeight=Math.max(160,innerHeight-topLimit-16)+'px';
    var r=dock&&!dock.hidden?dock.getBoundingClientRect():{left:innerWidth-20,right:innerWidth-20,top:innerHeight-20,bottom:innerHeight-20};
    var h=panel.getBoundingClientRect().height,x=r.right-w,y=r.top-h-12;
    if(y<topLimit&&innerHeight-r.bottom>=h+24)y=r.bottom+12;
    panel.style.left=clamp(x,12,innerWidth-w-12)+'px';panel.style.top=clamp(y,topLimit,innerHeight-h-16)+'px';
  }
  function protectedEntries(){
    return Array.from(document.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[contenteditable="true"],img,canvas,svg,.js-plotly-plot,.shiny-plot-output,#cell-stage,.lipid-help-panel')).filter(function(n){
      return !dock.contains(n)&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
    }).map(function(n){return {node:n,rect:n.getBoundingClientRect()};}).filter(function(entry){return entry.rect.width>0&&entry.rect.height>0;});
  }
  function protectedRects(){return protectedEntries().map(function(entry){return entry.rect;});}
  function overlapArea(r,rects){return rects.reduce(function(total,q){return total+Math.max(0,Math.min(r.right,q.right)-Math.max(r.left,q.left))*Math.max(0,Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top));},0);}
  function protectControls(){
    if(!dock||dock.hidden||dock.classList.contains('is-dragging'))return;
    // Scroll avoidance is transient: always evaluate from the intended placement,
    // never from the previous frame's offset.
    if(!avoidanceBase){var initial=dock.getBoundingClientRect();avoidanceBase={x:initial.left,y:initial.top};}
    dock.style.left=avoidanceBase.x+'px';dock.style.top=avoidanceBase.y+'px';
    var entries=protectedEntries(),r=dock.getBoundingClientRect(),rects=entries.map(function(entry){return entry.rect;});
    var over=overlapArea({left:r.left,right:r.right,top:r.top+28,bottom:r.bottom},rects)>0;
    dock.classList.toggle('is-yielding',over);
    dock.querySelector('.companion-launcher').inert=false;
    dock.querySelector('.companion-actions').inert=over;
    // Shrink for large visual regions, then move only when the compact launcher
    // still covers an actionable control. Candidate positions are relative to the
    // stable intended placement, so repeated scroll frames cannot accumulate drift.
    var launcher=dock.querySelector('.companion-launcher'), lr=launcher.getBoundingClientRect();
    var actions=entries.filter(function(entry){return entry.node.matches('button,input,select,textarea,a[href],[role="button"],[contenteditable="true"]');}).map(function(entry){return entry.rect;});
    var baseScore=overlapArea(lr,actions),best={x:avoidanceBase.x,y:avoidanceBase.y,score:baseScore};
    if(baseScore>0){
      var dr=dock.getBoundingClientRect(),dxStep=Math.max(90,dr.width+12),dyStep=Math.max(90,dr.height+12), offsets=[[0,dyStep],[0,-dyStep],[-dxStep,0],[dxStep,0],[-dxStep,dyStep],[dxStep,dyStep],[-dxStep,-dyStep],[dxStep,-dyStep]];
      for(var i=0;i<offsets.length;i++){
        var dx=offsets[i][0],dy=offsets[i][1];
        if(dr.left+dx<8||dr.right+dx>innerWidth-8||dr.top+dy<8||dr.bottom+dy>innerHeight-8)continue;
        var score=overlapArea({left:lr.left+dx,right:lr.right+dx,top:lr.top+dy,bottom:lr.bottom+dy},actions);
        if(score<best.score)best={x:avoidanceBase.x+dx,y:avoidanceBase.y+dy,score:score};
        if(score===0){best={x:avoidanceBase.x+dx,y:avoidanceBase.y+dy,score:0};break;}
      }
    }
    dock.style.left=best.x+'px';dock.style.top=best.y+'px';
    positionSpeech();
  }
  function positionDock(){
    if(!dock||dock.hidden)return;var r=dock.getBoundingClientRect(),gap=innerWidth<600?12:24,topLimit=8;
    document.querySelectorAll('.navbar,#guide-navigation,#guide-analysis-toolbar,#lipidomic-help-bar').forEach(function(n){
      if(!n.getClientRects().length||getComputedStyle(n).visibility==='hidden')return;
      var q=n.getBoundingClientRect();if(q.bottom>0&&q.top<innerHeight)topLimit=Math.max(topLimit,q.bottom+12);
    });
    topLimit=Math.min(topLimit,Math.max(8,innerHeight-r.height-8));
    var x=manual?manual.x:(corner.indexOf('right')>=0?innerWidth-r.width-gap:gap),y=manual?manual.y:(corner.indexOf('bottom')===0?innerHeight-r.height-gap:topLimit);
    x=clamp(x,8,innerWidth-r.width-8);y=clamp(y,8,innerHeight-r.height-8);
    // Only the automatic placement seeks open space. Saved drag coordinates stay put.
    if(!manual){
      var rects=protectedRects(),best={x:x,y:y,score:Infinity};
      var columns=[x,clamp(x+(corner.indexOf('right')>=0?-1:1)*(r.width+gap),8,innerWidth-r.width-8)];
      columns.forEach(function(cx){
        for(var cy=y;cy<=innerHeight-r.height-8;cy+=r.height+12){
          var score=overlapArea({left:cx,right:cx+r.width,top:cy+28,bottom:cy+r.height},rects);
          if(score<best.score)best={x:cx,y:cy,score:score};
          if(score===0)break;
        }
      });x=best.x;y=best.y;
    }
    dock.style.left=x+'px';dock.style.top=y+'px';avoidanceBase={x:x,y:y};positionPanel();protectControls();positionSpeech();
  }
  function panelShell(trigger,title,eyebrow){
    dismissSpeech();close(false);opener=trigger;trigger.setAttribute('aria-expanded','true');
    panel=el('section','lipid-help-panel');panel.id='lipidomic-help-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','lipidomic-help-title');
    var head=el('div','lipid-help-heading'),titles=el('div','help-titles');titles.appendChild(el('span','help-eyebrow',eyebrow));
    var heading=el('h3','',title);heading.id='lipidomic-help-title';heading.tabIndex=-1;titles.appendChild(heading);head.appendChild(titles);
    var dismiss=el('button','lipid-help-close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Close help');dismiss.onclick=function(){close(true);};head.appendChild(dismiss);panel.appendChild(head);
    var modal=trigger.closest('.modal');(modal||document.body).appendChild(panel);if(modal)panel.style.zIndex='1100';if(dock)dock.classList.add('is-helping');return heading;
  }
  function finishPanel(heading){styles();positionPanel();heading.focus({preventScroll:true});}
  function settings(trigger){
    if(panel&&opener===trigger){close(true);return;}
    var heading=panelShell(trigger,'Make yourself at home','YOUR COMPANION');
    var body=el('div','help-settings-body');body.appendChild(el('p','','Choose a little company, or keep your workspace quiet. Your choices stay in this browser tab.'));
    var group=el('div','companion-choices');group.setAttribute('role','group');group.setAttribute('aria-label','Companion character');
    [['neutrophil','Neutrophil'],['macrophage','Macrophage'],['none','Plain help']].forEach(function(item){var b=el('button','companion-choice');b.type='button';if(item[0]!=='none'){var thumb=el('span','companion-preview');thumb.setAttribute('aria-hidden','true');thumb.innerHTML=window.LipidomicCompanionArt(item[0]);b.appendChild(thumb);}else b.appendChild(el('span','plain-help-symbol','?'));b.appendChild(el('span','',item[1]));b.setAttribute('aria-pressed',String(choice===item[0]));b.onclick=function(){choice=item[0];remember();group.querySelectorAll('button').forEach(function(other){other.setAttribute('aria-pressed',String(other===b));});styles();};group.appendChild(b);});body.appendChild(group);
    var toggle=el('label','companion-motion-toggle'),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=motion;checkbox.onchange=function(){motion=checkbox.checked;saveSetting('motion',motion?'on':'off');styles();};toggle.appendChild(checkbox);toggle.appendChild(el('span','','Gentle heartbeat'));body.appendChild(toggle);
    body.appendChild(el('p','help-caption','Your device’s reduced-motion preference always takes priority.'));
    var messages=el('label','companion-motion-toggle'),messageToggle=el('input');messageToggle.type='checkbox';messageToggle.checked=speechEnabled;messageToggle.onchange=function(){speechEnabled=messageToggle.checked;saveSetting('messages',speechEnabled?'on':'off');if(!speechEnabled)dismissSpeech();};messages.appendChild(messageToggle);messages.appendChild(el('span','','Brief screen tips and reminders'));body.appendChild(messages);
    var replay=el('button','help-position-button','Replay this screen’s introduction');replay.type='button';replay.onclick=function(){speechEnabled=true;saveSetting('messages','on');close(false);sayContext(true);};body.appendChild(replay);
    body.appendChild(el('strong','','Place companion'));var corners=el('div','companion-corners');corners.setAttribute('role','group');corners.setAttribute('aria-label','Companion position');
    [['top-left','↖ Top left'],['top-right','↗ Top right'],['bottom-left','↙ Bottom left'],['bottom-right','↘ Bottom right']].forEach(function(item){var b=el('button','help-position-button',item[1]);b.type='button';b.setAttribute('aria-pressed',String(!manual&&corner===item[0]));b.onclick=function(){corner=item[0];manual=null;saveSetting('position','null');saveSetting('corner',corner);corners.querySelectorAll('button').forEach(function(other){other.setAttribute('aria-pressed',String(other===b));});positionDock();};corners.appendChild(b);});body.appendChild(corners);
    body.appendChild(el('p','help-caption','Drag the cell anywhere out of your way. It stays there while you scroll and becomes smaller when it would cover a control. Clicks pass through the small cell to the content underneath. The move handle remains available. You can also focus the handle and use arrow keys.'));
    panel.appendChild(body);finishPanel(heading);
  }
  function mountDock(){
    if(dock)return;dock=el('aside','companion-dock');dock.id='lipidomic-companion';dock.setAttribute('aria-label','Floating help companion');
    var grip=el('button','companion-grip','⠿');grip.type='button';grip.setAttribute('aria-label','Move companion. Drag or use arrow keys.');dock.appendChild(grip);
    var launcher=el('button','companion-launcher');launcher.type='button';launcher.setAttribute('aria-label','Open companion chat');launcher.setAttribute('aria-controls','lipidomic-assistant-panel');launcher.setAttribute('aria-expanded','false');launcher.onclick=function(){close(false);dismissSpeech();if(window.LipidomicAssistant)window.LipidomicAssistant.open(launcher);};launcher.textContent='';launcher.appendChild(picture());launcher.appendChild(el('span','companion-help-label','Need a hand?'));dock.appendChild(launcher);
    var actions=el('div','companion-actions'),mini=el('button','companion-minimize','−');mini.type='button';mini.onclick=function(){minimized=!minimized;saveSetting('mini',minimized);styles();launcher.focus();};actions.appendChild(mini);
    var prefs=el('button','companion-settings','⚙');prefs.type='button';prefs.setAttribute('aria-label','Companion settings');prefs.setAttribute('aria-expanded','false');prefs.setAttribute('aria-controls','lipidomic-help-panel');prefs.onclick=function(){settings(prefs);};actions.appendChild(prefs);dock.appendChild(actions);document.body.appendChild(dock);
    // The dock lives outside Shiny's scrolling main pane. Forward wheel gestures
    // to the pane underneath, so hovering the cell never creates a scroll dead zone.
    dock.addEventListener('wheel',function(e){
      if(e.ctrlKey||!e.deltaY)return;
      var under=document.elementsFromPoint(e.clientX,e.clientY).find(function(n){return !dock.contains(n);});
      function scrollPane(n){
        if(!n||n.clientHeight<=0||n.scrollHeight<=n.clientHeight+1)return false;
        if(!/auto|scroll|overlay/.test(getComputedStyle(n).overflowY))return false;
        var unit=e.deltaMode===1?16:e.deltaMode===2?n.clientHeight:1,before=n.scrollTop;
        n.scrollTop+=e.deltaY*unit;return n.scrollTop!==before;
      }
      for(var n=under;n;n=n.parentElement){if(scrollPane(n)){e.preventDefault();return;}}
      if(scrollPane(document.querySelector('.bslib-sidebar-layout:has(> #main_sidebar) > .main')))e.preventDefault();
    },{passive:false});
    var drag=null,suppressClick=false;
    function startDrag(e){
      if(e.button!==0)return;clearTimeout(speechTimer);suppressClick=false;
      var r=dock.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top,target:e.currentTarget,pointer:e.pointerId,moved:false};
      // Capture immediately so a fast drag cannot leave the small cell's hit area.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    function moveDrag(e){
      if(!drag||e.pointerId!==drag.pointer)return;
      var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(!drag.moved&&Math.hypot(dx,dy)<6)return;
      drag.moved=true;suppressClick=true;dock.classList.add('is-dragging');
      manual={x:drag.left+dx,y:drag.top+dy};positionDock();
    }
    function savePosition(){var r=dock.getBoundingClientRect();manual=avoidanceBase?{x:avoidanceBase.x,y:avoidanceBase.y}:{x:r.left,y:r.top};saveSetting('position',JSON.stringify(manual));}
    function endDrag(){if(!drag)return;if(drag.moved)savePosition();drag=null;dock.classList.remove('is-dragging');protectControls();positionSpeech();if(speech)speechTimer=setTimeout(dismissSpeech,9000);}
    [grip,launcher].forEach(function(target){target.onpointerdown=startDrag;target.onpointermove=moveDrag;target.onpointerup=endDrag;target.onpointercancel=endDrag;target.onlostpointercapture=endDrag;
      target.addEventListener('click',function(e){if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
    });
    grip.onkeydown=function(e){var d={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!d)return;e.preventDefault();var r=dock.getBoundingClientRect();manual={x:r.left+d[0],y:r.top+d[1]};positionDock();savePosition();};
    styles();
  }
  function helpButton(key,label){var b=el('button','lipid-help-trigger','?');b.type='button';b.dataset.helpTopic=key;b.setAttribute('aria-label','Help: '+label);b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls','lipidomic-help-panel');return b;}
  function show(trigger,key,tour){
    if(trigger.classList.contains('companion-launcher')&&minimized){minimized=false;saveSetting('mini',false);styles();}
    if(panel&&opener===trigger&&!tour){close(true);return;}
    close(false);var t=content.topics[key];if(!t)return;
    var heading=panelShell(trigger,t.title,tour?'THE SEVEN-STEP TOUR':(current.tool?'TOOL GUIDE':'YOUR GUIDE · STEP '+current.step+' OF 7'));
    var progress=el('div','help-step-progress');progress.setAttribute('aria-hidden','true');for(var n=1;n<=7;n++){var dot=el('span',n<=Number(tour?key.slice(4):current.step)?'is-complete':'');progress.appendChild(dot);}panel.appendChild(progress);
    [['what','What it means'],['how',key.indexOf('tool:')===0?'What you need':'What to do'],['limit','Keep in mind']].forEach(function(pair){if(!t[pair[0]])return;var p=el('p');p.appendChild(el('strong','',pair[1]+'. '));p.appendChild(document.createTextNode(t[pair[0]]));panel.appendChild(p);});
    var next=!tour&&key===topicKey()?nextAction():null;
    if(next){var suggested=el('div','guide-next-task');suggested.appendChild(el('strong','',next.title));suggested.appendChild(el('p','',next.message));suggested.appendChild(actionButton(next));panel.appendChild(suggested);}
    var foot=el('div','lipid-help-footer');
    if(choice!=='none'){var hide=el('button','help-text-button','Hide companion');hide.type='button';hide.onclick=function(){choice='none';remember();close(false);styles();var restore=document.querySelector('.help-bar-settings');if(restore)restore.focus();};foot.appendChild(hide);}
    foot.appendChild(el('span','help-caption','Local guide · no AI connected'));
    if(tour){
      var nav=el('div','help-tour-nav'),index=Number(key.slice(4));
      nav.appendChild(el('span','', 'Step '+index+' of 7'));
      [['Back',index-1],['Next',index+1]].forEach(function(item){if(item[1]<1||item[1]>7)return;var b=el('button','guide-button',item[0]);b.type='button';b.onclick=function(){show(trigger,'step'+item[1],true);};nav.appendChild(b);});
      var go=el('button','guide-button','Go to this step');go.type='button';go.onclick=function(){close(false);if(window.Shiny)Shiny.setInputValue('guide_step',index,{priority:'event'});};nav.appendChild(go);
      var skip=el('button','help-text-button',index===7?'Finish tour':'Skip tour');skip.type='button';skip.onclick=function(){close(true);};nav.appendChild(skip);panel.appendChild(nav);
    }
    panel.appendChild(foot);
    // Explanations belong to the form flow: never cover the control being explained.
    var anchor=trigger.closest('.shiny-input-container')||trigger.closest('.guide-tool-entry,.guide-tool-card,.guide-panel,.accordion-item,.lipid-help-bar');
    if(!anchor&&trigger.closest('.companion-dock'))anchor=document.getElementById('lipidomic-help-bar');
    if(!anchor)anchor=trigger;
    panel.classList.add('is-inline');anchor.insertAdjacentElement('afterend',panel);
    finishPanel(heading);panel.scrollIntoView({block:'nearest',behavior:'auto'});
  }
  function attachControl(id,key){
    var input=document.getElementById(id);if(!input)return;
    var container=input.closest('.shiny-input-container')||input.parentElement;if(!container)return;
    // renderUI can replace this container while leaving a prior trigger beside
    // it. Tooltip migration can also add a generic legacy trigger. Retain one
    // control-specific explanation, preferring the trigger in the fresh host.
    var host=input.closest('.shiny-html-output,[id$="UI"]')||container;
    var matches=Array.from(document.querySelectorAll('[data-help-for]')).filter(function(node){return node.dataset.helpFor===id;});
    var b=matches.find(function(node){return host.contains(node);})||matches.shift();
    matches.forEach(function(node){if(node!==b)node.remove();});
    Array.from(host.querySelectorAll('.lipid-help-trigger[data-help-topic^="legacy"]')).forEach(function(node){if(node!==b)node.remove();});
    var label=container.querySelector('label.control-label')||container.querySelector('label');
    if(!b)b=helpButton(key,content.topics[key].title);
    b.dataset.helpFor=id;b.dataset.helpTopic=key;b.setAttribute('aria-label','Help: '+content.topics[key].title);
    // Do not move an already-correct trigger. Moving it emits a child-list
    // mutation, which would schedule mount() again through the observer.
    var anchor=label||input;
    if(b.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',b);
  }
  function migrateHelp(){
    document.querySelectorAll('bslib-tooltip:not([data-context-migrated])').forEach(function(wrapper){
      var template=wrapper.querySelector('template');var source=wrapper.querySelector('div');var icon=wrapper.querySelector('[data-bs-toggle="tooltip"]')||wrapper.firstElementChild;
      if(icon && icon.matches('.bslib-full-screen-enter,.bslib-full-screen-exit'))return;
      if(!icon||icon.tagName==='TEMPLATE')return;var text=(template?template.content.textContent:(source?source.textContent:'')).trim();if(!text)return;wrapper.dataset.contextMigrated='true';
      // Preserve existing content and controls. Only replace the tooltip trigger.
      var label=wrapper.closest('label'), holder=wrapper.closest('button,a,label')||wrapper;
      var contextLabel=label||wrapper.closest('button,a,h3,h4,h5,h6')||wrapper.parentElement;
      var near=wrapper.closest('.shiny-input-container');
      if(!(near&&near.querySelector('[data-help-for]'))){
        var key='legacy'+(++serial),title=(contextLabel?contextLabel.textContent.replace(text,'').replace(/[\uF000-\uF8FF]/g,'').trim():'')||'About this control';
        content.topics[key]={title:title.replace(/\s+/g,' ').slice(0,100),what:text};
        holder.insertAdjacentElement('afterend',helpButton(key,content.topics[key].title));
      }
      // bslib owns the tooltip lifecycle; disposing here breaks later node moves.
      icon.hidden=true;icon.style.setProperty('display','none','important');icon.tabIndex=-1;icon.setAttribute('aria-hidden','true');icon.removeAttribute('title');icon.removeAttribute('data-bs-toggle');
    });
    document.querySelectorAll('button[title],a[title],label[title],i[title],span[title]').forEach(function(node){
      if(node.closest('.lipid-help-panel,#lipidomic-assistant-root,svg,.plotly,.html-widget,#data_hub-loaded_files_display')||node.hasAttribute('data-bs-toggle')||!node.getAttribute('title').trim())return;
      if(node.closest('.shiny-input-container')?.querySelector('.lipid-help-trigger'))return;
      var title=node.getAttribute('title');
      if(title.length<45||node.tagName==='SPAN'){if(node.matches('button,a')&&!node.getAttribute('aria-label'))node.setAttribute('aria-label',title);return;}
      node.removeAttribute('title');
      var key='legacy'+(++serial),name=(node.textContent||'About this control').trim().replace(/\s+/g,' ').slice(0,80);
      content.topics[key]={title:name||'About this control',what:title};
      (node.closest('button,a,label')||node).insertAdjacentElement('afterend',helpButton(key,content.topics[key].title));
    });
  }
  function mount(){
    var context=document.getElementById('guide-context');if(!context)return;
    if(!document.getElementById('lipidomic-help-bar')){
      var bar=el('div','lipid-help-bar');bar.id='lipidomic-help-bar';
      var b=helpButton(topicKey(),'this step');b.id='lipidomic-context-help';b.classList.add('help-context-button');b.textContent='Help with this step';bar.appendChild(b);
      var tour=el('button','help-text-button','Seven-step tour');tour.type='button';tour.id='lipidomic-tour';tour.onclick=function(){show(tour,'step1',true);};bar.appendChild(tour);
      var prefs=el('button','help-text-button help-bar-settings','Companion');prefs.type='button';prefs.setAttribute('aria-label','Customize companion');prefs.setAttribute('aria-expanded','false');prefs.setAttribute('aria-controls','lipidomic-help-panel');prefs.onclick=function(){settings(prefs);};bar.appendChild(prefs);context.insertAdjacentElement('afterend',bar);
    }
    mountDock();
    Object.keys(controlTopics).forEach(function(id){attachControl(id,controlTopics[id]);});
    document.querySelectorAll('.guide-tool-grid button[data-guide-tool]').forEach(function(b){if(b.dataset.contextAdded)return;b.dataset.contextAdded='true';var key='tool:'+b.dataset.guideTool;if(content.topics[key]){if(b.parentElement.classList.contains('guide-tool-grid')){var entry=el('div','guide-tool-entry');b.before(entry);entry.appendChild(b);}b.insertAdjacentElement('afterend',helpButton(key,b.dataset.guideTool));}});
    migrateHelp();
    // A dynamic control may arrive between the first pass and tooltip
    // migration. Reconcile again so legacy buttons cannot accumulate.
    Object.keys(controlTopics).forEach(function(id){attachControl(id,controlTopics[id]);});
    if(panel&&(!opener.isConnected||!opener.getClientRects().length))close(false);
  }
  function setContext(state){var changed=current.step!==state.step||current.tool!==state.tool;current=state;if(changed){noteActivity();dismissSpeech();close(false);}mount();requestAnimationFrame(function(){sayContext(false);});if(dock&&changed&&!seenSteps[current.step]&&!minimized){seenSteps[current.step]=true;dock.classList.remove('is-attentive');clearTimeout(attentionTimer);requestAnimationFrame(function(){dock.classList.add('is-attentive');attentionTimer=setTimeout(function(){dock.classList.remove('is-attentive');},950);});}if(dock){dock.querySelector('.companion-help-label').textContent=current.tool?'Explore this plot':['','Start here','Let’s map your study','Check your data','Choose a question','Explore your results','Explore the cell','Ready to share?'][current.step];}var b=document.getElementById('lipidomic-context-help');if(b){b.dataset.helpTopic=topicKey();b.textContent=current.tool?'About '+current.tool:'Help with '+['','Experiment','Design','Quality','My question','Results','3D Show','Share'][current.step];b.setAttribute('aria-label',b.textContent);}}
  document.addEventListener('click',function(e){var trigger=e.target.closest('[data-help-topic]');if(trigger){e.preventDefault();e.stopPropagation();show(trigger,trigger.dataset.helpTopic,false);}else if(panel&&e.target.isConnected&&opener&&!opener.contains(e.target)&&!panel.contains(e.target)&&!e.target.closest('.companion-dock'))close(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&speech){noteActivity();dismissSpeech();}if(e.key==='Escape'&&panel){var modal=document.querySelector('.modal.show');if(modal&&!modal.contains(panel)){close(false);return;}e.preventDefault();e.stopImmediatePropagation();close(true);}},true);
  var lastViewportWidth=innerWidth,lastViewportHeight=innerHeight;
  window.addEventListener('resize',function(){lastViewportWidth=innerWidth;lastViewportHeight=innerHeight;positionDock();});
  var controlFrame=false;document.addEventListener('scroll',function(){if(controlFrame)return;controlFrame=true;requestAnimationFrame(function(){controlFrame=false;protectControls();});},true);
  document.addEventListener('visibilitychange',function(){document.body.classList.toggle('companion-page-hidden',document.hidden);noteActivity();if(document.hidden)dismissSpeech();});
  ['pointerdown','pointermove','keydown','input','scroll','focusin'].forEach(function(name){document.addEventListener(name,noteActivity,{passive:true,capture:true});});
  window.addEventListener('pagehide',function(){clearInterval(idleTimer);idleTimer=null;dismissSpeech();});
  window.addEventListener('pageshow',function(){noteActivity();startIdleNudges();});
  var scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;mount();positionDock();if(!current.tool&&(Number(current.step)===1||Number(current.step)===3))sayContext(false);});}
  function init(){mount();saveIdleNudges();startIdleNudges();new MutationObserver(function(records){if(records.some(function(r){return r.addedNodes.length||r.removedNodes.length;}))schedule();}).observe(document.body,{childList:true,subtree:true});
    // Route all legacy launch buttons into this one help system.
    window.startGuidedTour=function(step){var trigger=document.getElementById('lipidomic-tour');if(trigger)show(trigger,'step'+(step>=1&&step<=7?step:1),true);};
  }
  $(document).on('show.bs.modal',function(){if(panel&&!panel.closest('.modal'))close(false);});
  window.LipidomicHelp={setContext:setContext,close:close};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
