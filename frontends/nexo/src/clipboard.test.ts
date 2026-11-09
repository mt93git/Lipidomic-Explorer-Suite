import { describe, expect, it } from 'vitest';
import { clearClipboard, clipboard, copyPlot, onClipboard, pasteTemplate } from './clipboard';
import type { Node } from './api';
const plot: Node = { kind: 'plot', id: 'tcinstance_aaaaaaaaaaaa-plot_pca', label: 'PCA', x: 10, y: 20, width: 400, height: 300,
  visual: { plotTitle: 'Mine' }, finished: { url: 'data:x' }, instance: { id: 'tcinstance_aaaaaaaaaaaa', source: 'pca', inputs: { scale: true } } };
describe('plot clipboard', () => {
  it('keeps source, inputs and visual, detached from the card', () => {
    clearClipboard(); let calls = 0; const off = onClipboard(() => calls++);
    expect(copyPlot(plot)).toBe(true);
    plot.instance!.inputs!.scale = false; plot.visual!.plotTitle = 'Changed';
    expect(clipboard()).toMatchObject({ source: 'pca', inputs: { scale: true }, visual: { plotTitle: 'Mine' } });
    expect(calls).toBe(1); off();
    plot.instance!.inputs!.scale = true; plot.visual!.plotTitle = 'Mine';
  });
  it('ignores illustrations and starts empty after clearing', () => {
    clearClipboard();
    expect(copyPlot({ ...plot, kind: 'illustration' })).toBe(false);
    expect(clipboard()).toBeNull();
  });
  it('pastes as a live card with the copied settings', () => {
    clearClipboard(); copyPlot(plot);
    const node = pasteTemplate(clipboard()!);
    expect(node.finished).toBeNull();
    expect(node.instance).toMatchObject({ source: 'pca', inputs: { scale: true } });
    expect(node.visual).toEqual({ plotTitle: 'Mine' });
  });
});
