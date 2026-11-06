/* Team upload formats for the abundance "Choose files" input (data_hub-files).
   .csv and .xlsx files keep the existing path. Files the shared reader does not accept
   (.txt, .tsv) are sent first to the hidden Team input "team_upload_inbox"; the server
   (R/frontends/team/upload_formats.R) converts them to .csv with every value unchanged, and the
   converted files are handed to the same "Choose files" input as if the user had chosen them. */
(function () {
  'use strict';
  var TARGET = 'data_hub-files', INBOX = 'team_upload_inbox';
  var ACCEPT = '.csv,.xlsx,.xls,.txt,.tsv';
  var CONVERT = { txt: 1, tsv: 1 };
  var MAX_TEXT_BYTES = 50 * 1024 * 1024, SERVER_TIMEOUT_MS = 5 * 60 * 1000, UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
  // One selection at a time: from interception until the final upload of the shared input has
  // finished. Selections made meanwhile wait in the queue, so uploads never overlap on the two
  // file inputs (a new upload on a Shiny file input aborts the one in progress).
  var reinjecting = false, active = null, queue = [], counter = 0, dialog = null;

  function ext(name) { var m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function canInject() { try { return typeof DataTransfer === 'function' && !!new DataTransfer().items; } catch (e) { return false; } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  // Short status / error dialog in Team style. locked: Escape does not close it (work in progress).
  function show(title, lines, buttons, locked) {
    if (!dialog) {
      dialog = el('dialog', 'tu-dialog'); dialog.id = 'team-upload-dialog'; dialog.setAttribute('aria-labelledby', 'team-upload-title'); document.body.appendChild(dialog);
      dialog.addEventListener('cancel', function (e) { if (dialog.dataset.locked === 'true') e.preventDefault(); });
    }
    dialog.dataset.locked = locked ? 'true' : 'false';
    dialog.replaceChildren();
    var h = el('h2', '', title); h.id = 'team-upload-title'; dialog.appendChild(h);
    (lines || []).forEach(function (line) { if (line && line.nodeType) dialog.appendChild(line); else dialog.appendChild(el('p', '', line)); });
    var row = el('div', 'tu-actions');
    (buttons || []).forEach(function (b) { var btn = el('button', b.primary ? 'tu-primary' : 'tu-secondary', b.label); btn.type = 'button'; btn.addEventListener('click', b.onClick); row.appendChild(btn); });
    if (row.children.length) dialog.appendChild(row);
    if (!dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
    var first = row.querySelector('.tu-primary') || row.querySelector('button'); if (first) first.focus();
    return dialog;
  }
  function close() { if (dialog && dialog.open) { dialog.dataset.locked = 'false'; if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); } }
  function cancelButton() { return { label: 'Close', onClick: close }; }
  // The error stays up until the user closes it; only then does the next queued selection start.
  function fail(lines) {
    var job = active;
    show('This file could not be read', lines.concat(['Nothing was loaded. Fix the file and choose it again.']), [cancelButton()]);
    dialog.addEventListener('close', function () { if (active === job) release(); }, { once: true });
  }

  function start(input, files) {
    if (active) { queue.push({ input: input, files: files }); return; }
    active = { id: ++counter, input: input };
    handle(input, files);
  }
  function release() {
    if (!active) return;
    if (active.timer) clearTimeout(active.timer);
    if (active.poll) clearInterval(active.poll);
    active = null;
    var next = queue.shift();
    if (next) start(next.input, next.files);
  }

  // Hands the final list of files to the shared "Choose files" input as a normal selection, then
  // waits for Shiny's upload of them to finish ("Upload complete" or an error) before the next one.
  function inject(input, files) {
    var dt = new DataTransfer(); files.forEach(function (f) { dt.items.add(f); });
    var container = input.closest('.shiny-input-container'), bar = container && container.querySelector('.progress-bar');
    if (bar) bar.textContent = '';
    input.files = dt.files;
    reinjecting = true;
    try { input.dispatchEvent(new Event('change', { bubbles: true })); } finally { reinjecting = false; }
    var job = active; if (!job) return;
    var started = Date.now();
    job.poll = setInterval(function () {
      if (active !== job) return;
      var text = bar ? bar.textContent : 'Upload complete';
      var errored = bar && /danger|error/.test(bar.className) && text !== '';
      if (text === 'Upload complete' || errored || Date.now() - started > UPLOAD_TIMEOUT_MS) release();
    }, 200);
  }

  function sendToInbox(batch, items) {
    var inbox = document.getElementById(INBOX);
    if (!inbox || !window.Shiny) return false;
    Shiny.setInputValue('team_upload_plan', { batch: batch, files: items.map(function (it) { return it.request; }) }, { priority: 'event' });
    var dt = new DataTransfer(); items.forEach(function (it) { dt.items.add(it.file); });
    inbox.files = dt.files;
    inbox.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // plan: [{file, action:'pass'|'convert', request}] in the user's order.
  function finish(input, plan) {
    var toServer = plan.filter(function (p) { return p.action === 'convert'; });
    if (!toServer.length) { inject(input, plan.map(function (p) { return p.file; })); return; }
    var big = toServer.filter(function (p) { return p.request.kind === 'delimited' && p.file.size > MAX_TEXT_BYTES; })[0];
    if (big) { fail([big.file.name + ' is larger than 50 MB. Save it as .csv or .xlsx and upload that file instead.']); return; }
    var job = active;
    job.batch = 'upload-' + job.id + '-' + Date.now();
    // Each file sent carries its own id; results are matched by id, never by file name.
    toServer.forEach(function (p, i) { p.request.id = job.batch + '-' + i; });
    job.plan = plan;
    show('Preparing your files…', toServer.map(function (p) { return 'Reading ' + p.file.name + '. Values are passed on unchanged.'; }), [], true);
    job.timer = setTimeout(function () { if (active === job) fail(['The workspace did not answer in time.']); }, SERVER_TIMEOUT_MS);
    if (!sendToInbox(job.batch, toServer)) fail(['The workspace is not connected. Reload the page and choose the files again.']);
  }

  // Converted names never replace another file of the same selection (the shared module keys
  // uploads by file name): "x.tsv.csv" becomes "x.tsv (converted).csv", then "(converted 2)".
  function uniqueName(name, used) {
    if (!used[name]) return name;
    var m = /^(.*?)(\.[^.]*)?$/.exec(name), base = m[1], suffix = m[2] || '';
    for (var i = 1; ; i++) { var candidate = base + (i === 1 ? ' (converted)' : ' (converted ' + i + ')') + suffix; if (!used[candidate]) return candidate; }
  }

  function received(message) {
    var job = active;
    if (!job || !message || message.batch !== job.batch) return;
    if (job.timer) { clearTimeout(job.timer); job.timer = null; }
    var errors = message.errors || [];
    if (errors.length) { fail(errors.map(function (e) { return e.message; })); return; }
    var byId = {}; (message.files || []).forEach(function (f) { byId[f.id] = f; });
    var used = {}; job.plan.forEach(function (p) { if (p.action !== 'convert') used[p.file.name] = true; });
    Promise.all(job.plan.map(function (p) {
      if (p.action !== 'convert') return Promise.resolve(p.file);
      var c = byId[p.request.id];
      if (!c) return Promise.reject(new Error(p.file.name + ' was not converted.'));
      var name = uniqueName(c.name, used); used[name] = true;
      return fetch(c.url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('Could not fetch the converted ' + p.file.name + '.');
        return r.blob();
      }).then(function (blob) { return new File([blob], name, { type: c.type }); });
    })).then(function (files) {
      if (active !== job) return;
      close();
      inject(job.input, files);
    }).catch(function (e) { if (active === job) fail([e.message]); });
  }

  function classify(file) {
    var x = ext(file.name);
    if (CONVERT[x]) return Promise.resolve({ file: file, action: 'convert', request: { name: file.name, kind: 'delimited' } });
    return Promise.resolve({ file: file, action: 'pass' });
  }
  function needsTeam(files) { return files.some(function (f) { return CONVERT[ext(f.name)]; }); }

  function handle(input, files) {
    Promise.all(files.map(classify)).then(function (plan) { finish(input, plan); }).catch(function () { inject(input, files); });
  }

  function isTarget(node) { return node && node.id === TARGET && node.type === 'file'; }
  // The sheet picker's final selection (sheet_picker.js) holds no .txt/.tsv: let it through.
  function sheetPickerReinjecting() { try { return !!(window.TeamSheetPicker && typeof TeamSheetPicker.reinjecting === 'function' && TeamSheetPicker.reinjecting()); } catch (e) { return false; } }
  function onChange(event) {
    var input = event.target;
    if (reinjecting || sheetPickerReinjecting() || !isTarget(input) || !input.files || !input.files.length || !canInject()) return;
    var files = Array.prototype.slice.call(input.files);
    if (!active && !needsTeam(files)) return; // .csv / .xls with nothing in progress: existing path, untouched
    event.stopImmediatePropagation(); event.preventDefault();
    input.value = '';
    start(input, files);
  }
  // Shiny's drop zone sets the files and triggers a jQuery-only change, which the listener
  // above does not see: route drops that need Team conversion here first.
  function onDrop(event) {
    var dt = event.dataTransfer, zone = event.target && event.target.closest && event.target.closest('.shiny-input-container');
    var input = zone && zone.querySelector('input[type=file]');
    if (!isTarget(input) || !dt || !dt.files || !dt.files.length || !canInject()) return;
    var files = Array.prototype.slice.call(dt.files);
    if (!active && !needsTeam(files)) return;
    event.stopPropagation(); event.preventDefault();
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
    Shiny.addCustomMessageHandler('team-upload-converted', received);
    return true;
  }
  if (!register()) document.addEventListener('DOMContentLoaded', register);
  document.addEventListener('DOMContentLoaded', widenAccept);
  if (window.jQuery) jQuery(document).on('shiny:connected shiny:value', widenAccept);
  window.TeamUploadFormats = { ext: ext, classify: classify, needsTeam: needsTeam, uniqueName: uniqueName, state: function () { return { active: !!active, queued: queue.length }; },
    // True only while this file dispatches its own re-injected selection (read by sciex_import.js).
    reinjecting: function () { return reinjecting; } };
})();
