(function (root) {
  'use strict';
  function makeDebounced(send, schedule, cancel) {
    var timer = null, generation = 0;
    function queue(threshold) {
      generation += 1;
      var current = generation;
      if (timer !== null) cancel(timer);
      timer = schedule(function () {
        if (current !== generation) return;
        timer = null;
        var value = typeof threshold === 'function' ? threshold() : threshold;
        if (!Number.isFinite(value)) return;
        send({kind: 'detection', threshold: value, token: current, source: 'human'});
      }, 450);
    }
    queue.cancel = function () {
      generation += 1;
      if (timer !== null) cancel(timer);
      timer = null;
    };
    return queue;
  }
  if (typeof module === 'object' && module.exports) module.exports = {makeDebounced: makeDebounced};
  if (!root.document) return;
  var dragging = false, foreground = new Map();
  function foregroundStart(key) {
    if(foreground.has(key) || !root.TeamBusy) return;
    foreground.set(key,root.TeamBusy.begin('Preparing data…'));
  }
  function foregroundResult(message) {
    if(!message || !foreground.has(message.key) || !root.TeamBusy) return;
    var token=foreground.get(message.key);foreground.delete(message.key);
    if(message.status==='failed'||message.status==='timeout') root.TeamBusy.fail(token,'Preparation did not finish. Review the workspace and try again.');
    else root.TeamBusy.end(token);
  }

  var queue = makeDebounced(function (request) {
    if (root.Shiny) { foregroundStart(request.kind+':'+request.token); root.Shiny.setInputValue('qc_pca_tab-minDetectionPct', request.threshold, {priority: 'event'}); root.Shiny.setInputValue('team_review_prepare', request, {priority: 'event'}); }
  }, root.setTimeout.bind(root), root.clearTimeout.bind(root));
  function sliderContainer(target) {
    var container = target && target.closest && target.closest('.shiny-input-container');
    return container && container.querySelector('#qc_pca_tab-minDetectionPct') ? container : null;
  }
  function submitSlider() {
    queue(function () {
      var slider = document.getElementById('qc_pca_tab-minDetectionPct');
      if (!slider) return NaN;
      var value = Number(slider.value);
      var minimum = Number(slider.getAttribute('data-min') || slider.min || 0);
      var maximum = Number(slider.getAttribute('data-max') || slider.max || 100);
      if (!Number.isFinite(minimum)) minimum = 0;
      if (!Number.isFinite(maximum)) maximum = 100;
      return Number.isFinite(value) && value >= minimum && value <= maximum ? value : NaN;
    });
  }
  // Sent only after the server validates an explicit companion confirmation.
  // Read the bound slider after Shiny applies its update; a later human edit
  // or stale value must never be replaced by the confirmed proposal.
  if (root.Shiny && typeof root.Shiny.addCustomMessageHandler === 'function') {
    root.Shiny.addCustomMessageHandler('team-review-foreground-start',function(message){if(message && typeof message.key==='string')foregroundStart(message.key);});
    root.Shiny.addCustomMessageHandler('team-review-foreground-result',foregroundResult);
    root.Shiny.addCustomMessageHandler('team-review-confirmed-detection', function (message) {
      var expected = message && message.threshold;
      if (typeof expected !== 'number' || !Number.isFinite(expected) || expected < 0 || expected > 100) return;
      queue(function () {
        var slider = document.getElementById('qc_pca_tab-minDetectionPct');
        var actual = slider ? Number(slider.value) : NaN;
        if (!Number.isFinite(actual) || actual !== expected) return NaN;
        root.dispatchEvent(new Event('team-confirmed-scientific-edit'));
        return actual;
      });
    });
  }
  document.addEventListener('pointerdown', function (event) {
    if (event.isTrusted && sliderContainer(event.target) && event.target.closest('.irs, [role="slider"], input[type="range"]')) {
      dragging = true;
      queue.cancel();
    }
  }, true);
  document.addEventListener('pointerup', function (event) {
    if (!event.isTrusted || !dragging) return;
    dragging = false;
    submitSlider();
  }, true);
  ['pointercancel', 'lostpointercapture'].forEach(function (name) {
    document.addEventListener(name, function () { if (dragging) queue.cancel(); dragging = false; }, true);
  });
  root.addEventListener('blur', function () { if (dragging) queue.cancel(); dragging = false; });
  document.addEventListener('input', function (event) {
    if (event.isTrusted && !dragging && sliderContainer(event.target)) submitSlider();
  }, true);
  document.addEventListener('keyup', function (event) {
    if (!event.isTrusted || !sliderContainer(event.target) || !/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key)) return;
    submitSlider();
  }, true);
  document.addEventListener('toggle', function (event) {
    if (!event.target.matches('.tw-review-table') || !event.target.open) return;
    root.requestAnimationFrame(function () {
      // DT's responsive binding listens for resize after a hidden table opens.
      root.dispatchEvent(new Event('resize'));
    });
  }, true);
  function bindPlot() {
    var plot = document.getElementById('qc_pca_tab-guided_qc_plot');
    var widget = plot && (plot.classList.contains('js-plotly-plot') ? plot : plot.querySelector('.js-plotly-plot'));
    if (!widget || typeof widget.on !== 'function' || widget.__teamReviewPopover) return;
    widget.__teamReviewPopover = true;
    widget.on('plotly_click', function (data) {
      var wrap = plot.closest('.tw-review-plot-wrap');
      var event = data && data.event;
      if (!wrap || !event || !Number.isFinite(event.clientX)) return;
      var box = wrap.getBoundingClientRect();
      wrap.style.setProperty('--review-popover-left', Math.max(8, Math.min(box.width - 280, event.clientX - box.left + 10)) + 'px');
      wrap.style.setProperty('--review-popover-top', Math.max(8, Math.min(box.height - 220, event.clientY - box.top + 10)) + 'px');
    });
  }
  new MutationObserver(bindPlot).observe(document.documentElement, {childList: true, subtree: true});
  bindPlot();
})(typeof window === 'object' ? window : globalThis);
