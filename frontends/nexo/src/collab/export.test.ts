import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { toCanvasV1 } from '../state/serialize';
import * as tabsModel from '../state/tabs';
import type { CanvasState, Document, Node } from '../state/document';
import type { Nexo } from '../state/nexo';
import { toDoc, fromDoc, seedDoc } from './schema';
import { createStore } from '../state/store';
import { addNode } from '../state/commands';
import { createDocumentHistory } from './history';
import { toTeamCanvasV1, toNexoV1 } from './export';

const nodes: Node[] = [1, 2, 3].map(i => ({kind:'plot', id:`tcinstance_${i}-plot_pca`, label:'PCA', x:i*500, y:0, width:440, height:330, visual:{plotTitle:'Title'}, finished:null, instance:{id:`tcinstance_${i}`, source:'results_dashboard-plot_pca', inputs:{color_by:'Group1'}}}));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
const document: Document = {version:'1', layout:'free', paper:'letter', orientation:'portrait', items:[{id:'text-1', type:'text', x:46, y:46, width:220, height:50, z:1, text:'Synthetic figure title', fontSize:16, color:'#172d4b'}]};
const other = tabsModel.initial(nodes.map(n => n.id));
tabsModel.addTab(other, 'Other');
tabsModel.moveNode(other, nodes[2].id, other.active);
// Active is personal; the shared document has no change history, so the first tab wins.
other.active = other.tabs[0].id;
const richNodes: Node[] = [
 {...nodes[0], id:'tcinstance_1-plot_violin', instance:{...nodes[0].instance!,source:'results_dashboard-plot_violin'}, finished:{url:'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'), createdAt:'2026-01-01T00:00:00Z', stale:false}, statistics:{version:'1', presentation:{show:true, pValue:'adjusted', label:'both', fontSize:12, spacing:0.08, tip:0.02, nDisplay:'both', hidden:[]}, applied:{test:'welch', effect:'hedges_g', correction:'BH', scope:'displayed', comparisons:[['Control','Treatment']]}, result:{fingerprint:'a'.repeat(64), dataFingerprint:'b'.repeat(64), computedAt:'2026-01-01T00:00:00Z', lipid:'PC', grouping:'Group1', family:{m:1,features:1,comparisons:1,untestable:0}, groups:[{group:'Control',nSamples:12,nExcluded:0},{group:'Treatment',nSamples:12,nExcluded:0}], rows:[{a:'Control',b:'Treatment',nA:12,nB:12,p:0.01,pAdj:0.01,note:''}], provenance:{method:'welch', transformation:'log2', normalization:'none', imputation:'none', participantIds:'unique', design:'independent'}}}},
 {...nodes[1], finished:{url:png, createdAt:'2026-01-01T00:00:00Z', stale:false}},
 {kind:'illustration', id:'illustration-1', label:'Illustration', x:0,y:0,width:440,height:330, visual:{}, assetId:'lipid-bilayer', assetVersion:'1', color:'#123456', insight:null},
];
const richTabs = tabsModel.initial(richNodes.map(n => n.id));
tabsModel.addTab(richTabs, 'Figures'); tabsModel.moveNode(richTabs, richNodes[2].id, richTabs.active); richTabs.active = richTabs.tabs[0].id;
richTabs.figure = {deselected:[richNodes[1].id], order:[richNodes[2].id,richNodes[0].id]};
const nexo: Nexo = {version:1, nodes:{[nodes[0].id]:{style:{titleWeight:'bold', series:[{index:0,lineDash:'dash'}]}, inputs:{selectedDetails:'GP_PC | Total Carbons', upload:{name:'synthetic.csv',content:'x,y\n1,2'}}, actions:['runAnalysis','updateSpecies']}}, design:{unit:'Animal',type:'independent'}};
const cases = [
 {name:'three nodes with inputs and tabs', state:{version:'1', libraryHidden:false, nodes, document:null}, tabs:other},
 {name:'default tabs and PNG finished snapshot', state:{version:'1',libraryHidden:false,nodes:[{...nodes[0],finished:{url:png,createdAt:'2026-01-01T00:00:00Z',stale:false}}],document:null}, tabs:tabsModel.initial([nodes[0].id])},
 {name:'figure page document',state:{version:'1',libraryHidden:false,nodes,document},tabs:tabsModel.initial(nodes.map(n=>n.id))},
 // nexo-complete-synthetic.zip contains only science state and data_files (see nexo-complete-fixture.md).
 // Its current opening canvas is empty; there is no team-canvas-v1.json or nexo-canvas-v1.json to extract.
 {name:'complete synthetic checkpoint empty opening canvas',state:{version:'1',libraryHidden:false,nodes:[],document:null},tabs:tabsModel.initial([])},
 {name:'SVG, PNG, illustration, custom figure, statistics and Nexo fields',state:{version:'1',libraryHidden:true,nodes:richNodes,document:{...document,paper:'custom',paperWidth:900,paperHeight:700,showPageFurniture:false,items:[...document.items,{id:'figure-1',type:'figure',nodeId:richNodes[0].id,caption:'Synthetic',x:0,y:100,width:440,height:330,z:2}]}},tabs:richTabs},
] satisfies {name:string;state:CanvasState;tabs:tabsModel.TabState}[];
for (const fixture of cases) {
 test(`${fixture.name}: lossless state round trip`, () => {
  const doc = toDoc(fixture.state, fixture.tabs, nexo);
  expect(fromDoc(doc)).toEqual({state:fixture.state,tabs:fixture.tabs,nexo});
 });
 test(`${fixture.name}: existing Team and Nexo projections`, () => {
  const doc = toDoc(fixture.state, fixture.tabs, nexo);
  // The existing serializer's SVG validator needs a browser parser. This narrow
  // edge fake accepts only our literal SVG; the new exporter runs without it.
  vi.stubGlobal('DOMParser', class {
   parseFromString(markup: string) {
    expect(markup).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    return {documentElement:{localName:'svg'}, querySelector:()=>null, querySelectorAll:()=>[]};
   }
  });
  let expected;
  try { expected = toCanvasV1(fixture.state as Parameters<typeof toCanvasV1>[0], fixture.tabs); }
  finally { vi.unstubAllGlobals(); }
  expect(toTeamCanvasV1(doc)).toEqual({...expected, tabs:{...fixture.tabs, savedActive:fixture.tabs.tabs[0].id}});
  expect(toNexoV1(doc)).toEqual(nexo);
 });
}
test('node objects never gain z or render keys', () => {
 const doc = toDoc(cases[0].state, other, nexo);
 for (const node of doc.getMap<Y.Map<unknown>>('nodes').values()) {
  expect(node.has('z')).toBe(false); expect(node.has('render')).toBe(false);
 }
 for (const node of toTeamCanvasV1(doc).nodes) {
  expect(node).not.toHaveProperty('z'); expect(node).not.toHaveProperty('render');
 }
});
test('personal active is absent and export deterministically selects first tab', () => {
 const personal = {...other,active:other.tabs[1].id};
 const doc = toDoc(cases[0].state,personal,nexo);
 expect(doc.getMap('tabs').has('active')).toBe(false);
 expect(fromDoc(doc).tabs.active).toBe(other.tabs[0].id);
 expect(toTeamCanvasV1(doc)).toEqual({...toCanvasV1(cases[0].state as Parameters<typeof toCanvasV1>[0],other), tabs:{...other, savedActive:other.tabs[0].id}});
});

