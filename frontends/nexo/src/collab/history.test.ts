import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { createStore } from '../state/store';
import { addNode, moveNodes, removeNodes, resizeNode, setDocument, setFinished, setGeometry, setLabel, styleNodes, type Command } from '../state/commands';
import { setAppearance } from '../state/visualCommands';
import { setNexoStyle } from '../state/nexo';
import { addTab, initial, type TabState } from '../state/tabs';
import { moveNodesToTab, tabsCommand } from '../ui/tabsWiring';
import { fromDoc, seedDoc, toDoc } from './schema';
import { createDocumentHistory } from './history';

// The API client: a change from another person, or the seed, must never reach it.
const api = vi.hoisted(() => ({ updateCard: vi.fn(), updatePalette: vi.fn(), replayActions: vi.fn(), violinStatistics: vi.fn(), createCard: vi.fn() }));
vi.mock('../api', () => api);
beforeEach(() => { for (const call of Object.values(api)) call.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

type State = ReturnType<typeof start>;
const card = (id: string, x: number) => ({ kind: 'plot' as const, id, label: id, x, y: 0, width: 440, height: 330, visual: {} });
function tabsOf(ids: string[]): TabState {
  const tabs = initial(ids); addTab(tabs, 'Other'); tabs.active = tabs.tabs[0].id; return tabs;
}
function start() {
  return { version: '1' as const, libraryHidden: false, nodes: [card('a', 0), card('b', 500)], document: null as null | object, tabs: tabsOf(['a', 'b']) as TabState | null, nexo: { version: 1 as const, nodes: {} as Record<string, object> } };
}
function client(doc: Y.Doc, state: State = start()) {
  const store = createStore(state);
  return { doc, store, history: createDocumentHistory(store, doc) };
}
function board() {
  const state = start();
  return client(toDoc(state as never, state.tabs!, state.nexo), state);
}
// Two people on one document; updates cross with the wire's origin while connected.
function pair() {
  const a = board(), doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(a.doc));
  const b = client(doc);
  let online = true;
  const wire = (from: Y.Doc, to: Y.Doc) => from.on('update', (update: Uint8Array, origin: unknown) => { if (online && origin !== 'wire') Y.applyUpdate(to, update, 'wire'); });
  wire(a.doc, b.doc); wire(b.doc, a.doc);
  return { a, b,
    offline() { online = false; },
    online() { online = true; Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), 'wire'); Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)), 'wire'); } };
}
const node = (c: { store: { get(): State } }, id: string) => c.store.get().nodes.find(n => n.id === id);
const shared = (doc: Y.Doc, id: string) => doc.getMap<Y.Map<unknown>>('nodes').get(id);

test('a local move writes the document once with origin local', () => {
  const { doc, store, history } = board();
  const origins: unknown[] = [];
  doc.on('update', (_: Uint8Array, origin: unknown) => origins.push(origin));
  history.dispatch(moveNodes(['a', 'b'], 200, 10, 'drop:1'));
  expect(origins).toEqual([{ kind: 'local' }]);
  expect([shared(doc, 'a')!.get('x'), shared(doc, 'b')!.get('x')]).toEqual([200, 700]);
  expect(store.get().nodes.map(n => n.x)).toEqual([200, 700]);
});

test('a drag of many pointer moves is one undo step', () => {
  const { store, history } = board();
  for (let i = 0; i < 5; i++) history.dispatch(moveNodes(['a'], 40, 0, 'drop:1'), { fold: i > 0 });
  expect(node({ store }, 'a')!.x).toBe(200);
  history.undo();
  expect(node({ store }, 'a')!.x).toBe(0);
  expect(history.canUndo).toBe(false);
});

