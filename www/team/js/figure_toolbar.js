(function () {
  'use strict';
  function init() {
    var root = document.getElementById('team-canvas-root');
    if (!root || root.querySelector('.tc-figure-tools')) return;
    var panel = root.querySelector('#tc-preview-panel');
    if (!panel || !panel.querySelector('.tc-shape-menu')) return;
    var host = document.createElement('div');
    host.className = 'tc-figure-tools';
    var bar = document.createElement('div');
    bar.className = 'tc-figure-tools-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Figure page tools');
    host.appendChild(bar);
    var proxies = [], menus = [], frame;
    function find(selector) { return root.querySelector(selector); }
    function button(parent, label, action) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', action); parent.appendChild(b); return b;
    }
    function proxy(parent, label, selector, check) {
      var b = button(parent, label, function () {
        var source = find(selector);
        if (source && !source.disabled) source.click();
        sync();
      });
      proxies.push({button:b, selector:selector, check:check}); return b;
    }
    function close(except) {
      menus.forEach(function (m) { if (m !== except) { m.body.hidden = true; m.trigger.setAttribute('aria-expanded', 'false'); } });
    }
    function menu(label) {
      var wrap = document.createElement('div'); wrap.className = 'tc-figure-menu'; bar.appendChild(wrap);
      var m = {};
      m.trigger = button(wrap, label, function () {
        var open = m.body.hidden; close(); m.body.hidden = !open;
        m.trigger.setAttribute('aria-expanded', String(open));
        if (open) { sync(); var first = m.body.querySelector('button:not(:disabled)'); if (first) first.focus(); }
      });
      m.trigger.setAttribute('aria-expanded', 'false');
      m.body = document.createElement('div'); m.body.className = 'tc-figure-menu-body'; m.body.hidden = true;
      m.body.id = 'tc-figure-menu-' + menus.length; m.trigger.setAttribute('aria-controls', m.body.id);
      wrap.appendChild(m.body); menus.push(m);
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !m.body.hidden) { e.preventDefault(); close(); m.trigger.focus(); }
      });
      m.body.addEventListener('click', function (e) {
        if (e.target.closest('button')) {
          close();
          // Preserve focus deliberately moved by the original action (e.g. its confirmation).
          if (m.body.contains(document.activeElement) || document.activeElement === document.body) m.trigger.focus();
        }
      });
      return m.body;
    }
    function separator() { var s = document.createElement('span'); s.className = 'tc-figure-separator'; s.setAttribute('aria-hidden','true'); bar.appendChild(s); }
    proxy(bar, 'Add text', '.tc-preview-add-text');
    var shapes = menu('Add shape ▾');
    ['Rectangle','Rounded rectangle','Circle / ellipse','Line','Arrow'].forEach(function (name) {
      proxy(shapes, name, '.tc-add-shape[aria-label="Add ' + name + '"]');
    });
    var publication = proxy(bar, 'Publication layout', '.tc-preview-stephania');
    publication.className = 'tc-figure-publication';
    separator();
    // The figure document's own history buttons (canvas_preview.js builds them in the page's object
    // inspector), never a Draft plot editor's (plot_editor.js uses the same data-history attribute).
    // TeamCanvasCompose.history() (canvas_preview.js) is the source: it holds in every layout, not only in
    // Free layout where the inspector's buttons exist.
    var historyButtons = ['undo', 'redo'].map(function (kind) {
      var b = button(bar, kind === 'undo' ? 'Undo' : 'Redo', function () {
        var api = window.TeamCanvasCompose;
        if (api && typeof api[kind] === 'function') api[kind]();
        else { var source = find('.tc-free-inspector [data-history="' + kind + '"]'); if (source && !source.disabled) source.click(); }
        sync();
      });
      return {kind: kind, button: b};
    });
    function syncHistory() {
      var api = window.TeamCanvasCompose, state = api && typeof api.history === 'function' ? api.history() : null;
      historyButtons.forEach(function (h) {
        var source = find('.tc-free-inspector [data-history="' + h.kind + '"]');
        var off = state ? !state[h.kind] : (!source || !!source.disabled);
        if (h.button.disabled !== off) h.button.disabled = off;
      });
    }
    separator(); proxy(bar, '← Back to draft', '.tc-preview-back');
    var here = document.createElement('span'); here.textContent = 'Figure page'; here.setAttribute('aria-current','page'); bar.appendChild(here);
    var exports = menu('Export figure ▾');
    ['SVG','PDF','Print'].forEach(function (name) { proxy(exports, name, '.tc-preview-' + name.toLowerCase()); });
    var reason = document.createElement('p'); reason.className = 'tc-figure-export-reason'; exports.appendChild(reason);
    var waits = document.createElement('span'); waits.className = 'tc-figure-waits'; bar.appendChild(waits);
    var more = menu('⋯'); more.previousElementSibling.setAttribute('aria-label','More figure options');
    var compactPublication = proxy(more, 'Publication layout', '.tc-preview-stephania'); compactPublication.className = 'tc-figure-publication-overflow';
    button(more, 'Page setup', function () {
      window.dispatchEvent(new CustomEvent('team-figure-open-tab', {detail:{tab:'page'}}));
      var settings = find('.tc-page-settings'); if (settings) settings.open = true;
      var layout = find('.tc-preview-layout'); if (layout && document.activeElement !== layout) layout.focus();
    });
    proxy(more, 'Show page header and footer', '.tc-preview-furniture', true);
    proxy(more, 'Page guides', '.tc-free-inspector > .tc-property-check input', true);
    proxy(more, 'Expand canvas', '.tc-focus-toggle');
    // Keep help local: the Draft help can live inside its closed overflow menu.
    var help = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = 'Canvas help'; help.appendChild(summary);
    var originalHelp = find('.tc-save-help');
    if (originalHelp) Array.from(originalHelp.children).forEach(function (child) { if (child.tagName !== 'SUMMARY') help.appendChild(child.cloneNode(true)); });
    more.appendChild(help);
    var hint = document.createElement('div'); hint.className = 'tc-figure-hint';
    hint.appendChild(document.createTextNode('Figure page: only finished plots are placed here'));
    var chip = button(hint, '', function () { window.dispatchEvent(new CustomEvent('team-figure-open-tab', {detail:{tab:'plots'}})); });
    chip.className = 'tc-figure-excluded-chip'; host.appendChild(hint);
    function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
    function sync() {
      var slot = document.getElementById('tc-figure-toolbar-slot');
      if (slot && host.parentNode !== slot) slot.appendChild(host);
      host.hidden = panel.hidden;
      // Standalone the host is a box: compact under 1000 px. In the shell's header row (canvas_preview.css,
      // from 901 px) host and slot lay out as their contents, and the bar shares the row with the page
      // strip: compact when the full bar does not fit its share of the row (as the Draft's fitTools).
      var boxed = host.getClientRects().length > 0, compact = window.innerWidth <= 1280;
      if (!compact && boxed) compact = host.clientWidth < 1000;
      else if (!compact && !host.hidden) { host.classList.remove('is-compact'); compact = bar.scrollWidth > bar.clientWidth + 1; }
      host.classList.toggle('is-compact', compact);
      if (host.hidden) close();
      syncHistory();
      proxies.forEach(function (p) {
        var source = find(p.selector), disabled = !source || !!source.disabled;
        if (p.button.disabled !== disabled) p.button.disabled = disabled;
        if (p.check) p.button.setAttribute('aria-pressed', String(!!(source && source.checked)));
      });
      var note = find('.tc-compose-excluded'), match = note && note.textContent.match(/^(\d+) plot/), count = match ? Number(match[1]) : 0;
      // A non-Free layout can show an empty state instead of rendering the banner.
      // Read the same inclusion/readiness flags without changing scientific state.
      if (!note && window.TeamCanvas && typeof window.TeamCanvas.previewState === 'function') {
        try {
          var state = window.TeamCanvas.previewState(), unusable = (state.unusable || []).map(function (u) { return u.id; });
          count = (state.state.nodes || []).filter(function (n) {
            var included = !window.TeamCanvasTabs || typeof window.TeamCanvasTabs.included !== 'function' || window.TeamCanvasTabs.included(n.id);
            return included && (!n.finished || n.finished.stale || unusable.indexOf(n.id) >= 0);
          }).length;
        } catch (ignore) { /* The original controls retain their unavailable state. */ }
      }
      chip.hidden = waits.hidden = !count;
      setText(chip, count + ' plots not finished — open Plots ›');
      setText(waits, 'Export waits · ' + count + ' plots');
      setText(reason, count ? 'Export waits · ' + count + ' plots not finished. Finish them in Draft or uncheck them in Plots.' : 'Exports the figure page as composed. SVG requires Free layout.');
    }
    var controls = panel.querySelector('.tc-preview-toolbar'); controls.before(host);
    root.classList.add('tc-has-figure-toolbar');
    function schedule() { if (!frame) frame = requestAnimationFrame(function () { frame = 0; sync(); }); }
    // Ignore our own mutations; original controls remain the source of truth even when moved.
    new MutationObserver(function (records) {
      if (records.some(function (r) { return !host.contains(r.target); })) schedule();
    }).observe(root, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['disabled','hidden','class','checked']});
    if (window.ResizeObserver) { var watch = new ResizeObserver(schedule); watch.observe(host); watch.observe(bar); }
    window.addEventListener('resize', schedule);
    root.addEventListener('change', schedule);
    window.addEventListener('team-canvas-mode', schedule);
    document.addEventListener('click', function (e) { if (!host.contains(e.target)) close(); });
    // The original controls are hidden under this bar (figure_toolbar.css). Their other entry points (Draft
    // Shapes, the rail's Text & shapes, the empty page's Choose a shape, TeamCanvasCompose.openShapes) open
    // the original shape menu and focus its summary; canvas_preview.js returns focus to the original
    // Publication layout trigger when its confirmation is cancelled. Both land on the visible replacement.
    var originalShapes = root.querySelector('.tc-shape-menu'), shapesMenu = menus[0];
    function openShapes() {
      if (host.hidden || !shapesMenu.trigger.getClientRects().length) return false;
      close(shapesMenu); shapesMenu.body.hidden = false; shapesMenu.trigger.setAttribute('aria-expanded', 'true'); sync();
      var first = shapesMenu.body.querySelector('button:not(:disabled)'); (first || shapesMenu.trigger).focus();
      return true;
    }
    originalShapes.addEventListener('toggle', function () {
      if (!originalShapes.open) return;
      // The figure page may still be switching in: wait for it to lay out.
      requestAnimationFrame(function () { sync(); if (openShapes()) originalShapes.open = false; });
    });
    // A hidden control cannot take focus (focus() does nothing), so the Draft-era callers that focus the
    // original shape summary leave focus where it was; the toggle above handles them. The confirmation's
    // Cancel focuses the hidden original trigger: focus falls to the body as the box is removed. Then the
    // visible Publication layout (or the ⋯ that holds it) takes it.
    var lastFocus = null;
    root.addEventListener('focusin', function (e) { lastFocus = e.target; });
    new MutationObserver(function (records) {
      var closed = records.some(function (r) { return Array.prototype.some.call(r.removedNodes, function (n) { return n.nodeType === 1 && n.classList.contains('tc-publication-confirmation') && lastFocus && n.contains(lastFocus); }); });
      if (!closed || (document.activeElement && document.activeElement !== document.body)) return;
      var target = [publication, compactPublication, more.previousElementSibling].find(function (b) { return b.getClientRects().length && !b.closest('[hidden]'); });
      if (target) target.focus();
    }).observe(panel, {childList: true});
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
