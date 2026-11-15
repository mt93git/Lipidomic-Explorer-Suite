// The sidecar's port of the client's projections (frontends/nexo/src/collab/export.ts toTeamCanvasV1/toNexoV1 and
// schema.ts toDoc), with the fixtures of export.test.ts: a Team canvas written into a document and read back is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { teamCanvas, nexoOf, replaceBoard } from '../src/board.mjs';

const nodes = [1, 2, 3].map(i => ({ kind: 'plot', id: `tcinstance_${i}-plot_pca`, label: 'PCA', x: i * 500, y: 0, width: 440, height: 330,
  visual: { plotTitle: 'Title' }, finished: null, instance: { id: `tcinstance_${i}`, source: 'results_dashboard-plot_pca', inputs: { color_by: 'Group1' } } }));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
const document = { version: '1', layout: 'free', paper: 'letter', orientation: 'portrait', items: [{ id: 'text-1', type: 'text', x: 46, y: 46,
  width: 220, height: 50, z: 1, text: 'Synthetic figure title', fontSize: 16, color: '#172d4b' }] };
const tabs = { version: '1', active: 'tab-1', tabs: [{ id: 'tab-1', name: 'Canvas 1', nodes: [nodes[0].id, nodes[1].id] },
  { id: 'tab-2', name: 'Other', nodes: [nodes[2].id] }], figure: { deselected: [], order: [] } };
const illustration = { kind: 'illustration', id: 'illustration-1', label: 'Illustration', x: 0, y: 0, width: 440, height: 330, visual: {},
  finished: null, assetId: 'lipid-bilayer', assetVersion: '1', color: '#123456', insight: null };
const nexo = { version: 1, nodes: { [nodes[0].id]: { style: { titleWeight: 'bold' }, inputs: { selectedDetails: 'GP_PC | Total Carbons' },
  actions: ['runAnalysis', 'updateSpecies'] } }, design: { unit: 'Animal', type: 'independent' } };
const cases = {
  'three nodes with inputs and tabs': { version: '1', libraryHidden: false, nodes, document: null, tabs },
  'default tabs and PNG finished snapshot': { version: '1', libraryHidden: false, document: null, tabs: null,
    nodes: [{ ...nodes[0], finished: { url: png, createdAt: '2026-01-01T00:00:00Z', stale: false } }] },
  'figure page document': { version: '1', libraryHidden: false, nodes, document, tabs: null },
  'complete synthetic checkpoint empty opening canvas': { version: '1', libraryHidden: false, nodes: [], document: null, tabs: null },
  'illustration, custom figure and figure tab order': { version: '1', libraryHidden: true, nodes: [nodes[0], illustration],
    document: { ...document, paper: 'custom', paperWidth: 900, paperHeight: 700 },
    tabs: { version: '1', active: 'tab-1', tabs: [{ id: 'tab-1', name: 'Canvas 1', nodes: [nodes[0].id] }, { id: 'tab-2', name: 'Figures', nodes: [illustration.id] }],
      figure: { deselected: [nodes[0].id], order: [illustration.id, nodes[0].id] } } },
};
for (const [name, canvas] of Object.entries(cases)) {
  test(`${name}: Team canvas round trip`, () => {
    const doc = new Y.Doc();
    replaceBoard(doc, canvas, nexo);
    assert.deepEqual(teamCanvas(doc), canvas);
    assert.deepEqual(nexoOf(doc), nexo);
  });
}

test('the written board has the shared types the client reads', () => {
  const doc = new Y.Doc();
  replaceBoard(doc, cases['three nodes with inputs and tabs'], nexo);
  const node = doc.getMap('nodes').get(nodes[0].id);
  assert.ok(node.get('label') instanceof Y.Text);
  assert.ok(node.get('instance').get('inputs') instanceof Y.Map);
  assert.deepEqual(doc.getMap('canvas').get('order').toArray(), nodes.map(n => n.id));
  assert.ok(doc.getMap('tabs').get('tabs').get(1).get('name') instanceof Y.Text);
  assert.ok(doc.getMap('nexo').get('nodes').get(nodes[0].id) instanceof Y.Map);
});

test('replacing a board removes the old cards and keeps comments', () => {
  const doc = new Y.Doc();
  replaceBoard(doc, cases['three nodes with inputs and tabs'], nexo);
  doc.getMap('comments').set('c1', 'synthetic comment');
  replaceBoard(doc, cases['complete synthetic checkpoint empty opening canvas'], { version: 1, nodes: {} });
  assert.equal(doc.getMap('nodes').size, 0);
  assert.equal(doc.getMap('comments').get('c1'), 'synthetic comment');
  assert.deepEqual(nexoOf(doc), { version: 1, nodes: {} });
});

test('the activity feed is not exported to Team or the Nexo member', () => {
  const doc = new Y.Doc();
  doc.transact(() => replaceBoard(doc, cases['three nodes with inputs and tabs'], nexo));
  doc.getArray('activity').push([{ at: 1, actor: 'ada', displayName: 'Ada', kind: 'save', label: 'Synthetic' }]);
  assert.doesNotMatch(JSON.stringify([teamCanvas(doc), nexoOf(doc)]), /activity|Synthetic/);
});
