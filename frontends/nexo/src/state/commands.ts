import type { CanvasState, Node } from './types';
export interface Command { kind: string; coalesceKey?: string; apply<S extends CanvasState>(doc: S): S; invert(doc: CanvasState): Command }
type Rect = Pick<Node, 'x' | 'y' | 'width' | 'height'>;
// Capture the node sequence for inverse replay, preserving other document fields.
function edit(kind: string, apply: (doc: CanvasState) => CanvasState, coalesceKey?: string): Command {
  return { kind, coalesceKey, apply: <S extends CanvasState>(doc: S) => apply(doc) as S, invert(doc) {
    const before = doc.nodes.map(n => ({ ...n })); const nexo=structuredClone(doc.nexo);
    return edit(`undo:${kind}`, current => ({ ...current, nodes: before.map(n => ({ ...n })), nexo }));
  } };
}
function patch(kind: string, ids: readonly string[], update: (node: Node) => Node, key?: string): Command {
  const selected = new Set(ids);
  return edit(kind, doc => ({ ...doc, nodes: doc.nodes.map(n => selected.has(n.id) ? update(n) : n) }), key);
}
export const moveNodes = (ids: readonly string[], dx: number, dy: number, coalesceKey?: string): Command => patch('moveNodes', ids, n => ({ ...n, x: n.x + dx, y: n.y + dy }), coalesceKey);
export const resizeNode = (id: string, width: number, height: number, coalesceKey?: string): Command => patch('resizeNode', [id], n => ({ ...n, width, height }), coalesceKey);
export const setLabel = (id: string, label: string): Command => patch('setLabel', [id], n => ({ ...n, label }));
// H8: a Data-tab change (server-confirmed inputs) is an undoable step; the canvas sends restored inputs back to the API.
export const setNodeInputs = (id: string, inputs: Record<string, unknown>): Command => { const copy = structuredClone(inputs); type WithInstance = Node & { instance?: { source?: string; inputs?: unknown } }; return patch('setNodeInputs', [id], node => { const n = node as WithInstance; return { ...n, instance: { ...(n.instance ?? {}), source: n.instance?.source ?? n.id, inputs: structuredClone(copy) } } as Node; }); };
export const setGeometry = (id: string, rect: Rect, coalesceKey?: string): Command => { const copy = { ...rect }; return patch('setGeometry', [id], n => ({ ...n, ...copy }), coalesceKey); };
export function addNode(node: Node): Command {
  const copy = structuredClone(node);
  return edit('addNode', doc => ({ ...doc, nodes: doc.nodes.some(n => n.id === copy.id) ? doc.nodes : [...doc.nodes, structuredClone(copy)] }));
}
export function removeNodes(ids: readonly string[]): Command {
  const selected = new Set(ids);
  return edit('removeNodes', doc => ({ ...doc, nodes: doc.nodes.filter(n => !selected.has(n.id)), nexo: doc.nexo ? {...doc.nexo,nodes:Object.fromEntries(Object.entries(doc.nexo.nodes).filter(([id])=>!selected.has(id)))} : undefined }));
}

export function setDocument(value:import('./document').Document|null):Command {
 const copy=structuredClone(value);
 return {kind:'setDocument',apply(doc){return {...doc,document:structuredClone(copy)};},invert(doc){return setDocument((doc as CanvasState & {document?:import('./document').Document|null}).document??null);}};
}
export const setFinished = (id:string, finished: import('../api').Node['finished']):Command => patch('setFinished',[id],n=>({...n,finished:structuredClone(finished??null)}));
/** F3/F5 style batch: per node, the given width/height/visual replace the node's; one undo step, inverted node by node. */
import { setNexoStyle } from './nexo';
export type StyleEntry = { id: string; width?: number; height?: number; visual?: unknown; nexoStyle?: import('./nexo').NexoStyle };
export function styleNodes(kind: string, entries: readonly StyleEntry[]): Command {
  const copy = structuredClone(entries) as StyleEntry[];
  const byId = new Map(copy.map(e => [e.id, e]));
  return { kind, apply: <S extends CanvasState>(doc: S) => {
      let next = { ...doc, nodes: doc.nodes.map(n => { const e = byId.get(n.id); if (!e) return n; const { id: _, nexoStyle: __, ...fields } = e; return { ...n, ...structuredClone(fields) }; }) } as S;
      // Nexo-only style travels in the same step (Nexo's own member, not Team's node).
      for (const e of copy) if (e.nexoStyle !== undefined && next.nodes.some(n => n.id === e.id)) next = setNexoStyle(e.id, e.nexoStyle).apply(next) as S;
      return next;
    },
    invert(doc) {
      const nexo = (doc as typeof doc & { nexo?: import('./nexo').Nexo }).nexo;
      const before = copy.flatMap(e => { const n = doc.nodes.find(n => n.id === e.id) as (Node & { visual?: unknown }) | undefined; if (!n) return []; const out: StyleEntry = { id: e.id }; for (const k of ['width', 'height', 'visual'] as const) if (k in e) (out as Record<string, unknown>)[k] = structuredClone(n[k]); if (e.nexoStyle !== undefined) out.nexoStyle = structuredClone(nexo?.nodes[e.id]?.style ?? {}); return [out]; });
      return styleNodes(`undo:${kind}`, before);
    } };
}
