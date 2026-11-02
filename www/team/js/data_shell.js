/* Team Data shell: project cards, a side card for the selected project and a
   "New matrix" card. Built from the library's existing selects and buttons,
   which stay bound and receive every action (select change, Resume). */
(function () {
  'use strict';
  var groups = null, loadedProject = null, requestedProject = null;
  // Remember which project an analysis was opened from (Resume or Open latest). The request
  // becomes the loaded project only when the server reports the checkpoint as restored, so a
  // rejected or failed request, or an uploaded matrix, never takes over the provenance.
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#team_library_resume,.ts-data-open')) { var p = document.getElementById('team_library_project'); if (loadedProject === null) requestedProject = p ? p.value : null; } }, true);
  if (window.jQuery) jQuery(document).on('shiny:value', function (e) { if (e.name === 'team_library_status' && loadedProject === null && requestedProject !== null && /^Checkpoint restored/.test(String(e.value || ''))) loadedProject = requestedProject; });
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function isCopy(name) { return /\b(copy|check|verification|test)\b/i.test(name); }
  function checkpointLabel(text) { return String(text).replace(/\s*·\s*[0-9a-f]{4,}\.zip.*$/i, '').replace(/\.zip\s+\S+$/i, '').trim(); }
  function choose(select, value) { if (select.value !== value) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); } }

  function liveCounts() {
    var stats = document.getElementById('guide_review_statistics'), out = {};
    if (stats) Array.from(stats.querySelectorAll('tr')).forEach(function (tr) {
      var k = (tr.querySelector('th') || {}).textContent, v = (tr.querySelector('td') || {}).textContent;
      if (/^Samples$/i.test(k || '')) out.samples = v; if (/^Lipids$/i.test(k || '')) out.lipids = v;
    });
    out.exclusions = document.querySelectorAll('#qc_pca_tab-guided_qc_decisions button[data-sample]').length;
    // Count the figures actually on the canvas (independent copies are not catalog "added" entries).
    var canvasRoot = document.getElementById('team-canvas-root');
    out.figures = canvasRoot ? canvasRoot.querySelectorAll('.tc-node[data-plot-id]').length : null;
    out.excluded = Array.from(document.querySelectorAll('#qc_pca_tab-guided_qc_decisions button[data-sample]')).map(function (b) { return b.dataset.sample; });
    return out;
  }
  function groupCounts(excluded) {
    if (!groups) return null;
    var counts = {}; groups.levels.forEach(function (l) { counts[l] = 0; });
    Object.keys(groups.samples).forEach(function (s) { if (excluded.indexOf(s) < 0) counts[groups.samples[s]] = (counts[groups.samples[s]] || 0) + 1; });
    return counts;
  }

  function paint() {
    var library = document.querySelector('.team-library'); var project = document.getElementById('team_library_project');
    if (!library || !project || document.body.dataset.teamAuthenticated !== 'true') return;
    library.classList.add('ts-data-library');
    var shell = library.querySelector('.ts-data');
    if (!shell) {
      shell = el('div', 'ts-data');
      shell.innerHTML = '<div class="ts-data-list" role="list" aria-label="Your projects"></div><aside class="ts-data-side" aria-label="Selected project"></aside>';
      library.insertBefore(shell, library.querySelector('#team_library_projects'));
      var matrix = el('div', 'ts-data-new');
      matrix.innerHTML = '<div><h5>New matrix</h5><p>Abundance (.xlsx, .csv) and optional sample metadata. Files stay in your private library.</p></div>';
      var upload = el('button', 'ts-data-upload', 'Choose files'); upload.type = 'button';
      upload.addEventListener('click', function () { var b = document.querySelector('[data-tw-choice="matrix"]'); if (b) b.click(); });
      matrix.appendChild(upload); library.appendChild(matrix);
    }
    var list = shell.querySelector('.ts-data-list'), side = shell.querySelector('.ts-data-side');
    var checkpoint = document.getElementById('team_library_checkpoint');
    var options = Array.from(project.options), selected = project.value;
    var bound = document.body.dataset.teamStage && document.querySelector('#qc_pca_tab-guided_qc_plot') && liveCounts();
    // The loaded analysis belongs to the project that was opened, not to whichever card is selected.
    var live = bound && (bound.samples || bound.lipids) && loadedProject !== null && loadedProject === selected ? bound : null;
    var html = options.map(function (o) {
      var on = o.value === selected, meta;
      if (on && live) meta = [live.samples && live.samples + ' samples', live.lipids && live.lipids + ' lipids', live.exclusions + ' exclusion' + (live.exclusions === 1 ? '' : 's'), live.figures != null && live.figures + ' figure' + (live.figures === 1 ? '' : 's')].filter(Boolean).join(' · ');
      else if (on && checkpoint) meta = checkpoint.options.length + ' checkpoint' + (checkpoint.options.length === 1 ? '' : 's') + (checkpoint.options[0] ? ' · latest ' + checkpointLabel(checkpoint.options[0].text) : '');
      else meta = 'Select to see its checkpoints';
      return '<button type="button" role="listitem" class="ts-data-project' + (on ? ' is-selected' : '') + '" data-value="' + o.value + '" aria-pressed="' + on + '">' +
        '<span class="ts-data-thumb" aria-hidden="true"></span><span class="ts-data-name"></span><span class="ts-data-meta"></span>' + (isCopy(o.text) ? '<span class="ts-data-chip">Copy</span>' : '') + '</button>';
    }).join('');
    var sig = JSON.stringify([options.map(function (o) { return o.value + o.text; }), selected, checkpoint && Array.from(checkpoint.options).map(function (o) { return o.value; }), live]);
    if (list.dataset.sig !== sig) {
      list.dataset.sig = sig; list.innerHTML = html;
      Array.from(list.children).forEach(function (card, i) {
        var o = options[i]; card.querySelector('.ts-data-name').textContent = o.text;
        var on = o.value === selected, meta = card.querySelector('.ts-data-meta');
        if (on && live) meta.textContent = [live.samples && live.samples + ' samples', live.lipids && live.lipids + ' lipids', live.exclusions + ' exclusion' + (live.exclusions === 1 ? '' : 's'), live.figures != null && live.figures + ' figure' + (live.figures === 1 ? '' : 's')].filter(Boolean).join(' · ');
        else if (on && checkpoint) meta.textContent = checkpoint.options.length + ' checkpoint' + (checkpoint.options.length === 1 ? '' : 's');
        else meta.textContent = 'Select to see its checkpoints';
        // Project and checkpoint selects are re-rendered by the server: use the live ones.
        card.addEventListener('click', function () { var live = document.getElementById('team_library_project'); if (live) choose(live, o.value); });
      });
      // Side card for the selected project.
      side.replaceChildren();
      var name = (project.options[project.selectedIndex] || {}).text || '';
      side.appendChild(el('span', 'ts-label', name));
      if (live && groups) {
        var counts = groupCounts(live.excluded), kp = el('div', 'ts-data-groups');
        groups.levels.forEach(function (l) { var k = el('div', 'ts-kpi'); k.appendChild(el('b', '', String(counts[l] || 0))); k.appendChild(el('span', '', l)); kp.appendChild(k); });
        side.appendChild(kp);
        side.appendChild(el('p', 'ts-data-callout', live.excluded.length ? 'Excludes ' + live.excluded.join(', ') : 'No sample exclusions'));
      }
      side.appendChild(el('span', 'ts-label', 'Checkpoints'));
      var cps = el('div', 'ts-data-checkpoints');
      Array.from(checkpoint ? checkpoint.options : []).slice(0, 4).forEach(function (o, i) { var row = el('div', 'ts-data-ckpt' + (i === 0 ? ' is-latest' : ''), checkpointLabel(o.text)); cps.appendChild(row); });
      if (!cps.children.length) cps.appendChild(el('p', 'ts-muted', 'No saved checkpoints yet.'));
      side.appendChild(cps);
      var open = el('button', 'ts-data-open', 'Open latest'); open.type = 'button';
      open.disabled = !(checkpoint && checkpoint.options.length);
      open.addEventListener('click', function () { var checkpoint = document.getElementById('team_library_checkpoint'); if (!checkpoint || !checkpoint.options.length) return; choose(checkpoint, checkpoint.options[0].value); setTimeout(function () { var r = document.getElementById('team_library_resume'); if (r && !r.disabled) r.click(); }, 0); });
      side.appendChild(open);
    }
    // The original controls remain available under "All checkpoints".
    var details = library.querySelector('.ts-data-all');
    if (!details) { details = el('details', 'ts-data-all'); details.appendChild(el('summary', '', 'All checkpoints and save options')); side.after(details); }
    var projects = document.getElementById('team_library_projects');
    if (projects && projects.parentNode !== details) details.appendChild(projects);
  }
  var queued = false;
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; paint(); }); } }
  function start() {
    if (!window.LIPIDOMIC_TEAM_WORKSPACE || !window.Shiny) return;
    // Shiny triggers its events through jQuery; native listeners never see them.
    if (window.jQuery) jQuery(document).on('shiny:value', schedule);
    document.addEventListener('change', function (e) { if (e.target && /^team_library_/.test(e.target.id || '')) schedule(); });
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-team-authenticated', 'data-team-stage', 'data-tw-screen'] });
    schedule();
  }
  window.TeamDataShell = { setGroups: function (g) { groups = g; schedule(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
