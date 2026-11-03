(function () {
  'use strict';

  // Team-only presentation adapter. The companion's chat, AI, and scientific
  // confirmation flow remain owned by companion_assistant.js.
  var enabled = window.LIPIDOMIC_TEAM_WORKSPACE === true || window.LIPIDOMIC_TEAM_WORKSPACE === '1';
  if (!enabled) return;

  var state = { stage: 'data', legacyStep: 1, tool: '', authenticated: false, ready: false, loaded: false, dirty: false,
    substep: 'data-choice', substepIndex: 1, substepCount: 10, canNext: false, canBack: false };
  var selectedPlot = null;
  var renderQueued = false;
  var nonce = 0;
  var contextSignature = '';
  var nudgeState = '';
  var nudgeCooldownMs = 45000;
  var nudgeDurationMs = 9000;
  var nudgeTimer = null;
  var lastNudgeAt = 0;
  try { lastNudgeAt = Number(window.localStorage.getItem('lipidomic-team-companion-nudge-at')) || 0; } catch (_) {}

  var stageLabels = { data: 'Data', review: 'Review', canvas: 'Canvas' };
  var legacyStages = { 1: 'data', 2: 'review', 3: 'review', 4: 'review', 5: 'canvas', 6: 'canvas', 7: 'canvas' };
  var stepCopy = {
    'data-choice': ['Choose a private checkpoint or start a new upload. Your source files stay unchanged.', 'Choose the data source'],
    'data-matrix': ['Upload the abundance matrix. Raw instrument files are not used in this analysis workflow.', 'Continue to sample metadata'],
    'data-metadata': ['Review the sample labels and metadata before moving into study design.', 'Review sample labels'],
    'review-single': ['Set the detection threshold. The data table and PCA plot update automatically. Click a point to inspect its sample, then choose Exclude if appropriate; Undo restores it.', 'Continue to Canvas'],
    canvas: ['Arrange and finish plots in Canvas; your workspace saves automatically. Want scientific background? Try Scientific insight below a live plot.', 'Explore Canvas']
  };

  var stageScreens = {data:['data-choice','data-matrix','data-metadata'], review:['review-single'], canvas:['canvas']};
  function root() { return document.getElementById('lipidomic-assistant-root'); }
  function panel() { return document.getElementById('lipidomic-assistant-panel'); }
  function node(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function sendQuestion(text) {
    if (!window.Shiny || !window.Shiny.setInputValue) return;
    window.Shiny.setInputValue('assistant_request', {
      text: text, nonce: ++nonce, step: state.legacyStep
    }, { priority: 'event' });
  }
  function go(stage) {
    if (stageLabels[stage] && window.TeamWorkspace && typeof window.TeamWorkspace.go === 'function') {
      window.TeamWorkspace.go(stage);
    }
  }
  function nextScreen(event) {
    if (window.TeamWorkspace && typeof window.TeamWorkspace.next === 'function') window.TeamWorkspace.next(event);
  }
  function suggestedPlot() {
    if (!window.TeamCanvas || typeof window.TeamCanvas.listPlots !== 'function') return null;
    try { return window.TeamCanvas.listPlots().filter(function (plot) { return plot && plot.id && !plot.added && plot.available !== false; })[0] || null; }
    catch (_) { return null; }
  }
  function addSuggestedPlot(plot) {
    if (!plot || !plot.id || !window.TeamCanvas || typeof window.TeamCanvas.addPlot !== 'function') return;
    window.TeamCanvas.addPlot(plot.id);
  }
  function actionButton(label, callback, disabled) {
    var button = node('button', 'assistant-action', label);
    button.type = 'button';
    button.disabled = !!disabled;
    button.addEventListener('click', callback);
    return button;
  }
  function contextStepKey() { return String(state.stage || 'data') + ':' + state.legacyStep + ':' + String(state.substep || ''); }
  function nudgeDismissed(key) {
    try { return window.localStorage.getItem('lipidomic-team-companion-nudge-dismissed:' + key) === '1'; } catch (_) { return false; }
  }
  function maybeNudge(container, key, copy) {
    if (!copy || nudgeDismissed(key) || nudgeState === key || Date.now() - lastNudgeAt < nudgeCooldownMs) return;
    nudgeState = key;
    lastNudgeAt = Date.now();
    try { window.localStorage.setItem('lipidomic-team-companion-nudge-at', String(lastNudgeAt)); } catch (_) {}
    var tip = node('div', 'assistant-workspace-nudge');
    tip.style.cssText = 'box-sizing:border-box;flex:0 0 100%;display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;padding:6px 8px;border:1px solid #d9e5ea;border-radius:8px;background:#f6fafb;color:#4b6472;font-size:12px;line-height:1.35;';
    tip.appendChild(node('span', '', copy));
    var dismiss = node('button', 'assistant-workspace-nudge-dismiss', 'Dismiss');
    dismiss.style.cssText = 'flex:0 0 auto;min-height:28px;padding:3px 6px;border:0;background:transparent;color:#456273;font:inherit;text-decoration:underline;';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss this workspace tip');
    dismiss.addEventListener('click', function () {
      try { window.localStorage.setItem('lipidomic-team-companion-nudge-dismissed:' + key, '1'); } catch (_) {}
      if (nudgeTimer) window.clearTimeout(nudgeTimer);
      nudgeTimer = null;
      tip.remove();
    });
    tip.appendChild(dismiss);
    var primary = container.querySelector('.assistant-workspace-primary');
    container.insertBefore(tip, primary || null);
    if (nudgeTimer) window.clearTimeout(nudgeTimer);
    nudgeTimer = window.setTimeout(function () { if (tip.isConnected) tip.remove(); nudgeTimer = null; }, nudgeDurationMs);
  }
  function canvasSnapshotState() {
    if (!selectedPlot) return 'editing';
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.tc-node'));
    var plotNode = nodes.find(function (item) { return item.dataset.plotId === selectedPlot.id; });
    if (!plotNode && nodes.length === 1) plotNode = nodes[0];
    if (!plotNode) return 'editing';
    if (plotNode.classList.contains('tc-stale')) return 'stale';
    return plotNode.classList.contains('tc-finished') ? 'finished' : 'editing';
  }
  function insightSupported(id) { try { return !!(window.TeamCanvas && typeof window.TeamCanvas.insightSupported === 'function' && window.TeamCanvas.insightSupported(id)); } catch (_) { return false; } }
  function stepDetails() {
    var key = stepCopy[state.substep] ? state.substep : legacyStages[state.legacyStep] === 'canvas' ? 'canvas' : state.legacyStep <= 1 ? 'data-choice' : state.legacyStep <= 4 ? 'review-single' : 'canvas';
    var copy = stepCopy[key];
    if (state.legacyStep === 7) return {key:'save', note:'Give this checkpoint a name and save it to your private project. It keeps the data, canvas, colors and finished figures. Nothing saves automatically.', next:'Explain saving a checkpoint'};
    if (state.legacyStep === 6) return {key:'cell', note:'Rotate the cell and compare the measured lipid profiles. Its structure and animation are illustrative, not a measured reconstruction.', next:'Explain the cell view'};
    var preview = document.getElementById('tc-preview-panel');
    if (state.legacyStep === 5 && preview && !preview.hidden) return {key:'print', note:'See your finished figures on paper. Choose the page layout, then download the PDF. Return to Workspace to edit; unfinished or outdated figures need attention first.', next:'Explain the print preview'};
    if (state.stage === 'review' && (state.preparationPending || state.preparationRunning || state.dirty)) return { key: key, note: 'Updating…', next: 'Continue to Canvas' };
    if (!state.loaded && state.stage !== 'data') return { key: key, note: 'No analysis loaded · return to Data to upload files or restore a checkpoint.', next: 'Open Data' };
    if (state.stage === 'canvas' && selectedPlot) {
      var snapshotState = canvasSnapshotState();
      var editCopy = snapshotState === 'stale'
        ? 'This archived snapshot predates an analysis change; it is not the current result. Review and prepare the analysis, then choose Edit to regenerate the current plot.'
        : snapshotState === 'finished'
          ? 'This is an archived snapshot of the prepared result at Finish and may differ from current live data. Export this figure here; after review and preparation, choose Edit to regenerate the current plot.'
          : 'The selected plot is live. Finish captures its current result; autosave keeps your work.' + (insightSupported(selectedPlot.id) ? ' Try Scientific insight below the plot for optional literature context.' : ' Ask me to explain this chart or suggest improvements.');
      return { key: key, note: 'Selected plot: ' + String(selectedPlot.title || selectedPlot.id).slice(0,120) + '. ' + editCopy, next: 'Ask about selected plot' };
    }
    if (state.stage === 'canvas' && !selectedPlot) {
      var candidate = suggestedPlot();
      if (candidate) return { key: key, note: 'Canvas saves automatically. Finish plots to compose a figure in Print preview. For optional literature context, try Scientific insight below a live plot.', next: 'Add ' + candidate.title + ' to Canvas', candidate: candidate };
      return { key: key, note: 'No additional live plot is currently available to add. Open the source analysis to inspect this output and any download it provides.', next: 'Explain this step' };
    }
    return { key: key, note: copy[0], next: copy[1] };
  }
  // The reviewed per-chart guide answers locally; the server question is the fallback.
  function localExplain() {
    var local = window.LipidomicCompanionLocal;
    return !!(local && selectedPlot && selectedPlot.id && local.sourceOf(selectedPlot.id) && local.explain(selectedPlot.id));
  }
  function askFromBubble(question) {
    var p = panel();
    if (p && p.hidden) {
      var launcher = document.querySelector('#lipidomic-assistant-root .assistant-launcher');
      if (launcher) launcher.click();
    }
    sendQuestion(question || 'Explain this step');
  }
  function adaptFloatingBubble() {
    var speech = document.querySelector('#lipidomic-companion .companion-speech, .companion-speech');
    if (!speech || !state.authenticated) return;
    var details = stepDetails();
    var stage = stageLabels[state.stage] ? state.stage : 'data';
    var heading = document.getElementById('tw-screen-title');
    var titleText = state.legacyStep === 7 ? 'Save your workspace' : state.legacyStep === 6 ? 'Explore the cell' : details.key === 'print' ? 'Print preview' : heading && heading.textContent.trim();
    var fallbackTitles = {
      'data-choice':'Choose how to begin', 'data-matrix':'Add your abundance matrix', 'data-metadata':'Add sample labels',
      'review-single':'Review the data', canvas:'Build your figure'
    };
    var eyebrow = speech.querySelector('.speech-eyebrow');
    var screens = stageScreens[stage];
    var screenIndex = screens.indexOf(state.substep);
    if (eyebrow) setText(eyebrow, 'YOUR WORKSPACE · ' + stageLabels[stage].toUpperCase() + (screenIndex >= 0 ? ' · ' + (screenIndex + 1) + ' OF ' + screens.length : ''));
    var title = speech.querySelector('.speech-title');
    if (title) setText(title, titleText || fallbackTitles[state.substep] || stageLabels[stage]);
    var copy = speech.querySelector('.speech-copy p');
    if (copy) setText(copy, details.note);
    // The legacy context helper can append an extra chat button. Keep the bubble
    // focused on its one safe action; the normal launcher and chat input remain.
    var extraChat = speech.querySelector('.assistant-speech-chat');
    if (extraChat) extraChat.hidden = true;
    var button = speech.querySelector('.speech-copy .guide-button');
    if (!button) return;
    var label, callback;
    if (!state.loaded && stage !== 'data') {
      label = 'Open Data'; callback = function () { go('data'); };
    } else if (stage === 'canvas' && state.legacyStep === 5 && details.key !== 'print' && selectedPlot && selectedPlot.id) {
      label = 'Ask about this plot';
      callback = function () {
        var plotName = String(selectedPlot.title || selectedPlot.id).slice(0, 120);
        if (localExplain()) return;
        askFromBubble('Explain how to read the ' + plotName + ' plot. Describe the method and limitations; do not infer findings that are not in the current analysis context.');
      };
    } else if (state.canNext && window.TeamWorkspace && typeof window.TeamWorkspace.next === 'function') {
      label = stage === 'review' ? details.next : 'Next'; callback = nextScreen;
    } else {
      label = 'Explain how'; callback = function () { askFromBubble('Explain this step'); };
    }
    setText(button, label);
    button.setAttribute('aria-label', label + ' · ' + (titleText || fallbackTitles[state.substep] || stageLabels[stage]));
    button.onclick = callback;
    button.dataset.workspaceSubstep = state.substep;
    speech.dataset.workspaceSubstep = state.substep;
  }
  function legacyStage(step) { return Number(step) <= 1 ? 'data' : Number(step) <= 4 ? 'review' : 'canvas'; }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function adaptHelpUI() {
    var stage = stageLabels[state.stage] ? state.stage : legacyStage(state.legacyStep);
    var stepLabels = { Experiment:'Data', Design:'Review', Quality:'Review', 'My question':'Review', Results:'Canvas', '3D Show':'Canvas', Share:'Canvas' };
    var help = document.getElementById('lipidomic-context-help');
    if (help) {
      setText(help, 'Help with ' + stageLabels[stage]);
      help.setAttribute('aria-label', help.textContent);
      help.dataset.helpTopic = 'step' + state.legacyStep;
    }
    var tour = document.getElementById('lipidomic-tour');
    if (tour) setText(tour, 'Workspace guide');
    var launcherLabel = document.querySelector('#lipidomic-companion .companion-help-label');
    if (launcherLabel) setText(launcherLabel, stage === 'data' ? 'Start here' : stage === 'review' ? 'Review your analysis' : 'Build a figure');

    document.querySelectorAll('.lipid-help-panel').forEach(function (helpPanel) {
      var eyebrow = helpPanel.querySelector('.help-eyebrow');
      if (eyebrow) {
        var old = eyebrow.textContent || '';
        if (/SEVEN-STEP TOUR/i.test(old)) setText(eyebrow, 'WORKSPACE GUIDE');
        else if (/YOUR GUIDE|YOUR WORKSPACE/i.test(old)) setText(eyebrow, 'YOUR GUIDE · ' + stageLabels[stage].toUpperCase());
      }
      var title = helpPanel.querySelector('#lipidomic-help-title');
      if (title) {
        if (!title.dataset.workspaceOriginalText) title.dataset.workspaceOriginalText = title.textContent;
        if (Object.prototype.hasOwnProperty.call(stepLabels, title.dataset.workspaceOriginalText)) setText(title, stepLabels[title.dataset.workspaceOriginalText]);
      }
      var progress = helpPanel.querySelector('.help-step-progress');
      if (progress) progress.hidden = true;
      var nav = helpPanel.querySelector('.help-tour-nav');
      if (nav && !nav.dataset.workspaceAdapted) {
        nav.dataset.workspaceAdapted = 'true';
        nav.replaceChildren();
        ['data', 'review', 'canvas'].forEach(function (key) {
          nav.appendChild(actionButton(stageLabels[key], function () {
            if (window.TeamWorkspace && typeof window.TeamWorkspace.go === 'function') window.TeamWorkspace.go(key);
          }, false));
        });
        nav.appendChild(actionButton('Close guide', function () {
          var close = helpPanel.querySelector('.lipid-help-close');
          if (close) close.click();
        }, false));
      }
    });
    adaptFloatingBubble();
  }
  function render() {
    renderQueued = false;
    var r = root(), p = panel();
    adaptHelpUI();
    var currentDock = document.getElementById('lipidomic-companion');
    if (currentDock && currentDock !== mobileDock) { mobileDock = currentDock; observeMobileDock(currentDock); }
    if (!r || !p) return;
    // Do not expose a companion launcher or chat before the Team workspace has
    // confirmed authentication. Existing chat contents remain mounted.
    r.hidden = !state.authenticated;
    if (!state.authenticated) return;

    var context = p.querySelector('.assistant-context-actions');
    if (context) {
      var stage = stageLabels[state.stage] ? state.stage : 'data';
      var details = stepDetails();
      var candidate = details.candidate;
      var key = stage + ':' + details.key;
      var signature = [stage, details.note, details.next, state.loaded, state.ready, state.dirty,
        state.canNext, selectedPlot && selectedPlot.id || '', candidate && candidate.id || '', canvasSnapshotState()].join('|');
      if (signature !== contextSignature || !context.querySelector('.assistant-workspace-primary')) {
        contextSignature = signature;
        context.replaceChildren();
        context.appendChild(node('p', 'assistant-context-note', stageLabels[stage] + ' · ' + details.note));
        var primary;
        if (state.stage === 'canvas' && state.legacyStep === 5 && details.key !== 'print' && selectedPlot && selectedPlot.id) {
          primary = actionButton('Ask about selected plot', function () {
            if (localExplain()) return;
            sendQuestion('Explain how to read the ' + String(selectedPlot.title || selectedPlot.id).slice(0,120) + ' plot. Describe the method and limitations; do not infer findings that are not in the current analysis context.');
          }, false);
        } else if (candidate) {
          primary = actionButton(details.next, function () { addSuggestedPlot(candidate); }, false);
        } else if (state.stage === 'review' && (!state.canNext || state.dirty)) {
          primary = actionButton('Explain this step', function () { sendQuestion('Explain this step'); }, false);
        } else if (state.canNext && window.TeamWorkspace && typeof window.TeamWorkspace.next === 'function') {
          primary = actionButton(details.next, nextScreen, false);
        } else if (state.stage !== 'canvas' && !state.loaded) {
          primary = actionButton('Open Data', function () { go('data'); }, false);
        } else {
          primary = actionButton('Explain this step', function () { sendQuestion('Explain this step'); }, false);
        }
        primary.classList.add('assistant-workspace-primary');
        primary.style.flex = '1 0 100%';
        primary.style.minWidth = '0';
        context.appendChild(primary);
        maybeNudge(context, key, state.stage === 'canvas' && selectedPlot ? (insightSupported(selectedPlot.id) ? 'Want scientific background? Try Scientific insight below a live plot. For a finished figure, choose Edit first.' : 'Ask about selected plot explains how to read it and what to check.') : details.next ? 'You can ask a question at any point.' : 'I can explain what this screen checks.');
      }
    }

    // The legacy server can still return navigation suggestions. Keep their
    // intent, but render the visible destination with the three workspace names.
    var actions = p.querySelector('.assistant-actions');
    if (actions) Array.prototype.forEach.call(actions.querySelectorAll('button'), function (button) {
      var old = button.textContent || '';
      var target = /experiment|upload|start/i.test(old) ? 'data' :
        /quality|design|preparation|review/i.test(old) ? 'review' :
        /result|plot|3d|share|canvas/i.test(old) ? 'canvas' :
        /this step|current step/i.test(old) ? state.stage :
        /next step/i.test(old) ? (state.stage === 'data' ? 'review' : 'canvas') : null;
      if (!target || button.dataset.workspaceAdapted === 'true') return;
      var replacement = actionButton('Open ' + stageLabels[target], function () { go(target); }, button.disabled);
      replacement.dataset.workspaceAdapted = 'true';
      button.replaceWith(replacement);
    });
  }
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(render);
  }
  function onWorkspace(event) {
    var detail = event && event.detail || {};
    if (stageLabels[detail.stage]) state.stage = detail.stage;
    if (Number.isInteger(Number(detail.legacyStep)) && Number(detail.legacyStep) >= 1 && Number(detail.legacyStep) <= 7) {
      state.legacyStep = Number(detail.legacyStep);
      if (!stageLabels[detail.stage]) state.stage = legacyStages[state.legacyStep] || state.stage;
    }
    if (typeof detail.tool === 'string') state.tool = detail.tool;
    if (typeof detail.substep === 'string') state.substep = detail.substep === 'review-samples' ? 'review-single' : detail.substep;
    if (Number.isFinite(Number(detail.substepIndex))) state.substepIndex = Number(detail.substepIndex);
    if (Number.isFinite(Number(detail.substepCount))) state.substepCount = Number(detail.substepCount);
    if (typeof detail.canNext === 'boolean') state.canNext = detail.canNext;
    if (typeof detail.canBack === 'boolean') state.canBack = detail.canBack;
    if (typeof detail.preparationPending === 'boolean') state.preparationPending = detail.preparationPending;
    if (typeof detail.preparationRunning === 'boolean') state.preparationRunning = detail.preparationRunning;
    if (typeof detail.authenticated === 'boolean') {
      state.authenticated = detail.authenticated;
      if (!state.authenticated) {
        selectedPlot = null;
        state.loaded = false;
        state.ready = false;
        state.dirty = false;
        state.substep = 'data-choice';
        state.substepIndex = 1;
        state.substepCount = 10;
        state.canNext = false;
        state.canBack = false;
        contextSignature = '';
      }
    }
    if (typeof detail.ready === 'boolean') state.ready = detail.ready;
    scheduleRender();
  }
  function onCanvasSelection(event) {
    var detail = event && event.detail;
    selectedPlot = detail && detail.id ? { id: String(detail.id), title: String(detail.title || detail.id) } : null;
    scheduleRender();
  }
  function onCompanionState(detail) {
    if (detail && typeof detail.ready === 'boolean') state.ready = detail.ready;
    if (detail && typeof detail.loaded === 'boolean') state.loaded = detail.loaded;
    if (detail && typeof detail.dirty === 'boolean') state.dirty = detail.dirty;
    scheduleRender();
  }
  var mobileDock = null;
  var mobileDockObserver = null;
  function observeMobileDock(dock) {
    if (mobileDockObserver) mobileDockObserver.disconnect();
    mobileDockObserver = new MutationObserver(function () {
      // The core help lifecycle repositions on content changes and scrolling,
      // after resize. Correct only unsafe coordinates; our safe write is a no-op
      // on the next delivery, so this cannot form a style feedback loop.
      keepMobileDockSafe();
    });
    mobileDockObserver.observe(dock, {attributes:true, attributeFilter:['style']});
    keepMobileDockSafe();
  }
  function keepMobileDockSafe() {
    if (window.innerWidth > 600) return;
    var dock = document.getElementById('lipidomic-companion');
    if (!dock || dock.classList.contains('is-dragging')) return;
    var rect = dock.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var headerBottom = 0;
    document.querySelectorAll('.navbar,#team-workspace .tw-steps,#team-workspace .tw-signout').forEach(function (el) {
      var bounds = el.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < window.innerHeight / 2) headerBottom = Math.max(headerBottom, bounds.bottom);
    });
    var inset = 12;
    // Respect a user placement whenever it remains visible and clears navigation.
    if (rect.top >= headerBottom + inset && rect.left >= inset && rect.right <= window.innerWidth - inset && rect.bottom <= window.innerHeight - inset) return;
    var x = Math.max(inset, window.innerWidth - rect.width - inset);
    var y = Math.max(headerBottom + inset, window.innerHeight - rect.height - 24);
    // Prefer the lower right; move upwards only when it would cover an action.
    var controls = Array.prototype.slice.call(document.querySelectorAll('button,a,input,select,textarea')).filter(function (el) {
      return !dock.contains(el) && !el.closest('#lipidomic-assistant-root,.lipid-help-panel') && el.getClientRects().length;
    }).map(function (el) { return el.getBoundingClientRect(); });
    var best = {y:y, score:Infinity};
    for (var candidate = y; candidate >= headerBottom + inset; candidate -= 24) {
      var score = controls.reduce(function (sum, bounds) {
        return sum + Math.max(0, Math.min(x + rect.width, bounds.right) - Math.max(x, bounds.left)) * Math.max(0, Math.min(candidate + rect.height, bounds.bottom) - Math.max(candidate, bounds.top));
      }, 0);
      if (score < best.score) best = {y:candidate, score:score};
      if (!score) break;
    }
    dock.style.left = x + 'px'; dock.style.top = best.y + 'px';
    dock.style.right = 'auto'; dock.style.bottom = 'auto';
  }
  function mount() {
    window.addEventListener('resize', function () { window.requestAnimationFrame(keepMobileDockSafe); });
    window.addEventListener('team-workspace-state', onWorkspace);
    window.addEventListener('team-canvas-selection', onCanvasSelection);
    document.addEventListener('click', function(e){if(e.target.closest('#tc-preview-tab,#tc-workspace-tab')) scheduleRender();});
    var observer = new MutationObserver(scheduleRender);
    var r = root();
    if (r) observer.observe(r, { childList: true, subtree: true });
    // Legacy context helpers may replace the floating tip after our frame. Repair
    // its presentation before the next paint; setText makes this idempotent.
    // The repair runs synchronously only when the tip itself changed; any other page change is
    // picked up by the next render frame (render -> adaptHelpUI -> adaptFloatingBubble), so canvas
    // edits do not pay for a full bubble pass on every mutation batch.
    var touchesSpeech = function (records) {
      return records.some(function (record) {
        var target = record.target && record.target.nodeType === 1 ? record.target : record.target && record.target.parentElement;
        if (target && target.closest('.companion-speech')) return true;
        return Array.prototype.some.call(record.addedNodes || [], function (node) {
          return node.nodeType === 1 && (node.matches('.companion-speech') || !!node.querySelector('.companion-speech'));
        });
      });
    };
    var helpObserver = new MutationObserver(function (records) { if (touchesSpeech(records)) adaptFloatingBubble(); scheduleRender(); });
    if (document.body) helpObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed'], characterData: true });
    if (window.Shiny && typeof window.Shiny.addCustomMessageHandler === 'function') {
      window.Shiny.addCustomMessageHandler('team_companion_workspace_state', onCompanionState);
    }
    var auth = document.body && document.body.dataset.teamAuthenticated;
    if (auth === 'true' || auth === '1') state.authenticated = true;
    if (window.TeamCanvas && typeof window.TeamCanvas.selected === 'function') {
      try { var selected = window.TeamCanvas.selected(); if (selected && selected.id) selectedPlot = { id: String(selected.id), title: String(selected.title || selected.id) }; } catch (_) {}
    }
    // Workspace state can be available before this adapter executes.
    if (window.TeamWorkspace && typeof window.TeamWorkspace.state === 'function') {
      try { onWorkspace({ detail: window.TeamWorkspace.state() }); } catch (_) {}
    }
    scheduleRender();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
