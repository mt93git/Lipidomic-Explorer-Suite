import type { Tier } from './tiers';

/**
 * Pixel ratio a PNG card asks the render route for (POST …/render `dpr`, 1 or 2; frontends/nexo-api/cards.R).
 * A live card at >= 100 % zoom on a Retina screen asks for 2: Team's renderPlot draws width*2 x height*2 for a
 * Retina browser (same science, more pixels) and the <img> keeps its logical CSS size. Frozen, culled and
 * zoomed-out cards (the image is shown at or below its logical size) and prefetches stay at 1x.
 * Fractional ratios round (1.25 -> 1, 1.5 -> 2): the API accepts 1 or 2 only.
 */
export function renderDpr({ tier, zoom, devicePixelRatio, prefetch = false }: { tier: Tier | undefined; zoom: number | undefined; devicePixelRatio: number; prefetch?: boolean }): 1 | 2 {
  if (prefetch || tier !== 'live' || !(typeof zoom === 'number' && zoom >= 1)) return 1;
  if (!Number.isFinite(devicePixelRatio)) return 1;
  return Math.min(2, Math.max(1, Math.round(devicePixelRatio))) as 1 | 2;
}
