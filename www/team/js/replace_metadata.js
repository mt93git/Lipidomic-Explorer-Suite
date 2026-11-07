/* Team Review: "Replace sample metadata" opens the existing "Add sample labels"
   screen (data-metadata) after a short in-page confirmation. No upload logic
   here: the metadata panel already replaces a table. Navigation goes through
   TeamWorkspace.open, the same guarded route as "← Back", so the step guard and
   the busy queue apply. Shown on Review only (CSS keys on data-tw-screen). */
(function () {
  'use strict';
  var NOTE = 'Groups and colours in Review will be rebuilt from the new table. Exclusions, Canvas figures and checkpoints are kept.';
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function build() {
    var actions = document.querySelector('#team-workspace .tw-journey-actions');
    if (!actions || actions.querySelector('.tw-replace-meta')) return;
    var wrap = el('span', 'tw-replace-meta');
    var trigger = el('button', 'tw-replace-meta-trigger', 'Replace sample metadata');
    trigger.type = 'button'; trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'tw-replace-meta-note');
    var note = el('div', 'tw-replace-meta-note'); note.id = 'tw-replace-meta-note'; note.hidden = true;
    note.setAttribute('role', 'dialog'); note.setAttribute('aria-label', 'Replace sample metadata');
    var text = el('p', null, NOTE); text.id = 'tw-replace-meta-text'; note.setAttribute('aria-describedby', text.id);
    var row = el('div', 'tw-replace-meta-actions');
    var replace = el('button', 'tw-replace-meta-confirm', 'Replace'); replace.type = 'button';
    var cancel = el('button', 'tw-replace-meta-cancel', 'Cancel'); cancel.type = 'button';
    row.appendChild(replace); row.appendChild(cancel); note.appendChild(text); note.appendChild(row);
    wrap.appendChild(trigger); wrap.appendChild(note);
    actions.insertBefore(wrap, actions.firstChild);
    if (window.TeamWorkspace && typeof TeamWorkspace.state === 'function') trigger.disabled = !TeamWorkspace.state().authenticated;

    // Never hide the note with focus inside it: move focus first, to the button when it is
    // still shown and enabled, otherwise to the screen title (always present).
    function parkFocus() {
      var target = !trigger.disabled && trigger.getClientRects().length ? trigger : document.getElementById('tw-screen-title');
      if (target) target.focus({preventScroll: true});
    }
    function open(show, refocus) {
      if (!show && (refocus || note.contains(document.activeElement))) parkFocus();
      note.hidden = !show; trigger.setAttribute('aria-expanded', String(show));
      if (show) replace.focus({preventScroll: true});
    }
    trigger.addEventListener('click', function () { open(note.hidden, true); });
    cancel.addEventListener('click', function () { open(false, true); });
    replace.addEventListener('click', function () {
      open(false, true);
      // Same route as Back from Review; held and sent at idle while an update runs.
      if (window.TeamWorkspace && typeof TeamWorkspace.open === 'function') TeamWorkspace.open('data-metadata');
    });
    note.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); open(false, true); } });
    document.addEventListener('click', function (e) { if (!note.hidden && !wrap.contains(e.target)) open(false, false); });
    // Leaving Review (any route) closes the note.
    window.addEventListener('team-workspace-state', function (e) {
      trigger.disabled = !(e.detail && e.detail.authenticated);
      if (!note.hidden && (trigger.disabled || !(e.detail && e.detail.substep === 'review-single'))) open(false, false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
