import { describe, expect, it, vi } from 'vitest';
import { hasGl3d, purgePlot, releaseCanvases } from './gl';

// A canvas holding one context of `type` (or a 2D one): getContext returns it only for that type.
function canvas(type: 'webgl' | 'webgl2' | '2d', log: string[] = []) {
  const lose = { loseContext: vi.fn(() => log.push('lose')) };
  const ctx = { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? lose : null) };
  return { lose, getContext: (t: string) => (t === type ? ctx : null) } as unknown as HTMLCanvasElement & { lose: typeof lose };
}
const plot = (type: string, canvases: HTMLCanvasElement[]) => ({ data: [{ type }], querySelectorAll: () => canvases }) as unknown as HTMLElement;

describe('gl3d context release', () => {
  it('detects 3D figures and plots', () => {
    expect(hasGl3d({ data: [{ type: 'scatter' }, { type: 'scatter3d' }] })).toBe(true);
    expect(hasGl3d({ data: [{ type: 'scatter' }, {}] })).toBe(false);
    expect(hasGl3d(undefined)).toBe(false);
  });
  it('loses WebGL and WebGL2 contexts, ignores 2D canvases', () => {
    const [a, b, c] = [canvas('webgl'), canvas('webgl2'), canvas('2d')];
    releaseCanvases([a, b, c]);
    expect(a.lose.loseContext).toHaveBeenCalledOnce();
    expect(b.lose.loseContext).toHaveBeenCalledOnce();
    expect(c.lose.loseContext).not.toHaveBeenCalled();
  });
  it('purgePlot releases a 3D plot before purging; a 2D plot is only purged', () => {
    const log: string[] = [], purge = vi.fn(() => log.push('purge'));
    const gl = canvas('webgl', log);
    purgePlot({ purge }, plot('scatter3d', [gl]));
    expect(log).toEqual(['lose', 'purge']);
    const flat = canvas('webgl');
    purgePlot({ purge }, plot('scatter', [flat]));
    expect(flat.lose.loseContext).not.toHaveBeenCalled();
    expect(purge).toHaveBeenCalledTimes(2);
  });
});
