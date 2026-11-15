// Faithful DOM-free port of www/team/js/canvas_tabs_model.js.
// Commands mutate the supplied state; validate/prune/serialize return repaired copies.
import { LIMITS, type Tab, type Tabs } from './document';
export type TabState = Tabs & { figure: NonNullable<Tabs['figure']> };
export const VERSION = '1', MAX_TABS = LIMITS.tabs, MAX_NAME = LIMITS.tabName, DEFAULT_NAME = 'Canvas 1';
const FIRST_ID = 'tab-1', ID = /^tab-[A-Za-z0-9_-]{1,40}$/, NODE = /^[A-Za-z][A-Za-z0-9_-]{0,159}$/;
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function clone(state: TabState): TabState { return JSON.parse(JSON.stringify(state)); }
function uniqueIds(list: unknown, allowed?: string[]): string[] {
  const seen: Record<string, boolean> = Object.create(null), out: string[] = [];
  (Array.isArray(list) ? list : []).forEach((id) => {
    if (typeof id !== 'string' || !NODE.test(id) || seen[id] || (allowed && allowed.indexOf(id) < 0)) return;
    seen[id] = true; out.push(id);
  });
  return out;
}
// Any name: trimmed, at most 40 characters, no control characters. Returns null when empty.
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Count characters, not UTF-16 units, so a cut never splits an emoji or other astral character.
  let name = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, MAX_NAME).join('').trim();
  return name ? name : null;
}
export function initial(nodeIds: unknown): TabState {
  return {version: VERSION, active: FIRST_ID, tabs: [{id: FIRST_ID, name: DEFAULT_NAME, nodes: uniqueIds(nodeIds)}], figure: {deselected: [], order: []}};
}
// Lenient by design: a bad field never blocks opening a checkpoint, it falls back.
export function validate(raw: unknown, nodeIds: unknown): TabState {
  let ids = uniqueIds(nodeIds);
  if (!isObject(raw) || raw.version !== VERSION || !Array.isArray(raw.tabs) || !raw.tabs.length || raw.tabs.length > MAX_TABS) return initial(ids);
  const seenTab: Record<string, boolean> = Object.create(null), owned: Record<string, boolean> = Object.create(null), tabs: Tab[] = [];
  for (let i = 0; i < raw.tabs.length; i++) {
    let t = raw.tabs[i];
    if (!isObject(t) || typeof t.id !== 'string' || !ID.test(t.id) || seenTab[t.id]) return initial(ids);
    let name = cleanName(t.name); if (!name) return initial(ids);
    seenTab[t.id] = true;
    let nodes = uniqueIds(t.nodes, ids).filter((id) => { if (owned[id]) return false; owned[id] = true; return true; });
    tabs.push({id: t.id, name: name, nodes: nodes});
  }
  // Cards the field does not mention (e.g. added by an older reader) join the first tab.
  ids.forEach((id) => { if (!owned[id]) tabs[0].nodes.push(id); });
  let figure = isObject(raw.figure) ? raw.figure : {};
  return {version: VERSION, active: typeof raw.active === 'string' && seenTab[raw.active] ? raw.active : tabs[0].id, tabs: tabs,
    figure: {deselected: uniqueIds(figure.deselected, ids), order: uniqueIds(figure.order, ids)}};
}
export function prune(state: TabState, nodeIds: unknown): TabState {
  let ids = uniqueIds(nodeIds), s = clone(state);
  s.tabs.forEach((t) => { t.nodes = t.nodes.filter((id) => { return ids.indexOf(id) >= 0; }); });
  const owned = s.tabs.flatMap(t => t.nodes);
  ids.forEach((id) => { if (owned.indexOf(id) < 0) tabOf(s, s.active).nodes.push(id); });
  s.figure.deselected = s.figure.deselected.filter((id) => { return ids.indexOf(id) >= 0; });
  s.figure.order = s.figure.order.filter((id) => { return ids.indexOf(id) >= 0; });
  return s;
}
export function isDefault(state: TabState): boolean {
  return state.tabs.length === 1 && state.tabs[0].id === FIRST_ID && state.tabs[0].name === DEFAULT_NAME && state.active === FIRST_ID && !state.figure.deselected.length && !state.figure.order.length;
}
export function serialize(state: TabState, nodeIds: unknown): TabState | null {
  let s = prune(state, nodeIds);
  return isDefault(s) ? null : s;
}
export function tabOf(state: TabState, id: string): Tab { return state.tabs.find((t) => { return t.id === id; }) || state.tabs[0]; }
export function tabForNode(state: TabState, nodeId: string): string | null { let t = state.tabs.find((t) => { return t.nodes.indexOf(nodeId) >= 0; }); return t ? t.id : null; }
function nextId(state: TabState): string { let n = state.tabs.length + 1; while (state.tabs.some((t) => { return t.id === 'tab-' + n; })) n++; return 'tab-' + n; }
function nextName(state: TabState, base?: string): string {
  if (base) { let copy = cleanName(base + ' copy') || 'Canvas copy', k = 2, candidate = copy; while (state.tabs.some((t) => { return t.name === candidate; })) candidate = cleanName(copy.slice(0, MAX_NAME - 3) + ' ' + k++)!; return candidate; }
  let n = state.tabs.length + 1; while (state.tabs.some((t) => { return t.name === 'Canvas ' + n; })) n++; return 'Canvas ' + n;
}
export function addTab(state: TabState, name?: unknown) {
  if (state.tabs.length >= MAX_TABS) return {ok: false, message: 'A workspace can have up to ' + MAX_TABS + ' canvas tabs.'};
  let id = nextId(state), label = cleanName(name) || nextName(state);
  state.tabs.push({id: id, name: label, nodes: []}); state.active = id;
  return {ok: true, id: id, duplicate: duplicateName(state, id)};
}
export function duplicateName(state: TabState, id: string): boolean { let t = tabOf(state, id); return state.tabs.some((o) => { return o.id !== id && o.name.toLowerCase() === t.name.toLowerCase(); }); }
export function rename(state: TabState, id: string, name: unknown) {
  let label = cleanName(name); if (!label) return {ok: false, message: 'A tab name cannot be empty.'};
  let t = state.tabs.find((t) => { return t.id === id; }); if (!t) return {ok: false, message: 'That tab no longer exists.'};
  t.name = label; return {ok: true, name: label, duplicate: duplicateName(state, id)};
}
export function reorder(state: TabState, id: string, toIndex: number): boolean {
  let from = state.tabs.findIndex((t) => { return t.id === id; }); if (from < 0) return false;
  toIndex = Math.max(0, Math.min(state.tabs.length - 1, toIndex)); if (toIndex === from) return false;
  let t = state.tabs.splice(from, 1)[0]; state.tabs.splice(toIndex, 0, t); return true;
}
// The new tab starts empty; the caller copies the cards (copies are new plot instances).
export function duplicateTab(state: TabState, id: string) {
  if (state.tabs.length >= MAX_TABS) return {ok: false, message: 'A workspace can have up to ' + MAX_TABS + ' canvas tabs.'};
  let source = state.tabs.find((t) => { return t.id === id; }); if (!source) return {ok: false, message: 'That tab no longer exists.'};
  let nid = nextId(state), at = state.tabs.indexOf(source) + 1;
  state.tabs.splice(at, 0, {id: nid, name: nextName(state, source.name), nodes: []}); state.active = nid;
  return {ok: true, id: nid, sources: source.nodes.slice()};
}
// moveTo: a tab id to keep the cards, or null to delete them (returned as `removed`).
export function deleteTab(state: TabState, id: string, moveTo: string | null) {
  if (state.tabs.length <= 1) return {ok: false, message: 'The last canvas tab cannot be deleted.'};
  let at = state.tabs.findIndex((t) => { return t.id === id; }); if (at < 0) return {ok: false, message: 'That tab no longer exists.'};
  if (moveTo && (moveTo === id || !state.tabs.some((t) => { return t.id === moveTo; }))) return {ok: false, message: 'The tab chosen for the cards no longer exists.'};
  const gone = state.tabs.splice(at, 1)[0]; let removed: string[] = [];
  if (moveTo && moveTo !== id && state.tabs.some((t) => { return t.id === moveTo; })) tabOf(state, moveTo).nodes.push.apply(tabOf(state, moveTo).nodes, gone.nodes);
  else removed = gone.nodes.slice();
  if (state.active === id) state.active = (state.tabs[Math.min(at, state.tabs.length - 1)] || state.tabs[0]).id;
  if (removed.length) { state.figure.deselected = state.figure.deselected.filter((n) => { return removed.indexOf(n) < 0; }); state.figure.order = state.figure.order.filter((n) => { return removed.indexOf(n) < 0; }); }
  return {ok: true, removed: removed, active: state.active};
}
export function moveNode(state: TabState, nodeId: string, tabId: string): boolean {
  if (!state.tabs.some((t) => { return t.id === tabId; })) return false;
  let from = tabForNode(state, nodeId); if (from === tabId) return false;
  state.tabs.forEach((t) => { t.nodes = t.nodes.filter((n) => { return n !== nodeId; }); });
  tabOf(state, tabId).nodes.push(nodeId); return true;
}
export function assign(state: TabState, nodeId: string, tabId?: string): boolean {
  if (tabForNode(state, nodeId)) return false;
  tabOf(state, tabId || state.active).nodes.push(nodeId); return true;
}
// A card that left the workspace leaves its tab, the selection and the order.
export function forget(state: TabState, nodeId: string): boolean {
  let had = !!tabForNode(state, nodeId) || state.figure.deselected.indexOf(nodeId) >= 0 || state.figure.order.indexOf(nodeId) >= 0;
  state.tabs.forEach((t) => { t.nodes = t.nodes.filter((n) => { return n !== nodeId; }); });
  state.figure.deselected = state.figure.deselected.filter((n) => { return n !== nodeId; });
  state.figure.order = state.figure.order.filter((n) => { return n !== nodeId; });
  return had;
}
// Cards present on the board but in no tab (e.g. kept alive by an undo) join a tab; nothing is removed.
export function adopt(state: TabState, nodeIds: unknown, tabId?: string): boolean {
  let changed = false; uniqueIds(nodeIds).forEach((id) => { if (assign(state, id, tabId)) changed = true; }); return changed;
}
export function setActive(state: TabState, id: string): boolean { if (!state.tabs.some((t) => { return t.id === id; }) || state.active === id) return false; state.active = id; return true; }
// Figure page: default order is tab order, then card order inside each tab;
// a saved custom order takes precedence for the cards it names. `canonical`
// (optional) is the canvas's own card order (the saved node array, newest
// first); inside a tab it decides the order, so a default single-tab
// workspace keeps the same figure order before and after a save and reopen.
export function tabNodes(t: Tab, canonical?: string[]): string[] {
  if (!Array.isArray(canonical)) return t.nodes.slice();
  return t.nodes.slice().sort((a, b) => { let x = canonical.indexOf(a), y = canonical.indexOf(b); return (x < 0 ? 1e6 : x) - (y < 0 ? 1e6 : y); });
}
export function figureOrder(state: TabState, canonical?: string[]): string[] {
  const natural = state.tabs.flatMap(t => tabNodes(t, canonical));
  let custom = state.figure.order.filter((id) => { return natural.indexOf(id) >= 0; });
  return custom.concat(natural.filter((id) => { return custom.indexOf(id) < 0; }));
}
export function included(state: TabState, nodeId: string): boolean { return state.figure.deselected.indexOf(nodeId) < 0; }
export function setIncluded(state: TabState, nodeId: string, on: boolean): boolean {
  let list = state.figure.deselected.filter((n) => { return n !== nodeId; });
  if (!on) list.push(nodeId);
  let changed = list.length !== state.figure.deselected.length; state.figure.deselected = list; return changed;
}
export function setTabIncluded(state: TabState, tabId: string, on: boolean): boolean { let t = state.tabs.find((t) => { return t.id === tabId; }); if (!t) return false; let any = false; t.nodes.forEach((n) => { any = setIncluded(state, n, on) || any; }); return any; }
export function moveInOrder(state: TabState, nodeId: string, delta: number, canonical?: string[]): boolean {
  let order = figureOrder(state, canonical), at = order.indexOf(nodeId), to = at + delta;
  if (at < 0 || to < 0 || to >= order.length) return false;
  order.splice(at, 1); order.splice(to, 0, nodeId); state.figure.order = order; return true;
}
export function resetOrder(state: TabState): boolean { let had = state.figure.order.length > 0; state.figure.order = []; return had; }
