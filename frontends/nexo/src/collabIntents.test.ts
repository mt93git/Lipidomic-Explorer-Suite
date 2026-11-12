// Phase 3 seam (collab/intents.ts): with collaboration on, every science mutation in api.ts is one intent to the
// sidecar and never the direct route; the caller gets the settled value from a read. Flag off: the direct route.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sendIntent } from './collab/intents';
import { initCollab } from './collab/mode';
import * as Y from 'yjs';
import { confirmDesign, confirmGroupComparison, createCard, figureIntent, parkCards, renderCard, setCohort, updateAnalysis, updateCard, updatePalette, violinStatistics } from './api';

vi.mock('./collab/intents', () => ({ sendIntent: vi.fn(async () => ({ intentId: 'i1', revision: 8 })), nodeFor: (instance: string) => `node-of-${instance}` }));
const board = new Y.Doc(); board.getMap('meta').set('engineRevision', 8);
vi.mock('./collab/provider', () => ({ getProvider: () => ({ document: board }) }));
const project = '00000000-0000-4000-8000-000000000001';
const card = { instanceId: 'tcinstance_a1', nodeId: 'tcinstance_a1-plot_violin', source: 'results_dashboard-plot_violin', family: 'results_dashboard', render: 'plotly', allowedInputs: [], inputs: { lipid: 'PC 34:1' }, settled: true, error: null };
// Synthetic answers of the read routes, by method and path.
const reads: Record<string, unknown> = {
  'GET /api/v1/sessions/s1': { engineRevision: 8, cards: [card] },
  'GET /api/v1/sessions/s1/join': { design: { allowed: true, unit: 'sample', type: 'independent', confirmed: true } },
  'GET /api/v1/sessions/s1/analysis': { sections: [] },
  'GET /api/v1/sessions/s1/cohort': { lipids: ['PC 34:1'] },
  'GET /api/v1/sessions/s1/palette': { state: {}, groups: [] },
  'GET /api/v1/sessions/s1/cards/tcinstance_a1/group-comparison': { requiresConfirmation: false },
};
let calls: string[] = [];
beforeEach(() => {
  calls = []; vi.mocked(sendIntent).mockClear();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.startsWith('/api/v1/')) return new Response(null, { status: 401 }); // no Admin session: no token
    const key = `${init?.method ?? 'GET'} ${url}`, body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(body?.mode ? `${key} ${body.mode}` : key);
    const answer = reads[key] ?? (body?.mode ? { status: 'ok', mode: body.mode, dataFingerprint: 'f'.repeat(64), policy: { allowed: true } } : { settled: true, inputs: {} });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); initCollab({ url: undefined, search: '' }); });
const on = () => initCollab({ url: 'ws://collab.test', search: `?project=${project}` });
const mutations = () => calls.filter(c => !c.startsWith('GET ') && !/ (describe|verify|check)$/.test(c));

it('flag off: an input change is the direct PATCH and no intent', async () => {
  await updateCard('s1', 'tcinstance_a1', { lipid: 'PC 36:2' });
  expect(calls).toEqual(['PATCH /api/v1/sessions/s1/cards/tcinstance_a1']);
  expect(sendIntent).not.toHaveBeenCalled();
});

it('an input change is one inputs intent and answers the settled inputs', async () => {
  on();
  const result = await updateCard('s1', 'tcinstance_a1', { lipid: 'PC 36:2' });
  expect(sendIntent).toHaveBeenCalledExactlyOnceWith('inputs', { nodeId: 'node-of-tcinstance_a1' }, { instanceId: 'tcinstance_a1', inputs: { lipid: 'PC 36:2' }, actions: [] });
  expect(mutations()).toEqual([]);
  expect(result.inputs).toEqual({ lipid: 'PC 34:1' });
});

it('a card action is one action intent', async () => {
  on();
  await updateCard('s1', 'tcinstance_a1', {}, ['generate']);
  expect(sendIntent).toHaveBeenCalledExactlyOnceWith('action', { nodeId: 'node-of-tcinstance_a1' }, { instanceId: 'tcinstance_a1', inputs: {}, actions: ['generate'] });
  expect(mutations()).toEqual([]);
});

it('add card is one createCard intent with the placed node and writes no node', async () => {
  on();
  const placed = { kind: 'plot' as const, id: 'tcinstance_a1-plot_violin', label: 'Feature distributions', x: 10, y: 20, width: 440, height: 330, visual: {}, finished: null };
  const result = await createCard('s1', 'results_dashboard-plot_violin', { lipid: 'PC 34:1' }, 'tcinstance_a1', undefined, placed);
  expect(sendIntent).toHaveBeenCalledExactlyOnceWith('createCard', { nodeId: 'tcinstance_a1-plot_violin' }, { node: {
    kind: 'plot', id: 'tcinstance_a1-plot_violin', x: 10, y: 20, width: 440, height: 330, visual: {}, label: 'Feature distributions',
    instance: { id: 'tcinstance_a1', source: 'results_dashboard-plot_violin', inputs: { lipid: 'PC 34:1' } } } });
  expect(mutations()).toEqual([]);
  expect(board.getMap('nodes').size).toBe(0);
  expect(result.nodeId).toBe('tcinstance_a1-plot_violin');
});

