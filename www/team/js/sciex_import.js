/* Team: SCIEX results exports on the abundance "Choose files" input (data_hub-files).
   A selection that holds a .txt/.tsv/.csv file is held back for a moment while the first bytes
   of those files are read here. A file whose first lines are a SCIEX results export (wide:
   "Sample Name" row then "Sample Type" row; long: "Sample Name" and "Component Name" columns) is
   sent to the hidden Team input "team_sciex_inbox"; R/frontends/team/sciex_import.R answers with a
   summary, the user confirms the choices (value column for the long layout, keep or leave out
   non-Unknown samples and internal standards; everything is kept by default), and the converted
   wide .csv is handed to the same "Choose files" input as if the user had chosen it. Every other
   file of the selection is handed back unchanged. A selection without a SCIEX file is handed back
   unchanged, as chosen.
   Merge note (ux21 upload formats): this file must be included before upload_formats.js. Its
   re-injected selection is a normal change event, so upload_formats.js still sees and converts
   any other .txt/.tsv files. Without upload_formats.js, a .txt/.tsv that is not a SCIEX export is
   refused here (the shared reader does not read text files). */
(function () {
  'use strict';
  var TARGET = 'data_hub-files', INBOX = 'team_sciex_inbox';
  var ACCEPT = '.csv,.xlsx,.xls,.txt,.tsv';
  var SNIFF = { txt: 1, tsv: 1, csv: 1 }, TEXT = { txt: 1, tsv: 1 };
  var HEAD_BYTES = 64 * 1024, MAX_BYTES = 50 * 1024 * 1024, SERVER_TIMEOUT_MS = 5 * 60 * 1000;
  var reinjecting = false, active = null, counter = 0, dialog = null;

  function ext(name) { var m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  // The selection can be rebuilt only where a file input accepts an assigned FileList.
  var injectable = null;
  function canInject() {
    if (injectable !== null) return injectable;
    try {
      var probe = document.createElement('input'); probe.type = 'file';
      var dt = new DataTransfer(); dt.items.add(new File([''], 'probe.csv'));
      probe.files = dt.files;
      injectable = probe.files.length === 1 && typeof Blob.prototype.slice === 'function';
    } catch (e) { injectable = false; }
    return injectable;
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  // ---- Detection (mirrors team_sciex_detect_lines in R) ----
  function baseName(x) {
    return String(x || '').replace(/^﻿/, '').replace(/"/g, '').replace(/\s*[(\[][^)\]]*[)\]]\s*$/, '').trim().replace(/\s+/g, ' ').toLowerCase();
  }
  function decodeHead(buf) {
    var b = new Uint8Array(buf), enc = 'utf-8';
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) enc = 'utf-16le';
    else if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) enc = 'utf-16be';
    try { return new TextDecoder(enc).decode(b); } catch (e) { return ''; }
  }
  function detectLines(lines) {
    function fields(l, sep) { return l.split(sep).map(baseName); }
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i]; if (!l.trim()) continue;
      var sep = l.indexOf('\t') >= 0 ? '\t' : ',', f = fields(l, sep);
      if (f.indexOf('sample name') >= 0 && f.indexOf('component name') >= 0) return 'long';
      if (f.length >= 2 && f[0] === 'sample name' && i + 1 < lines.length && fields(lines[i + 1], sep)[0] === 'sample type') return 'wide';
    }
    return null;
  }
  function detectText(text) {
    var lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
    if (lines.length > 1) lines.pop(); // the last line may be cut at HEAD_BYTES
    return detectLines(lines.slice(0, 50));
  }
  function sniff(file) {
    if (!SNIFF[ext(file.name)]) return Promise.resolve(null);
    return file.slice(0, HEAD_BYTES).arrayBuffer().then(function (buf) { return detectText(decodeHead(buf)); }).catch(function () { return null; });
  }

  // ---- Dialog ----
  function show(title, nodes, buttons, locked) {
    if (!dialog) {
      dialog = el('dialog', 'tsx-dialog'); dialog.id = 'team-sciex-dialog'; dialog.setAttribute('aria-labelledby', 'team-sciex-title'); document.body.appendChild(dialog);
      dialog.addEventListener('cancel', function (e) { e.preventDefault(); if (dialog.dataset.locked !== 'true' && dialog._onCancel) dialog._onCancel(); });
    }
    dialog.dataset.locked = locked ? 'true' : 'false'; dialog._onCancel = null;
    dialog.replaceChildren();
    var h = el('h2', '', title); h.id = 'team-sciex-title'; dialog.appendChild(h);
    (nodes || []).forEach(function (n) { dialog.appendChild(n && n.nodeType ? n : el('p', '', n)); });
    var row = el('div', 'tsx-actions');
    (buttons || []).forEach(function (b) { var btn = el('button', b.primary ? 'tsx-primary' : 'tsx-secondary', b.label); btn.type = 'button'; btn.addEventListener('click', b.onClick); row.appendChild(btn); });
    if (row.children.length) dialog.appendChild(row);
    if (!dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
    var first = row.querySelector('.tsx-primary') || row.querySelector('button'); if (first) first.focus();
    return dialog;
  }
  function close() { if (dialog && dialog.open) { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); } }
  function fail(lines) {
    var job = active;
    show('This file could not be loaded', lines.map(function (m) { return el('p', 'tsx-error', m); }).concat([el('p', '', 'Nothing was loaded. Fix the file and choose it again.')]), [{ label: 'Close', onClick: close }]);
    if (dialog) dialog._onCancel = close;
    if (job && job.batch && job.stage !== 'done' && window.Shiny) Shiny.setInputValue('team_sciex_convert', { batch: job.batch, cancel: true, n: ++counter }, { priority: 'event' });
    release();
  }
  function release() { if (active && active.timer) clearTimeout(active.timer); active = null; }

  function previewTable(p) {
    var wrap = el('div', 'tsx-scroll'), t = el('table'), head = el('tr');
    head.appendChild(el('th', '', 'Component'));
    p.samples.forEach(function (s, k) { var th = el('th', '', s); if (p.types && p.types[k] && p.types[k].toLowerCase() !== 'unknown') th.appendChild(el('span', 'tsx-type', ' ' + p.types[k])); head.appendChild(th); });
    t.appendChild(head);
    p.components.forEach(function (c, i) {
      var tr = el('tr'); tr.appendChild(el('td', '', c));
      (p.values[i] || []).forEach(function (v) { tr.appendChild(el('td', v == null || v === '' ? 'tsx-na' : '', v == null ? '' : v)); });
      t.appendChild(tr);
    });
    wrap.appendChild(t); return wrap;
  }
  function checkbox(label, checked) { var lab = el('label'), c = el('input'); c.type = 'checkbox'; c.checked = !!checked; lab.appendChild(c); lab.appendChild(document.createTextNode(label)); return { node: lab, input: c }; }

  // Resolves to the choices for one file, or null to cancel the selection.
  function choose(s) {
    return new Promise(function (resolve) {
      var nodes = [], radios = null, group = 'tsx-v-' + (++counter);
      nodes.push(el('p', '', (s.layout === 'wide' ? 'SCIEX results export' : 'SCIEX Results Table (one row per sample and component)') + ': ' +
        plural(s.samples, 'sample') + ' × ' + plural(s.components, 'component') + '. It will be loaded as a lipid × sample matrix; values are passed on unchanged.'));
      if (s.layout === 'long' && s.value_columns) {
        var fs = el('fieldset'); fs.appendChild(el('legend', '', 'Value to load'));
        radios = s.value_columns.map(function (c) {
          var lab = el('label'), r = el('input'); r.type = 'radio'; r.name = group; r.value = c.column; r.checked = c.column === s.value;
          lab.appendChild(r); lab.appendChild(document.createTextNode(c.column + ' (' + plural(c.numeric, 'value') + ')'));
          if (!c.numeric) { r.disabled = true; lab.classList.add('tsx-disabled'); }
          fs.appendChild(lab); return r;
        });
        nodes.push(fs);
      }
      if (s.preview && s.preview.components.length) nodes.push(previewTable(s.preview));
      if (s.missing) nodes.push(el('p', 'tsx-muted', plural(s.missing, 'cell') + ' marked N/A or No Peak will be missing values (NA), like empty cells.'));
      var typeBox = null, isBox = null;
      if (s.other_samples && s.other_samples.length) {
        var types = (s.sample_types || []).map(function (t) { return plural(t.samples, t.type + ' sample'); }).join(', ');
        var names = s.other_samples.slice(0, 8).map(function (o) { return o.sample + ' (' + o.type + ')'; }).join(', ') + (s.other_samples.length > 8 ? ', …' : '');
        nodes.push(el('p', 'tsx-warn', 'Sample types: ' + types + '. Not Unknown: ' + names + '.'));
        typeBox = checkbox('Leave out the ' + plural(s.other_samples.length, 'sample') + ' whose type is not Unknown', false); nodes.push(typeBox.node);
      }
      if (s.standards) {
        nodes.push(el('p', 'tsx-muted', plural(s.standards, 'internal standard') + ' found (for example ' + [].concat(s.standard_examples || []).join(', ') + ').'));
        isBox = checkbox('Leave out the ' + plural(s.standards, 'internal standard'), false); nodes.push(isBox.node);
      }
      var done = false;
      function end(v) { if (done) return; done = true; resolve(v); }
      show('Load ' + s.file, nodes, [
        { label: 'Cancel', onClick: function () { end(null); } },
        { label: 'Load', primary: true, onClick: function () {
          var picked = radios ? radios.filter(function (r) { return r.checked; })[0] : null;
          end({ name: s.file, value: picked ? picked.value : '', excludeOtherTypes: !!(typeBox && typeBox.input.checked), excludeStandards: !!(isBox && isBox.input.checked) });
        } }
      ]);
      dialog._onCancel = function () { end(null); };
    });
  }

  // ---- Flow ----
  function inject(input, files) {
    var dt = new DataTransfer(); files.forEach(function (f) { dt.items.add(f); });
    input.files = dt.files;
    reinjecting = true;
    try { input.dispatchEvent(new Event('change', { bubbles: true })); } finally { reinjecting = false; }
  }

  // Hands the selection to the input; the job ends only once that worked.
  function handBack(input, files) {
    try { inject(input, files); } catch (e) { fail(['The browser could not pass the files on (' + (e && e.message || e) + '). Choose them again.']); return; }
    release();
  }

  function handle(input, files) {
    var job = active;
    Promise.all(files.map(sniff)).then(function (kinds) {
      if (active !== job) return;
      var sciex = files.filter(function (f, i) { return kinds[i]; });
      // Without upload_formats.js nothing reads other text files: refuse the whole selection.
      var text = files.filter(function (f, i) { return !kinds[i] && TEXT[ext(f.name)]; });
      if (text.length && !window.TeamUploadFormats) { fail([text[0].name + ' is not a SCIEX results export. Text files are read only when they are SCIEX exports; save other tables as .csv or .xlsx.']); return; }
      if (!sciex.length) { handBack(input, files); return; }
      var big = sciex.filter(function (f) { return f.size > MAX_BYTES; })[0];
      if (big) { fail([big.name + ' is larger than 50 MB. Export fewer components or samples per file.']); return; }
      var names = {}; for (var k = 0; k < sciex.length; k++) { if (names[sciex[k].name]) { fail(['Two files are named ' + sciex[k].name + '. Rename one and choose them again.']); return; } names[sciex[k].name] = true; }
      var inbox = document.getElementById(INBOX);
      if (!inbox || !window.Shiny) { fail(['The workspace is not connected. Reload the page and choose the files again.']); return; }
      job.files = files; job.sciex = sciex; job.stage = 'inspect';
      job.batch = 'sciex-' + job.id + '-' + Date.now();
      show('Reading the SCIEX export…', sciex.map(function (f) { return 'Reading ' + f.name + '.'; }), [], true);
      job.timer = setTimeout(function () { if (active === job) fail(['The workspace did not answer in time.']); }, SERVER_TIMEOUT_MS);
      // The batch travels in each file name, so the server ties the upload to this job.
      var dt = new DataTransfer(); sciex.forEach(function (f) { dt.items.add(new File([f], job.batch + '__' + f.name, { type: f.type })); });
      inbox.files = dt.files;
      inbox.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(function (e) { if (active === job) fail([String(e && e.message || e)]); });
  }

  function onInspected(job, message) {
    var summaries = message.files || [];
    job.stage = 'choose';
    summaries.reduce(function (chain, s) {
      return chain.then(function (acc) { if (!acc) return acc; return choose(s).then(function (c) { return c ? acc.concat([c]) : null; }); });
    }, Promise.resolve([])).then(function (choices) {
      if (active !== job) return;
      if (!choices) {
        Shiny.setInputValue('team_sciex_convert', { batch: job.batch, cancel: true, n: ++counter }, { priority: 'event' });
        close(); release(); return;
      }
      job.stage = 'convert';
      show('Converting…', ['Building the lipid × sample matrix.'], [], true);
      job.timer = setTimeout(function () { if (active === job) fail(['The workspace did not answer in time.']); }, SERVER_TIMEOUT_MS);
      Shiny.setInputValue('team_sciex_convert', { batch: job.batch, files: choices, n: ++counter }, { priority: 'event' });
    }).catch(function (e) { if (active === job) fail([String(e && e.message || e)]); });
  }

  function onConverted(job, message) {
    var bySource = {}; (message.files || []).forEach(function (f) { bySource[f.source] = f; });
    var used = {}; job.files.forEach(function (f) { if (job.sciex.indexOf(f) < 0) used[f.name] = true; });
    var abort = typeof AbortController === 'function' ? new AbortController() : null;
    job.timer = setTimeout(function () { if (abort) abort.abort(); if (active === job) fail(['The converted file did not arrive in time.']); }, SERVER_TIMEOUT_MS);
    Promise.all(job.files.map(function (f) {
      if (job.sciex.indexOf(f) < 0) return Promise.resolve(f);
      var c = bySource[f.name];
      if (!c) return Promise.reject(new Error(f.name + ' was not converted.'));
      var name = c.name, i = 2; while (used[name]) name = c.name.replace(/\.csv$/, ' ' + (i++) + '.csv'); used[name] = true;
      return fetch(c.url, { credentials: 'same-origin', signal: abort ? abort.signal : undefined }).then(function (r) {
        if (!r.ok) throw new Error('Could not fetch the converted ' + f.name + '.');
        return r.blob();
      }).then(function (blob) { return new File([blob], name, { type: 'text/csv' }); });
    })).then(function (out) {
      if (active !== job) return;
      clearTimeout(job.timer); job.timer = null;
      job.stage = 'done'; close(); handBack(job.input, out);
    }).catch(function (e) { if (active === job) fail([e.message]); });
  }

  function received(message) {
    var job = active;
    if (!job || !message || message.batch !== job.batch) return;
    if (job.timer) { clearTimeout(job.timer); job.timer = null; }
    var errors = message.errors || [];
    if (errors.length) { job.stage = 'done'; fail(errors.map(function (e) { return e.message; })); return; }
    if (message.stage === 'inspect' && job.stage === 'inspect') onInspected(job, message);
    else if (message.stage === 'convert' && job.stage === 'convert') onConverted(job, message);
  }

  function takes(files) { return files.some(function (f) { return SNIFF[ext(f.name)]; }); }
  function start(input, files) {
    if (active) { show('Please wait', ['A SCIEX export is still being loaded. Choose the files again when it has finished.'], [{ label: 'Close', onClick: close }]); if (dialog) dialog._onCancel = close; return; }
    active = { id: ++counter, input: input };
    handle(input, files);
  }
  function isTarget(node) { return node && node.id === TARGET && node.type === 'file'; }
  // upload_formats.js (ux21) re-dispatches its finished selection as a change event; that one
  // event is its own and is left to it (handling it here would loop between the two files). Every
  // selection the user makes, also while ux21 is busy, is checked for SCIEX exports here first.
  function otherReinjecting() {
    try {
      return !!(window.TeamUploadFormats && typeof TeamUploadFormats.reinjecting === 'function' && TeamUploadFormats.reinjecting()) ||
        !!(window.TeamSheetPicker && typeof TeamSheetPicker.reinjecting === 'function' && TeamSheetPicker.reinjecting());
    } catch (e) { return false; }
  }
  function onChange(event) {
    var input = event.target;
    if (reinjecting || !isTarget(input) || !input.files || !input.files.length || !canInject() || otherReinjecting()) return;
    var files = Array.prototype.slice.call(input.files);
    if (!takes(files)) return; // .xlsx / .xls only: existing path, untouched
    event.stopImmediatePropagation(); event.preventDefault();
    input.value = '';
    start(input, files);
  }
  // Shiny's drop zone sets the files and triggers a jQuery-only change: route drops here first.
  function onDrop(event) {
    var dt = event.dataTransfer, zone = event.target && event.target.closest && event.target.closest('.shiny-input-container');
    var input = zone && zone.querySelector('input[type=file]');
    if (!isTarget(input) || !dt || !dt.files || !dt.files.length || !canInject()) return;
    var files = Array.prototype.slice.call(dt.files);
    if (!takes(files)) return;
    event.stopImmediatePropagation(); event.preventDefault();
    if (window.jQuery) jQuery(zone).find('.shiny-file-input-over,.shiny-file-input-active').addBack().removeClass('shiny-file-input-over shiny-file-input-active');
    start(input, files);
  }
  function widenAccept() {
    document.querySelectorAll('input[type=file]#' + TARGET).forEach(function (input) { if (input.getAttribute('accept') !== ACCEPT) input.setAttribute('accept', ACCEPT); });
  }

  window.addEventListener('change', onChange, true);
  window.addEventListener('drop', onDrop, true);
  function register() {
    if (!window.Shiny || typeof Shiny.addCustomMessageHandler !== 'function') return false;
    Shiny.addCustomMessageHandler('team-sciex', received);
    return true;
  }
  if (!register()) document.addEventListener('DOMContentLoaded', register);
  document.addEventListener('DOMContentLoaded', widenAccept);
  if (window.jQuery) jQuery(document).on('shiny:connected shiny:value', widenAccept);
  window.TeamSciexImport = { detectText: detectText, decodeHead: decodeHead, baseName: baseName, state: function () { return { active: !!active }; } };
})();
