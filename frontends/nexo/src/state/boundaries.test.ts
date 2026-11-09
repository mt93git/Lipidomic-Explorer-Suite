import { expect, it } from 'vitest';
import { createStore } from './store';
import { createHistory } from './history';
import { moveNodes, removeNodes, addNode } from './commands';
import { validateState, validateDocument } from './validate';
const node = { id: 'plot', label: 'Plot', x: 0, y: 0, width: 240, height: 220, visual: {}, finished: null };
const state = { version: '1', libraryHidden: false, nodes: [node] };
it('derived snapshots are cached per state and selector equality suppresses updates', () => {
  const store = createStore({ count: 0, other: 0 }); let calls = 0;
  const selected = store.subscribe(s => ({ count: s.count }), () => calls++, (a, b) => a.count === b.count);
  const first = selected.getSnapshot(); expect(selected.getSnapshot()).toBe(first);
  store.set(s => ({ ...s, other: 1 })); expect(selected.getSnapshot()).toBe(first); expect(calls).toBe(0);
  const allocated = store.subscribe(s => ({ ...s }), () => {});
  expect(allocated.getSnapshot()).toBe(allocated.getSnapshot());
  let notified = 0; const stop = selected.subscribe(() => notified++);
  store.set(s => ({ ...s, count: 1 })); expect(notified).toBe(1); stop();
  store.set(s => ({ ...s, count: 2 })); expect(notified).toBe(1);
  expect(selected.getSnapshot()).toEqual({ count: 2 }); selected(); allocated();
});
it('a 700 ms pause ends a burst; structural commands remain undoable', () => {
  let now = 0; const store = createStore(state); const h = createHistory(store, { clock: () => now });
  h.dispatch(moveNodes(['plot'], 1, 0, 'key')); now = 700;
  h.dispatch(moveNodes(['plot'], 1, 0, 'key')); h.undo(); expect(store.get().nodes[0].x).toBe(1);
  h.dispatch(removeNodes(['plot'])); expect(store.get().nodes).toEqual([]); h.undo(); expect(store.get().nodes[0].x).toBe(1);
  h.dispatch(addNode({ ...node, id: 'second' })); h.undo(); expect(store.get().nodes).toHaveLength(1);
});
it('normalizes rounding, known appearance fields, instances and illustration colors', () => {
  const value = { ...state, nodes: [{ ...node, x: 0.6, visual: { fontSize: 48, ignored: 1 } }] };
  expect(validateState(value)).toEqual({ ok: true, state: { ...state, nodes: [{ ...node, x: 1, visual: { fontSize: 48 } }] } });
  const illustration = { ...node, kind: 'illustration', assetId: 'lc-ms', assetVersion: '1', color: '#AABBCC' };
  expect(validateState({ ...state, nodes: [illustration] })).toEqual({ ok: true, state: { ...state, nodes: [{ ...illustration, color: '#aabbcc' }] } });
  const instance = { id: 'tcinstance_copy', source: 'results_dashboard-plot_pca', inputs: {} };
  const copy = { ...node, id: 'tcinstance_copy-plot_pca', instance };
  expect(validateState({ ...state, nodes: [copy] })).toEqual({ ok: true, state: { ...state, nodes: [copy] } });
});
it('rejects invalid identities, font sizes, positions, snapshots and statistics owners', () => {
  for (const [patch, message] of [
    [{ id: '1bad' }, 'Invalid saved plot identity.'],
    [{ x: 1000001 }, 'Invalid saved figure size or position.'],
    [{ visual: { fontSize: 49 } }, 'Invalid saved font size.'],
    [{ finished: { url: 'data:image/png;base64,YQ==', createdAt: '2026-01-01T00:00:00Z', stale: false } }, 'Invalid saved figure image.'],
    [{ statistics: {} }, 'Invalid saved violin statistics.'],
    [{ instance: { id: 'tcinstance_BAD', source: 'results_dashboard-plot_pca', inputs: {} } }, 'Invalid independent plot settings.']
  ] as const) expect(validateState({ ...state, nodes: [{ ...node, ...patch }] })).toEqual({ ok: false, message });
});
it('accepts a PNG header and rejects a snapshot exceeding 4 MiB', () => {
  const bytes = '\x89PNG\r\n\x1a\n' + '\x00'.repeat(4) + 'IHDR' + '\x00'.repeat(17);
  const finished = { url: `data:image/png;base64,${btoa(bytes)}`, createdAt: '2026-01-01T00:00:00Z', stale: false };
  expect(validateState({ ...state, nodes: [{ ...node, finished }] }).ok).toBe(true);
  expect(validateState({ ...state, nodes: [{ ...node, finished: { ...finished, url: 'a'.repeat(4 * 1024 * 1024 + 1) } }] })).toEqual({ ok: false, message: 'Invalid saved figure image.' });
});
it('accepts custom pages and enforces the 80-item limit', () => {
  const doc = { version: '1', layout: 'pages', paper: 'custom', paperWidth: 100, paperHeight: 100, orientation: 'portrait', items: [] };
  expect(validateDocument(doc, [])).toEqual({ ok: true, state: doc });
  expect(validateDocument({ ...doc, items: Array.from({ length: 81 }, () => ({})) }, [])).toEqual({ ok: false, message: 'Invalid saved document layout.' });
});
