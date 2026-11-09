import { describe, expect, it } from "vitest";
describe('setNodeInputs (H8)', () => {
  it('records a Data-tab change as one undoable step that restores the previous inputs', async () => {
    const { setNodeInputs } = await import('./commands');
    const doc = { nodes: [{ id: 'a', x: 0, y: 0, width: 10, height: 10, instance: { source: 'violin', inputs: { lipid: 'PC' } } }] } as never;
    const cmd = setNodeInputs("a", { lipid: "PE" }), inverse = cmd.invert(doc), next = cmd.apply(doc) as unknown as { nodes: { instance: { source: string; inputs: { lipid: string } } }[] };
    expect(next.nodes[0].instance).toEqual({ source: 'violin', inputs: { lipid: 'PE' } });
    expect((inverse.apply(next as never) as unknown as typeof next).nodes[0].instance.inputs.lipid).toBe('PC');
  });
});

import { styleNodes } from './commands';
import { createStore as createStyleStore } from './store';
import { createHistory as createStyleHistory } from './history';
it('styleNodes: one batched command over many nodes, inverted node by node', () => {
  const a = { id: 'a', label: 'A', x: 0, y: 0, width: 300, height: 300, visual: { background: '#ffffff' } }, b = { id: 'b', label: 'B', x: 400, y: 0, width: 300, height: 300 }, c = { id: 'c', label: 'C', x: 0, y: 400, width: 300, height: 300 };
  const store = createStyleStore({ nodes: [a, b, c] }), history = createStyleHistory(store);
  history.dispatch(styleNodes('applyStyle', [{ id: 'a', width: 500, visual: { background: '#000000' } }, { id: 'b', height: 260 }]));
  expect(store.get().nodes[0]).toMatchObject({ width: 500, visual: { background: '#000000' } });
  expect(store.get().nodes[1]).toMatchObject({ height: 260 });
  // A later, unrelated edit of c survives the undo of the batch (node by node, not a snapshot).
  store.set(s => ({ nodes: s.nodes.map(n => n.id === 'c' ? { ...n, label: 'C2' } : n) }));
  expect(history.undo()).toBe(true);
  expect(store.get().nodes).toEqual([a, b, { ...c, label: 'C2' }]);
});
