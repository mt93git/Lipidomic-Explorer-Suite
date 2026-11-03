/* Canvas tabs: pure state model (no DOM). Loaded in the browser as
   window.TeamCanvasTabsModel and required directly by the unit tests.

   Saved shape (optional `tabs` field of the canvas state, version "1"):
     {version:'1', active:'tab-1',
      tabs:[{id:'tab-1', name:'Canvas 1', nodes:['plot-id', ...]}, ...],
      figure:{deselected:['plot-id', ...], order:['plot-id', ...]}}
   A workspace with one tab named "Canvas 1", nothing deselected and no custom
   order serializes to null, so such saves stay byte-identical to saves made
   before tabs existed. A missing, unknown-version or malformed field falls
   back to that single default tab holding every card (positions untouched). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeamCanvasTabsModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1', MAX_TABS = 20, MAX_NAME = 40, DEFAULT_NAME = 'Canvas 1', FIRST_ID = 'tab-1';
  var ID = /^tab-[A-Za-z0-9_-]{1,40}$/, NODE = /^[A-Za-z][A-Za-z0-9_-]{0,159}$/;

  function clone(state) { return JSON.parse(JSON.stringify(state)); }
  function uniqueIds(list, allowed) {
    var seen = Object.create(null), out = [];
    (Array.isArray(list) ? list : []).forEach(function (id) {
      if (typeof id !== 'string' || !NODE.test(id) || seen[id] || (allowed && allowed.indexOf(id) < 0)) return;
      seen[id] = true; out.push(id);
    });
    return out;
  }
  // Any name: trimmed, at most 40 characters, no control characters. Returns null when empty.
  function cleanName(value) {
    if (typeof value !== 'string') return null;
    // Count characters, not UTF-16 units, so a cut never splits an emoji or other astral character.
    var name = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, MAX_NAME).join('').trim();
    return name ? name : null;
  }
  function initial(nodeIds) {
    return {version: VERSION, active: FIRST_ID, tabs: [{id: FIRST_ID, name: DEFAULT_NAME, nodes: uniqueIds(nodeIds)}], figure: {deselected: [], order: []}};
  }
  // Lenient by design: a bad field never blocks opening a checkpoint, it falls back.
  function validate(raw, nodeIds) {
    var ids = uniqueIds(nodeIds);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== VERSION || !Array.isArray(raw.tabs) || !raw.tabs.length || raw.tabs.length > MAX_TABS) return initial(ids);
    var seenTab = Object.create(null), owned = Object.create(null), tabs = [];
    for (var i = 0; i < raw.tabs.length; i++) {
      var t = raw.tabs[i];
      if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !ID.test(t.id) || seenTab[t.id]) return initial(ids);
      var name = cleanName(t.name); if (!name) return initial(ids);
      seenTab[t.id] = true;
      var nodes = uniqueIds(t.nodes, ids).filter(function (id) { if (owned[id]) return false; owned[id] = true; return true; });
      tabs.push({id: t.id, name: name, nodes: nodes});
    }
    // Cards the field does not mention (e.g. added by an older reader) join the first tab.
    ids.forEach(function (id) { if (!owned[id]) tabs[0].nodes.push(id); });
    var figure = raw.figure && typeof raw.figure === 'object' && !Array.isArray(raw.figure) ? raw.figure : {};
    return {version: VERSION, active: seenTab[raw.active] ? raw.active : tabs[0].id, tabs: tabs,
      figure: {deselected: uniqueIds(figure.deselected, ids), order: uniqueIds(figure.order, ids)}};
  }
  function prune(state, nodeIds) {
    var ids = uniqueIds(nodeIds), s = clone(state);
    s.tabs.forEach(function (t) { t.nodes = t.nodes.filter(function (id) { return ids.indexOf(id) >= 0; }); });
    var owned = [].concat.apply([], s.tabs.map(function (t) { return t.nodes; }));
    ids.forEach(function (id) { if (owned.indexOf(id) < 0) tabOf(s, s.active).nodes.push(id); });
    s.figure.deselected = s.figure.deselected.filter(function (id) { return ids.indexOf(id) >= 0; });
    s.figure.order = s.figure.order.filter(function (id) { return ids.indexOf(id) >= 0; });
    return s;
  }
  function isDefault(state) {
    return state.tabs.length === 1 && state.tabs[0].id === FIRST_ID && state.tabs[0].name === DEFAULT_NAME && state.active === FIRST_ID && !state.figure.deselected.length && !state.figure.order.length;
  }
  function serialize(state, nodeIds) {
    var s = prune(state, nodeIds);
    return isDefault(s) ? null : s;
  }
  function tabOf(state, id) { return state.tabs.find(function (t) { return t.id === id; }) || state.tabs[0]; }
  function tabForNode(state, nodeId) { var t = state.tabs.find(function (t) { return t.nodes.indexOf(nodeId) >= 0; }); return t ? t.id : null; }
  function nextId(state) { var n = state.tabs.length + 1; while (state.tabs.some(function (t) { return t.id === 'tab-' + n; })) n++; return 'tab-' + n; }
  function nextName(state, base) {
    if (base) { var copy = cleanName(base + ' copy') || 'Canvas copy', k = 2, candidate = copy; while (state.tabs.some(function (t) { return t.name === candidate; })) candidate = cleanName(copy.slice(0, MAX_NAME - 3) + ' ' + k++); return candidate; }
    var n = state.tabs.length + 1; while (state.tabs.some(function (t) { return t.name === 'Canvas ' + n; })) n++; return 'Canvas ' + n;
  }
  function addTab(state, name) {
    if (state.tabs.length >= MAX_TABS) return {ok: false, message: 'A workspace can have up to ' + MAX_TABS + ' canvas tabs.'};
    var id = nextId(state), label = cleanName(name) || nextName(state);
    state.tabs.push({id: id, name: label, nodes: []}); state.active = id;
    return {ok: true, id: id, duplicate: duplicateName(state, id)};
  }
  function duplicateName(state, id) { var t = tabOf(state, id); return state.tabs.some(function (o) { return o.id !== id && o.name.toLowerCase() === t.name.toLowerCase(); }); }
  function rename(state, id, name) {
    var label = cleanName(name); if (!label) return {ok: false, message: 'A tab name cannot be empty.'};
    var t = state.tabs.find(function (t) { return t.id === id; }); if (!t) return {ok: false, message: 'That tab no longer exists.'};
    t.name = label; return {ok: true, name: label, duplicate: duplicateName(state, id)};
  }
  function reorder(state, id, toIndex) {
    var from = state.tabs.findIndex(function (t) { return t.id === id; }); if (from < 0) return false;
    toIndex = Math.max(0, Math.min(state.tabs.length - 1, toIndex)); if (toIndex === from) return false;
    var t = state.tabs.splice(from, 1)[0]; state.tabs.splice(toIndex, 0, t); return true;
  }
  // The new tab starts empty; the caller copies the cards (copies are new plot instances).
  function duplicateTab(state, id) {
    if (state.tabs.length >= MAX_TABS) return {ok: false, message: 'A workspace can have up to ' + MAX_TABS + ' canvas tabs.'};
    var source = state.tabs.find(function (t) { return t.id === id; }); if (!source) return {ok: false, message: 'That tab no longer exists.'};
    var nid = nextId(state), at = state.tabs.indexOf(source) + 1;
    state.tabs.splice(at, 0, {id: nid, name: nextName(state, source.name), nodes: []}); state.active = nid;
    return {ok: true, id: nid, sources: source.nodes.slice()};
  }
  // moveTo: a tab id to keep the cards, or null to delete them (returned as `removed`).
  function deleteTab(state, id, moveTo) {
    if (state.tabs.length <= 1) return {ok: false, message: 'The last canvas tab cannot be deleted.'};
    var at = state.tabs.findIndex(function (t) { return t.id === id; }); if (at < 0) return {ok: false, message: 'That tab no longer exists.'};
    var gone = state.tabs.splice(at, 1)[0], removed = [];
    if (moveTo && moveTo !== id && state.tabs.some(function (t) { return t.id === moveTo; })) tabOf(state, moveTo).nodes.push.apply(tabOf(state, moveTo).nodes, gone.nodes);
    else removed = gone.nodes.slice();
    if (state.active === id) state.active = (state.tabs[Math.min(at, state.tabs.length - 1)] || state.tabs[0]).id;
    if (removed.length) { state.figure.deselected = state.figure.deselected.filter(function (n) { return removed.indexOf(n) < 0; }); state.figure.order = state.figure.order.filter(function (n) { return removed.indexOf(n) < 0; }); }
    return {ok: true, removed: removed, active: state.active};
  }
  function moveNode(state, nodeId, tabId) {
    if (!state.tabs.some(function (t) { return t.id === tabId; })) return false;
    var from = tabForNode(state, nodeId); if (from === tabId) return false;
    state.tabs.forEach(function (t) { t.nodes = t.nodes.filter(function (n) { return n !== nodeId; }); });
    tabOf(state, tabId).nodes.push(nodeId); return true;
  }
  function assign(state, nodeId, tabId) {
    if (tabForNode(state, nodeId)) return false;
    tabOf(state, tabId || state.active).nodes.push(nodeId); return true;
  }
  // A card that left the workspace leaves its tab, the selection and the order.
  function forget(state, nodeId) {
    var had = !!tabForNode(state, nodeId) || state.figure.deselected.indexOf(nodeId) >= 0 || state.figure.order.indexOf(nodeId) >= 0;
    state.tabs.forEach(function (t) { t.nodes = t.nodes.filter(function (n) { return n !== nodeId; }); });
    state.figure.deselected = state.figure.deselected.filter(function (n) { return n !== nodeId; });
    state.figure.order = state.figure.order.filter(function (n) { return n !== nodeId; });
    return had;
  }
  // Cards present on the board but in no tab (e.g. kept alive by an undo) join a tab; nothing is removed.
  function adopt(state, nodeIds, tabId) {
    var changed = false; uniqueIds(nodeIds).forEach(function (id) { if (assign(state, id, tabId)) changed = true; }); return changed;
  }
  function setActive(state, id) { if (!state.tabs.some(function (t) { return t.id === id; }) || state.active === id) return false; state.active = id; return true; }
  // Figure page: default order is tab order, then card order inside each tab;
  // a saved custom order takes precedence for the cards it names. `canonical`
  // (optional) is the canvas's own card order (the saved node array, newest
  // first); inside a tab it decides the order, so a default single-tab
  // workspace keeps the same figure order before and after a save and reopen.
  function tabNodes(t, canonical) {
    if (!Array.isArray(canonical)) return t.nodes.slice();
    return t.nodes.slice().sort(function (a, b) { var x = canonical.indexOf(a), y = canonical.indexOf(b); return (x < 0 ? 1e6 : x) - (y < 0 ? 1e6 : y); });
  }
  function figureOrder(state, canonical) {
    var natural = [].concat.apply([], state.tabs.map(function (t) { return tabNodes(t, canonical); }));
    var custom = state.figure.order.filter(function (id) { return natural.indexOf(id) >= 0; });
    return custom.concat(natural.filter(function (id) { return custom.indexOf(id) < 0; }));
  }
  function included(state, nodeId) { return state.figure.deselected.indexOf(nodeId) < 0; }
  function setIncluded(state, nodeId, on) {
    var list = state.figure.deselected.filter(function (n) { return n !== nodeId; });
    if (!on) list.push(nodeId);
    var changed = list.length !== state.figure.deselected.length; state.figure.deselected = list; return changed;
  }
  function setTabIncluded(state, tabId, on) { var t = state.tabs.find(function (t) { return t.id === tabId; }); if (!t) return false; var any = false; t.nodes.forEach(function (n) { any = setIncluded(state, n, on) || any; }); return any; }
  function moveInOrder(state, nodeId, delta, canonical) {
    var order = figureOrder(state, canonical), at = order.indexOf(nodeId), to = at + delta;
    if (at < 0 || to < 0 || to >= order.length) return false;
    order.splice(at, 1); order.splice(to, 0, nodeId); state.figure.order = order; return true;
  }
  function resetOrder(state) { var had = state.figure.order.length > 0; state.figure.order = []; return had; }
  return {VERSION: VERSION, MAX_TABS: MAX_TABS, MAX_NAME: MAX_NAME, DEFAULT_NAME: DEFAULT_NAME,
    initial: initial, validate: validate, prune: prune, isDefault: isDefault, serialize: serialize, cleanName: cleanName,
    tabOf: tabOf, tabForNode: tabForNode, addTab: addTab, rename: rename, reorder: reorder, duplicateTab: duplicateTab,
    deleteTab: deleteTab, moveNode: moveNode, assign: assign, forget: forget, adopt: adopt, tabNodes: tabNodes, setActive: setActive, duplicateName: duplicateName,
    figureOrder: figureOrder, included: included, setIncluded: setIncluded, setTabIncluded: setTabIncluded,
    moveInOrder: moveInOrder, resetOrder: resetOrder, clone: clone};
});
