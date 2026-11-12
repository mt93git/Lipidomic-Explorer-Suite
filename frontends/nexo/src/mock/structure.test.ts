// NEXO-P2: Team draws the Structure figures as Plotly charts (R/modules/8_structural_module.R structure_team_plotly). The
// mock serves the same shape: series keyed by a legend group, a round legend proxy (meta.teamLegendProxy) carrying the
// legend entry, per-point marker sizes on the dotplot, and layout.meta.teamHideSeries on the all-classes grid.
import { afterEach, expect, it, vi } from 'vitest';
import checkpoints from './checkpoints.json';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
type Drawn = { render: string; figure: { data: Record<string, any>[]; layout: Record<string, any> } };
async function drawn(source: string): Promise<Drawn> {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {}); vi.resetModules();
  const { openSession, createCard, renderCard } = await import('../api');
  const session = await openSession(checkpoints[0].id);
  const card = await createCard(session.sessionId, source, {});
  return await renderCard(session.sessionId, card.instanceId, 620, 380, 'json') as unknown as Drawn;
}
it('a Structure dotplot is a Plotly figure with a legend proxy and per-point sizes', async () => {
  const { render, figure } = await drawn('structural_grid_tab-dotplotPlot');
  expect(render).toBe('plotly');
  const proxy = figure.data.find(t => t.meta?.teamLegendProxy), series = figure.data.find(t => !t.meta?.teamLegendProxy && t.legendgroup === proxy?.legendgroup);
  expect(proxy && { showlegend: proxy.showlegend, x: proxy.x, y: proxy.y, symbol: proxy.marker.symbol }).toEqual({ showlegend: true, x: [null], y: [null], symbol: 'circle' });
  expect(series && { showlegend: series.showlegend, color: typeof series.marker.color }).toEqual({ showlegend: false, color: 'string' });
  expect(figure.data.some(t => Array.isArray(t.marker?.size) && t.marker.size.length > 1)).toBe(true);
  expect(figure.data.some(t => t.meta?.teamNoEdit)).toBe(true);
});
it('the all-classes grid asks for no Series section', async () => {
  const { figure } = await drawn('structural_grid_tab-mergedPlot');
  expect(figure.layout.meta?.teamHideSeries).toBe(true);
});
