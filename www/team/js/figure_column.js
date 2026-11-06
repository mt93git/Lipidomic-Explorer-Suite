/* Figure page right column (Team shell): Object / Plots · N / Page tabs.
   The panels hold the nodes canvas_preview.js already built (object inspector,
   the "Plots in this figure" picker, Page setup); they are moved, never rebuilt,
   so every handler stays with them. Mounts into #tc-figure-column when the shell
   provides it (before its .tc-companion-home, which is left untouched), otherwise
   builds a column at the top of the figure page. No Shiny input is created. */
(function () {
  'use strict';
  var root, panel, inspector, picker, settings, editor, column, card, cardCount, finishButton, uncheckButton, tabs = {}, panels = {}, active = 'object', lastSelected = null;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  // Checked plots that are not on the page, as capture() in canvas_preview.js decides:
  // listed as unusable, never finished, or finished with a stale snapshot. Figure order.
  function unfinished() {
    var result; try { result = window.TeamCanvas && TeamCanvas.previewState(); } catch (e) { return []; }
    if (!result || !result.state || !Array.isArray(result.state.nodes)) return [];
    var api = window.TeamCanvasTabs && typeof TeamCanvasTabs.figureOrder === 'function' ? TeamCanvasTabs : null;
    var ids = result.state.nodes.map(function (n) { return n.id; }), out = [];
    (Array.isArray(result.unusable) ? result.unusable : []).forEach(function (u) { if (ids.indexOf(u.id) >= 0 && out.indexOf(u.id) < 0) out.push(u.id); });
    result.state.nodes.forEach(function (n) { if ((!n.finished || n.finished.stale) && out.indexOf(n.id) < 0) out.push(n.id); });
    if (!api) return out;
    var order = api.figureOrder();
    return out.filter(function (id) { return api.included(id); }).sort(function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 1e6 : x) - (y < 0 ? 1e6 : y); });
  }

  function openTab(name, focus) {
    if (!tabs[name]) return;
    active = name;
    Object.keys(tabs).forEach(function (key) {
      var on = key === name; tabs[key].setAttribute('aria-selected', String(on)); tabs[key].tabIndex = on ? 0 : -1; panels[key].hidden = !on;
    });
    if (focus) tabs[name].focus();
  }

  function update() {
    if (!column) return;
    var api = window.TeamCanvasTabs, total = api && typeof api.figureOrder === 'function' ? api.figureOrder().length : 0;
    tabs.plots.textContent = total ? 'Plots · ' + total : 'Plots';
    var pending = unfinished(), n = pending.length;
    cardCount.hidden = !n;
    cardCount.textContent = n === 1 ? '1 checked plot is not finished yet; export waits for it.' : n + ' checked plots are not finished yet; export waits for them.';
    finishButton.disabled = uncheckButton.disabled = !n;
    // Rows keep their own badge; finished, checked rows say they are on the page.
    picker.querySelectorAll('.tc-figure-plots-row').forEach(function (row) {
      var box = row.querySelector('input[data-pick-key^="plot:"]'), label = row.querySelector('label'); if (!box || !label) return;
      var id = box.dataset.pickKey.slice(5), badge = label.querySelector('.tc-figure-plots-state'), mark = label.querySelector('.tc-fc-on-page'), on = box.checked && pending.indexOf(id) < 0 && !badge;
      if (!badge && box.checked && pending.indexOf(id) >= 0) { badge = el('span', 'tc-figure-plots-state', 'not finished'); label.appendChild(badge); on = false; }
      if (on && !mark) label.appendChild(el('span', 'tc-fc-on-page', '✓ on page'));
      else if (!on && mark) mark.remove();
    });
  }

  // Back to the draft, on the first unfinished card's tab, framed by the viewport camera.
  function finishInDraft() {
    var id = unfinished()[0]; if (!id) return;
    var tabsApi = window.TeamCanvasTabs;
    if (window.TeamCanvasCompose && TeamCanvasCompose.showDraft) TeamCanvasCompose.showDraft();
    if (tabsApi && typeof tabsApi.groups === 'function') {
      var group = tabsApi.groups().find(function (g) { return g.nodes.indexOf(id) >= 0; });
      if (group && tabsApi.state().active !== group.id) tabsApi.activate(group.id);
    }
    // canvas_tabs.js restores the tab camera on the next frame; frame the card after it.
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      var node = Array.from(root.querySelectorAll('.tc-node')).find(function (n) { return (n.dataset.canvasOrderId || n.dataset.plotId) === id; });
      if (node && window.TeamCanvasViewport && typeof TeamCanvasViewport.focusNode === 'function') TeamCanvasViewport.focusNode(node);
    }); });
  }

  function uncheckUnfinished() {
    var api = window.TeamCanvasTabs; if (!api || typeof api.setIncluded !== 'function') return;
    unfinished().forEach(function (id) { api.setIncluded(id, false); });
    update();
  }

  function build() {
    column = el('div', 'tc-fc'); column.setAttribute('data-figure-column', 'true');
    var list = el('div', 'tc-fc-tabs'); list.setAttribute('role', 'tablist'); list.setAttribute('aria-label', 'Figure page panels');
    [['object', 'Object'], ['plots', 'Plots'], ['page', 'Page']].forEach(function (pair, index, all) {
      var tab = el('button', 'tc-fc-tab', pair[1]), body = el('div', 'tc-fc-panel');
      tab.type = 'button'; tab.id = 'tc-fc-tab-' + pair[0]; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'tc-fc-panel-' + pair[0]);
      body.id = 'tc-fc-panel-' + pair[0]; body.setAttribute('role', 'tabpanel'); body.setAttribute('aria-labelledby', tab.id); body.dataset.panel = pair[0];
      tab.addEventListener('click', function () { openTab(pair[0], false); });
      tab.addEventListener('keydown', function (event) {
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : event.key === 'ArrowRight' ? (index + 1) % all.length : event.key === 'ArrowLeft' ? (index + all.length - 1) % all.length : -1;
        if (next >= 0) { event.preventDefault(); openTab(all[next][0], true); }
      });
      tabs[pair[0]] = tab; panels[pair[0]] = body; list.appendChild(tab);
    });
    column.appendChild(list);
    Object.keys(panels).forEach(function (key) { column.appendChild(panels[key]); });

    // Object: the inspector itself; outside Free layout it is hidden by canvas_preview.js.
    panels.object.append(el('p', 'tc-fc-empty', 'Object properties are available in Free layout. Choose it under Page.'), inspector);
    // Plots: the "finished" rule first, then the picker.
    card = el('section', 'tc-fc-howto'); card.setAttribute('aria-labelledby', 'tc-fc-howto-title');
    var title = el('h4', '', 'How plots get here'); title.id = 'tc-fc-howto-title';
    var rule = el('p'); rule.append('A plot is placed on the page when it is ', el('b', '', 'Finished'), ' in Draft and ', el('b', '', 'checked'), ' here.');
    cardCount = el('p', 'tc-fc-howto-count');
    var actions = el('div', 'tc-fc-howto-actions');
    finishButton = el('button', 'tc-fc-finish', '← Finish in Draft'); finishButton.type = 'button'; finishButton.addEventListener('click', finishInDraft);
    uncheckButton = el('button', 'tc-fc-uncheck', 'Uncheck unfinished'); uncheckButton.type = 'button'; uncheckButton.addEventListener('click', uncheckUnfinished);
    actions.append(finishButton, uncheckButton); card.append(title, rule, cardCount, actions);
    panels.plots.append(card, picker);
    // Page: the Page setup details with its controls, open in its own tab.
    settings.open = true; panels.page.appendChild(settings);
    editor.classList.add('tc-fc-inspector-moved');
    openTab(active, false);
  }

  // The shell column wins whenever it exists; the companion home stays its last child.
  function place() {
    if (!column) return;
    var host = document.getElementById('tc-figure-column');
    if (!host) {
      host = el('div', 'tc-figure-column-fallback'); host.id = 'tc-figure-column';
      var top = panel.querySelector('.tc-preview-toolbar'); if (top) top.after(host); else panel.prepend(host);
    }
    // Outside the shell's right column (no shell, or before it mounts) the host is part of the figure page.
    host.classList.toggle('tc-figure-column-fallback', !host.closest('.ts-inspector-column'));
    if (column.parentNode === host) return;
    var home = Array.from(host.children).find(function (c) { return c.classList.contains('tc-companion-home'); });
    if (home) host.insertBefore(column, home); else host.appendChild(column);
  }

  function showMode(figure) { if (column) column.hidden = !figure; }
  // Open a tab and make sure the column can take focus (inspector_toggle.js hides and inerts it).
  function reveal(name) {
    openTab(name, false);
    if (window.TeamInspectorToggle && typeof window.TeamInspectorToggle.reveal === 'function') window.TeamInspectorToggle.reveal();
  }

  function init() {
    root = document.getElementById('team-canvas-root'); panel = root && root.querySelector('#tc-preview-panel'); if (!panel || column) return;
    // In the shell canvas_preview.js has already moved these out of the panel into the right column's
    // .tc-figure-side (embedInShell runs when shell.js mounts, before this script): look in the root.
    inspector = root.querySelector('.tc-free-inspector'); picker = root.querySelector('.tc-figure-plots'); settings = root.querySelector('.tc-page-settings'); editor = root.querySelector('.tc-document-editor');
    if (!inspector || !picker || !settings || !editor) return; // canvas_preview.js did not build the figure page
    build(); place(); showMode(!panel.hidden); update();

    window.addEventListener('team-canvas-mode', function (event) {
      var figure = !!(event.detail && event.detail.mode === 'figure');
      place(); showMode(figure);
      if (!figure) return;
      update();
      // Entering with plots that are not on the page opens Plots.
      if (unfinished().length) openTab('plots', false);
    });
    window.addEventListener('team-canvas-changed', function () { if (!panel.hidden) update(); });
    // canvas_preview.js rebuilds the picker on each render.
    new MutationObserver(function () { if (!panel.hidden) update(); }).observe(picker, {childList: true, subtree: true});
    // A new selection on the page (click, keyboard, Layers, a new text or shape) opens Object;
    // re-renders keep the same selection, so Undo/Redo do not switch tabs.
    var pages = panel.querySelector('.tc-preview-pages');
    if (pages) new MutationObserver(function () {
      var chosen = pages.querySelector('.tc-free-item.selected'), id = chosen ? chosen.dataset.itemId : null;
      if (id && id !== lastSelected) openTab('object', false);
      lastSelected = id;
    }).observe(pages, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']});
    // Adding text focuses its field in the inspector, which must be showing first: the Object tab, and the
    // shell column itself when the inspector toggle has hidden it (it is inert then).
    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('.tc-preview-add-text,.tc-add-shape,.tc-compose-empty-hint button') && root.contains(event.target)) reveal('object');
    }, true);
    var compose = window.TeamCanvasCompose;
    if (compose && typeof compose.addText === 'function') { var addText = compose.addText; compose.addText = function () { reveal('object'); return addText.apply(this, arguments); }; }
    // Editing a text object (double click, canvas_preview.js focuses its text field): Object, shown, even
    // when the same object was already selected under another tab. Not in Move (pointer_mode.js), where
    // the double click never reaches the object.
    document.addEventListener('dblclick', function (event) {
      if (window.TeamCanvasPointerMode && window.TeamCanvasPointerMode.mode === 'hand') return;
      var item = event.target.closest && event.target.closest('.tc-free-item');
      if (item && panel.contains(item) && item.querySelector('.tc-paper-text')) reveal('object');
    }, true);
    // Toolbar requests (figure_toolbar.js: ⋯ Page setup, the unfinished-plots chip).
    window.addEventListener('team-figure-open-tab', function (event) {
      var name = event.detail && event.detail.tab; if (!tabs[name]) return;
      reveal(name);
      if (name === 'page') { settings.open = true; var layout = settings.querySelector('.tc-preview-layout') || settings.querySelector('select'); if (layout) layout.focus(); }
      else tabs[name].focus();
    });
    // Narrow screens: the "Object properties" toggle shows the Object tab.
    var toggle = panel.querySelector('.tc-inspector-toggle');
    if (toggle) toggle.addEventListener('click', function () { openTab('object', false); column.scrollIntoView({block: 'nearest'}); });
  }

  window.TeamFigureColumn = {
    open: function (name) { openTab(name, false); },
    active: function () { return active; },
    mount: function () { if (!column) init(); else place(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
