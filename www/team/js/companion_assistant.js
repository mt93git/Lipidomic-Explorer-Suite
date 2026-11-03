(function () {
  'use strict';

  // A deliberately small, allow-listed client for the companion assistant. The
  // model can suggest actions, but it never receives a DOM command from the UI.
  var root, panel, messages, actions, input, form, status, opener, lastStep = 1;
  var nonce = 0, preview = null, connected = false, revision = null, sendQueue = [], pendingConfirmation = false, stateMessage = '', stateDirty=false, aiEnabled=false, contextActions, registered = false;
  var mascot, mascotLabel, restButton, idleTimer, greetingTimer, lifeState='awake', lastGreeting=0, greetingCount=0;
  var steps = ['Experiment', 'Design', 'Quality', 'My question', 'Results', '3D Show', 'Share'];

  function node(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function life(state) {
    lifeState=state;
    document.body.dataset.companionLife=state;
    if(mascot){mascot.dataset.life=state;mascot.setAttribute('aria-label',state==='sleeping'?'Wake companion':'Say hello to companion');}
    if(restButton)restButton.textContent=state==='sleeping'?'Wake up':'Rest';if(mascotLabel)mascotLabel.textContent=state==='sleeping'?'Resting · tap to wake':state==='offline'?'Offline · local guide':state==='working'?'Finding guidance…':state==='hello'?'Hello again!':'Tap me to say hello';
  }
  function awaken(greet) {
    clearTimeout(idleTimer);clearTimeout(greetingTimer);
    greet=!!greet&&Date.now()-lastGreeting>2000;if(greet){lastGreeting=Date.now();greetingCount++;}life(greet?'hello':'awake');
    if(greet)greetingTimer=setTimeout(function(){life('awake');},1600);
    idleTimer=setTimeout(function(){if(document.hidden||preview||lifeState==='working'||input&&(input.value||document.activeElement===input)){awaken(false);return;}if(lifeState!=='offline')life('sleeping');},90000);
  }
  function syncMascot() {
    if(!mascot)return;
    var original=document.querySelector('#lipidomic-companion .help-companion');
    var kind=original?original.dataset.kind:'none';
    mascot.hidden=kind==='none';mascotLabel.hidden=kind==='none';if(restButton)restButton.hidden=kind==='none';var eyebrow=panel.querySelector('.assistant-eyebrow');var label=(kind==='none'?'COMPANION':kind.toUpperCase())+(aiEnabled?' · AI GUIDE':' · LOCAL GUIDE');if(eyebrow.textContent!==label)eyebrow.textContent=label;
    if(kind!=='none'&&mascot.dataset.kind!==kind&&window.LipidomicCompanionArt){
      mascot.dataset.kind=kind;mascot.querySelector('.assistant-character-art').innerHTML=window.LipidomicCompanionArt(kind);
    }
  }
  function send(name, value) {
    if (!window.Shiny || !connected) { if (/assistant_(action|confirm|cancel|request)/.test(name)) { setStatus('Offline mode — reconnect to send this request.'); return false; } sendQueue.push([name, value]); return false; }
    window.Shiny.setInputValue(name, value, { priority: 'event' }); return true;
  }
  function addMessage(text, kind, source) {
    if (!messages || !text) return;
    var item = node('div', 'assistant-message assistant-message-' + (kind || 'assistant'));
    item.appendChild(node('span', 'assistant-message-text', String(text)));
    if (source) item.appendChild(node('span', 'assistant-source', source === 'local' ? 'Local guide' : String(source)));
    if (kind === 'assistant') item.querySelector('.assistant-message-text').style.whiteSpace = 'pre-wrap';
    messages.appendChild(item);
    while (messages.children.length > 40) messages.firstElementChild.remove();
    var scroller=messages.parentElement;scroller.scrollTop=scroller.scrollHeight;
  }
  function setStatus(text) { if (status) status.textContent = text || ''; }
  function close() {
    if (!panel) return;
    awaken(false);panel.hidden = true; root.classList.remove('assistant-open'); document.body.classList.remove('assistant-chat-open');
    if (opener && opener.isConnected) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
  }
  function open() {
    if (!panel) return;
    panel.hidden = false; root.classList.add('assistant-open'); document.body.classList.add('assistant-chat-open');
    if (opener) opener.setAttribute('aria-expanded', 'true');
    positionSheet();syncMascot();awaken(true);
    window.setTimeout(function () { if (input) input.focus(); }, 20);
  }
  function actionButton(item) {
    if (!item || !item.id || !item.label) return;
    var allowed = ['navigate_step', 'propose_parameter'];
    if (allowed.indexOf(item.id) < 0) return;
    var b = node('button', 'assistant-action', item.label); b.type = 'button';
    b.addEventListener('click', function () {
      var args = item.args && typeof item.args === 'object' ? item.args : {};
      if (item.id === 'navigate_step') {
        var step = Number(args.step);
        if (step >= 1 && step <= 7) send('assistant_action', { id: 'navigate_step', args: { step: step }, revision: item.revision, nonce: ++nonce });
      } else {
        send('assistant_action', { id: item.id, args: args, revision: item.revision, nonce: ++nonce });
      }
      if(connected)setStatus('Action requested.');
    });
    actions.appendChild(b);
  }
  function renderPreview(msg) {
    if (!panel) return;
    preview = msg && msg.token ? msg : null;
    if (!preview) { pendingConfirmation = false; var cleared = panel.querySelector('.assistant-preview'); if (cleared) cleared.remove(); return; }
    var old = panel.querySelector('.assistant-preview'); if (old) old.remove();
    if (!preview) return;setStatus('Review the proposed change. Nothing has changed yet.');
    var box = node('section', 'assistant-preview'); 
    box.appendChild(node('div', 'assistant-preview-label', 'Confirmation required'));
    box.appendChild(node('h4', '', preview.title || 'Review proposed change'));
    box.appendChild(node('p', '', preview.reason || 'This may change scientific parameters. Review it before applying.'));
    var details = node('dl', 'assistant-preview-values');
    [['Current', preview.current], ['Proposed', preview.proposed]].forEach(function (pair) {
      var dt = node('dt', '', pair[0]); var dd = node('dd', '', typeof pair[1] === 'string' ? pair[1] : JSON.stringify(pair[1])); details.appendChild(dt); details.appendChild(dd);
    });
    box.appendChild(details);
    var row = node('div', 'assistant-preview-actions');
    var yes = node('button', 'assistant-action assistant-action-primary', 'Update Quality setting'); yes.type = 'button';
    var no = node('button', 'assistant-action', 'Keep current settings'); no.type = 'button';
    yes.onclick = function () { if (pendingConfirmation || !connected || !preview) return; pendingConfirmation = true; yes.disabled = true; no.disabled = true; send('assistant_confirm', { token: preview.token, nonce: ++nonce }); setStatus('Confirmation sent — waiting for the assistant.'); };
    no.onclick = function () { if (pendingConfirmation || !connected || !preview) return; pendingConfirmation = true; yes.disabled = true; no.disabled = true; send('assistant_cancel', { token: preview.token, nonce: ++nonce }); setStatus('Cancellation sent — keeping current settings.'); };
    row.appendChild(yes); row.appendChild(no); box.appendChild(row); panel.querySelector('.assistant-panel-body').prepend(box);panel.querySelector('.assistant-panel-body').scrollTop=0;var heading=box.querySelector('h4');heading.tabIndex=-1;heading.focus({preventScroll:true});
  }
  function renderReply(msg) {
    if (!msg) return;
    pendingConfirmation = false; awaken(false); addMessage(msg.text, 'assistant', msg.source);
    if (actions) { actions.replaceChildren(); (msg.actions || []).forEach(function(item){item.revision=msg.revision;actionButton(item);}); }
    if (msg.mode) setStatus(msg.mode === 'confirm' ? 'Review the proposed change below.' : 'Ready for your next question.');
  }
  function mount() {
    if (document.getElementById('lipidomic-assistant-root')) return;
    root = node('aside', 'assistant-root'); root.id = 'lipidomic-assistant-root'; root.setAttribute('aria-label', 'Companion assistant');
    var launcher = node('button', 'assistant-launcher', 'Ask companion'); launcher.type = 'button'; launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'lipidomic-assistant-panel');
    launcher.onclick = function () { opener = launcher; if (panel && !panel.hidden) close(); else open(); };
    root.appendChild(launcher);
    panel = node('section', 'assistant-panel'); panel.id = 'lipidomic-assistant-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'lipidomic-assistant-title');
    var head = node('header', 'assistant-panel-head'); var title = node('div', 'assistant-panel-title'); title.appendChild(node('span', 'assistant-eyebrow', 'COMPANION · LOCAL GUIDE')); var titleText = node('h3', '', 'How can I help?'); titleText.id = 'lipidomic-assistant-title'; title.appendChild(titleText); mascotLabel=node('span','assistant-character-caption','Tap me to say hello');title.appendChild(mascotLabel);restButton=node('button','assistant-rest-button','Rest');restButton.type='button';restButton.onclick=function(){if(lifeState==='sleeping')awaken(true);else{clearTimeout(idleTimer);clearTimeout(greetingTimer);life('sleeping');}};title.appendChild(restButton);
    mascot=node('button','assistant-character');mascot.type='button';mascot.title='Illustrated companion — decorative, not a scientific model';mascot.appendChild(node('span','assistant-character-art'));var zzz=node('span','assistant-zzz','z z');zzz.setAttribute('aria-hidden','true');mascot.appendChild(zzz);mascot.onclick=function(){awaken(true);};head.appendChild(mascot);head.appendChild(title);
    var x = node('button', 'assistant-close', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close companion chat'); x.onclick = close; head.appendChild(x); panel.appendChild(head);
    var body = node('div', 'assistant-panel-body'); messages = node('div', 'assistant-messages'); messages.setAttribute('aria-live', 'polite'); messages.setAttribute('role','log'); body.appendChild(messages); contextActions=node('div','assistant-context-actions');body.appendChild(contextActions); actions = node('div', 'assistant-actions'); body.appendChild(actions); panel.appendChild(body);
    form = node('form', 'assistant-chat-form'); input = node('input', 'assistant-chat-input'); input.type = 'text'; input.maxLength = 600; input.placeholder = 'Ask about this step…'; input.setAttribute('aria-label', 'Ask the companion a question'); var submit = node('button', 'assistant-send', 'Send'); submit.type = 'submit'; submit.disabled = !connected; form.appendChild(input); form.appendChild(submit); panel.appendChild(form);
    status = node('div', 'assistant-status'); status.setAttribute('role', 'status'); panel.appendChild(status); root.appendChild(panel); document.body.appendChild(root);
    addMessage('No AI model is connected. I can explain this step, point you to the right control, and suggest next actions. I will ask before changing scientific settings.', 'assistant', 'local');
    form.onsubmit = function (e) { e.preventDefault(); var text = input.value.trim(); if (!text || !connected) return; addMessage(text, 'user'); input.value = ''; send('assistant_request', { text: text, nonce: ++nonce, step: lastStep, revision: revision }); setStatus('Waiting for the assistant…'); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) close(); });
    var bar = document.getElementById('lipidomic-help-bar'); if (bar && !bar.querySelector('.assistant-launcher')) bar.appendChild(launcher);
    registerHandlers();
  }
  function registerHandlers(){
    if (window.Shiny && !registered) {
      registered=true;
      Shiny.addCustomMessageHandler('assistant_reply', renderReply);Shiny.addCustomMessageHandler('assistant_busy',function(msg){if(msg.busy){life('working');setStatus('Looking up guidance…');}else awaken(false);});
      Shiny.addCustomMessageHandler('assistant_preview', renderPreview);
      Shiny.addCustomMessageHandler('assistant_navigate', function (msg) { var step = Number(msg && msg.step); if (step >= 1 && step <= 7) send('guide_step', step); });
      Shiny.addCustomMessageHandler('assistant_state', function (msg) { if (!msg) return; if(msg.ai_enabled!==undefined){aiEnabled=!!msg.ai_enabled;var welcome=messages.querySelector('.assistant-message-text');if(welcome)welcome.textContent=aiEnabled?'Ask about this workflow. AI matches your question to reviewed application guidance; it does not analyze your matrix. OpenAI receives your question and basic settings. Do not enter identifying or confidential details. Scientific changes always need your confirmation.':'No AI model is connected. I can explain this step and guide actions. Scientific changes always need your confirmation.';syncMascot();}if (msg.step) lastStep = Number(msg.step); if (msg.revision !== undefined) revision = msg.revision;stateMessage=msg.message||'';stateDirty=!!msg.dirty;connected=true;var submit=root.querySelector('.assistant-send');if(submit)submit.disabled=false;renderContext(); });
      $(document).on('shiny:connected', function () { connected = true; var button = root.querySelector('.assistant-send'); if (button) button.disabled = false; sendQueue.splice(0).forEach(function (entry) { window.Shiny.setInputValue(entry[0], entry[1], { priority: 'event' }); }); });
      $(document).on('shiny:disconnected', function () { connected = false; life('offline');sendQueue=[];renderPreview({}); var button = root.querySelector('.assistant-send'); if (button) button.disabled = true; setStatus('Disconnected — reconnect before sending questions or actions.'); });
    }
  }
  function renderContext(){
    if(!contextActions)return;contextActions.replaceChildren();
    contextActions.appendChild(node('p','assistant-context-note',steps[lastStep-1]+' · '+stateMessage));
    var explain=node('button','assistant-action','Explain this step');explain.type='button';explain.onclick=function(){if(send('assistant_request',{text:'Explain this step',nonce:++nonce}))setStatus('Opening local guidance…');};contextActions.appendChild(explain);
    var contextRevision=revision;var contextStep=stateDirty?3:Math.min(lastStep+1,7);var next=node('button','assistant-action',stateDirty?'Review Quality':'Next step');next.type='button';next.disabled=revision===null;next.onclick=function(){send('assistant_action',{id:'navigate_step',args:{step:contextStep},revision:contextRevision,nonce:++nonce});};contextActions.appendChild(next);
  }
  function positionSheet(){
    if(!panel)return;var vv=window.visualViewport,h=vv?vv.height:innerHeight;
    if(innerWidth<=600){panel.style.bottom=Math.max(8,innerHeight-h-(vv?vv.offsetTop:0)+8)+'px';var nav=document.querySelector('.navbar'),top=nav?Math.max(0,nav.getBoundingClientRect().bottom-(vv?vv.offsetTop:0)):0;panel.style.maxHeight=Math.max(100,Math.min(560,0.72*h,h-top-24))+'px';}
    else {panel.style.bottom='';panel.style.maxHeight='';}
  }
  function companionLinks(){
    syncMascot();
    var dockActions=document.querySelector('#lipidomic-companion .companion-actions');
    if(dockActions&&!dockActions.querySelector('.assistant-dock-chat')){var b=node('button','assistant-dock-chat','Chat');b.type='button';b.setAttribute('aria-label','Ask companion');b.onclick=function(){opener=b;open();};dockActions.appendChild(b);}
    var speech=document.querySelector('.companion-speech');if(speech&&!speech.querySelector('.assistant-speech-chat')){var b=node('button','assistant-speech-chat','Ask about this step');b.type='button';b.onclick=function(){opener=document.querySelector('.assistant-launcher');open();send('assistant_request',{text:'Explain this step',nonce:++nonce});};speech.appendChild(b);}
  }
  function observeStep() {
    var observer = new MutationObserver(function () { var step = Number(document.body.dataset.guideStep); if (step >= 1 && step <= 7 && step !== lastStep) { lastStep = step; } });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-guide-step'] });
  }
  function start() { window.LipidomicAssistant={open:function(trigger){opener=trigger;open();},isNudgeBlocked:function(){return !!preview||pendingConfirmation||lifeState==='working';}};mount();awaken(false);document.addEventListener('visibilitychange',function(){if(document.hidden){clearTimeout(idleTimer);clearTimeout(greetingTimer);}else awaken(false);});document.addEventListener('pointerdown',function(e){if(e.target.closest('.assistant-rest-button,.assistant-character'))return;if(lifeState!=='working')awaken(lifeState==='sleeping');},{passive:true});document.addEventListener('keydown',function(){if(lifeState!=='working')awaken(lifeState==='sleeping');}); observeStep();renderContext();companionLinks();new MutationObserver(companionLinks).observe(document.body,{childList:true,subtree:true});if(window.jQuery)$(document).on('shiny:connected',registerHandlers);window.addEventListener('resize',positionSheet);if(window.visualViewport){visualViewport.addEventListener('resize',positionSheet);visualViewport.addEventListener('scroll',positionSheet);} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
