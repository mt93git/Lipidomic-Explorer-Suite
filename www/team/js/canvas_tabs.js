/* Canvas tabs (Team shell only). Every card belongs to exactly one tab; only the
   active tab's cards are shown, and each tab keeps its own camera (zoom and
   scroll), so the viewport, Fit all, Arrange and the minimap work per tab.
   State lives in TeamCanvasTabsModel; canvas.js saves it with the workspace and
   records it in the canvas undo history. No Shiny input is created or renamed. */
(function () {
  'use strict';
  var M = window.TeamCanvasTabsModel; if (!M) return;
  var state = M.initial([]), root, main, board, scroll, shell, bar, list, status, cameras = {}, pendingCopies = [], mounted = false, applying = false, restoring = false;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function nodeKey(node) { return node.dataset.canvasOrderId || node.dataset.plotId || ''; }
  function nodes() { return board ? Array.from(board.querySelectorAll('.tc-node')) : []; }
  function nodeIds() { return nodes().map(nodeKey).filter(Boolean); }
  function nodeFor(id) { return nodes().find(function (n) { return nodeKey(n) === id; }) || null; }
  function labelFor(id) { var n = nodeFor(id), h = n && n.querySelector('.tc-node-head strong'); return String((h && h.textContent) || id).trim().slice(0, 80) || id; }
  function tell(message) { if (status) { status.textContent = message; status.classList.add('is-visible'); } }
  // Uses the card's own Remove (or Return) action, so canvas.js cleans up as usual.
  function removeCard(id) { var n = nodeFor(id), b = n && Array.from(n.querySelectorAll('button')).find(function (x) { return /^(Remove|Return)$/.test(x.textContent.trim()); }); if (b) b.click(); }
  function canvasApi() { return window.TeamCanvas || {}; }
  function canonical() { var c = canvasApi(); return c.creationOrder ? c.creationOrder() : nodeIds(); }
  // Picker edits (selection, order) and navigation are saved but kept out of the canvas undo.
  function quiet() { var c = canvasApi(); if (c.tabsChanged) c.tabsChanged(true); render(); }
  function viewport() { return window.TeamCanvasViewport || null; }

  // ---- Undo integration: canvas.js snapshots the tab state with the layout.
  function before() { var c = canvasApi(); if (c.tabsWillChange) c.tabsWillChange(); }
  function after() { var c = canvasApi(); if (c.tabsChanged) c.tabsChanged(); render(); }

  // ---- Camera per tab.
  function saveCamera(id) { var v = viewport(); if (!scroll || !v) return; cameras[id] = {scale: Number(v.scale) || 1, left: scroll.scrollLeft, top: scroll.scrollTop}; }
  function loadCamera(id) {
    var v = viewport(), cam = cameras[id]; if (!v || !scroll) return;
    if (cam) { if (v.setScale) v.setScale(cam.scale); scroll.scrollLeft = cam.left; scroll.scrollTop = cam.top; if (v.refresh) v.refresh(); }
    else if (v.fitAll) v.fitAll();
  }

  // ---- Show only the active tab's cards.
  function apply() {
    if (!board) return;
    // A card on the board that no tab lists (an undo keeps new cards alive) joins the active tab.
    M.adopt(state, nodeIds(), state.active);
    var active = M.tabOf(state, state.active), shown = [], closeSelection = false;
    applying = true;
    try {
      nodes().forEach(function (n) {
        var id = nodeKey(n); if (!id) return;
        var hide = active.nodes.indexOf(id) < 0;
        if (n.classList.contains('tc-tab-hidden') !== hide) { n.classList.toggle('tc-tab-hidden', hide); if (!hide) shown.push(id); }
        if (hide && n.classList.contains('is-selected')) closeSelection = true;
      });
    } finally { applying = false; }
    var sel = canvasApi().selected ? canvasApi().selected() : null, selNode = sel && nodes().find(function (n) { return n.dataset.plotId === sel.id; });
    if (selNode && selNode.classList.contains('tc-tab-hidden')) closeSelection = true;
    // A selected card that leaves the view also leaves the inspector.
    if (closeSelection) {
      closeHiddenSelection();
      // The shell re-opens the inspector a tick after a selection event; check again after it.
      setTimeout(closeHiddenSelection, 50);
    }
    if (shell) { shell.setAttribute('aria-labelledby', 'tc-canvas-tab-' + state.active); }
    var empty = board.querySelector('.tc-empty');
    if (empty) empty.classList.toggle('tc-tab-empty', !active.nodes.length && nodes().length > 0);
    if (shown.length && canvasApi().fitPlot) requestAnimationFrame(function () { shown.forEach(function (id) { canvasApi().fitPlot(id); }); });
    var v = viewport(); if (v && v.refresh) v.refresh();
  }

  function closeHiddenSelection() {
    var hidden = board && board.querySelector('.tc-node.tc-tab-hidden.is-selected'), sel = canvasApi().selected ? canvasApi().selected() : null;
    var selHidden = sel && nodes().some(function (n) { return n.dataset.plotId === sel.id && n.classList.contains('tc-tab-hidden'); });
    if (!hidden && !selHidden) return;
    if (selHidden && canvasApi().deselect) canvasApi().deselect();
    var x = root.querySelector('[aria-label="Close object properties"]'); if (x && x.getClientRects().length) x.click();
    if (hidden) hidden.classList.remove('is-selected');
  }
  function activate(id, focus) {
    if (id === state.active) { if (focus) focusTab(id); return; }
    saveCamera(state.active);
    M.setActive(state, id);
    apply(); render(); requestAnimationFrame(function () { loadCamera(id); });
    if (focus) focusTab(id);
    // Switching tabs is navigation, not an edit, but the active tab is saved.
    var c = canvasApi(); if (c.tabsChanged) c.tabsChanged(true);
  }
  function focusTab(id) { var t = list && list.querySelector('[data-tab-id="' + id + '"]'); if (t) t.focus(); }

  // ---- Tab bar.
  function render() {
    if (!list) return;
    var focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.tc-canvas-tab');
    var focusId = focused && focused.dataset.tabId;
    list.replaceChildren();
    state.tabs.forEach(function (t, i) {
      var b = el('button', 'tc-canvas-tab'); b.type = 'button'; b.id = 'tc-canvas-tab-' + t.id; b.dataset.tabId = t.id;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(t.id === state.active)); b.tabIndex = t.id === state.active ? 0 : -1;
      if (shell && shell.id) b.setAttribute('aria-controls', shell.id);
      b.draggable = true;
      var n = t.nodes.length, name = el('span', 'tc-canvas-tab-name', t.name), count = el('span', 'tc-canvas-tab-count', String(n));
      count.setAttribute('aria-hidden', 'true');
      b.append(name, count, el('span', 'tc-sr-only', ' (' + n + ' card' + (n === 1 ? '' : 's') + ')'));
      b.addEventListener('click', function () { activate(t.id, false); });
      b.addEventListener('dblclick', function (e) { e.preventDefault(); startRename(t.id); });
      b.addEventListener('keydown', function (e) { tabKey(e, t, i); });
      b.addEventListener('dragstart', function (e) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-canvas-tab', t.id); b.classList.add('is-dragging'); });
      b.addEventListener('dragend', function () { b.classList.remove('is-dragging'); list.querySelectorAll('.is-drop-target').forEach(function (x) { x.classList.remove('is-drop-target'); }); });
      b.addEventListener('dragover', function (e) { if (Array.from(e.dataTransfer.types || []).indexOf('text/x-canvas-tab') < 0) return; e.preventDefault(); b.classList.add('is-drop-target'); });
      b.addEventListener('dragleave', function () { b.classList.remove('is-drop-target'); });
      b.addEventListener('drop', function (e) { var id = e.dataTransfer.getData('text/x-canvas-tab'); if (!id) return; e.preventDefault(); b.classList.remove('is-drop-target'); reorder(id, state.tabs.findIndex(function (x) { return x.id === t.id; })); });
      list.appendChild(b);
    });
    if (focusId) focusTab(focusId);
    bar.querySelectorAll('[data-needs-two]').forEach(function (b) { b.disabled = state.tabs.length < 2; });
    var add = bar.querySelector('.tc-canvas-tab-add'); if (add) add.disabled = state.tabs.length >= M.MAX_TABS;
  }
  function tabKey(e, t, i) {
    var n = state.tabs.length, k = e.key;
    if ((e.altKey || e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); reorder(t.id, i + (k === 'ArrowLeft' ? -1 : 1)); focusTab(t.id); return; }
    var next = k === 'ArrowRight' ? (i + 1) % n : k === 'ArrowLeft' ? (i + n - 1) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
    if (next >= 0) { e.preventDefault(); activate(state.tabs[next].id, true); return; }
    if (k === 'F2' || k === 'Enter') { e.preventDefault(); startRename(t.id); return; }
    if (k === 'Delete') { e.preventDefault(); confirmDelete(t.id); }
  }
  function reorder(id, to) { before(); if (M.reorder(state, id, to)) { after(); tell('Moved tab “' + M.tabOf(state, id).name + '” to position ' + (state.tabs.findIndex(function (t) { return t.id === id; }) + 1) + '.'); } }
  function addTab() {
    saveCamera(state.active); before(); var r = M.addTab(state); if (!r.ok) { tell(r.message); return; }
    apply(); after(); requestAnimationFrame(function () { loadCamera(r.id); }); focusTab(r.id);
    tell('Added tab “' + M.tabOf(state, r.id).name + '”. New plots go to this tab. To rename it, double-click the tab or press F2.');
  }
  function startRename(id) {
    var b = list.querySelector('[data-tab-id="' + id + '"]'); if (!b) return;
    var t = M.tabOf(state, id), input = el('input', 'tc-canvas-tab-input'); input.type = 'text'; input.value = t.name; input.maxLength = M.MAX_NAME;
    input.setAttribute('aria-label', 'Tab name (up to ' + M.MAX_NAME + ' characters)');
    var done = false;
    function finish(save) {
      if (done) return; done = true;
      if (save && input.value.trim() !== t.name) {
        before(); var r = M.rename(state, id, input.value);
        if (!r.ok) { tell(r.message); render(); focusTab(id); return; }
        after(); focusTab(id);
        tell('Renamed to “' + r.name + '”.' + (r.duplicate ? ' Another tab already has this name.' : ''));
      } else { render(); focusTab(id); }
    }
    input.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    input.addEventListener('blur', function () { finish(true); });
    b.replaceWith(input); input.focus(); input.select();
  }
  function duplicate(id) {
    var c = canvasApi(); saveCamera(state.active); before(); var r = M.duplicateTab(state, id); if (!r.ok) { tell(r.message); return; }
    var copied = 0, skipped = 0;
    r.sources.forEach(function (nid) { var iid = c.copyPlotAsInstance && c.copyPlotAsInstance(nid); if (iid) { pendingCopies.push({instance: iid, tab: r.id, at: Date.now()}); copied++; } else skipped++; });
    apply(); after(); requestAnimationFrame(function () { loadCamera(r.id); }); focusTab(r.id);
    tell('Duplicated as “' + M.tabOf(state, r.id).name + '”.' + (copied ? ' Copying ' + copied + ' plot' + (copied === 1 ? '' : 's') + '…' : '') + (skipped ? ' ' + skipped + ' card' + (skipped === 1 ? '' : 's') + ' could not be copied (illustrations, plots without an independent copy, or the 40-figure limit).' : ''));
  }

  // ---- Delete with a confirmation that offers to keep the cards.
  var dialog = null;
  function closeDialog(focusId) { if (dialog) { dialog.remove(); dialog = null; } if (focusId) focusTab(focusId); }
  function confirmDelete(id) {
    if (state.tabs.length < 2) { tell('The last canvas tab cannot be deleted.'); return; }
    closeDialog(); var t = M.tabOf(state, id), count = t.nodes.length, others = state.tabs.filter(function (x) { return x.id !== id; });
    dialog = el('div', 'tc-canvas-tab-dialog'); dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-modal', 'false'); dialog.setAttribute('aria-labelledby', 'tc-tab-del-title');
    var h = el('strong', '', 'Delete tab “' + t.name + '”?'); h.id = 'tc-tab-del-title'; dialog.appendChild(h);
    var moveSelect = null, keep = null;
    if (count) {
      dialog.appendChild(el('p', '', 'It holds ' + count + ' card' + (count === 1 ? '' : 's') + '.'));
      var keepLabel = el('label', 'tc-tab-del-choice'); keep = el('input'); keep.type = 'radio'; keep.name = 'tc-tab-del'; keep.checked = true; keepLabel.append(keep, document.createTextNode(' Move the cards to '));
      moveSelect = el('select'); moveSelect.setAttribute('aria-label', 'Tab that receives the cards'); others.forEach(function (o) { var op = el('option', '', o.name); op.value = o.id; moveSelect.appendChild(op); }); keepLabel.appendChild(moveSelect);
      var dropLabel = el('label', 'tc-tab-del-choice'), drop = el('input'); drop.type = 'radio'; drop.name = 'tc-tab-del'; dropLabel.append(drop, document.createTextNode(' Remove the cards too (copies are deleted, original plots go back to the library; cannot be undone)'));
      moveSelect.addEventListener('change', function () { keep.checked = true; });
      dialog.append(keepLabel, dropLabel);
    } else dialog.appendChild(el('p', '', 'The tab is empty. You can undo this.'));
    var yes = el('button', 'tc-tab-del-confirm', 'Delete tab'); yes.type = 'button'; var no = el('button', '', 'Cancel'); no.type = 'button';
    yes.addEventListener('click', function () {
      var moveTo = !count || (keep && keep.checked) ? (moveSelect ? moveSelect.value : others[0].id) : null;
      saveCamera(state.active); before(); var r = M.deleteTab(state, id, moveTo); if (!r.ok) { tell(r.message); closeDialog(id); return; }
      closeDialog(); delete cameras[id];
      r.removed.forEach(removeCard);
      if (moveTo) t.nodes.forEach(function (nid) { var n = nodeFor(nid); if (n) placeAtEnd(n, moveTo); });
      apply(); after(); requestAnimationFrame(function () { loadCamera(state.active); }); focusTab(state.active);
      tell('Deleted tab “' + t.name + '”.' + (count ? (moveTo ? ' Its cards moved to “' + M.tabOf(state, moveTo).name + '”.' : ' Its cards were removed from the canvas.') : ''));
    });
    no.addEventListener('click', function () { closeDialog(id); });
    dialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(id); } });
    var row = el('div', 'tc-tab-del-actions'); row.append(yes, no); dialog.appendChild(row);
    bar.appendChild(dialog); (keep || yes).focus();
  }

  // ---- Tab menu (rename, duplicate, delete, move) for the active tab.
  function menuButton() {
    var wrap = el('div', 'tc-canvas-tab-menu'), trigger = el('button', 'tc-canvas-tab-more', '⋯'); trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Tab actions'); trigger.setAttribute('aria-expanded', 'false');
    var menu = el('div', 'tc-canvas-tab-actions'); menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Tab actions'); menu.hidden = true; trigger.setAttribute('aria-controls', menu.id = 'tc-canvas-tab-actions');
    function item(label, fn, needsTwo) { var b = el('button', '', label); b.type = 'button'; if (needsTwo) b.dataset.needsTwo = '1'; b.addEventListener('click', function () { close(); fn(state.active); }); menu.appendChild(b); return b; }
    function close() { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
    item('Rename…', startRename); item('Duplicate tab', duplicate);
    item('Move tab left', function (id) { reorder(id, state.tabs.findIndex(function (t) { return t.id === id; }) - 1); }, true);
    item('Move tab right', function (id) { reorder(id, state.tabs.findIndex(function (t) { return t.id === id; }) + 1); }, true);
    item('Delete tab…', confirmDelete, true);
    trigger.addEventListener('click', function (e) { e.stopPropagation(); var open = menu.hidden; menu.hidden = !open; trigger.setAttribute('aria-expanded', String(open)); if (open) { var first = menu.querySelector('button:not(:disabled)'); if (first) first.focus(); } });
    menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); trigger.focus(); } });
    wrap.addEventListener('focusout', function (e) { if (!menu.hidden && e.relatedTarget && !wrap.contains(e.relatedTarget)) close(); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    wrap.append(trigger, menu); return wrap;
  }

  // ---- Cards: Move to tab… / Copy to tab…, drag onto a tab, new cards to the active tab.
  function moveCard(id, tabId) {
    var node = nodeFor(id), target = M.tabOf(state, tabId); if (!node) return;
    before(); if (!M.moveNode(state, id, tabId)) return;
    placeAtEnd(node, tabId); apply(); after(); focusTab(tabId);
    tell('Moved “' + labelFor(id) + '” to “' + target.name + '”. Choose that tab to see it.');
  }
  function copyCard(id, tabId) {
    var c = canvasApi();
    var iid = c.copyPlotAsInstance && c.copyPlotAsInstance(id);
    if (!iid) { tell('This card could not be copied. Only plots with an independent copy can be copied, up to 40 figures.'); return; }
    pendingCopies.push({instance: iid, tab: tabId, at: Date.now()});
    tell('Copying “' + labelFor(id) + '” to “' + M.tabOf(state, tabId).name + '”…');
  }
  // A card that arrives in another tab goes below that tab's cards.
  function placeAtEnd(node, tabId) {
    var bottom = 30; M.tabOf(state, tabId).nodes.forEach(function (nid) { var n = nodeFor(nid); if (!n || n === node) return; bottom = Math.max(bottom, (parseFloat(n.style.top) || 0) + (parseFloat(n.style.height) || n.offsetHeight || 0) + 30); });
    node.style.left = '30px'; node.style.top = bottom + 'px';
  }
  function cardPicker(id, mode, anchor) {
    closePicker(); var others = state.tabs.filter(function (t) { return t.nodes.indexOf(id) < 0 || mode === 'copy'; });
    var pop = el('div', 'tc-tab-picker'); pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', (mode === 'move' ? 'Move' : 'Copy') + ' to tab');
    pop.appendChild(el('span', 'tc-tab-picker-title', mode === 'move' ? 'Move to tab' : 'Copy to tab'));
    others.forEach(function (t) { var b = el('button', '', t.name + (t.id === state.active ? ' (this tab)' : '')); b.type = 'button'; b.addEventListener('click', function () { closePicker(); (mode === 'move' ? moveCard : copyCard)(id, t.id); }); pop.appendChild(b); });
    var fresh = el('button', 'tc-tab-picker-new', '+ New tab'); fresh.type = 'button';
    fresh.addEventListener('click', function () { closePicker(); var keep = state.active; before(); var r = M.addTab(state); if (!r.ok) { tell(r.message); return; } state.active = keep; after(); (mode === 'move' ? moveCard : copyCard)(id, r.id); });
    pop.appendChild(fresh);
    // The picker sits inside the card: keep its clicks from re-selecting the card that just moved.
    ['click', 'pointerdown', 'mousedown', 'focusin'].forEach(function (type) { pop.addEventListener(type, function (e) { e.stopPropagation(); }); });
    pop.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); anchor.focus(); } });
    pop.addEventListener('focusout', function (e) { if (e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== anchor) closePicker(); });
    anchor.after(pop); picker = pop; var first = pop.querySelector('button'); if (first) first.focus();
  }
  var picker = null;
  function closePicker() { if (picker) { picker.remove(); picker = null; } }
  document.addEventListener('click', function (e) { if (picker && !picker.contains(e.target) && !e.target.closest('.tc-tab-card-action')) closePicker(); });
  function decorate(node) {
    if (node.dataset.tabActions) return;
    var actions = Array.from(node.querySelectorAll('button')).find(function (b) { return /^(Remove|Return|Duplicate|Copy)$/.test(b.textContent.trim()); });
    if (!actions) return; node.dataset.tabActions = '1';
    var host = actions.parentElement, id = nodeKey(node);
    [['move', 'Move to tab…'], ['copy', 'Copy to tab…']].forEach(function (m) {
      if (m[0] === 'copy' && !Array.from(host.children).some(function (b) { return b.textContent.trim() === 'Copy'; })) return;
      var b = el('button', 'tc-tab-card-action', m[1]); b.type = 'button'; b.dataset.tabAction = m[0];
      b.addEventListener('click', function (e) { e.stopPropagation(); cardPicker(nodeKey(node) || id, m[0], b); });
      host.appendChild(b);
    });
  }
  function observe() {
    new MutationObserver(function (events) {
      var added = [], removed = [];
      events.forEach(function (ev) {
        ev.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.classList.contains('tc-node')) added.push(n); });
        ev.removedNodes.forEach(function (n) { if (n.nodeType === 1 && n.classList.contains('tc-node')) removed.push(n); });
      });
      // A card removed or returned to the library leaves its tab, so counts stay right and a
      // re-added plot joins the active tab. Restores replace the tab state themselves.
      var lost = restoring ? [] : removed.map(nodeKey).filter(function (id) { return id && !nodeFor(id); });
      if (!added.length && !lost.length) return;
      lost.forEach(function (id) { M.forget(state, id); });
      added.forEach(function (n) {
        var id = nodeKey(n); if (!id || !n.isConnected) return; decorate(n);
        if (M.tabForNode(state, id)) return;
        // Copies sent to another tab are matched by their own instance id.
        var now = Date.now(); pendingCopies = pendingCopies.filter(function (p) { return now - p.at < 300000 && state.tabs.some(function (t) { return t.id === p.tab; }); });
        var match = pendingCopies.find(function (p) { return id === p.instance || id.indexOf(p.instance + '-') === 0 || n.id === p.instance || (n.dataset.instanceId || '') === p.instance; });
        if (match) pendingCopies.splice(pendingCopies.indexOf(match), 1);
        var target = match ? match.tab : state.active;
        M.assign(state, id, target);
        if (target !== state.active) { placeAtEnd(n, target); tell('Copied “' + labelFor(id) + '” to “' + M.tabOf(state, target).name + '”.'); }
      });
      apply(); render(); var c = canvasApi(); if (c.tabsChanged) c.tabsChanged(true);
    }).observe(board, {childList: true});
  }
  // Dragging a card by its header onto a tab moves it there (it keeps its place on the canvas).
  function dragToTabs() {
    var drag = null;
    board.addEventListener('pointerdown', function (e) {
      var head = e.target.closest('.tc-node-head,.tc-node-header,header'), node = e.target.closest('.tc-node');
      if (!node || !head || e.target.closest('button,input,select,textarea') || e.button !== 0) return;
      drag = {node: node, left: node.style.left, top: node.style.top, over: null};
    }, true);
    document.addEventListener('pointermove', function (e) {
      if (!drag) return; var hit = document.elementFromPoint(e.clientX, e.clientY), tab = hit && hit.closest && hit.closest('.tc-canvas-tab');
      if (drag.over && drag.over !== tab) drag.over.classList.remove('is-drop-target');
      drag.over = tab && tab.dataset.tabId !== state.active ? tab : null; if (drag.over) drag.over.classList.add('is-drop-target');
      bar.classList.toggle('is-card-drag', true);
    }, true);
    function end() {
      if (!drag) return; var d = drag; drag = null; bar.classList.remove('is-card-drag');
      if (!d.over) return; d.over.classList.remove('is-drop-target');
      d.node.style.left = d.left; d.node.style.top = d.top;
      moveCard(nodeKey(d.node), d.over.dataset.tabId);
    }
    document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', function () { if (drag && drag.over) drag.over.classList.remove('is-drop-target'); drag = null; if (bar) bar.classList.remove('is-card-drag'); }, true);
  }

  // ---- Public API used by canvas.js (save/restore/undo) and the figure page.
  window.TeamCanvasTabs = {
    // canvas.js: the tab field for a save (null keeps the classic single-canvas format).
    serialize: function (ids) { return M.serialize(state, ids || nodeIds()); },
    snapshot: function () { return JSON.stringify(state); },
    // Undo/redo restores tabs and membership; the figure-page selection and order are not canvas edits and stay.
    applySnapshot: function (json) { try { var next = JSON.parse(json); if (!next || !Array.isArray(next.tabs) || !next.tabs.length) return; saveCamera(state.active); var prev = state.active; next.figure = M.clone(state.figure); if (!next.tabs.some(function (t) { return t.id === next.active; })) next.active = next.tabs[0].id; state = next; apply(); render(); if (prev !== state.active) requestAnimationFrame(function () { loadCamera(state.active); }); } catch (e) { /* keep the current tabs */ } },
    // canvas.js restore: returns the ids shown first (the active tab).
    restore: function (raw, ids) { state = M.validate(raw, ids); cameras = {}; pendingCopies = []; restoring = true; setTimeout(function () { restoring = false; }, 0); if (mounted) { apply(); render(); } return M.tabOf(state, state.active).nodes.slice(); },
    activeIds: function () { return M.tabOf(state, state.active).nodes.slice(); },
    isVisible: function (id) { return M.tabForNode(state, id) === state.active || !M.tabForNode(state, id); },
    state: function () { return M.clone(state); },
    activate: function (id) { activate(id, false); },
    add: addTab, rename: function (id, name) { before(); var r = M.rename(state, id, name); if (r.ok) after(); return r; },
    remove: function (id, moveTo) { saveCamera(state.active); before(); var r = M.deleteTab(state, id, moveTo || null); if (r.ok) { r.removed.forEach(removeCard); apply(); after(); } return r; },
    duplicate: duplicate, reorder: reorder, moveCard: moveCard, copyCard: copyCard,
    // Figure page: groups by tab, the default/custom order and the selection.
    groups: function () { var ids = nodeIds(), order = canonical(); return state.tabs.map(function (t) { return {id: t.id, name: t.name, nodes: M.tabNodes(t, order).filter(function (n) { return ids.indexOf(n) >= 0; })}; }); },
    figureOrder: function () { var ids = nodeIds(); return M.figureOrder(state, canonical()).filter(function (n) { return ids.indexOf(n) >= 0; }); },
    included: function (id) { return M.included(state, id); },
    setIncluded: function (id, on) { if (M.setIncluded(state, id, on)) quiet(); },
    setTabIncluded: function (tabId, on) { if (M.setTabIncluded(state, tabId, on)) quiet(); },
    moveInOrder: function (id, delta) { if (M.moveInOrder(state, id, delta, canonical())) quiet(); },
    resetOrder: function () { if (M.resetOrder(state)) quiet(); },
    label: labelFor
  };

  function mount() {
    if (mounted) return true;
    if (!window.LIPIDOMIC_TEAM_WORKSPACE) return false;
    root = document.getElementById('team-canvas-root'); if (!root || root.dataset.tsShell !== 'true') return false;
    main = root.querySelector('.tc-main'); board = root.querySelector('.tc-board'); scroll = root.querySelector('.tc-scroll'); shell = root.querySelector('.tc-viewport-shell'); status = root.querySelector('.tc-status');
    if (!main || !board || !shell) return false;
    mounted = true;
    if (!shell.id) shell.id = 'tc-canvas-tabpanel';
    shell.setAttribute('role', 'tabpanel');
    bar = el('div', 'tc-tabbar'); list = el('div', 'tc-canvas-tablist'); list.setAttribute('role', 'tablist'); list.setAttribute('aria-label', 'Canvas tabs');
    var add = el('button', 'tc-canvas-tab-add', '+'); add.type = 'button'; add.setAttribute('aria-label', 'Add canvas tab'); add.addEventListener('click', addTab);
    bar.append(list, add, menuButton());
    main.classList.add('has-canvas-tabs'); main.insertBefore(bar, main.firstChild);
    // Cards present before mounting (a restore that already ran) keep their tab.
    state = M.prune(state, nodeIds());
    nodes().forEach(decorate);
    observe(); dragToTabs(); apply(); render();
    return true;
  }
  function start() { if (mount()) return; var tries = 0, timer = setInterval(function () { if (mount() || ++tries > 600) clearInterval(timer); }, 100); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