test('schema uses editable shared types and survives a Yjs binary round trip', () => {
 const fixture = cases[4];
 const doc = toDoc(fixture.state, fixture.tabs, nexo);
 const node = doc.getMap<Y.Map<unknown>>('nodes').get(richNodes[0].id)!;
 expect(node.get('label')).toBeInstanceOf(Y.Text);
 expect((node.get('instance') as Y.Map<unknown>).get('inputs')).toBeInstanceOf(Y.Map);
 expect(node.get('visual')).not.toBeInstanceOf(Y.Map);
 expect(node.get('statistics')).not.toBeInstanceOf(Y.Map);
 expect(doc.getMap('document').get('items')).toBeInstanceOf(Y.Array);
 const tab = (doc.getMap('tabs').get('tabs') as Y.Array<Y.Map<unknown>>).get(0);
 expect(tab.get('name')).toBeInstanceOf(Y.Text);
 expect(tab.get('nodes')).toBeInstanceOf(Y.Array);
 expect(doc.getMap('nexo').get('nodes')).toBeInstanceOf(Y.Map);
 for (const name of ['comments','renderState','meta']) {
  expect(doc.share.has(name)).toBe(true);
  expect(doc.getMap(name).size).toBe(0);
  doc.getMap(name).set('synthetic-private', {value:'not exported'});
 }
 const restored = new Y.Doc();
 Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));
 expect(fromDoc(restored)).toEqual({state:fixture.state,tabs:fixture.tabs,nexo});
 expect(toTeamCanvasV1(restored)).toEqual(toTeamCanvasV1(doc));
 expect(toNexoV1(restored)).toEqual(nexo);
});

