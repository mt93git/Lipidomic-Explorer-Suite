import * as model from '../state/tabs';
import type { Command } from '../state/commands';
import type { CanvasState } from '../state/types';
export function visibleNodeIds(doc: { nodes: { id: string }[] }, tabs: model.TabState, activeId: string): string[] {
  const owned = new Set(tabs.tabs.flatMap(t => t.nodes));
  const active = new Set(tabs.tabs.find(t => t.id === activeId)?.nodes ?? []);
  return doc.nodes.filter(n => active.has(n.id) || (!owned.has(n.id) && activeId === tabs.tabs[0].id)).map(n => n.id);
}
export function moveNodesToTab(tabs: model.TabState, ids: readonly string[], targetId: string) {
  const next = model.clone(tabs);
  ids.forEach(id => model.moveNode(next, id, targetId));
  return next;
}
export function deleteTabPlan(tabs: model.TabState, id: string, mode: 'move' | 'remove', target?: string) {
  const empty = { moves: [] as { id: string; target: string }[], removals: [] as string[] };
  const tab = tabs.tabs.find(t => t.id === id);
  if (!tab || tabs.tabs.length < 2 || (mode === 'move' && (!target || target === id || !tabs.tabs.some(t => t.id === target)))) return empty;
  return mode === 'remove' ? { ...empty, removals: tab.nodes.slice() } : { ...empty, moves: tab.nodes.map(id => ({ id, target: target! })) };
}
// One history entry restores both card instances and tab membership.
export function tabsCommand(tabs: model.TabState, commands: Command[] = []): Command {
  const snapshot = model.clone(tabs);
  return { kind: 'tabs', apply<S extends CanvasState>(doc: S): S {
    const next = commands.reduce((d, c) => c.apply(d), doc);
    return { ...next, tabs: model.serialize(snapshot, next.nodes.map(n => n.id)) };
  }, invert(doc) {
    const before = structuredClone(doc);
    return { kind: 'undo:tabs', apply: <S extends CanvasState>(current: S) => ({ ...current, ...structuredClone(before) }), invert: () => tabsCommand(snapshot, commands) };
  } };
}
