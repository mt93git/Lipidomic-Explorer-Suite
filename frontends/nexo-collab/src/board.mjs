// Minimal port of the client's projections, which are TypeScript importing other client modules (and another copy of
// yjs): teamCanvas = frontends/nexo/src/collab/export.ts toTeamCanvasV1 (with state/tabs.ts serialize), nexoOf =
// toNexoV1, replaceBoard = collab/schema.ts toDoc over a cleared board. test/board.test.mjs holds export.test.ts's fixtures.
import * as Y from 'yjs';

const nodeKeys = ['kind', 'id', 'x', 'y', 'width', 'height', 'visual', 'finished', 'assetId', 'assetVersion', 'color', 'insight', 'statistics'];
const NODE = /^[A-Za-z][A-Za-z0-9_-]{0,159}$/;
const initialTabs = ids => ({ version: '1', active: 'tab-1', tabs: [{ id: 'tab-1', name: 'Canvas 1', nodes: ids }], figure: { deselected: [], order: [] } });

/** schema.ts nodeIds: `canvas.order` first, then ids it does not name in id order. */
function nodeIds(doc) {
  const nodes = doc.getMap('nodes'), order = doc.getMap('canvas').get('order')?.toArray() ?? [];
  return [...new Set(order.filter(id => nodes.has(id)))].concat([...nodes.keys()].filter(id => !order.includes(id)).sort());
}

export function teamCanvas(doc) {
  const canvas = doc.getMap('canvas'), figure = doc.getMap('document'), all = doc.getMap('nodes');
  const nodes = nodeIds(doc).map(id => {
    const node = all.get(id).toJSON();
    return { ...node, visual: node.visual ?? {}, finished: node.finished ?? null,
      ...(node.instance ? { instance: { id: node.instance.id, source: node.instance.source, inputs: node.instance.inputs ?? {} } } : {}) };
  });
  // tabs.ts prune + isDefault, with the first tab active (fromDoc's savedActive).
  const ids = [...new Set(nodes.map(n => n.id).filter(id => NODE.test(id)))];
  const shared = doc.getMap('tabs').toJSON();
  const tabs = { ...shared, active: shared.tabs[0]?.id ?? '' };
  tabs.tabs = tabs.tabs.map(t => ({ ...t, nodes: t.nodes.filter(id => ids.includes(id)) }));
  const owned = tabs.tabs.flatMap(t => t.nodes);
  (tabs.tabs.find(t => t.id === tabs.active) ?? tabs.tabs[0]).nodes.push(...ids.filter(id => !owned.includes(id)));
  tabs.figure = { deselected: tabs.figure.deselected.filter(id => ids.includes(id)), order: tabs.figure.order.filter(id => ids.includes(id)) };
  const isDefault = tabs.tabs.length === 1 && tabs.tabs[0].id === 'tab-1' && tabs.tabs[0].name === 'Canvas 1' && tabs.active === 'tab-1' &&
    !tabs.figure.deselected.length && !tabs.figure.order.length;
  return { version: canvas.get('version'), libraryHidden: canvas.get('libraryHidden') ?? false, nodes,
    document: figure.size ? figure.toJSON() : null, tabs: isDefault ? null : tabs };
}

export const nexoOf = doc => doc.getMap('nexo').toJSON();

/** Clears the board (canvas, nodes, document, tabs, nexo; comments and meta stay) and writes a Team canvas and Nexo
 *  state in the document shape the client reads. The caller owns the transaction. */
export function replaceBoard(doc, state, nexo) {
  for (const name of ['canvas', 'nodes', 'document', 'tabs', 'nexo']) doc.getMap(name).clear();
  const ids = state.nodes.map(node => node.id);
  const canvas = doc.getMap('canvas');
  canvas.set('version', state.version);
  canvas.set('libraryHidden', state.libraryHidden ?? false);
  canvas.set('order', Y.Array.from(ids));
  for (const node of state.nodes) {
    const value = new Y.Map();
    for (const key of nodeKeys) if (node[key] !== undefined) value.set(key, structuredClone(node[key]));
    value.set('label', new Y.Text(node.label));
    if (node.instance === null) value.set('instance', null);
    else if (node.instance) value.set('instance', new Y.Map([['id', node.instance.id], ['source', node.instance.source],
      ['inputs', new Y.Map(Object.entries(structuredClone(node.instance.inputs ?? {})))]]));
    doc.getMap('nodes').set(node.id, value);
  }
  for (const [key, value] of Object.entries(state.document ?? {})) {
    doc.getMap('document').set(key, key === 'items' ? Y.Array.from(structuredClone(value)) : structuredClone(value));
  }
  // Team validated these tabs; cards they do not name join the first tab, as tabs.ts validate does.
  const tabs = structuredClone(state.tabs ?? initialTabs([]));
  const owned = tabs.tabs.flatMap(t => t.nodes);
  tabs.tabs[0].nodes.push(...ids.filter(id => !owned.includes(id)));
  const shared = doc.getMap('tabs');
  shared.set('version', tabs.version);
  shared.set('tabs', Y.Array.from(tabs.tabs.map(t => new Y.Map([['id', t.id], ['name', new Y.Text(t.name)], ['nodes', Y.Array.from(t.nodes)]]))));
  shared.set('figure', tabs.figure);
  const sharedNexo = doc.getMap('nexo');
  sharedNexo.set('version', nexo.version);
  sharedNexo.set('nodes', new Y.Map(Object.entries(nexo.nodes).map(([id, node]) => [id, new Y.Map(Object.entries(structuredClone(node)))])));
  if (nexo.design !== undefined) sharedNexo.set('design', structuredClone(nexo.design));
}
