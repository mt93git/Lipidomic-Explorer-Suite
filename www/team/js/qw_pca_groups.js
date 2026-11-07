/* Guided Quality step (Team without the workspace shell): colour the sample PCA
   by experimental group and add a group legend. Uses the same "team-review-groups"
   payload and colours as the workspace Review (review_shell.js, which is not
   loaded in this mode). Marker colours only; the PCA scores are unchanged. */
(function () {
  'use strict';
  var groups = null, scheduled = false, FALLBACK = '#9aa5b1', own = Object.prototype.hasOwnProperty;
  function groupOf(id) { return groups.samples && own.call(groups.samples, id) ? groups.samples[id] : null; }
  function plot() { return document.getElementById('qc_pca_tab-guided_qc_plot'); }
  function color(level) { var c = groups.colors && own.call(groups.colors, level) ? groups.colors[level] : null; return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : FALLBACK; }
  function legend(g, ids) {
    var box = g.parentNode && g.parentNode.querySelector(':scope > .qw-pca-legend');
    if (!ids.length) { if (box) box.hidden = true; return; }
    if (!box) { box = document.createElement('ul'); box.className = 'qw-pca-legend'; box.setAttribute('aria-label', 'Sample groups'); g.parentNode.insertBefore(box, g); }
    var counts = Object.create(null); ids.forEach(function (id) { var k = groupOf(id); if (k != null) counts[k] = (counts[k] || 0) + 1; });
    var levels = (groups.levels || []).map(String);
    var signature = JSON.stringify(levels.map(function (lev) { return [lev, color(lev), counts[lev] || 0]; }));
    box.hidden = false;
    if (box.dataset.signature === signature) return;
    box.dataset.signature = signature; box.textContent = '';
    levels.forEach(function (lev) {
      var li = document.createElement('li'), swatch = document.createElement('span'), n = document.createElement('b');
      swatch.className = 'qw-pca-swatch'; swatch.setAttribute('aria-hidden', 'true'); swatch.style.background = color(lev);
      n.textContent = String(counts[lev] || 0);
      li.appendChild(swatch); li.appendChild(document.createTextNode(lev + ' ')); li.appendChild(n);
      box.appendChild(li);
    });
  }
  function paint() {
    scheduled = false;
    var g = plot(); if (!g || !groups) return;
    if (g.on && !g.dataset.qwGroupsHooked) { g.dataset.qwGroupsHooked = 'true'; g.on('plotly_afterplot', schedule); }
    var t = g.data && g.data[0], ids = (t && t.customdata || []).map(String);
    legend(g, ids);
    if (!ids.length || !window.Plotly) return;
    var colors = ids.map(function (id) { var k = groupOf(id); return k != null ? color(k) : FALLBACK; });
    var current = t.marker && t.marker.color;
    if (Array.isArray(current) && current.length === colors.length && current.every(function (c, i) { return c === colors[i]; })) return;
    window.Plotly.restyle(g, {'marker.color': [colors], 'marker.line.color': '#ffffff', 'marker.line.width': 1}, [0]);
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } }
  function start() {
    if (window.LIPIDOMIC_TEAM_WORKSPACE || !window.Shiny) return;
    Shiny.addCustomMessageHandler('team-review-groups', function (msg) { groups = msg && msg.samples ? msg : null; schedule(); });
    // Exclusion reasons are only shown by the workspace Review; accept and ignore them here.
    Shiny.addCustomMessageHandler('team-review-reasons', function (msg) {});
    if (window.jQuery) jQuery(document).on('shiny:value', function (e) { if (e.name === 'qc_pca_tab-guided_qc_plot') [0, 300, 1000].forEach(function (ms) { setTimeout(schedule, ms); }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
