/* Foreground work has explicit ownership. Background Shiny/autosave is not a lock. */
(function () {
  'use strict';
  var operations = new Map(), sequence = 0, dialog, title, detail, close, previousFocus;
  var preparationToken = null;
  function ensure() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'team-foreground';
    dialog.setAttribute('aria-labelledby', 'team-foreground-title');
    dialog.setAttribute('aria-describedby', 'team-foreground-detail');
    var spinner = document.createElement('span'); spinner.className = 'team-foreground-spinner'; spinner.setAttribute('aria-hidden', 'true');
    title = document.createElement('h2'); title.id = 'team-foreground-title';
    detail = document.createElement('p'); detail.id = 'team-foreground-detail'; detail.setAttribute('role', 'status');
    close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss'; close.hidden = true;
    close.onclick = function () { Array.from(operations.entries()).forEach(function (entry) { if (entry[1].error) end(entry[0]); }); };
    dialog.addEventListener('close', function () { if (operations.size) paint(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && dialog.open && operations.size) { event.preventDefault(); event.stopImmediatePropagation(); if (!close.hidden) close.click(); } }, true);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); if (!close.hidden) close.click(); });
    dialog.append(spinner, title, detail, close); document.body.appendChild(dialog);
  }
  function paint() {
    ensure();
    var active = Array.from(operations.entries());
    var workspace = document.getElementById('team-workspace');
    if (!active.length) {
      if (dialog.open) dialog.close();
      if (workspace) workspace.removeAttribute('aria-busy');
      if (previousFocus && previousFocus.isConnected && !previousFocus.disabled) previousFocus.focus({preventScroll: true});
      previousFocus = null; return;
    }
    var op = active[active.length - 1][1], problem = active.find(function (entry) { return entry[1].error; });
    if (problem) op = problem[1];
    title.textContent = op.error ? 'Please check this operation' : op.label;
    detail.textContent = op.error || 'Please wait. You can continue as soon as this finishes.';
    close.hidden = !op.error; dialog.classList.toggle('has-error', !!op.error);
    if (workspace) workspace.setAttribute('aria-busy', 'true');
    if (!dialog.open) { previousFocus = document.activeElement; dialog.showModal(); }
    if (op.error) close.focus({preventScroll:true});
  }
  function begin(label, options) {
    var id = 'foreground-' + (++sequence), op = {label: String(label || 'Loading…'), server: !!(options && options.server), action: options && options.action};
    op.timer = setTimeout(function () { fail(id, 'This is taking longer than expected. You can dismiss this message; the operation may still be running.'); }, 120000);
    operations.set(id, op); paint(); return id;
  }
  function end(id) { var op = operations.get(id); if (!op) return; clearTimeout(op.timer); operations.delete(id); paint(); }
  function fail(id, message) { var op = operations.get(id); if (!op) return; clearTimeout(op.timer); op.error = String(message || 'The operation could not finish. Dismiss this message and try again.'); paint(); }
  function serverStart(label, action) {
    var existing = Array.from(operations.entries()).find(function (entry) { return entry[1].action === action && !entry[1].error; });
    if (existing) return existing[0];
    var id = begin(label, {server:true, action:action});
    if (window.Shiny) Shiny.setInputValue('team_foreground_' + action, id, {priority:'event'});
    return id;
  }
  window.TeamBusy = {begin:begin, end:end, fail:fail, pending:function () { return operations.size; }};
  function init() {
    if (!document.getElementById('team-workspace')) return;
    ensure();
    var actions = {
      team_library_login:'Signing in…', team_library_resume:'Opening your saved analysis…',
      team_library_activation_submit:'Setting your password…', team_library_retry:'Recovering your checkpoint…',
      team_library_save:'Saving your checkpoint…'
    };
    document.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('button');
      if (button && !button.disabled && actions[button.id]) {
        // Flush debounced credentials before the action; opening the dialog moves focus.
        if(button.id === 'team_library_login' && window.Shiny) ['email','password'].forEach(function(key){var input=document.getElementById('team_library_'+key);if(input)Shiny.setInputValue(input.id,input.value,{priority:'event'});});
        serverStart(actions[button.id], button.id);
      }
    }, true);
    document.addEventListener('change', function (event) {
      if (['data_hub-files','data_hub-import_session_file','sample_metadata_import-file'].indexOf(event.target.id) >= 0 && event.target.files && event.target.files.length) serverStart('Loading your files…', event.target.id);
    }, true);
    window.addEventListener('team-preparation-state', function (event) {
      var state = event.detail || {};
      if (state.running && !preparationToken) preparationToken = begin('Updating your analysis…');
      if (!state.running && preparationToken) { end(preparationToken); preparationToken = null; }
    });
    function register() {
      if (!window.Shiny || typeof Shiny.addCustomMessageHandler !== 'function') return;
      Shiny.addCustomMessageHandler('team-foreground-result', function (message) {
        if (!message || !operations.has(message.id)) return;
        if (message.ok === false) fail(message.id, 'The operation could not finish. Dismiss this message and review the details in the workspace.');
        else end(message.id);
      });
    }
    register();
    if (window.jQuery) jQuery(document)
      .on('shiny:connected', register)
      .on('shiny:disconnected', function () {
        operations.forEach(function (op, id) { if (op.server || id === preparationToken) fail(id, 'The connection was lost. Reconnect before continuing.'); });
      });
    // Shiny reports upload HTTP failures in the input's own progress element.
    new MutationObserver(function () {
      operations.forEach(function (op, id) {
        if (!op.action) return;
        var input = document.getElementById(op.action), container = input && input.closest('.shiny-input-container');
        if (container && container.querySelector('.progress-bar-danger')) fail(id, 'The file upload failed. Dismiss this message and select the file again.');
      });
    }).observe(document.getElementById('team-workspace'), {childList:true, subtree:true, attributes:true, attributeFilter:['class']});

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
