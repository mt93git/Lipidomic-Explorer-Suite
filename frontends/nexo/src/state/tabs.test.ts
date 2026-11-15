import { describe, expect, it } from 'vitest';
import { initial, validate, serialize, cleanName, addTab, rename, duplicateTab, reorder, deleteTab, moveNode, assign, forget, adopt, setActive, figureOrder, setTabIncluded, moveInOrder, resetOrder } from './tabs';

describe('Team canvas tabs', () => {
  it('serializes the default workspace to null without changing it', () => {
    const s = initial(['plot-a', 'plot-b']);
    expect(serialize(s, ['plot-a'])).toBeNull();
    expect(s.tabs[0].nodes).toEqual(['plot-a', 'plot-b']);
  });
  it('repairs ownership and orphans, and falls back on malformed tabs', () => {
    const raw = { version: '1', active: 'missing', tabs: [
      { id: 'tab-1', name: ' First ', nodes: ['plot-a', 'plot-a', 'gone'] },
      { id: 'tab-2', name: 'Second', nodes: ['plot-a', 'plot-b'] }
    ], figure: { deselected: ['gone', 'plot-b'], order: ['plot-b', 'plot-b'] } };
    const s = validate(raw, ['plot-a', 'plot-b', 'orphan']);
    expect(s.tabs.map(t => t.nodes)).toEqual([['plot-a', 'orphan'], ['plot-b']]);
    expect(s.active).toBe('tab-1');
    expect(s.figure).toEqual({ deselected: ['plot-b'], order: ['plot-b'] });
    for (const bad of [null, { ...raw, version: '2' }, { ...raw, tabs: [raw.tabs[0], raw.tabs[0]] }]) {
      expect(validate(bad, ['plot-a'])).toEqual(initial(['plot-a']));
    }
  });
  it('rejects a 21st tab, including duplication, without changing state', () => {
    const s = initial([]);
    for (let i = 1; i < 20; i++) expect(addTab(s).ok).toBe(true);
    const before = structuredClone(s);
    expect(addTab(s).ok).toBe(false);
    expect(duplicateTab(s, 'tab-1').ok).toBe(false);
    expect(s).toEqual(before);
  });
  it('cleans names to 40 characters, returns null for empty, and flags duplicate names', () => {
    expect(cleanName('  A\nB  ')).toBe('A B');
    expect(cleanName('  ' + '😀'.repeat(41))).toBe('😀'.repeat(40));
    expect(cleanName(' \t\u0000 ')).toBeNull();
    const s = initial([]); addTab(s, 'Other');
    expect(rename(s, s.active, ' canvas 1 ')).toEqual({ ok: true, name: 'canvas 1', duplicate: true });
    expect(rename(s, s.active, ' ').ok).toBe(false);
    expect(rename(s, 'missing', 'Name').ok).toBe(false);
  });
  it('duplicates beside the source with an empty tab and returns card IDs for the caller', () => {
    const s = initial(['plot-a']);
    expect(duplicateTab(s, 'tab-1')).toEqual({ ok: true, id: 'tab-2', sources: ['plot-a'] });
    expect(s.tabs[1]).toEqual({ id: 'tab-2', name: 'Canvas 1 copy', nodes: [] });
    duplicateTab(s, 'tab-1');
    expect(s.tabs.map(t => t.name)).toEqual(['Canvas 1', 'Canvas 1 copy 2', 'Canvas 1 copy']);
    expect(s.active).toBe('tab-3');
  });
  it('clamps moves left and right and ignores missing tabs or unchanged positions', () => {
    const s = initial([]); addTab(s); addTab(s);
    expect(reorder(s, 'tab-3', -10)).toBe(true);
    expect(reorder(s, 'tab-3', -1)).toBe(false);
    expect(reorder(s, 'tab-3', 100)).toBe(true);
    expect(s.tabs.map(t => t.id)).toEqual(['tab-1', 'tab-2', 'tab-3']);
    expect(reorder(s, 'missing', 0)).toBe(false);
  });
  it('deleting moves or removes cards, cleans figure metadata, and protects the last tab', () => {
    const s = initial(['plot-a']); addTab(s);
    expect(deleteTab(s, 'tab-1', 'missing').ok).toBe(false);
    expect(deleteTab(s, 'tab-1', 'tab-2')).toEqual({ ok: true, removed: [], active: 'tab-2' });
    expect(s.tabs[0].nodes).toEqual(['plot-a']);
    addTab(s); s.figure = { deselected: ['plot-a'], order: ['plot-a'] };
    setActive(s, 'tab-2');
    expect(deleteTab(s, 'tab-2', null)).toEqual({ ok: true, removed: ['plot-a'], active: 'tab-3' });
    expect(s.figure).toEqual({ deselected: [], order: [] });
    expect(deleteTab(s, 'tab-3', null).ok).toBe(false);
  });
  it('tracks card membership and figure inclusion/order across pruning and adoption', () => {
    const s = initial(['plot-a', 'plot-b']); addTab(s);
    expect(moveNode(s, 'plot-a', s.active)).toBe(true);
    expect(assign(s, 'plot-a')).toBe(false);
    expect(adopt(s, ['plot-c', 'plot-c'])).toBe(true);
    expect(figureOrder(s)).toEqual(['plot-b', 'plot-a', 'plot-c']);
    expect(setTabIncluded(s, s.active, false)).toBe(true);
    expect(moveInOrder(s, 'plot-c', -1)).toBe(true);
    expect(figureOrder(s)).toEqual(['plot-b', 'plot-c', 'plot-a']);
    expect(resetOrder(s)).toBe(true);
    expect(forget(s, 'plot-a')).toBe(true);
    expect(serialize(s, ['plot-b', 'new-card'])?.tabs[1].nodes).toEqual(['new-card']);
    expect(s.tabs[1].nodes).toEqual(['plot-c']);
  });
});
