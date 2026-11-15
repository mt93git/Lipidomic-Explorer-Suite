import { describe, expect, it } from 'vitest';
import { titleEditCommand } from './titleEdit';
import { createStore } from '../state/store';
import { createHistory } from '../state/history';
import { setAppearance } from '../state/visualCommands';

const node = { id: 'card', label: 'Principal components', x: 40, y: 40, width: 440, height: 330, visual: { background: '#ffffff' } };
describe('inline card title command', () => {
  it('uses the inspector Label command and changes no plot settings', () => {
    const command = titleEditCommand(node, 'Study overview', false)!;
    const doc = { nodes: [node] };
    expect(command.kind).toBe('setAppearance');
    expect(command.apply(doc)).toEqual(setAppearance(node.id, { label: 'Study overview' }).apply(doc));
    expect(command.apply(doc).nodes[0]).toEqual({ ...node, label: 'Study overview' });
    expect(node.label).toBe('Principal components');
  });
  it('commits a complete draft in one undo step and redoes it', () => {
    const store = createStore({ nodes: [node] }), history = createHistory(store);
    history.dispatch(titleEditCommand(node, 'Study overview', false)!);
    expect(history.cursor).toBe(1);
    expect(store.get().nodes[0].label).toBe('Study overview');
    expect(history.undo()).toBe(true);
    expect(store.get().nodes[0].label).toBe(node.label);
    expect(history.canUndo).toBe(false);
    expect(history.redo()).toBe(true);
    expect(store.get().nodes[0].label).toBe('Study overview');
  });
  it('creates no step for an unchanged or cancelled draft', () => {
    expect(titleEditCommand(node, node.label, false)).toBeUndefined();
    expect(titleEditCommand(node, undefined, false)).toBeUndefined();
  });
  it('cannot rename a card on a read-only device or link', () => {
    expect(titleEditCommand(node, 'Changed', true)).toBeUndefined();
  });
  it('respects Team’s 512 character limit without splitting Unicode characters', () => {
    const label = '🧪'.repeat(513);
    expect(titleEditCommand(node, label, false)!.apply({nodes:[node]}).nodes[0].label).toBe('🧪'.repeat(512));
  });
});