test('alternating fields are separate undo steps', () => {
  const { store, history } = board();
  history.dispatch(moveNodes(['a'], 100, 0, 'drop:1'));
  history.dispatch(setLabel('a', 'Renamed'));
  history.dispatch(resizeNode('a', 600, 400, 'size:1'));
  history.dispatch(setLabel('a', 'Again'));
  expect(history.cursor).toBe(4);
  history.undo();
  expect(node({ store }, 'a')).toMatchObject({ label: 'Renamed', width: 600 });
  history.undo();
  expect(node({ store }, 'a')).toMatchObject({ label: 'Renamed', width: 440, x: 100 });
  history.undo();
  expect(node({ store }, 'a')).toMatchObject({ label: 'a', x: 100 });
  history.undo();
  expect(node({ store }, 'a')).toMatchObject({ label: 'a', x: 0 });
  expect(history.cursor).toBe(0);
});

test('a fold long after the step still joins it', () => {
  vi.useFakeTimers();
  const { store, history } = board();
  history.dispatch(setLabel('a', 'Renamed'));
  vi.advanceTimersByTime(5000);
  history.dispatch(setFinished('a', { url: 'data:image/png;base64,AA==', createdAt: '2026-01-01T00:00:00Z', stale: false }), { fold: true });
  expect(history.cursor).toBe(1);
  history.undo();
  expect(node({ store }, 'a')).toMatchObject({ label: 'a' });
  expect(node({ store }, 'a')!).not.toHaveProperty('finished');
});

test('the undo stack keeps fifty steps', () => {
  const { store, history } = board();
  for (let i = 1; i <= 51; i++) history.dispatch(moveNodes(['a'], 1, 0, `drop:${i}`));
  expect(history.cursor).toBe(50);
  while (history.undo());
  expect(node({ store }, 'a')!.x).toBe(1);
});

test('a new local step drops redo', () => {
  const { history } = board();
  history.dispatch(moveNodes(['a'], 100, 0, 'drop:1'));
  history.undo();
  expect(history.canRedo).toBe(true);
  history.dispatch(moveNodes(['b'], 100, 0, 'drop:2'));
  expect(history.canRedo).toBe(false);
});

test('undo reverts only this person\'s change', () => {
  const { a, b } = pair();
  a.history.dispatch(moveNodes(['a'], 200, 0, 'drop:1'));
  b.history.dispatch(moveNodes(['b'], 400, 0, 'drop:1'));
  a.history.undo();
  expect([node(a, 'a')!.x, node(a, 'b')!.x]).toEqual([0, 900]);
  expect([node(b, 'a')!.x, node(b, 'b')!.x]).toEqual([0, 900]);
});

test('undo without an own change leaves another person\'s move', () => {
  const { a, b } = pair();
  b.history.dispatch(moveNodes(['a'], 200, 0, 'drop:1'));
  expect(a.history.undo()).toBe(false);
  expect(node(a, 'a')!.x).toBe(200);
});

test('a remote edit between two local edits survives undo', () => {
  const { a, b } = pair();
  a.history.dispatch(moveNodes(['a'], 100, 0, 'drop:1'));
  b.history.dispatch(setLabel('a', 'Theirs'));
  a.history.dispatch(resizeNode('a', 600, 400, 'size:1'));
  a.history.undo(); a.history.undo();
  expect(node(a, 'a')).toMatchObject({ x: 0, width: 440, label: 'Theirs' });
  expect(node(b, 'a')).toMatchObject({ x: 0, width: 440, label: 'Theirs' });
});

test('undo after another person removed the card does not bring it back', () => {
  const { a, b } = pair();
  a.history.dispatch(moveNodes(['a'], 100, 0, 'drop:1'));
  b.history.dispatch(removeNodes(['a']));
  a.history.undo();
  for (const c of [a, b]) {
    expect(c.store.get().nodes.map(n => n.id)).toEqual(['b']);
    expect([...c.doc.getMap('nodes').keys()]).toEqual(['b']);
    expect(fromDoc(c.doc).tabs.tabs.flatMap(t => t.nodes)).toEqual(['b']);
  }
});

