/* Lipid heatmap "Show": the server reports whether Significant only is allowed
 * (data-allowed on its status note). Disable just that option, with the reason
 * linked to it; "All lipids" stays available so a blocked view can be left.
 * Nodes may be moved (Canvas inspector), never re-created, so ids hold. */
(function (root) {
  'use strict';
  function sync() {
    document.querySelectorAll('[data-rd-significance-for]').forEach(function (note) {
      var group = document.getElementById(note.dataset.rdSignificanceFor);
      var option = group && group.querySelector('input[type="radio"][value="significant"]');
      if (!option) return;
      var blocked = note.dataset.allowed === 'false';
      if (option.disabled !== blocked) option.disabled = blocked;
      var label = option.closest('label');
      if (label) label.classList.toggle('is-unavailable', blocked);
      if (blocked) { if (option.getAttribute('aria-describedby') !== note.id) option.setAttribute('aria-describedby', note.id); }
      else if (option.hasAttribute('aria-describedby')) option.removeAttribute('aria-describedby');
    });
  }
  var queued = false;
  function schedule() { if (!queued) { queued = true; setTimeout(function () { queued = false; sync(); }, 0); } }
  function start() {
    if (root.jQuery) root.jQuery(document).on('shiny:value.teamHeatSignificance shiny:bound.teamHeatSignificance', schedule);
    ['team-canvas-restored', 'team-document-restored'].forEach(function (name) { root.addEventListener(name, schedule); });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
