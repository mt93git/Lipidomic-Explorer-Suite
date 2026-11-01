/* Team Review shell: condition colors and legend on the PCA, two KPI tiles, a
   short prepared-data table, one Export menu and a Samples column. Existing
   Shiny outputs and inputs are moved, never recreated; the PCA coordinates are
   not changed (only marker colors). */
(function () {
  'use strict';
  var groups = null, reasons = {}, typedReasons = {};
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function num(s) { return Number(String(s).replace(/,/g, '')); }
  function fmt(n) { return Number.isFinite(n) ? n.toLocaleString('en-US') : '–'; }

  // ---- PCA colored by condition -------------------------------------------------
  function plot() { return document.getElementById('qc_pca_tab-guided_qc_plot'); }
  function colorPlot() {
    var g = plot(); if (!g || !groups || !g.data || !g.data[0] || !window.Plotly) return;
    var t = g.data[0], ids = t.customdata || [];
    var colors = ids.map(function (id) { var grp = groups.samples[id]; return grp && groups.colors[grp] || '#9aa5b1'; });
    var current = t.marker && t.marker.color;
    if (Array.isArray(current) && current.length === colors.length && current.every(function (c, i) { return c === colors[i]; })) return;
    window.Plotly.restyle(g, { 'marker.color': [colors], 'marker.line.color': '#ffffff', 'marker.line.width': 1 }, [0]);
  }
  function legend() {
    var wrap = document.querySelector('#guide-qc-review .tw-review-plot-wrap'); if (!wrap || !groups) return;
    var box = wrap.querySelector('.ts-review-legend');
    if (!box) { box = el('div', 'ts-review-legend'); box.setAttribute('aria-label', 'Sample groups'); wrap.insertBefore(box, plot()); }
    var g = plot(), ids = g && g.data && g.data[0] && g.data[0].customdata || [];
    var counts = {}; ids.forEach(function (id) { var k = groups.samples[id]; if (k) counts[k] = (counts[k] || 0) + 1; });
    var html = groups.levels.map(function (lev) {
      return '<span><i style="background:' + groups.colors[lev] + '"></i>' + String(lev).replace(/[&<>]/g, '') + ' <b>' + (counts[lev] || 0) + '</b></span>';
    }).join('');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ---- Detection KPIs and the short summary --------------------------------------
  function excludedSamples() {
    var d = document.getElementById('qc_pca_tab-guided_qc_decisions');
    return d ? Array.from(d.querySelectorAll('button[data-sample]')).map(function (b) { return b.dataset.sample; }) : [];
  }
  function kpis() {
    var rail = document.querySelector('.tw-simple-review .tw-review-detection'); if (!rail) return;
    var source = Array.from(rail.querySelectorAll('p,div,span')).find(function (n) { return !n.closest('.ts-kpis') && /lipids retained/i.test(n.textContent) && !n.querySelector('p,div'); });
    var box = rail.querySelector('.ts-kpis');
    if (!box) { box = el('div', 'ts-kpis'); box.innerHTML = '<div class="ts-kpi"><b data-k="lipids">–</b><span data-k="lipids-note"></span></div><div class="ts-kpi"><b data-k="samples">–</b><span data-k="samples-note"></span></div>'; rail.appendChild(box); }
    var m = source && source.textContent.match(/([\d,]+)\s+lipids retained\D+([\d,]+)\s+excluded\D+([\d,]+)\s+samples/i);
    if (source) source.classList.add('ts-kpi-source');
    var excluded = excludedSamples().length;
    var set = function (k, v) { var n = box.querySelector('[data-k="' + k + '"]'); if (n && n.textContent !== v) n.textContent = v; };
    set('lipids', m ? fmt(num(m[1])) : '–'); set('lipids-note', m ? 'lipids kept · ' + fmt(num(m[2])) + ' out' : 'lipids kept');
    set('samples', m ? fmt(num(m[3])) : '–'); set('samples-note', 'samples · ' + excluded + ' excluded');
  }
  function summary() {
    var stats = document.getElementById('guide_review_statistics'); if (!stats || !stats.firstElementChild) return;
    var first = stats.querySelector('table'); if (!first) return;
    Array.from(first.querySelectorAll('tr')).forEach(function (tr) {
      var keep = /missing|median|iqr/i.test(tr.textContent);
      tr.classList.toggle('ts-detail-row', !keep);
    });
    Array.from(stats.children).forEach(function (child) { if (child !== first) child.classList.add('ts-detail-row'); });
    var host = stats.parentNode, toggle = host.querySelector('.ts-prep-details');
    if (!toggle) {
      toggle = el('button', 'ts-prep-details', 'Preparation details'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', function () { var open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); stats.classList.toggle('ts-details-open', open); toggle.textContent = open ? 'Hide preparation details' : 'Preparation details'; });
      host.appendChild(toggle);
    }
  }

  // ---- One Export menu ------------------------------------------------------------
  function exportMenu() {
    document.querySelectorAll('.tw-simple-review .plot-export-bar:not([data-ts-menu])').forEach(function (bar) {
      bar.dataset.tsMenu = 'true';
      var buttons = Array.from(bar.querySelectorAll('.plot-export-button')); if (!buttons.length) return;
      var trigger = el('button', 'ts-export-trigger', 'Export ▾'); trigger.type = 'button'; trigger.setAttribute('aria-haspopup', 'true'); trigger.setAttribute('aria-expanded', 'false');
      var menu = el('div', 'ts-export-menu'); menu.setAttribute('role', 'menu'); menu.hidden = true;
      buttons.forEach(function (b) { b.setAttribute('role', 'menuitem'); menu.appendChild(b); b.addEventListener('click', function () { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }); });
      trigger.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; trigger.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) buttons[0].focus(); });
      menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); } });
      document.addEventListener('click', function (e) { if (!bar.contains(e.target)) { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); } });
      var label = bar.querySelector(':scope > span:not(.plot-export-status)'); if (label) label.classList.add('ts-visually-hidden');
      bar.insertBefore(trigger, bar.firstChild); bar.insertBefore(menu, trigger.nextSibling);
    });
  }

  // ---- Samples column ---------------------------------------------------------------
  function samplesColumn() {
    var board = document.querySelector('.tw-simple-review .tw-review-board'); if (!board) return null;
    var col = board.querySelector('.ts-review-samples');
    if (!col) {
      col = el('aside', 'guide-panel ts-review-samples'); col.setAttribute('aria-label', 'Samples');
      col.innerHTML = '<span class="ts-label">Samples</span><div class="ts-selected-slot"><p class="ts-muted">Click a point in the PCA, or choose a sample by name, to inspect it.</p></div><span class="ts-label ts-excluded-label">Excluded (0)</span><div class="ts-excluded-list"></div><div class="ts-review-home" aria-hidden="true"></div>';
      board.appendChild(col);
    }
    var pca = document.getElementById('guide-qc-review');
    var selection = document.getElementById('qc_pca_tab-guided_qc_selection'), decisions = document.getElementById('qc_pca_tab-guided_qc_decisions');
    var byName = pca && Array.from(pca.querySelectorAll(':scope > details')).find(function (d) { return /select a sample by name/i.test(d.textContent); });
    var slot = col.querySelector('.ts-selected-slot');
    if (selection && selection.parentNode !== slot) slot.appendChild(selection);
    if (byName && byName.parentNode !== slot) slot.appendChild(byName);
    var list = col.querySelector('.ts-excluded-list');
    if (decisions && decisions.parentNode !== list) list.appendChild(decisions);
    return col;
  }
  function decorateSamples() {
    var col = samplesColumn(); if (!col) return;
    var selection = document.getElementById('qc_pca_tab-guided_qc_selection');
    var hint = col.querySelector('.ts-selected-slot > .ts-muted');
    if (hint) hint.hidden = !!(selection && selection.querySelector('.tw-review-popover'));
    var popover = selection && selection.querySelector('.tw-review-popover');
    if (popover && !popover.dataset.tsDecorated) {
      popover.dataset.tsDecorated = 'true';
      var id = (popover.querySelector('strong') || {}).textContent || '', grp = groups && groups.samples[id];
      if (grp) { var meta = el('span', 'ts-sample-group', grp); popover.querySelector('strong').after(meta); }
      var keep = document.getElementById('qc_pca_tab-guided_qc_dismiss'); if (keep) { var l = keep.querySelector('.action-label') || keep; l.textContent = 'Keep'; }
      var ex = document.getElementById('qc_pca_tab-guided_qc_propose'); if (ex) { var x = ex.querySelector('.action-label') || ex; x.textContent = 'Exclude…'; }
      var reason = document.getElementById('qc_pca_tab-guided_qc_reason');
      if (ex && reason) ex.addEventListener('click', function () { if (reason.value.trim()) typedReasons[id] = reason.value.trim(); });
    }
    var rows = document.querySelectorAll('#qc_pca_tab-guided_qc_decisions button[data-sample]');
    var label = col.querySelector('.ts-excluded-label'), text = 'Excluded (' + rows.length + ')';
    if (label.textContent !== text) label.textContent = text;
    rows.forEach(function (b) {
      var row = b.parentNode; if (!row || row.dataset.tsDecorated === b.dataset.sample) return;
      row.dataset.tsDecorated = b.dataset.sample; row.classList.add('ts-excluded-row');
      var id = b.dataset.sample, why = typedReasons[id] || reasons[id], grp = groups && groups.samples[id];
      var detail = [grp, why ? '“' + why + '”' : ''].filter(Boolean).join(' · ');
      if (detail) row.appendChild(el('span', 'ts-excluded-detail', detail));
    });
  }

  var scheduled = false;
  function paint() {
    scheduled = false;
    if (!document.querySelector('.tw-simple-review')) return;
    exportMenu(); kpis(); summary(); decorateSamples(); legend(); colorPlot();
  }
  function schedule() { if (!scheduled && document.body.dataset.teamStage === 'review') { scheduled = true; requestAnimationFrame(paint); } }
  function start() {
    if (!window.LIPIDOMIC_TEAM_WORKSPACE || !window.Shiny) return;
    Shiny.addCustomMessageHandler('team-review-groups', function (msg) { groups = msg; if (window.TeamDataShell) window.TeamDataShell.setGroups(msg); schedule(); });
    Shiny.addCustomMessageHandler('team-review-reasons', function (msg) { reasons = msg && msg.reasons || {}; document.querySelectorAll('.ts-excluded-row').forEach(function (r) { delete r.dataset.tsDecorated; r.querySelectorAll('.ts-excluded-detail').forEach(function (n) { n.remove(); }); }); schedule(); });
    // Shiny re-renders outputs in place; repaint after every render or plot draw.
    // Shiny triggers its events through jQuery; native listeners never see them.
    if (window.jQuery) jQuery(document).on('shiny:value', schedule);
    document.addEventListener('plotly_afterplot', schedule, true);
    new MutationObserver(function (records) {
      if (records.some(function (r) { return !(r.target.closest && r.target.closest('.ts-kpis,.ts-review-legend,.ts-export-menu')); })) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    // Hook the PCA once it exists; poll only while Review is the current stage.
    var hook = null;
    function arm() { if (hook) return; hook = setInterval(function () { var g = plot(); if (g && g.on && !g.dataset.tsHooked) { g.dataset.tsHooked = 'true'; g.on('plotly_afterplot', schedule); } if ((g && g.dataset.tsHooked) || document.body.dataset.teamStage !== 'review') { clearInterval(hook); hook = null; } }, 500); }
    arm();
    new MutationObserver(function () { schedule(); if (document.body.dataset.teamStage === 'review') arm(); }).observe(document.body, { attributes: true, attributeFilter: ['data-team-stage'] });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
