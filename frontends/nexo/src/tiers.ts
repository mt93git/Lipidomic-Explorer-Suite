export interface Rect { x: number; y: number; width: number; height: number }
export type Tier = 'live' | 'frozen' | 'culled';
// Rects use screen pixels: cull outside a 200 px viewport margin. Below 50%
// everything visible freezes; otherwise selection overrides gesture freezing.
export function tier(card: Rect, viewport: Rect, scale: number, selected: boolean, gesturing: boolean): Tier {
  if (card.x + card.width <= viewport.x - 200 || card.x >= viewport.x + viewport.width + 200 ||
      card.y + card.height <= viewport.y - 200 || card.y >= viewport.y + viewport.height + 200) return 'culled';
  if (scale < .5 || (gesturing && !selected)) return 'frozen';
  return 'live';
}
