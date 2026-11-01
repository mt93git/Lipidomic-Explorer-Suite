(function () {
  'use strict';
  function init() {
    if (!document.getElementById('team-canvas-root') || !window.Shiny || !window.TeamCanvas) return;
    let request = null, replay = false, downloading = false, foregroundToken = null;
    function status(control, message) {
      if (!control) return;
      let notice = control.parentElement.querySelector('.team-checkpoint-status');
      if (!notice) {
        notice = document.createElement('p'); notice.className = 'team-checkpoint-status';
        notice.setAttribute('role', 'status'); control.insertAdjacentElement('afterend', notice);
      }
      notice.textContent = message;
    }
    function busy(control, value) {
      if (!control) return;
      control.setAttribute('aria-busy', String(value));
      if (control.tagName === 'BUTTON') control.disabled = value;
    }
    async function saveRequest(message) {
      const id = message && message.requestId;
      if (typeof id !== 'string' || !id) return;
      request = id;
      if(message.kind !== "autosave" && window.TeamBusy) { if(foregroundToken)TeamBusy.end(foregroundToken); foregroundToken=TeamBusy.begin("Saving your checkpoint…"); }
      const control = document.getElementById('team_library_save');
      busy(control, true); status(control, 'Saving your canvas edits…');
      try {
        const ack = await TeamCanvas.checkpoint();
        if (request !== id) return;
        status(control, 'Canvas confirmed. Saving the private checkpoint…');
        Shiny.setInputValue('team_canvas_save_ready', {requestId:id, token:ack.token, ok:true}, {priority:'event'});
      } catch (error) {
        if (request !== id) return;
        status(control, 'Checkpoint not saved. ' + error.message);
        busy(control, false);
        Shiny.setInputValue('team_canvas_save_ready', {requestId:id, ok:false}, {priority:'event'});
      }
    }
    // Shiny awaits custom-message handlers in sequence. Returning this promise
    // would block delivery of the acknowledgement that checkpoint() awaits.
    Shiny.addCustomMessageHandler('team-canvas-save-request', function (message) {
      void saveRequest(message);
    });
    Shiny.addCustomMessageHandler('team-canvas-save-result', function (message) {
      if (!message || message.requestId !== request) return;
      request = null;
      if(foregroundToken){TeamBusy.end(foregroundToken);foregroundToken=null;}
      const control = document.getElementById('team_library_save');
      busy(control, false);
      const notice = control && control.parentElement.querySelector('.team-checkpoint-status');
      if (message.ok) status(control, 'Canvas and analysis saved in the private checkpoint.');
      else if (!notice || !notice.textContent.startsWith('Checkpoint not saved.'))
        status(control, 'Checkpoint not saved. See the project library message and try again.');
    });
    // Text bindings debounce edits. Flush the visible checkpoint name before
    // Shiny's bubbling action-button handler starts the guarded save request.
    // Keep the server's mid-save project/name change checks intact.
    document.addEventListener('click', function (event) {
      const button = event.target.closest && event.target.closest('#team_library_save');
      if (!button || button.disabled) return;
      const label = document.getElementById('team_library_label');
      if (label) Shiny.setInputValue('team_library_label', label.value, {priority:'event'});
    }, true);
    // Intercept only Team's ZIP link. Wait for validated presentation state before
    // Shiny opens the download endpoint; a failed capture must never export stale edits.
    document.addEventListener('click', async function (event) {
      const link = event.target.closest && event.target.closest('#data_hub-export_session_btn');
      if (!link || replay) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (downloading) return;
      downloading = true; const token=window.TeamBusy && TeamBusy.begin("Preparing your ZIP…"); busy(link, true); status(link, 'Preparing the canvas checkpoint…');
      try {
        await TeamCanvas.checkpoint();
        replay = true;
        try { link.click(); } finally { replay = false; }
        status(link, 'Canvas confirmed. Your ZIP download is starting.');
      } catch (error) { status(link, 'ZIP not downloaded. ' + error.message); }
      finally { downloading = false; busy(link, false); if(token)TeamBusy.end(token); }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
