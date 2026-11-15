export interface Rect { x: number; y: number; width: number; height: number }
export type Tier = 'live' | 'frozen' | 'culled';
// Rects use screen pixels: cull outside a 200 px viewport margin. Below 50%
// everything visible freezes; otherwise selection overrides gesture freezing.
/** From this zoom up, visible plots are live; below it they are frozen images. */
export const LIVE_FROM = .5;
/** Thumbnail chrome is independent of the live/frozen/culled rendering decision. */
export const THUMB_BELOW = .2;
export function isThumb(scale: number): boolean { return scale < THUMB_BELOW; }
export function tier(card: Rect, viewport: Rect, scale: number, selected: boolean, gesturing: boolean): Tier {
  if (card.x + card.width <= viewport.x - 200 || card.x >= viewport.x + viewport.width + 200 ||
      card.y + card.height <= viewport.y - 200 || card.y >= viewport.y + viewport.height + 200) return 'culled';
  if (scale < LIVE_FROM || (gesturing && !selected)) return 'frozen';
  return 'live';
}
export interface TierCard { id: string; rect: Rect; renderer: 'plotly' | 'image' }
// Live Plotly plots are capped: selected visible cards first, then those nearest the viewport
// centre. The rest freeze to their snapshot image; image renderers are images either way.
export function assignTiers(cards: TierCard[], viewport: Rect, scale: number, selected: ReadonlySet<string>, gesturing: boolean, maxLive = 4): Map<string, Tier> {
  const tiers = new Map<string, Tier>(), candidates: { id: string; selected: boolean; distance: number }[] = [];
  const cx = viewport.x + viewport.width / 2, cy = viewport.y + viewport.height / 2;
  for (const c of cards) {
    const t = tier(c.rect, viewport, scale, selected.has(c.id), gesturing);
    if (t === 'live' && c.renderer === 'plotly') {
      candidates.push({ id: c.id, selected: selected.has(c.id), distance: Math.hypot(c.rect.x + c.rect.width / 2 - cx, c.rect.y + c.rect.height / 2 - cy) });
      tiers.set(c.id, 'frozen');
    } else tiers.set(c.id, t);
  }
  candidates.sort((a, b) => Number(b.selected) - Number(a.selected) || a.distance - b.distance);
  for (const c of candidates.slice(0, maxLive)) tiers.set(c.id, 'live');
  return tiers;
}
