import { describe, expect, it } from 'vitest';
import { CARD_CHROME } from '../cards';
import { cardHeightFor, plotHeightForCard, plotHeightOf, heightInputCommands, reopenPlotHeight } from './plotHeight';
import { createHistory } from '../state/history';
import { createStore } from '../state/store';
import type { CanvasState } from '../state/types';

// Chart audit b05 F5: the violin card is as tall as Team's plot height (violin_zoom_pct) plus the card chrome.
describe('violin card height follows the module plot height', () => {
  it('card height = plotHeight + chrome, capped at the canvas limit', () => {
    expect(cardHeightFor(2340)).toBe(2340 + CARD_CHROME);
    expect(cardHeightFor(400)).toBe(400 + CARD_CHROME);
    expect(cardHeightFor(5000)).toBe(4000);
  });
  it('reads the reported plotHeight first, then the height input, never a formula', () => {
    expect(plotHeightOf('violin_zoom_pct', { violin_zoom_pct: 1200 }, 2340)).toBe(2340);
    expect(plotHeightOf('violin_zoom_pct', { violin_zoom_pct: 1200 })).toBe(1200);
    expect(plotHeightOf(undefined, { violin_zoom_pct: 1200 }, 2340)).toBeUndefined();
    expect(plotHeightOf('violin_zoom_pct', {})).toBeUndefined();
  });
  it('a hand resize writes a clamped, stepped plot height', () => {
    expect(plotHeightForCard(1000 + CARD_CHROME)).toBe(1000);
    expect(plotHeightForCard(1024 + CARD_CHROME)).toBe(1000);
    expect(plotHeightForCard(1026 + CARD_CHROME)).toBe(1050);
    expect(plotHeightForCard(220)).toBe(300);
    expect(plotHeightForCard(4000)).toBe(3950);
  });
  it('one undo step restores both the size and violin_zoom_pct', () => {
    const node = { kind: 'plot', id: 'v', label: 'Violin', x: 0, y: 0, width: 620, height: 2340 + CARD_CHROME, instance: { instanceId: 'tcinstance_v', source: 'heatmap_barchart_tab-violin_plot_render', inputs: { violin_zoom_pct: 2340, violin_scale_mode: 'log2' } } };
    const below = { kind: 'plot', id: 'b', label: 'Below', x: 0, y: 2340 + CARD_CHROME + 20, width: 620, height: 400 };
    const store = createStore({ version: 1, nodes: [node, below], edges: [] } as unknown as CanvasState);
    const history = createHistory(store);
    const before = structuredClone(store.get().nodes);
    // Hand resize to 1013 px tall: the plot height becomes 1000 (stepped), the card snaps to 1000 + chrome.
    heightInputCommands(store.get().nodes, 'v', 'violin_zoom_pct', { width: 620, height: 1013 }, 'k').forEach((c, i) => history.dispatch(c, { fold: i > 0 }));
    let v = store.get().nodes.find(n => n.id === 'v') as typeof node;
    expect(v.height).toBe(1000 + CARD_CHROME);
    expect(v.instance.inputs).toEqual({ violin_zoom_pct: 1000, violin_scale_mode: 'log2' });
    // Grow it again past the neighbour: the neighbour is pushed down, not overlapped.
    heightInputCommands(store.get().nodes, 'v', 'violin_zoom_pct', { width: 620, height: 3000 }, 'k2').forEach((c, i) => history.dispatch(c, { fold: i > 0 }));
    v = store.get().nodes.find(n => n.id === 'v') as typeof node;
    const b = store.get().nodes.find(n => n.id === 'b')!;
    expect(v.instance.inputs.violin_zoom_pct).toBe(2950); expect(v.height).toBe(2950 + CARD_CHROME);
    expect(b.y).toBeGreaterThanOrEqual(v.y + v.height);
    history.undo();
    v = store.get().nodes.find(n => n.id === 'v') as typeof node;
    expect(v.height).toBe(1000 + CARD_CHROME); expect(v.instance.inputs.violin_zoom_pct).toBe(1000);
    history.undo();
    expect(store.get().nodes).toEqual(before);
  });
  it('reopen keeps the stored geometry and writes it back to the input when they disagree', () => {
    expect(reopenPlotHeight('violin_zoom_pct', { violin_zoom_pct: 2340 }, 2340 + CARD_CHROME)).toBeUndefined();
    expect(reopenPlotHeight('violin_zoom_pct', { violin_zoom_pct: 5000 }, 4000)).toBeUndefined();
    expect(reopenPlotHeight('violin_zoom_pct', { violin_zoom_pct: 2340 }, 1200 + CARD_CHROME)).toBe(1200);
    expect(reopenPlotHeight('violin_zoom_pct', {}, 720)).toBe(700);
  });
});
