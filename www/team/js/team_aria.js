/* RC5: ARIA on the step bars and the Canvas cards. Attributes only: nothing is created, moved or
   cloned, and no label is written where its owner already manages it.
   - Guided seven-step bar (#guide-navigation, R/guided_workflow.R): each step is named
     "Step N of 7: Label". Its content alone reads "1Experiment". aria-current stays guided.js's.
   - Workspace stage bars (#team-workspace .tw-steps and shell.js's .ts-steps mirror): the numeral is
     aria-hidden, so the name is the stage ("Data", not "01Data"). workspace.js owns their aria-label
     (lock reasons) and it is never written here.
   - Canvas cards (article.tc-node): named by their title. The focusable header, the arrow-key move
     handle that canvas.js names "Move … with arrow keys", gets role=group: aria-label is not allowed
     on a div without a role, and the header holds buttons, so it cannot be a button itself. */
(function () {
  'use strict';
  var queued = 0;
  // Plots, the minimap and the board's world change constantly and never hold a step or a card title.
  var CHURN = '.js-plotly-plot,.plot-container,.tc-map,svg';

  function set(el, name, value) { if (el.getAttribute(name) !== value) el.setAttribute(name, value); }
  function text(n) { return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; }

  function guidedSteps() {
    var steps = document.querySelectorAll('#guide-navigation > nav:not(.tw-compact-steps) > [data-guide-step]');
    Array.prototype.forEach.call(steps, function (b) {
      var last = b.lastChild;
      var label = last && last.nodeType === 3 ? last.textContent.trim() : text(b).replace(/^\d+\s*/, '');
      if (label) set(b, 'aria-label', 'Step ' + b.dataset.guideStep + ' of ' + steps.length + ': ' + label);
    });
  }

  function stageBars() {
    document.querySelectorAll('#team-workspace .tw-steps [data-tw-stage] > span:first-child, .ts-steps .ts-step > em').forEach(function (n) {
      set(n, 'aria-hidden', 'true');
    });
  }

  function cards() {
    document.querySelectorAll('#team-canvas-root .tc-node').forEach(function (node) {
      var head = node.querySelector('.tc-node-head');
      var name = text(head && head.querySelector('strong'));
      if (name) set(node, 'aria-label', name);
      if (head && head.hasAttribute('aria-label') && !head.hasAttribute('role')) head.setAttribute('role', 'group');
    });
  }

  function sync() { queued = 0; guidedSteps(); stageBars(); cards(); }
  function schedule() { if (!queued) queued = requestAnimationFrame(sync); }
  function relevant(records) {
    return records.some(function (r) { var t = r.target.nodeType === 1 ? r.target : r.target.parentElement; return !(t && t.closest(CHURN)); });
  }
  function start() {
    sync();
    new MutationObserver(function (records) { if (relevant(records)) schedule(); })
      .observe(document.body, {childList: true, subtree: true, characterData: true});
  }
  window.TeamAria = {sync: sync};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
