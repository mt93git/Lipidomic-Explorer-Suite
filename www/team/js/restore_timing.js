/* Opt in before Open latest: TeamRestoreTiming.start(); inspect .snapshot().
 * Record event timing/visibility only, never output values or input contents.
 * shiny:value means delivery, not completion of browser/Plotly painting.
 */
(function () {
  'use strict';
  var rows = [], started = null;
  function record(event) {
    if (started === null) return;
    var node = event.name && document.getElementById(event.name);
    rows.push({ms: Math.round((performance.now() - started) * 10) / 10,
      event: event.type, output: event.name || null,
      hidden: node ? !node.getClientRects().length : null,
      stage: document.body.dataset.teamStage || null});
    if (rows.length > 10000) rows.shift();
  }
  window.TeamRestoreTiming = {
    start: function () { rows = []; started = performance.now(); },
    stop: function () { started = null; },
    snapshot: function () { return rows.map(function (row) { return Object.assign({}, row); }); }
  };
  function init() {
    if (window.jQuery) jQuery(document).on(
      'shiny:busy.teamRestoreTiming shiny:idle.teamRestoreTiming shiny:value.teamRestoreTiming shiny:outputinvalidated.teamRestoreTiming', record);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