test('complete synthetic ZIP has no saved canvas members', async () => {
 const fsName = 'node:fs';
 const {readFileSync} = await import(fsName);
 // ZIP central-directory filenames are uncompressed; check the actual fixture,
 // rather than inventing an archived canvas for this science-only checkpoint.
 const archive = readFileSync(new URL('../../../../tests/dual-ui/fixtures/nexo-complete-synthetic.zip', import.meta.url));
 expect(archive.includes('shared-state-v1.json')).toBe(true);
 expect(archive.includes('team-canvas-v1.json')).toBe(false);
 expect(archive.includes('nexo-canvas-v1.json')).toBe(false);
});

// Two people add a card each while apart, then meet: one board, one export.
function person(doc: Y.Doc) {
 const {state, tabs, nexo: shared} = fromDoc(doc);
 const store = createStore({...state, tabs, nexo: shared});
 return {store, history: createDocumentHistory(store, doc)};
}
test('both peers export the same board after concurrent adds', () => {
 const state = cases[0].state, a = toDoc(state, other, nexo), b = new Y.Doc();
 Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
 const first = person(a), second = person(b);
 first.store.get().tabs.active = other.tabs[1].id;
 first.history.dispatch(addNode(<never>{...nodes[0], id:'tcinstance_4-plot_pca', instance:{...nodes[0].instance!, id:'tcinstance_4'}}));
 second.history.dispatch(addNode(<never>{...nodes[1], id:'tcinstance_5-plot_pca', instance:{...nodes[1].instance!, id:'tcinstance_5'}}));
 Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
 Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
 expect(toTeamCanvasV1(a)).toEqual(toTeamCanvasV1(b));
 expect(toTeamCanvasV1(a).nodes).toHaveLength(5);
 expect(toTeamCanvasV1(a).tabs!.active).toBe(other.tabs[0].id);
 expect(toNexoV1(a)).toEqual(toNexoV1(b));
});
test('two openers seeding at once leave one copy of the board', () => {
 const state = {...cases[4].state, tabs:richTabs, nexo}, a = new Y.Doc(), b = new Y.Doc();
 expect(seedDoc(a, state)).toBe(true);
 expect(seedDoc(b, state)).toBe(true);
 Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
 Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
 expect(fromDoc(a)).toEqual({state:cases[4].state, tabs:richTabs, nexo});
 expect(fromDoc(b)).toEqual(fromDoc(a));
});
test('a seed never writes over a document that has a board', () => {
 const doc = toDoc(cases[0].state, other, nexo), before = Y.encodeStateVector(doc);
 expect(seedDoc(doc, {...cases[2].state, tabs:tabsModel.initial([]), nexo})).toBe(false);
 expect(Y.encodeStateVector(doc)).toEqual(before);
});
test('a card added in this session keeps its instance id for the other person', () => {
 const doc = toDoc(cases[3].state, tabsModel.initial([]), nexo), {store, history} = person(doc);
 history.dispatch(addNode(<never>{...nodes[0], instance:{instanceId:'tcinstance_9', source:'results_dashboard-plot_pca', inputs:{}}}));
 expect(store.get().nodes).toHaveLength(1);
 expect(fromDoc(doc).state.nodes[0].instance).toEqual({id:'tcinstance_9', source:'results_dashboard-plot_pca', inputs:{}});
});

test('default shared tabs export an explicit savedActive', () => {
 const doc = toDoc(cases[3].state, tabsModel.initial([]), nexo);
 expect(toTeamCanvasV1(doc).tabs).toEqual({...tabsModel.initial([]), savedActive:'tab-1'});
});
