import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { restoreRefusedInputs } from './canvas';
import { createStore } from './state/store';
import { nodeMap, nexoMap } from './collab/schema';
import type { Node } from './api';

it.each([false, true])('a refused intent restores store and card inputs (fixed: %s)', fixed => {
  const baseline = { violin_lipid: 'PC 34:1', violin_zoom_pct: 400 };
  const node: Node = { id: 'n1', kind: 'plot', label: 'Synthetic', x: 0, y: 0, width: 400, height: 300,
    ...(!fixed ? { instance: { id: 'i1', source: 'results_dashboard-plot_violin', inputs: baseline } } : {}) };
  const doc = new Y.Doc();
  doc.getMap('nodes').set('n1', nodeMap(node as never));
  doc.getMap('nexo').set('nodes', new Y.Map([['n1', nexoMap({ inputs: fixed ? baseline : { plot_scale: 2 } })]]));
  const optimistic = { ...baseline, violin_zoom_pct: 1000, refusedOnly: true };
  const local = structuredClone(node);
  if (local.instance) local.instance.inputs = optimistic;
  const store = createStore({ nodes: [local], nexo: { version: 1 as const, nodes: { n1: { inputs: fixed ? optimistic : { plot_scale: 9 } } } } });
  const card = { node: structuredClone(local), inputs: { ...optimistic }, fixedInputs: fixed ? optimistic : undefined };
  const observed = vi.fn();
  store.subscribe(s => s, () => observed(card.inputs));
  restoreRefusedInputs(doc, store, card);
  expect(card.inputs).toEqual(fixed ? baseline : { ...baseline, plot_scale: 2 });
  expect(store.get().nodes[0].instance?.inputs).toEqual(fixed ? undefined : baseline);
  expect(store.get().nexo.nodes.n1.inputs).toEqual(fixed ? baseline : { plot_scale: 2 });
  expect(card.node.instance?.inputs).toEqual(fixed ? undefined : baseline);
  expect(card.fixedInputs).toEqual(fixed ? baseline : undefined);
  expect(observed).toHaveBeenCalledExactlyOnceWith(card.inputs);
});
