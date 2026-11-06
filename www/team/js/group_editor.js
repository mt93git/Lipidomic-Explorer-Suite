/* Team Review: "Edit groups". A drawer (fixed overlay, so Review's columns never move) with a
   samples x Group 1/Group 2 table: inline edit, bulk-assign to selected rows, and validation
   (empty values, groups with fewer than 2 samples, typo-similar names). "Apply groups" sends the
   edited labels to the server (group_editor.R), which writes them into the confirmed metadata
   table and confirms it through the same path as "Add sample labels"; Review then updates with
   the same request as Next from that screen. Exclusions, Canvas and checkpoints are not touched. */
(function () {
  'use strict';
  var NOTE = 'Applying works like re-uploading your sample metadata with these groups: groups and colours in Review are rebuilt. Exclusions, Canvas figures and checkpoints are kept.';
  var table = null;      // last server payload: {samples:[], columns:[{field,label,source,values:[]}]}
  // Sample IDs and labels are data, never object keys: Map/Set and null-prototype objects only.
  var edits = Object.create(null);  // field -> array of current (edited) values
  var selected = new Set();         // selected sample IDs
  var filter = '';
  var pendingToken = null, sentVersion = null;
  var ui = null;

  function nfc(s) { s = String(s); return s.normalize ? s.normalize('NFC') : s; }
  function maxLabel() { return table && table.max_label > 0 ? table.max_label : 200; }
  function freshEdits() { return Object.create(null); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function send(id, value) { if (window.Shiny && Shiny.setInputValue) Shiny.setInputValue(id, value, {priority: 'event'}); }
  function cols() { return table ? table.columns : []; }
  function original(field) { var c = cols().find(function (x) { return x.field === field; }); return c ? c.values.map(String) : []; }
  function current(field) { return edits[field] || original(field); }
  function changedFields() {
    return cols().map(function (c) { return c.field; }).filter(function (f) {
      var a = current(f), b = original(f); return a.some(function (v, i) { return v !== b[i]; });
    });
  }
  function changeCount() {
    var n = 0; cols().forEach(function (c) { var a = current(c.field), b = original(c.field); a.forEach(function (v, i) { if (v !== b[i]) n++; }); });
    return n;
  }

  // ---- Validation ---------------------------------------------------------------------------
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = [], i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function norm(s) { return nfc(s).toLowerCase().replace(/[\s_\-.]+/g, ''); }
  // Two labels look like a typo of each other: same after case/space/punctuation folding, or one or
  // two letters apart. Labels that differ only in their digits (Batch 1 / Batch 2) are intended.
  function similar(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === nb) return true;
    if (na.replace(/\d+/g, '#') === nb.replace(/\d+/g, '#')) return false;
    var shortest = Math.min(na.length, nb.length);
    if (shortest < 4) return false;
    return lev(na, nb) <= (shortest >= 8 ? 2 : 1);
  }
  function validate() {
    var errors = [], warnings = [], flagged = Object.create(null), changed = changedFields();
    cols().forEach(function (c) {
      var values = current(c.field), counts = new Map(), empty = 0, flags = new Set();
      values.forEach(function (v) { if (!v.trim()) empty++; else counts.set(v, (counts.get(v) || 0) + 1); });
      flagged[c.field] = flags;
      // Same limit as the server: Unicode characters (code points), not UTF-16 units.
      var long = values.filter(function (v) { return Array.from(v).length > maxLabel(); }).length;
      if (long && changed.indexOf(c.field) >= 0) errors.push(c.label + ': ' + long + (long === 1 ? ' label is' : ' labels are') + ' longer than ' + maxLabel() + ' characters.');
      if (empty) {
        var msg = c.label + ': ' + empty + (empty === 1 ? ' sample has' : ' samples have') + ' no value.';
        if (changed.indexOf(c.field) >= 0) errors.push(msg + ' Fill every sample before applying.');
        else warnings.push(msg);
      }
      var levels = Array.from(counts.keys());
      levels.forEach(function (lv) { if (counts.get(lv) < 2) { flags.add(lv); warnings.push(c.label + ': "' + lv + '" has only ' + counts.get(lv) + ' sample; group statistics need at least 2.'); } });
      for (var i = 0; i < levels.length; i++) for (var j = i + 1; j < levels.length; j++) {
        if (similar(levels[i], levels[j])) {
          var rare = counts.get(levels[i]) <= counts.get(levels[j]) ? levels[i] : levels[j], common = rare === levels[i] ? levels[j] : levels[i];
          flags.add(rare);
          warnings.push(c.label + ': "' + rare + '" looks like "' + common + '". Check for a typo.');
        }
      }
    });
    return {errors: errors, warnings: warnings, flagged: flagged};
  }

  // ---- Drawer -------------------------------------------------------------------------------
  function build() {
    var actions = document.querySelector('#team-workspace .tw-journey-actions');
    if (!actions || actions.querySelector('.tw-groups-trigger')) return;
    var trigger = el('button', 'tw-groups-trigger', 'Edit groups');
    trigger.type = 'button'; trigger.disabled = true;
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'tw-groups-drawer');
    var anchor = actions.querySelector('.tw-replace-meta') || actions.firstChild;
    actions.insertBefore(trigger, anchor);

    var drawer = el('aside', 'tw-groups-drawer'); drawer.id = 'tw-groups-drawer'; drawer.hidden = true;
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'false'); drawer.setAttribute('aria-labelledby', 'tw-groups-title');
    drawer.innerHTML =
      '<header class="tw-groups-head"><h3 id="tw-groups-title" tabindex="-1">Edit groups</h3>' +
      '<button type="button" class="tw-groups-close" aria-label="Close Edit groups">×</button></header>' +
      '<p class="tw-groups-note"></p>' +
      '<div class="tw-groups-tools">' +
      '<label class="tw-groups-filter"><span>Filter</span><input type="search" placeholder="Sample or group" aria-label="Filter samples"></label>' +
      '<div class="tw-groups-bulk" role="group" aria-label="Assign a value to selected samples">' +
      '<select aria-label="Column to assign"></select>' +
      '<input type="text" class="tw-groups-bulk-value" aria-label="Value to assign" placeholder="Value" list="tw-groups-list-bulk">' +
      '<datalist id="tw-groups-list-bulk"></datalist><div class="tw-groups-lists" hidden></div>' +
      '<button type="button" class="tw-groups-assign" disabled>Assign to selected</button></div></div>' +
      '<div class="tw-groups-scroll"><table class="tw-groups-table"><caption class="tw-sr-only">Sample groups. Edit a cell to change its group.</caption>' +
      '<thead></thead><tbody></tbody></table></div>' +
      '<div class="tw-groups-issues" role="status" aria-live="polite"></div>' +
      '<footer class="tw-groups-foot"><span class="tw-groups-count" aria-live="polite"></span>' +
      '<button type="button" class="tw-groups-reset" disabled>Reset</button>' +
      '<button type="button" class="tw-groups-apply" disabled>Apply groups</button></footer>';
    drawer.querySelector('.tw-groups-note').textContent = NOTE;
    document.body.appendChild(drawer);
    ui = {trigger: trigger, drawer: drawer, thead: drawer.querySelector('thead'), tbody: drawer.querySelector('tbody'),
      filter: drawer.querySelector('.tw-groups-filter input'), bulkField: drawer.querySelector('.tw-groups-bulk select'),
      bulkValue: drawer.querySelector('.tw-groups-bulk-value'), bulkList: drawer.querySelector('#tw-groups-list-bulk'),
      assign: drawer.querySelector('.tw-groups-assign'), issues: drawer.querySelector('.tw-groups-issues'),
      count: drawer.querySelector('.tw-groups-count'), reset: drawer.querySelector('.tw-groups-reset'),
      apply: drawer.querySelector('.tw-groups-apply'), close: drawer.querySelector('.tw-groups-close')};

    trigger.addEventListener('click', function () { open(drawer.hidden); });
    ui.close.addEventListener('click', function () { open(false, true); });
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); open(false, true); }
    });
    ui.filter.addEventListener('input', function () { filter = ui.filter.value.trim().toLowerCase(); applyFilter(); });
    ui.bulkField.addEventListener('change', fillBulkList);
    ui.bulkValue.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!ui.assign.disabled) bulkAssign(); } });
    ui.assign.addEventListener('click', bulkAssign);
    ui.reset.addEventListener('click', function () { edits = freshEdits(); status(''); render(); });
    ui.apply.addEventListener('click', apply);
    ui.tbody.addEventListener('input', function (e) {
      var t = e.target; if (!t.classList.contains('tw-groups-cell')) return;
      var f = t.dataset.field, i = Number(t.dataset.row);
      if (!edits[f]) edits[f] = original(f).slice();
      edits[f][i] = t.value;
      refresh();
    });
    // Leading/trailing spaces in a typed label are dropped when the cell is left.
    ui.tbody.addEventListener('change', function (e) {
      var t = e.target; if (!t.classList.contains('tw-groups-cell') || t.value === nfc(t.value.trim())) return;
      var f = t.dataset.field, i = Number(t.dataset.row);
      t.value = nfc(t.value.trim()); if (!edits[f]) edits[f] = original(f).slice(); edits[f][i] = t.value; refresh();
    });
    ui.tbody.addEventListener('keydown', function (e) {
      var t = e.target; if (!t.classList.contains('tw-groups-cell') || e.key !== 'Enter') return;
      e.preventDefault();
      var rows = Array.from(ui.tbody.querySelectorAll('tr:not([hidden]) .tw-groups-cell[data-field="' + t.dataset.field + '"]'));
      var k = rows.indexOf(t), next = rows[k + (e.shiftKey ? -1 : 1)];
      if (next) { next.focus(); next.select(); }
    });
    ui.tbody.addEventListener('change', function (e) {
      var t = e.target; if (!t.classList.contains('tw-groups-pick')) return;
      if (t.checked) selected.add(t.dataset.sample); else selected.delete(t.dataset.sample);
      refresh();
    });
    ui.thead.addEventListener('change', function (e) {
      if (!e.target.classList.contains('tw-groups-pick-all')) return;
      var on = e.target.checked;
      Array.from(ui.tbody.querySelectorAll('tr:not([hidden]) .tw-groups-pick')).forEach(function (b) {
        b.checked = on; if (on) selected.add(b.dataset.sample); else selected.delete(b.dataset.sample);
      });
      refresh();
    });
    document.addEventListener('click', function (e) {
      if (!drawer.hidden && !drawer.contains(e.target) && e.target !== trigger && !trigger.contains(e.target) && !e.target.closest('.modal')) open(false, false);
    });
    window.addEventListener('team-workspace-state', function (e) {
      var d = e.detail || {}, onReview = !!d.authenticated && d.substep === 'review-single';
      trigger.disabled = !onReview || !table;
      if (!drawer.hidden && !onReview) open(false, false);
    });
    if (window.TeamWorkspace && typeof TeamWorkspace.state === 'function') {
      var s = TeamWorkspace.state(); trigger.disabled = !(s.authenticated && s.substep === 'review-single' && table);
    }
    render();
  }

  function open(show, refocus) {
    if (!ui) return;
    if (!show && (refocus || ui.drawer.contains(document.activeElement))) {
      var target = !ui.trigger.disabled && ui.trigger.getClientRects().length ? ui.trigger : document.getElementById('tw-screen-title');
      if (target) target.focus({preventScroll: true});
    }
    ui.drawer.hidden = !show; ui.trigger.setAttribute('aria-expanded', String(show));
    document.body.classList.toggle('tw-groups-open', show);
    if (show) { render(); document.getElementById('tw-groups-title').focus({preventScroll: true}); }
  }

  function status(text, kind) {
    var box = ui && ui.drawer.querySelector('.tw-groups-result');
    if (!ui) return;
    if (!box) { box = el('p', 'tw-groups-result'); box.setAttribute('role', 'status'); ui.drawer.querySelector('.tw-groups-foot').before(box); }
    box.textContent = text || ''; box.hidden = !text; box.dataset.kind = kind || 'info';
  }

  function render() {
    if (!ui) return;
    var lists = ui.drawer.querySelector('.tw-groups-lists');
    ui.thead.innerHTML = ''; ui.tbody.innerHTML = ''; ui.bulkField.innerHTML = ''; lists.innerHTML = '';
    if (!table) { refresh(); return; }
    var hr = el('tr'), th0 = el('th'), all = el('input', 'tw-groups-pick-all');
    all.type = 'checkbox'; all.setAttribute('aria-label', 'Select all shown samples'); th0.appendChild(all); hr.appendChild(th0);
    var ths = el('th', null, 'Sample'); ths.scope = 'col'; hr.appendChild(ths);
    cols().forEach(function (c) {
      var th = el('th'); th.scope = 'col'; th.appendChild(el('span', null, c.label));
      th.appendChild(el('small', null, c.source ? 'column “' + c.source + '”' : 'from sample names'));
      hr.appendChild(th);
      var o = el('option', null, c.label); o.value = c.field; ui.bulkField.appendChild(o);
      var dl = el('datalist'); dl.id = 'tw-groups-list-' + c.field; lists.appendChild(dl);
    });
    ui.thead.appendChild(hr);
    var frag = document.createDocumentFragment();
    table.samples.forEach(function (s, i) {
      var tr = el('tr'); tr.dataset.sample = s; tr.dataset.row = i;
      var td0 = el('td'), pick = el('input', 'tw-groups-pick'); pick.type = 'checkbox'; pick.dataset.sample = s; pick.checked = selected.has(s);
      pick.setAttribute('aria-label', 'Select ' + s); td0.appendChild(pick); tr.appendChild(td0);
      var name = el('th', 'tw-groups-sample', s); name.scope = 'row'; tr.appendChild(name);
      cols().forEach(function (c) {
        var td = el('td'), input = el('input', 'tw-groups-cell'); input.type = 'text';
        input.dataset.field = c.field; input.dataset.row = i; input.value = current(c.field)[i];
        input.setAttribute('list', 'tw-groups-list-' + c.field); input.setAttribute('aria-label', c.label + ' for ' + s);
        input.spellcheck = false; input.autocomplete = 'off';
        td.appendChild(input); tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    ui.tbody.appendChild(frag);
    fillBulkList(); applyFilter(); refresh();
  }

  function fillLists() {
    cols().forEach(function (c) {
      var dl = document.getElementById('tw-groups-list-' + c.field); if (!dl) return;
      var levels = Array.from(new Set(current(c.field).filter(function (v) { return v.trim(); })));
      var html = levels.map(function (v) { var o = document.createElement('option'); o.value = v; return o.outerHTML; }).join('');
      if (dl.innerHTML !== html) dl.innerHTML = html;
    });
  }
  function fillBulkList() {
    if (!ui) return;
    var src = document.getElementById('tw-groups-list-' + ui.bulkField.value);
    ui.bulkList.innerHTML = src ? src.innerHTML : '';
  }
  function applyFilter() {
    if (!ui || !table) return;
    Array.from(ui.tbody.rows).forEach(function (tr) {
      var i = Number(tr.dataset.row);
      var text = [tr.dataset.sample].concat(cols().map(function (c) { return current(c.field)[i]; })).join(' ').toLowerCase();
      tr.hidden = !!filter && text.indexOf(filter) < 0;
    });
    refresh();
  }

  function refresh() {
    if (!ui) return;
    var v = validate(), n = changeCount(), picked = selected.size;
    if (table) {
      Array.from(ui.tbody.rows).forEach(function (tr) {
        var i = Number(tr.dataset.row);
        tr.querySelectorAll('.tw-groups-cell').forEach(function (input) {
          var f = input.dataset.field, val = current(f)[i];
          if (input.value !== val && document.activeElement !== input) input.value = val;
          input.classList.toggle('is-changed', val !== original(f)[i]);
          input.classList.toggle('is-flagged', !!(val.trim() && v.flagged[f] && v.flagged[f].has(val)));
          if (!val.trim()) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        });
      });
      var shown = Array.from(ui.tbody.querySelectorAll('tr:not([hidden]) .tw-groups-pick'));
      var all = ui.thead.querySelector('.tw-groups-pick-all');
      if (all) { var on = shown.filter(function (b) { return b.checked; }).length; all.checked = !!shown.length && on === shown.length; all.indeterminate = on > 0 && on < shown.length; }
    }
    fillLists(); fillBulkList();
    // While Apply is pending the whole editor is read-only, so no edit can be made that was not sent.
    var busy = pendingToken !== null;
    ui.drawer.setAttribute('aria-busy', String(busy));
    ui.drawer.querySelectorAll('input, select').forEach(function (n) { n.disabled = busy; });
    ui.assign.textContent = picked ? 'Assign to ' + picked + ' selected' : 'Assign to selected';
    ui.assign.disabled = !picked || !ui.bulkValue.value.trim() || pendingToken !== null;
    ui.count.textContent = n ? n + (n === 1 ? ' change' : ' changes') + ' not applied' : 'No changes';
    ui.reset.disabled = !n || pendingToken !== null;
    ui.apply.disabled = !n || v.errors.length > 0 || pendingToken !== null;
    ui.apply.textContent = pendingToken !== null ? 'Applying…' : 'Apply groups';
    var list = ui.issues.querySelector('ul');
    if (!list) { list = el('ul'); ui.issues.appendChild(list); }
    var items = v.errors.map(function (m) { return ['is-error', m]; }).concat(v.warnings.map(function (m) { return ['is-warning', m]; }));
    var key = JSON.stringify(items);
    if (list.dataset.key !== key) {
      list.dataset.key = key; list.innerHTML = '';
      items.forEach(function (it) { var li = el('li', it[0]); li.appendChild(el('strong', null, it[0] === 'is-error' ? 'Fix: ' : 'Check: ')); li.appendChild(document.createTextNode(it[1])); list.appendChild(li); });
    }
    ui.issues.hidden = !items.length;
  }
  if (typeof document !== 'undefined') document.addEventListener('input', function (e) { if (ui && e.target === ui.bulkValue) refresh(); });

  function bulkAssign() {
    var f = ui.bulkField.value, value = nfc(ui.bulkValue.value.trim()); if (!f || !value) return;
    if (!edits[f]) edits[f] = original(f).slice();
    table.samples.forEach(function (s, i) { if (selected.has(s)) edits[f][i] = value; });
    var n = selected.size;
    status('Assigned "' + value + '" to ' + n + (n === 1 ? ' sample.' : ' samples.'), 'info');
    refresh();
  }

  function apply() {
    var v = validate(), fields = changedFields();
    if (!fields.length || v.errors.length || pendingToken !== null) return;
    var values = {}; fields.forEach(function (f) { values[f] = current(f).slice(); });
    pendingToken = Date.now(); sentVersion = table.version;
    status('Applying groups…', 'info'); refresh();
    send('team_groups_apply', {token: pendingToken, version: table.version, samples: table.samples.slice(), values: values});
  }

  function onApplied(msg) {
    if (!msg || pendingToken === null || msg.token !== pendingToken) return;
    pendingToken = null;
    // The server already requested the Review update (group_editor.R), in the same operation.
    if (msg.ok) {
      edits = freshEdits(); selected = new Set();
      render(); status(msg.message || 'Groups applied.', msg.prepared === false ? 'error' : 'ok');
      if (ui && !ui.drawer.hidden) document.getElementById('tw-groups-title').focus({preventScroll: true});
    } else if (table && table.version !== sentVersion) {
      // The labels changed underneath: edits made on the old table must not be re-applied.
      edits = freshEdits(); render(); status(msg.message || 'Groups could not be applied.', 'error');
    } else {
      refresh(); status(msg.message || 'Groups could not be applied.', 'error');
    }
  }

  function onTable(payload) {
    if (!payload || !Array.isArray(payload.samples) || !Array.isArray(payload.columns)) return;
    var sameSamples = table && JSON.stringify(table.samples) === JSON.stringify(payload.samples);
    var sameVersion = table && table.version === payload.version;
    var hadEdits = changeCount() > 0;
    payload.columns.forEach(function (c) { c.values = (c.values || []).map(function (x) { return x == null ? '' : String(x); }); });
    table = payload;
    if (!sameSamples) selected = new Set();
    // Edits belong to the table version they were made on. A new version (metadata replaced,
    // another project or checkpoint opened) clears them; while our own Apply is pending the
    // editor is read-only and onApplied settles them.
    if (!sameVersion && hadEdits && pendingToken === null) {
      edits = freshEdits();
      if (ui) status('The sample labels changed (metadata replaced, or another project or checkpoint opened), so unapplied edits were cleared.', 'error');
    }
    if (ui) {
      var s = window.TeamWorkspace && TeamWorkspace.state ? TeamWorkspace.state() : {};
      ui.trigger.disabled = !(s.authenticated && s.substep === 'review-single');
      if (!ui.drawer.hidden && sameVersion && changeCount() > 0) { refresh(); return; }
      if (pendingToken !== null) { refresh(); return; }
      var hadFocus = ui.drawer.contains(document.activeElement) && ui.tbody.contains(document.activeElement);
      render();
      if (hadFocus) ui.apply.focus({preventScroll: true});
    }
  }

  function boot() {
    build();
    if (window.Shiny && Shiny.addCustomMessageHandler) {
      Shiny.addCustomMessageHandler('team-groups-table', onTable);
      Shiny.addCustomMessageHandler('team-groups-applied', onApplied);
    }
  }
  window.TeamGroupEditor = {similar: similar, nfc: nfc, validate: function () { return validate(); }};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
