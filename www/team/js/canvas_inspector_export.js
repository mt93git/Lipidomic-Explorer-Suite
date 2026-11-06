/* Team shell: the inspector's Export tab and status line (canvas_inspector.js calls in).
   A download row from the card's module content (plot image buttons, Plot data CSV, a
   download-only row) is MOVED into Export by the inspector, like the Data tab content, so
   every id and binding stays. What cannot move is mirrored: a download link inside a mixed
   row (it moves with its row to Data), and a finished figure's PNG/SVG/PDF buttons, which
   canvas.js disables and replaces in place. A mirror button clicks the original. The card's
   status badge (card_status.js) is mirrored with its one action above the tabs. Presentation
   only: nothing here computes, saves or changes a figure. */
(function () {
  'use strict';
  // .gc-download: Group comparison's own CSV/PNG/JPG/SVG/PDF chips (group_comparison.js). They stay
  // on the card (its controls are rebuilt on every redraw) and are mirrored here.
  var DOWNLOAD = '.shiny-download-link,a[download],.plot-export-button,.tc-csv,.gc-download';
  var CONTROL = 'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
  // True while a mirror clicks its original: canvas_inspector.js then keeps the inspector open
  // (a click inside Group comparison's own controls otherwise hands the card back to them).
  var mirroring = false;
  function isExport(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches('.plot-export-bar,.tc-csv,.tc-export-note,.tc-snapshot-exports') || el.matches(DOWNLOAD)) return true;
    var controls = el.querySelectorAll(CONTROL);
    return controls.length > 0 && Array.prototype.every.call(controls, function (c) { return c.matches(DOWNLOAD) || !!c.closest('.plot-export-bar'); });
  }
  function text(el) { return String(el && el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function off(el) { return !!(el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'); }
  // [element, label] pairs for every download that is not already a real control in Export.
  function sources(node, panel, data) {
    var out = [];
    if (node.classList.contains('tc-finished')) {
      node.querySelectorAll(':scope > .tc-snapshot .tc-snapshot-exports button').forEach(function (b) { out.push([b, 'Download ' + text(b)]); });
      node.querySelectorAll(':scope > .tc-snapshot .tc-export-fallback').forEach(function (a) { out.push([a, text(a)]); });
      return out;
    }
    var seen = [];
    [data, node].forEach(function (scope) {
      if (!scope) return;
      scope.querySelectorAll(DOWNLOAD).forEach(function (el) {
        if (seen.indexOf(el) >= 0 || panel.contains(el) || el.closest('.tc-node-head,.tc-snapshot')) return;
        // Everything in Data counts (its tab may be closed); on the card, a download that is not
        // rendered (closed details, an output not shown) is not on offer there either.
        if (scope === node && !el.getClientRects().length && !el.closest('.tc-figure-chrome,.tc-figure-park')) return;
        seen.push(el); out.push([el, el.dataset.exportLabel || el.getAttribute('aria-label') || text(el) || 'Download']);
      });
    });
    return out;
  }
  function mirror(el, label) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tc-export-mirror'; b.textContent = label; b.disabled = off(el);
    b.addEventListener('click', function () { if (!el.isConnected || off(el)) return; mirroring = true; try { el.click(); } finally { mirroring = false; } });
    return b;
  }
  function statusLine(node, panel) {
    var inspector = panel.closest('.tc-selection-inspector'), tabs = inspector && inspector.querySelector(':scope > .tc-inspector-tabs');
    var line = inspector && inspector.querySelector(':scope > .tc-inspector-status');
    var chip = node.querySelector(':scope > .tc-node-head > .tc-card-status');
    if (!chip || chip.hidden || !chip.dataset.state) { if (line) line.remove(); return ''; }
    var label = text(chip.querySelector('.tc-card-status-text')), desc = text(chip.querySelector('.tc-card-status-desc')), action = chip.querySelector('button');
    var key = [chip.dataset.state, label, desc, action ? text(action) : ''].join('|');
    if (line && line._tcKey === key && line._tcChip === chip) return key;
    if (!line) { line = document.createElement('div'); line.className = 'tc-inspector-status'; if (tabs) tabs.before(line); else if (inspector) inspector.appendChild(line); else return key; }
    line._tcKey = key; line._tcChip = chip; line.dataset.state = chip.dataset.state; line.textContent = '';
    var dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
    var strong = document.createElement('strong'); strong.textContent = label;
    var p = document.createElement('span'); p.textContent = desc;
    line.append(dot, strong, p);
    if (action) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text(action); b.addEventListener('click', function () { var now = chip.querySelector('button'); if (now) now.click(); }); line.appendChild(b); }
    return key;
  }
  function render(node, panel, data) {
    if (!node || !panel) return;
    statusLine(node, panel);
    var finished = node.classList.contains('tc-finished'), list = sources(node, panel, data);
    var caption = finished ? text(node.querySelector(':scope > .tc-snapshot .tc-snapshot-status')) : '';
    var box = panel.querySelector(':scope > .tc-export-more');
    var real = Array.prototype.some.call(panel.children, function (c) { return c !== box; });
    var key = [finished, real, caption].concat(list.map(function (s) { return s[1] + (off(s[0]) ? ':off' : ''); })).join('|');
    if (panel.classList.contains('is-finished') !== finished) panel.classList.toggle('is-finished', finished);
    // Rebuild only on a real change, so a focused mirror keeps focus while the board churns.
    if (box && box._tcKey === key && box._tcSources.every(function (el) { return el.isConnected; })) return;
    var focused = box && box.contains(document.activeElement) ? document.activeElement.textContent : null;
    if (box) box.remove();
    box = document.createElement('div'); box.className = 'tc-export-more'; box._tcKey = key; box._tcSources = list.map(function (s) { return s[0]; });
    if (finished) {
      var note = document.createElement('p'); note.className = 'tc-export-caption'; note.textContent = caption || 'Finished figure.'; box.appendChild(note);
    }
    if (list.length) {
      var group = document.createElement('div'); group.className = 'tc-export-mirrors'; group.setAttribute('role', 'group');
      group.setAttribute('aria-label', finished ? 'Download the finished figure' : 'More downloads from this analysis');
      list.forEach(function (s) { group.appendChild(mirror(s[0], s[1])); });
      box.appendChild(group);
    }
    if (!list.length && (finished || !real)) {
      var none = document.createElement('p'); none.className = 'tc-export-none';
      none.textContent = finished ? 'Downloads for this figure are not available yet.' : 'This figure has no downloads here. Use Export figure in the toolbar for the whole canvas.';
      box.appendChild(none);
    }
    // Finished: the snapshot downloads first; the live plot's rows (still moved here) are hidden by CSS.
    if (finished) panel.prepend(box); else panel.appendChild(box);
    if (focused) { var again = Array.prototype.find.call(box.querySelectorAll('button'), function (b) { return b.textContent === focused && !b.disabled; }); if (again) again.focus(); }
  }
  window.TeamInspectorExport = { isExport: isExport, render: render, mirroring: function () { return mirroring; } };
})();