test('undo of a removal restores the card for both people', () => {
  const { a, b } = pair();
  a.history.dispatch(setLabel('a', 'Kept'));
  a.history.dispatch(removeNodes(['a']));
  a.history.undo();
  for (const c of [a, b]) {
    expect(node(c, 'a')).toMatchObject({ label: 'Kept', x: 0 });
    expect(c.store.get().tabs!.tabs[0].nodes).toEqual(['a', 'b']);
  }
});

test('two people writing one card at once converge', () => {
  const link = pair(), { a, b } = link;
  link.offline();
  a.history.dispatch(moveNodes(['a'], 100, 0, 'drop:1'));
  a.history.dispatch(setLabel('a', 'Mine'));
  b.history.dispatch(moveNodes(['a'], 300, 50, 'drop:1'));
  b.history.dispatch(resizeNode('a', 700, 500, 'size:1'));
  link.online();
  expect(fromDoc(a.doc)).toEqual(fromDoc(b.doc));
  expect(a.store.get().nodes).toEqual(b.store.get().nodes);
  expect(node(a, 'a')).toMatchObject({ label: 'Mine', width: 700, height: 500 });
});

test('a new card joins this person\'s active tab', () => {
  const { a, b } = pair();
  a.store.get().tabs!.active = 'tab-2';
  a.history.dispatch(addNode(card('c', 1000)));
  expect(b.store.get().tabs!.tabs.map(t => t.nodes)).toEqual([['a', 'b'], ['c']]);
  expect(b.store.get().tabs!.active).toBe('tab-1');
});

test('the active tab never reaches the document', () => {
  const { a, b } = pair();
  a.store.get().tabs!.active = 'tab-2';
  a.history.dispatch(moveNodes(['a'], 10, 0, 'drop:1'));
  expect(a.doc.getMap('tabs').has('active')).toBe(false);
  expect(b.store.get().tabs!.active).toBe('tab-1');
  expect(a.store.get().tabs!.active).toBe('tab-2');
});

test('an undo reaches the store with origin undo', () => {
  const { store, history } = board();
  const seen: unknown[] = [];
  history.dispatch(moveNodes(['a'], 10, 0, 'drop:1'));
  store.subscribe(s => s, () => seen.push(history.origin));
  history.undo();
  expect(seen).toEqual([{ kind: 'undo' }]);
});

// Plan 2.3 inventory: every persistent write a person makes today, as the other person receives it.
const png = { url: 'data:image/png;base64,AA==', createdAt: '2026-01-01T00:00:00Z', stale: false };
const presentation = { show: true, pValue: 'adjusted', label: 'stars', fontSize: 12, spacing: 0.08, tip: 0.02, nDisplay: 'both', hidden: [] };
const statistics: Command = { kind: 'setStatistics', apply: doc => ({ ...doc, nodes: doc.nodes.map(n => n.id === 'a' ? { ...n, statistics: { version: '1', presentation } } : n) }), invert: () => statistics };
const rows: [string, () => Command][] = [
  ['move', () => moveNodes(['a'], 120, 40, 'drop:1')],
  ['resize', () => resizeNode('a', 640, 480, 'size:1')],
  ['label', () => setLabel('a', 'Synthetic label')],
  ['geometry', () => setGeometry('a', { x: 10, y: 20, width: 500, height: 400 }, 'position:1')],
  ['add', () => addNode(card('c', 1000))],
  ['remove', () => removeNodes(['b'])],
  ['style batch', () => styleNodes('pasteStyle', [{ id: 'a', width: 520, visual: { plotTitle: 'Synthetic' } }, { id: 'b', height: 360 }])],
  ['appearance', () => setAppearance('a', { color: '#123456', visual: { background: '#fafafa' } })],
  ['Nexo style', () => setNexoStyle('a', { titleWeight: 'bold' })],
  ['statistics presentation', () => statistics],
  ['finished', () => setFinished('a', png)],
  ['document', () => setDocument({ version: '1', layout: 'free', paper: 'letter', orientation: 'portrait', items: [{ id: 'text-1', type: 'text', x: 46, y: 46, width: 220, height: 50, z: 1, text: 'Synthetic', fontSize: 16, color: '#172d4b' }] })],
  ['tabs membership', () => tabsCommand(moveNodesToTab(tabsOf(['a', 'b']), ['b'], 'tab-2'))],
];
for (const [row, command] of rows) {
  test(`${row} from another person reaches the store with origin remote and no engine call`, () => {
    const { a, b } = pair(), before = JSON.stringify(b.store.get()), seen: unknown[] = [];
    b.store.subscribe(s => s, () => seen.push(b.history.origin));
    a.history.dispatch(command());
    expect(JSON.stringify(b.store.get())).not.toBe(before);
    expect(b.store.get()).toEqual(a.store.get());
    expect(fromDoc(b.doc)).toEqual(fromDoc(a.doc));
    expect(seen).toEqual([{ kind: 'remote' }]);
    expect(b.history.canUndo).toBe(false);
    for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled();
  });
}

