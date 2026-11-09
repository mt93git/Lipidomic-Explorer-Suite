// Chart audit b10 check 11 / open item 3: the first render of a fresh longitudinal card still drew one 422 ("needs
// Generate Analysis") before the gate knew. A card created on this page has not had its module button pressed, so the
// gate is set from the create answer: no render is asked until Generate analysis is pressed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runNeedKey, runNeedWaiting, clearRunNeedIfPressed } from './runNeeds';
afterEach(() => vi.unstubAllGlobals());
const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
describe('run-need gate before the first render', () => {
  it('createCard of a time course sets the gate (no render request until Generate analysis)', async () => {
    const { createCard } = await import('./api');
    vi.stubGlobal('fetch', vi.fn(async () => answer({ instanceId: 'tcinstance_aaaaaaaaaaaa', nodeId: 'tcinstance_aaaaaaaaaaaa-macroclass_plot', source: 'longitudinal_tab-macroclass_plot', family: 'longitudinal_tab', render: 'png', allowedInputs: [], inputs: {}, settled: true, error: null })));
    const key = runNeedKey('fresh-s1', 'tcinstance_aaaaaaaaaaaa');
    expect(runNeedWaiting(key)).toBe(false);
    await createCard('fresh-s1', 'longitudinal_tab-macroclass_plot', {}, 'tcinstance_aaaaaaaaaaaa');
    expect(runNeedWaiting(key)).toBe(true);
    clearRunNeedIfPressed(key, ['submit_longitudinal_btn']); expect(runNeedWaiting(key)).toBe(false);
  });
  it('other plots are not gated', async () => {
    const { createCard } = await import('./api');
    vi.stubGlobal('fetch', vi.fn(async () => answer({ instanceId: 'tcinstance_bbbbbbbbbbbb', nodeId: 'tcinstance_bbbbbbbbbbbb-heatmapPlot', source: 'heatmap_tab-heatmapPlot', family: 'heatmap_tab', render: 'png', allowedInputs: [], inputs: {}, settled: true, error: null })));
    await createCard('fresh-s1', 'heatmap_tab-heatmapPlot', {}, 'tcinstance_bbbbbbbbbbbb');
    expect(runNeedWaiting(runNeedKey('fresh-s1', 'tcinstance_bbbbbbbbbbbb'))).toBe(false);
  });
  it('a replay that presses the module button opens the gate', async () => {
    const { replayActions } = await import('./api');
    const key = runNeedKey('fresh-s2', 'tcinstance_cccccccccccc');
    vi.stubGlobal('fetch', vi.fn(async () => answer({ instanceId: 'tcinstance_cccccccccccc', nodeId: 'tcinstance_cccccccccccc-index_plot', source: 'longitudinal_tab-index_plot', family: 'longitudinal_tab', render: 'png', allowedInputs: [], inputs: {}, settled: true, error: null })));
    const { createCard } = await import('./api');
    await createCard('fresh-s2', 'longitudinal_tab-index_plot', {}, 'tcinstance_cccccccccccc');
    expect(runNeedWaiting(key)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => answer({ replayed: ['submit_longitudinal_btn'], failed: [], pressed: ['submit_longitudinal_btn'], settled: true })));
    await replayActions('fresh-s2', 'tcinstance_cccccccccccc', ['submit_longitudinal_btn']);
    expect(runNeedWaiting(key)).toBe(false);
  });
});
