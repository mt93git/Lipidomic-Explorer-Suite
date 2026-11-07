/* Team Excel sheet picker for the abundance "Choose files" input (data_hub-files).
   Server side: R/frontends/team/sheet_picker.R. A selection (chosen or dropped) that contains an
   .xlsx/.xls is held back here: the workbooks go to the hidden Team input "team_sheet_inbox"; the
   server refuses workbooks over 50 MB and lists their sheet names. A workbook with one sheet is
   then handed on unchanged (the user's own File). With several sheets the user picks one (read
   alone on the server and handed on as .csv) or, explicitly, all sheets combined. Only then does
   the selection reach data_hub-files, as one ordinary selection. A browser that cannot move files
   between inputs gets a message instead: a workbook is never handed on unchecked.
   .csv-only selections are not touched. No workbook is opened in the browser.
   Included after sciex_import.js and upload_formats.js: their capture listeners run first and
   convert .txt/.tsv; their re-injected selection then reaches this one, which handles only
   .xlsx/.xls. Its own final selection is skipped by both (TeamSheetPicker.reinjecting()). */
(function () {
  'use strict';
  var TARGET = 'data_hub-files', INBOX = 'team_sheet_inbox';
  var MAX_BYTES = 50 * 1024 * 1024, SERVER_TIMEOUT_MS = 5 * 60 * 1000, UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
  // One selection at a time, from interception until the shared input's upload has finished;
  // selections made meanwhile wait in the queue (a new upload on a Shiny file input aborts the
  // one in progress).
  var reinjecting = false, active = null, queue = [], counter = 0, dialog = null;

  function isExcel(file) { return /\.(xlsx|xls)$/i.test((file && file.name) || ''); }
  function canInject() { try { return typeof DataTransfer === 'function' && !!new DataTransfer().items; } catch (e) { return false; } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function mb(bytes) { return (bytes / 1048576).toFixed(1); }

  // Team-style modal dialog. locked: Escape does not close it (work in progress).
  function show(title, lines, buttons, locked) {
    if (!dialog) {
      dialog = el('dialog', 'tsp-dialog'); dialog.id = 'team-sheet-dialog'; dialog.setAttribute('aria-labelledby', 'team-sheet-title'); document.body.appendChild(dialog);
      dialog.addEventListener('cancel', function (e) { if (dialog.dataset.locked === 'true') e.preventDefault(); });
    }
    dialog.dataset.locked = locked ? 'true' : 'false';
    dialog.replaceChildren();
    var h = el('h2', '', title); h.id = 'team-sheet-title'; dialog.appendChild(h);
    (lines || []).forEach(function (line) { dialog.appendChild(line && line.nodeType ? line : el('p', '', line)); });
    var row = el('div', 'tsp-actions');
    (buttons || []).forEach(function (b) { var btn = el('button', b.primary ? 'tsp-primary' : 'tsp-secondary', b.label); btn.type = 'button'; btn.addEventListener('click', b.onClick); row.appendChild(btn); });
    if (row.children.length) dialog.appendChild(row);
    if (!dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
    var first = row.querySelector('.tsp-primary') || row.querySelector('button'); if (first) first.focus();
    return dialog;
  }
  function close() { if (dialog && dialog.open) { dialog.dataset.locked = 'false'; if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); } }
  // The message stays up until the user closes it; only then does the next queued selection start.
  function fail(lines) {
    var job = active;
    show('The files were not loaded', lines.concat(['Nothing from this selection was loaded.']), [{ label: 'Close', primary: true, onClick: close }]);
    dialog.addEventListener('close', function () { if (active === job) release(); }, { once: true });
  }

  function start(input, files) {
    if (active) { queue.push({ input: input, files: files }); return; }
    active = { id: ++counter, input: input, files: files };
    handle(active);
  }
  function release() {
    if (!active) return;
    if (active.timer) clearTimeout(active.timer);
    if (active.poll) clearInterval(active.poll);
    active = null;
    var next = queue.shift();
    if (next) start(next.input, next.files);
  }
  function wait(job, what) {
    if (job.timer) clearTimeout(job.timer);
    job.timer = setTimeout(function () { if (active === job) fail(['The workspace did not answer in time while ' + what + '.']); }, SERVER_TIMEOUT_MS);
  }

  // Hands the final files to the shared input as one normal selection, then waits for Shiny's
  // upload of them to finish before the next selection starts.
  function inject(job, files) {
    var input = job.input, dt = new DataTransfer();
    files.forEach(function (f) { dt.items.add(f); });
    var container = input.closest('.shiny-input-container'), bar = container && container.querySelector('.progress-bar');
    if (bar) bar.textContent = '';
    input.files = dt.files;
    reinjecting = true;
    try { input.dispatchEvent(new Event('change', { bubbles: true })); } finally { reinjecting = false; }
    var started = Date.now();
    job.poll = setInterval(function () {
      if (active !== job) return;
      var text = bar ? bar.textContent : 'Upload complete';
      var errored = bar && /danger|error/.test(bar.className) && text !== '';
      if (text === 'Upload complete' || errored || Date.now() - started > UPLOAD_TIMEOUT_MS) release();
    }, 200);
  }

  function handle(job) {
    var books = job.files.filter(isExcel);
    if (!books.length) { inject(job, job.files); return; } // a queued .csv-only selection
    if (!canInject() || !window.Shiny || !document.getElementById(INBOX)) {
      fail(['This page cannot check Excel workbooks in this browser, so they are not loaded. Use a current version of Chrome, Edge, Firefox or Safari, or save the sheet you need as .csv.']);
      return;
    }
    var big = books.filter(function (f) { return f.size > MAX_BYTES; })[0];
    if (big) { fail([big.name + ' is ' + mb(big.size) + ' MB. Excel workbooks up to 50 MB can be loaded. Save the sheet you need as its own .xlsx or .csv file and upload that.']); return; }
    job.books = books;
    job.batch = 'sheets-' + job.id + '-' + Date.now();
    show('Checking ' + (books.length === 1 ? books[0].name : books.length + ' workbooks') + '…', ['Listing the sheets.'], [], true);
    wait(job, 'listing the sheets');
    Shiny.setInputValue('team_sheet_batch', job.batch, { priority: 'event' });
    var inbox = document.getElementById(INBOX), dt = new DataTransfer();
    books.forEach(function (f) { dt.items.add(f); });
    inbox.files = dt.files;
    inbox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Resolves to the chosen sheet name, '' for all sheets combined, or null to cancel.
  function chooseSheet(name, sheets) {
    return new Promise(function (resolve) {
      var form = el('fieldset'); form.appendChild(el('legend', '', 'Sheet to load'));
      var group = 'tsp-sheet-' + (++counter);
      function option(value, label, checked, cls) {
        var lab = el('label', cls), r = el('input'); r.type = 'radio'; r.name = group; r.value = value; r.checked = !!checked;
        lab.appendChild(r); lab.appendChild(document.createTextNode(label)); form.appendChild(lab);
      }
      sheets.forEach(function (s, i) { option('s' + i, s, i === 0); });
      option('all', 'All sheets combined into one table', false, 'tsp-all');
      var done = false;
      function end(v) { if (done) return; done = true; dialog.removeEventListener('cancel', onCancel); close(); resolve(v); }
      function onCancel(e) { e.preventDefault(); end(null); }
      show(name + ' has ' + sheets.length + ' sheets', [
        el('p', '', 'Choose the sheet that holds the abundance table. Only that sheet is loaded.'), form
      ], [
        { label: 'Cancel', onClick: function () { end(null); } },
        { label: 'Load sheet', primary: true, onClick: function () {
          var c = form.querySelector('input:checked'); if (!c) return;
          end(c.value === 'all' ? '' : sheets[+c.value.slice(1)]);
        } }
      ]);
      dialog.addEventListener('cancel', onCancel);
    });
  }

  function listed(message) {
    var job = active;
    if (!job || !message || message.batch !== job.batch || job.choices) return;
    var errors = message.errors || [];
    if (errors.length) { fail(errors); return; }
    var books = message.files || [];
    if (books.length !== job.books.length) { fail(['The upload did not match the selection. Choose the files again.']); return; }
    if (job.timer) { clearTimeout(job.timer); job.timer = null; }
    close();
    var choices = [];
    books.reduce(function (chain, b) {
      return chain.then(function (ok) {
        if (!ok || b.sheets.length < 2) return ok;
        return chooseSheet(b.name, b.sheets).then(function (sheet) {
          if (sheet === null) return false;
          if (sheet !== '') choices.push({ index: b.index, sheet: sheet });
          return true;
        });
      });
    }, Promise.resolve(true)).then(function (ok) {
      if (active !== job) return;
      job.choices = choices;
      // Always answer, so the server drops the workbooks it holds; Cancel sends no choices.
      Shiny.setInputValue('team_sheet_choice', { batch: job.batch, choices: ok ? choices : [] }, { priority: 'event' });
      if (!ok) { job.cancelled = true; release(); return; }
      show(choices.length ? 'Loading the chosen sheet…' : 'Loading…', [], [], true);
      wait(job, 'reading the sheet');
    });
  }

  function ready(message) {
    var job = active;
    if (!job || !message || message.batch !== job.batch || !job.choices) return;
    if (job.timer) { clearTimeout(job.timer); job.timer = null; }
    var errors = message.errors || [];
    if (errors.length) { fail(errors); return; }
    var byIndex = {}; (message.files || []).forEach(function (f) { byIndex[f.index] = f; });
    if ((message.files || []).length !== job.choices.length) { fail(['The chosen sheet was not prepared. Choose the file again.']); return; }
    // The shared module keys uploads by file name: a sheet's .csv never takes the name of another
    // file of the same selection ("x [S].csv" becomes "x [S] (2).csv", then "(3)").
    var used = {}, bookIndex = 0;
    job.files.forEach(function (file, i) { if (!isExcel(file) || !byIndex[job.files.slice(0, i).filter(isExcel).length]) used[file.name] = true; });
    function unique(name) {
      var m = /^(.*?)(\.csv)$/i.exec(name) || [name, name, ''], candidate = name;
      for (var n = 2; used[candidate]; n++) candidate = m[1] + ' (' + n + ')' + m[2];
      used[candidate] = true; return candidate;
    }
    Promise.all(job.files.map(function (file) {
      if (!isExcel(file)) return Promise.resolve(file);
      var c = byIndex[bookIndex++];
      if (!c) return Promise.resolve(file); // one sheet, or all sheets chosen: the user's own file, unchanged
      var name = unique(c.name);
      return fetch(c.url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('The chosen sheet of ' + file.name + ' could not be fetched. Choose the file again.');
        return r.blob();
      }).then(function (blob) { return new File([blob], name, { type: 'text/csv' }); });
    })).then(function (files) {
      if (active !== job) return;
      close();
      inject(job, files);
    }).catch(function (e) { if (active === job) fail([e.message]); });
  }

  function hold(input, files, event) {
    if (reinjecting || !files.length) return false;
    if (!active && !files.some(isExcel)) return false; // .csv with nothing in progress: untouched
    event.stopImmediatePropagation(); event.preventDefault();
    start(input, files);
    return true;
  }
  function isTarget(node) { return !!node && node.id === TARGET && node.type === 'file'; }
  function onChange(event) {
    var input = event.target;
    if (!isTarget(input) || !input.files) return;
    var files = Array.prototype.slice.call(input.files);
    if (hold(input, files, event)) input.value = '';
  }
  // Shiny's drop zone hands dropped files to the upload directly (no DOM change event): hold
  // drops on the shared input's container here first.
  function onDrop(event) {
    var zone = event.target && event.target.closest && event.target.closest('.shiny-input-container');
    var input = zone && zone.querySelector('input[type=file]');
    var dt = event.dataTransfer;
    if (!isTarget(input) || !dt || !dt.files) return;
    if (hold(input, Array.prototype.slice.call(dt.files), event) && window.jQuery) {
      jQuery(zone).find('.shiny-file-input-over,.shiny-file-input-active').addBack().removeClass('shiny-file-input-over shiny-file-input-active');
    }
  }

  window.addEventListener('change', onChange, true);
  window.addEventListener('drop', onDrop, true);
  function register() {
    if (!window.Shiny || typeof Shiny.addCustomMessageHandler !== 'function') return false;
    Shiny.addCustomMessageHandler('team-sheet-list', listed);
    Shiny.addCustomMessageHandler('team-sheet-ready', ready);
    return true;
  }
  if (!register()) document.addEventListener('DOMContentLoaded', register);
  // reinjecting(): true while this script hands its final selection to the shared input, so the
  // other interceptors (sciex_import.js, upload_formats.js) let that selection through untouched.
  window.TeamSheetPicker = { state: function () { return { active: !!active, queued: queue.length }; }, reinjecting: function () { return reinjecting; } };
})();