test('a server write of instance inputs, Nexo inputs and design reaches the store with no engine call', () => {
  const state = start();
  state.nodes[0] = { ...card('a', 0), instance: { instanceId: 'tcinstance_a', source: 'results_dashboard-plot_violin', inputs: { lipid: 'PC 34:1' } } } as never;
  state.nexo = { version: 1, nodes: { a: { inputs: { customCol_g1: '#111111' } } }, design: { unit: 'sample', type: 'independent' } } as never;
  const { doc, store, history } = client(toDoc(state as never, state.tabs!, state.nexo as never), state);
  doc.transact(() => {
    (shared(doc, 'a')!.get('instance') as Y.Map<Y.Map<unknown>>).get('inputs')!.set('lipid', 'PC 36:2');
    (doc.getMap('nexo').get('nodes') as Y.Map<Y.Map<unknown>>).get('a')!.set('inputs', { customCol_g1: '#222222' });
    doc.getMap('nexo').set('design', { unit: 'subject', type: 'paired' });
  }, 'server');
  const now = store.get() as unknown as { nodes: { id: string; instance?: { instanceId?: string; inputs: object } }[]; nexo: { nodes: Record<string, { inputs?: object }>; design?: object } };
  expect(now.nodes[0].instance).toEqual({ instanceId: 'tcinstance_a', source: 'results_dashboard-plot_violin', inputs: { lipid: 'PC 36:2' } });
  expect(now.nexo.nodes.a.inputs).toEqual({ customCol_g1: '#222222' });
  expect(now.nexo.design).toEqual({ unit: 'subject', type: 'paired' });
  expect(history.canUndo).toBe(false);
  for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled();
});

test('the first opener\'s seed reaches its store with origin init and no engine call', () => {
  const doc = new Y.Doc(), state = start(), opener = client(doc, state), seen: unknown[] = [];
  opener.store.subscribe(s => s, () => seen.push(opener.history.origin));
  expect(seedDoc(doc, state as never)).toBe(true);
  expect(seen).toEqual([{ kind: 'init' }]);
  expect(opener.store.get().nodes).toEqual(state.nodes);
  expect(opener.history.canUndo).toBe(false);
  for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled();
});

test('a joiner takes the document with origin init through the history it adopted first', () => {
  const owner = board();
  owner.history.dispatch(moveNodes(['a'], 300, 0, 'drop:1'));
  const doc = new Y.Doc(), store = createStore(start()), seen: unknown[] = [];
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(owner.doc));
  let adopted: { origin: unknown } | undefined;
  store.subscribe(s => s, () => seen.push(adopted?.origin));
  createDocumentHistory(store, doc, history => { adopted = history; });
  expect(seen).toEqual([{ kind: 'init' }]);
  expect(store.get().nodes[0].x).toBe(300);
  for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled();
});