it('the design dialog is one design intent', async () => {
  on();
  const design = await confirmDesign('s1', 'sample', 'independent');
  expect(sendIntent).toHaveBeenCalledExactlyOnceWith('design', {}, { unit: 'sample', type: 'independent' });
  expect(mutations()).toEqual([]);
  expect(design.confirmed).toBe(true);
});

it('the analysis, cohort and palette dialogs are one intent each', async () => {
  on();
  await updateAnalysis('s1', { normalization: 'none' });
  await setCohort('s1', ['PC 34:1']);
  await updatePalette('s1', { restore: {} } as never);
  expect(vi.mocked(sendIntent).mock.calls).toEqual([['analysis', {}, { inputs: { normalization: 'none' } }], ['cohort', {}, { lipids: ['PC 34:1'] }], ['palette', {}, { restore: {} }]]);
  expect(mutations()).toEqual([]);
});

it('violin apply is one applyViolin intent; describe stays a read', async () => {
  on();
  const settings = { test: 'welch' } as never;
  await violinStatistics('s1', 'tcinstance_a1', { mode: 'describe' });
  expect(sendIntent).not.toHaveBeenCalled();
  const reply = await violinStatistics('s1', 'tcinstance_a1', { mode: 'apply', settings });
  expect(sendIntent).toHaveBeenCalledExactlyOnceWith('applyViolin', { nodeId: 'node-of-tcinstance_a1' }, { instanceId: 'tcinstance_a1', settings });
  expect(mutations()).toEqual([]);
  expect(reply.mode).toBe('apply');
});

it('group comparison confirm is one confirmBaseline intent', async () => {
  on();
  await confirmGroupComparison('s1', 'tcinstance_a1', 'token-1');
  expect(sendIntent).toHaveBeenCalledExactlyOnceWith('confirmBaseline', { nodeId: 'node-of-tcinstance_a1' }, { instanceId: 'tcinstance_a1', confirmationToken: 'token-1' });
  expect(mutations()).toEqual([]);
});

it('a refused intent rejects the call and sends nothing else', async () => {
  on();
  vi.mocked(sendIntent).mockRejectedValueOnce(new Error('Change not allowed: lab only'));
  await expect(updateAnalysis('s1', { normalization: 'none' })).rejects.toThrow('Change not allowed: lab only');
  expect(calls).toEqual([]);
});

it('flag off: removing cards and finishing a figure stay on the canvas', () => {
  expect(parkCards(['n1'])).toBe(false);
  expect(figureIntent('n1', null)).toBeNull();
  expect(sendIntent).not.toHaveBeenCalled();
});

it('removing cards is one parkCard intent per card', async () => {
  on();
  expect(parkCards(['n1', 'n2'])).toBe(true);
  await vi.waitFor(() => expect(sendIntent).toHaveBeenCalledTimes(2));
  expect(vi.mocked(sendIntent).mock.calls).toEqual([['parkCard', { nodeId: 'n1' }, {}], ['parkCard', { nodeId: 'n2' }, {}]]);
});

it('Finish and Edit figure are one finish or editFigure intent', async () => {
  on();
  const finished = { url: 'data:image/png;base64,AAAA', width: 10, height: 10 } as never;
  await figureIntent('n1', finished);
  await figureIntent('n1', null);
  expect(vi.mocked(sendIntent).mock.calls).toEqual([['finish', { nodeId: 'n1' }, { finished }], ['editFigure', { nodeId: 'n1' }, {}]]);
});

it('a render answered at an older engine revision is discarded and asked again', async () => {
  on();
  const revisions = ['7', '8'], renders: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.startsWith('/api/v1/')) return new Response(null, { status: 401 });
    const revision = revisions.shift()!; renders.push(revision);
    return new Response(JSON.stringify({ figure: { data: [revision], layout: {} } }), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Nexo-Engine-Revision': revision } });
  }));
  const result = await renderCard('s1', 'tcinstance_a1', 400, 300, 'json');
  expect(renders).toEqual(['7', '8']);
  expect(result).toMatchObject({ figure: { data: ['8'] } });
});

it('flag off: a render is asked once whatever its revision', async () => {
  const fetch = vi.fn(async (url: string) => url.startsWith('/api/v1/')
    ? new Response(JSON.stringify({ figure: { data: [], layout: {} } }), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Nexo-Engine-Revision': '7' } })
    : new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  await renderCard('s1', 'tcinstance_a1', 400, 300, 'json');
  expect(fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/v1/'))).toHaveLength(1);
});
