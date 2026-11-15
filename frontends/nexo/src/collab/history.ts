import * as Y from 'yjs';
import type { Command } from '../state/commands';
import type { CanvasState } from '../state/types';
import type { Node } from '../state/document';
import type { Nexo } from '../state/nexo';
import { moveNode, validate, type TabState } from '../state/tabs';
import { nexoMap, nodeIds, nodeKeys, nodeMap, nodeOf, tabMap } from './schema';

/** Who made a document change (plan 2.3). Side effects that reach the engine run only for local and undo. */
export type Origin = { kind: 'local' | 'remote' | 'init' | 'undo' };
interface Store<S> { get(): S; set(updater: (state: S) => S): void }
type Board = CanvasState & { libraryHidden?: boolean; document?: unknown; tabs?: unknown; nexo?: Nexo };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function setText(text: Y.Text, value: string) { if (text.toString() !== value) { text.delete(0, text.length); text.insert(0, value); } }
// Make a Y.Array of ids hold `ids`: remove the ones gone, append the new ones (concurrent appends keep both).
function setIds(array: Y.Array<string>, ids: string[]) {
  const keep = new Set(ids);
  for (let i = array.length - 1; i >= 0; i--) if (!keep.has(array.get(i))) array.delete(i, 1);
  const have = new Set(array.toArray());
  array.push(ids.filter(id => !have.has(id)));
}

/** The bridge (nexo-collab-plan.md 2.3, Phase 2): a local command is applied to the store and its field-level diff is
 *  written into the document in one transaction with origin local; a change from anyone else (remote), the first
 *  opener's seed (init) or this person's undo updates the store from the document and is never re-dispatched. Server-
 *  settled fields (instance inputs after the card is added, Nexo inputs and actions, the saved design, the session
 *  palette) are not written: the sidecar refuses them (plan 2.1), Phase 3 sends them as intents and the sidecar's
 *  write (origin server, a remote change here) brings them back. Undo is this
 *  person's own: Y.UndoManager tracks only the local origin, with history.ts's boundaries and cap. */
