import { describe, it, expect } from 'vitest';
import * as model from '../state/tabs';
import { visibleNodeIds, moveNodesToTab, deleteTabPlan } from './tabsWiring';
describe('canvas tabs wiring', () => {
  const state = () => { const t = model.initial(['a', 'b']); model.addTab(t); return t; };
  it('assigns orphan nodes to the first tab', () => {
    const t = state();
    expect(visibleNodeIds({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'orphan' }] }, t, 'tab-1')).toEqual(['a', 'b', 'orphan']);
    expect(visibleNodeIds({ nodes: [{ id: 'orphan' }] }, t, t.active)).toEqual([]);
  });
  it('moves a selection immutably without duplicate ownership', () => {
    const t = state(), next = moveNodesToTab(t, ['a', 'a'], t.active);
    expect(t.tabs[0].nodes).toEqual(['a', 'b']);
    expect(next.tabs.map(t => t.nodes)).toEqual([['b'], ['a']]);
    expect(moveNodesToTab(t, ['a'], 'missing')).toEqual(t);
  });
  it('plans deletion with moves or removals, protecting the final tab', () => {
    const t = state();
    expect(deleteTabPlan(t, 'tab-1', 'move', t.active)).toEqual({ moves: [{ id: 'a', target: t.active }, { id: 'b', target: t.active }], removals: [] });
    expect(deleteTabPlan(t, 'tab-1', 'remove')).toEqual({ moves: [], removals: ['a', 'b'] });
    expect(deleteTabPlan(model.initial(['a']), 'tab-1', 'remove')).toEqual({ moves: [], removals: [] });
  });
});

import { tabsCommand } from './tabsWiring';
import { addNode, removeNodes } from '../state/commands';
import { createStore } from '../state/store';
import { createHistory } from '../state/history';
it('undoes card removal and tab deletion together and serializes defaults as null', () => {
  const original = { nodes: [{ id: 'a', label: 'A', x: 0, y: 0, width: 300, height: 240 }], tabs: model.initial(['a']) };
  const store = createStore(original), history = createHistory(store);
  const t = model.clone(original.tabs); model.addTab(t);
  model.deleteTab(t, 'tab-1', null);
  history.dispatch(tabsCommand(t, [removeNodes(['a'])]));
  expect(store.get().nodes).toEqual([]);
  history.undo(); expect(store.get()).toEqual(original);
  history.redo(); expect(store.get().nodes).toEqual([]);
  const defaultDoc = tabsCommand(model.initial(['a'])).apply(original);
  expect(defaultDoc.tabs).toBeNull();
});
it('copies cards and target membership as one reversible command', () => {
  const t = model.initial(['a']); model.addTab(t); model.assign(t, 'copy', t.active);
  const doc = { nodes: [{ id: 'a', label: 'A', x: 0, y: 0, width: 300, height: 240 }], tabs: model.initial(['a']) };
  const store = createStore(doc), history = createHistory(store);
  history.dispatch(tabsCommand(t, [addNode({ ...doc.nodes[0], id: 'copy' })]));
  expect(visibleNodeIds(store.get(), model.validate(store.get().tabs, ['a', 'copy']), t.active)).toEqual(['copy']);
  history.undo(); expect(store.get()).toEqual(doc);
});
