import { expect, it } from 'vitest';
import { createStore } from './store';
import { createHistory } from './history';
import { addNode, moveNodes, removeNodes, resizeNode, setGeometry, setLabel } from './commands';
const node = { id: 'plot', label: 'Plot', x: 10, y: 20, width: 300, height: 300 };
it('a drag burst of 5 moves within 700 ms is one undo step; undo restores x/y; redo reapplies', () => {
  let now = 0;
  const store = createStore({ nodes: [node] });
  const history = createHistory(store, { clock: () => now });
  for (let i = 0; i < 5; i++) { history.dispatch(moveNodes(['plot'], 2, 3, 'drag')); now += 100; }
  expect(store.get().nodes[0]).toMatchObject({ x: 20, y: 35 });
  expect(history.undo()).toBe(true);
  expect(store.get().nodes[0]).toEqual(node);
  expect(history.canUndo).toBe(false);
  expect(history.redo()).toBe(true);
  expect(store.get().nodes[0]).toMatchObject({ x: 20, y: 35 });
});
it('cap 50 drops the oldest', () => {
  const store = createStore({ nodes: [node] }); const h = createHistory(store);
  for (let i = 0; i < 55; i++) h.dispatch(moveNodes(['plot'], 1, 0));
  for (let i = 0; i < 50; i++) expect(h.undo()).toBe(true);
  expect(h.canUndo).toBe(false); expect(store.get().nodes[0].x).toBe(15);
});
it('settle folds into drop; replay breaks coalescing and new edits discard redo', () => {
  const store = createStore({ nodes: [node] }); const h = createHistory(store, { clock: () => 0 });
  h.dispatch(moveNodes(['plot'], 5, 0, 'drop'));
  h.dispatch(setGeometry('plot', { x: 40, y: 50, width: 300, height: 300 }), { fold: true });
  h.undo(); expect(store.get().nodes[0]).toEqual(node);
  h.redo(); expect(store.get().nodes[0].x).toBe(40);
  h.dispatch(moveNodes(['plot'], 1, 0, 'drop')); h.undo();
  expect(store.get().nodes[0].x).toBe(40);
  h.dispatch(setLabel('plot', 'New')); expect(h.canRedo).toBe(false);
});
it('commands invert without mutating and restore removed node order', () => {
  const initial = { nodes: [node, { ...node, id: 'other' }] };
  for (const cmd of [resizeNode('plot', 500, 600), setLabel('plot', 'New'), removeNodes(['plot']), addNode({ ...node, id: 'third' })]) {
    const before = structuredClone(initial);
    expect(cmd.invert(initial).apply(cmd.apply(initial))).toEqual(initial);
    expect(initial).toEqual(before);
  }
});
it('selector subscriptions expose stable snapshots, equality and unsubscribe', () => {
  const store = createStore({ nodes: [node], count: 0 }); let calls = 0;
  const subscription = store.subscribe(s => s.nodes, () => calls++);
  expect(subscription.getSnapshot()).toBe(subscription.getSnapshot());
  store.set(s => ({ ...s, count: 1 })); expect(calls).toBe(0);
  store.dispatch(moveNodes(['plot'], 1, 0)); expect(calls).toBe(1);
  subscription(); store.dispatch(moveNodes(['plot'], 1, 0)); expect(calls).toBe(1);
});