export function createDocumentHistory<S extends CanvasState>(store: Store<S>, doc: Y.Doc, adopt?: (history: DocumentHistory) => void) {
  const canvas = doc.getMap('canvas'), nodes = doc.getMap<Y.Map<unknown>>('nodes'), figure = doc.getMap('document');
  const tabs = doc.getMap('tabs'), nexo = doc.getMap('nexo');
  const local: Origin = { kind: 'local' };
  const manager = new Y.UndoManager([canvas, nodes, figure, tabs, nexo], { trackedOrigins: new Set([local]), captureTimeout: 700 });
  manager.on('stack-item-added', () => { if (manager.undoStack.length > 50) manager.undoStack.shift(); });
  let key: string | undefined, origin: Origin = local;

  function tabsOf(state: Board, active?: string): TabState {
    const ids = state.nodes.map(n => n.id), raw = state.tabs as TabState | null | undefined;
    return validate(raw && { ...raw, active: active ?? raw.active }, ids);
  }
  // Document → store, keeping what only this person holds: the active tab. Server-settled values (instance and Nexo
  // inputs, actions, design) are the document's: the sidecar writes them (Phase 3 intents).
  function pull(kind: Origin['kind'], tr?: Y.Transaction) {
    if (!canvas.has('version')) return;
    origin = { kind };
    try {
      store.set(current => {
        const state = current as unknown as Board, mine = new Map(state.nodes.map(n => [n.id, n as unknown as Node]));
        const next = nodeIds(doc).map(id => {
          const map = nodes.get(id)!, own = mine.get(id);
          if (own && tr && !tr.changedParentTypes.has(map as never) && !tr.changed.get(nodes as never)?.has(id)) return own;
          const n = nodeOf(map); if (!own) return n;
          const out = { ...own, label: n.label } as Record<string, unknown>;
          for (const k of nodeKeys) if (n[k] === undefined) delete out[k]; else out[k] = n[k];
          // The store's instance keeps its own id key (instanceId for a card added in this session).
          if (n.instance) out.instance = own.instance ? { ...own.instance, inputs: n.instance.inputs } : n.instance;
          return out as unknown as Node;
        });
        const shared = structuredClone(nexo.toJSON()) as Nexo;
        const nexoNodes = shared.nodes ?? {};
        const design = shared.design ?? state.nexo?.design;
        const board = { ...state, libraryHidden: canvas.get('libraryHidden') as boolean, nodes: next,
          document: figure.size ? structuredClone(figure.toJSON()) : null,
          nexo: { version: 1 as const, nodes: nexoNodes, ...(design !== undefined ? { design } : {}) } };
        return { ...board, tabs: tabsOf({ ...board, tabs: structuredClone(tabs.toJSON()) }, (state.tabs as TabState | null | undefined)?.active) } as unknown as S;
      });
    } finally { origin = local; }
  }
  // Store → document: what differs from the document, field by field.
  function push(state: Board) {
    const ids = state.nodes.map(n => n.id), keep = new Set(ids);
    for (const id of [...nodes.keys()]) if (!keep.has(id)) nodes.delete(id);
    for (const raw of state.nodes) {
      const n = raw as unknown as Node, sharedNode = nodes.get(n.id);
      if (!sharedNode) { nodes.set(n.id, nodeMap(n)); continue; }
      for (const k of nodeKeys) if (!same(sharedNode.get(k), n[k])) { if (n[k] === undefined) sharedNode.delete(k); else sharedNode.set(k, structuredClone(n[k])); }
      setText(sharedNode.get('label') as Y.Text, n.label);
    }
    if (!canvas.get('order')) canvas.set('order', new Y.Array<string>());
    setIds(canvas.get('order') as Y.Array<string>, ids);
    if (canvas.get('libraryHidden') !== (state.libraryHidden ?? false)) canvas.set('libraryHidden', state.libraryHidden ?? false);
    const page = (state.document ?? {}) as Record<string, unknown>;
    for (const k of [...figure.keys()]) if (!(k in page)) figure.delete(k);
    for (const [k, v] of Object.entries(page)) if (!same(figure.get(k), v)) figure.set(k, k === 'items' ? Y.Array.from(structuredClone(v as object[])) : structuredClone(v));
    const { active: _, ...board } = tabsOf(state);
    if (!same(tabs.get('figure'), board.figure)) tabs.set('figure', structuredClone(board.figure));
    const list = tabs.get('tabs') as Y.Array<Y.Map<unknown>>;
    if (list.toArray().map(t => t.get('id')).join() !== board.tabs.map(t => t.id).join()) {
      for (let i = list.length - 1; i >= 0; i--) if (!board.tabs.some(t => t.id === list.get(i).get('id'))) list.delete(i, 1);
      board.tabs.forEach((tab, i) => {
        if (list.length > i && list.get(i).get('id') === tab.id) return;
        const at = list.toArray().findIndex(t => t.get('id') === tab.id);
        if (at >= 0) list.delete(at, 1);
        list.insert(i, [tabMap(tab)]);
      });
    }
    board.tabs.forEach((tab, i) => { setText(list.get(i).get('name') as Y.Text, tab.name); setIds(list.get(i).get('nodes') as Y.Array<string>, tab.nodes); });
    const sharedNexo = nexo.get('nodes') as Y.Map<Y.Map<unknown>>, own = state.nexo?.nodes ?? {};
    for (const id of [...sharedNexo.keys()]) if (!(id in own)) sharedNexo.delete(id);
    for (const [id, n] of Object.entries(own)) {
      const entry = sharedNexo.get(id);
      if (!entry) sharedNexo.set(id, nexoMap(n));
      else if (!same(entry.get('style'), n.style)) { if (n.style === undefined) entry.delete('style'); else entry.set('style', structuredClone(n.style)); }
    }
  }
  doc.on('afterTransaction', (tr: Y.Transaction) => {
    if (tr.origin === local || !tr.changed.size) return;
    pull(tr.origin === manager ? 'undo' : (tr.origin as Origin | null)?.kind === 'init' ? 'init' : 'remote', tr);
  });
  const history = {
    // Same signature as createHistory's: a fold, or the same coalesce key within 700 ms, stays in the current step.
    dispatch(cmd: Command, { fold = false }: { fold?: boolean } = {}) {
      const before = store.get() as unknown as Board;
      let next = cmd.apply(before as never) as unknown as Board;
      // A card this person adds joins their active tab, in the same step.
      const raw = next.tabs as TabState | null | undefined, owned = new Set(raw?.tabs.flatMap(t => t.nodes) ?? next.nodes.map(n => n.id));
      const t = tabsOf(next), had = new Set(before.nodes.map(n => n.id));
      for (const n of next.nodes) if (!had.has(n.id) && !owned.has(n.id)) moveNode(t, n.id, t.active);
      next = { ...next, tabs: t };
      if (fold) { if (manager.lastChange > 0) manager.lastChange = Date.now(); }
      else if (cmd.coalesceKey === undefined || cmd.coalesceKey !== key) manager.stopCapturing();
      key = cmd.coalesceKey;
      origin = local;
      store.set(() => next as unknown as S);
      doc.transact(() => push(next), local);
    },
    undo() { const done = manager.undo() !== null; manager.stopCapturing(); return done; },
    redo() { const done = manager.redo() !== null; manager.stopCapturing(); return done; },
    get canUndo() { return manager.canUndo(); },
    get canRedo() { return manager.canRedo(); },
    /** The undo stack length, where createHistory has its cursor (recheckStatistics folds against it). */
    get cursor() { return manager.undoStack.length; },
    /** The origin of the store change being delivered: subscribers ask it during the notification. */
    get origin() { return origin; },
  };
  // The caller adopts the history first, so its subscribers see this first pull's origin: a joiner takes the document.
  adopt?.(history);
  pull('init');
  return history;
}
export interface DocumentHistory { readonly origin: Origin }
