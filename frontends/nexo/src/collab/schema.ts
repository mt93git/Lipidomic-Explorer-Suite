import * as Y from 'yjs';
import type { CanvasState, Document, Node } from '../state/document';
import { validate, type TabState } from '../state/tabs';
import type { Nexo, NexoNode } from '../state/nexo';

type State = Pick<CanvasState, 'version' | 'libraryHidden' | 'nodes' | 'document'>;
/** Node keys a person writes (plan 2.1 client-writable, Team's node allowlist); label is a Y.Text, instance is
 *  written once with the card. Team node objects must never acquire z or render. */
export const nodeKeys = ['kind','id','x','y','width','height','visual','finished','assetId','assetVersion','color','insight','statistics'] as const;

/** A card added in this session carries instance.instanceId until it is saved; the document holds Team's id. */
export function nodeMap(node: Node & { instance?: { instanceId?: string } | null }): Y.Map<unknown> {
 const value = new Y.Map<unknown>();
 for (const key of nodeKeys) if (node[key] !== undefined) value.set(key, structuredClone(node[key]));
 value.set('label', new Y.Text(node.label));
 if (node.instance === null) value.set('instance', null);
 else if (node.instance) {
  const instance = new Y.Map<unknown>();
  instance.set('id', node.instance.id ?? node.instance.instanceId);
  instance.set('source', node.instance.source);
  instance.set('inputs', new Y.Map(Object.entries(structuredClone(node.instance.inputs ?? {}))));
  value.set('instance', instance);
 }
 return value;
}
export const nexoMap = (node: NexoNode) => new Y.Map<unknown>(Object.entries(structuredClone(node)));
export const tabMap = (tab: TabState['tabs'][number]) => new Y.Map<unknown>([['id', tab.id], ['name', new Y.Text(tab.name)], ['nodes', Y.Array.from(tab.nodes)]]);

/** Convert persistent v1 state only; active tab and render caches belong to the client. Node order is the explicit
 *  `canvas.order` array, so every peer reads the nodes in one order. Every root value is a map key, so two
 *  concurrent writers of a whole board leave one copy (last writer per key), never two. */
export function toDoc(state: State, tabs: TabState, nexo: Nexo, doc = new Y.Doc(), origin: unknown = null): Y.Doc {
 doc.transact(() => {
  const canvas = doc.getMap('canvas');
  canvas.set('version', state.version);
  canvas.set('libraryHidden', state.libraryHidden);
  canvas.set('order', Y.Array.from(state.nodes.map(node => node.id)));
  const nodes = doc.getMap<Y.Map<unknown>>('nodes');
  for (const node of state.nodes) nodes.set(node.id, nodeMap(node));
  const figure = doc.getMap('document');
  if (state.document) {
   for (const [key, value] of Object.entries(state.document)) {
    figure.set(key, key === 'items' ? Y.Array.from(structuredClone(state.document.items)) : structuredClone(value));
   }
  }
  const sharedTabs = doc.getMap('tabs');
  sharedTabs.set('version', tabs.version);
  sharedTabs.set('tabs', Y.Array.from(tabs.tabs.map(tabMap)));
  sharedTabs.set('figure', structuredClone(tabs.figure));
  const sharedNexo = doc.getMap('nexo');
  sharedNexo.set('version', nexo.version);
  sharedNexo.set('nodes', new Y.Map(Object.entries(nexo.nodes).map(([id, node]) => [id, nexoMap(node)])));
  if (nexo.design !== undefined) sharedNexo.set('design', structuredClone(nexo.design));
  for (const name of ['comments', 'renderState', 'meta']) doc.getMap(name);
 }, origin);
 return doc;
}

/** The first opener writes its board into an empty document (origin init); a document with a board is left alone. */
export function seedDoc(doc: Y.Doc, state: State & { tabs?: unknown; nexo: Nexo }): boolean {
 if (doc.getMap('canvas').has('version')) return false;
 toDoc(state, validate(state.tabs, state.nodes.map(n => n.id)), state.nexo, doc, { kind: 'init' });
 return true;
}

export const nodeOf = (node: Y.Map<unknown>) => structuredClone(node.toJSON()) as Node;
/** The board's node order: `canvas.order`; ids it does not name (none in a valid board) follow in id order. */
export function nodeIds(doc: Y.Doc): string[] {
 const nodes = doc.getMap('nodes'), order = (doc.getMap('canvas').get('order') as Y.Array<string> | undefined)?.toArray() ?? [];
 return [...new Set(order.filter(id => nodes.has(id)))].concat([...nodes.keys()].filter(id => !order.includes(id)).sort());
}

export function fromDoc(doc: Y.Doc): {state: State; tabs: TabState; nexo: Nexo} {
 const {order: _, ...canvas} = doc.getMap('canvas').toJSON();
 const figure = doc.getMap('document');
 const tabs = structuredClone(doc.getMap('tabs').toJSON()) as Omit<TabState, 'active'>;
 // No committed-change history exists at this stage. The deterministic savedActive
 // fallback is the first tab; personal active is never stored in the shared doc.
 const savedActive = tabs.tabs[0]?.id ?? '';
 const nodes = doc.getMap<Y.Map<unknown>>('nodes');
 return {
  state: {
   version: canvas.version,
   libraryHidden: canvas.libraryHidden,
   nodes: nodeIds(doc).map(id => nodeOf(nodes.get(id)!)),
   document: figure.size ? structuredClone(figure.toJSON()) as Document : null,
  },
  tabs: {...tabs, active: savedActive},
  nexo: structuredClone(doc.getMap('nexo').toJSON()) as Nexo,
 };
}
