import type { Rect } from '../tiers';
import { ZOOM_MIN } from './overview';
export type Cam = { x: number; y: number; scale: number };
// Where the camera must move so a card is seen (null: it already is). Moves as little as possible; a card
// larger than the view shows its title corner: top-left on the margins unless already in the top-left half. Used after adding, pasting or locating a card; adding still never moves the camera when the
// new card is in view (Nexo v0). `left` is the strip covered by the floating library (screen px): a card there
// counts as out of view, so what was just added or located is never hidden under the panel.
export function revealCamera(view: { width: number; height: number; left?: number }, cam: Cam, rect: Rect, margin = 48): Cam | null {
  const s = cam.scale;
  const shift = (start: number, size: number, span: number) => {
    if (size > span - 2 * margin) return start >= margin && start <= span / 2 ? 0 : margin - start;
    if (start < margin) return margin - start;
    if (start + size > span - margin) return span - margin - (start + size);
    return 0;
  };
  const left = view.left ?? 0;
  const dx = shift(rect.x * s + cam.x - left, rect.width * s, view.width - left);
  const dy = shift(rect.y * s + cam.y, rect.height * s, view.height);
  return dx || dy ? { x: cam.x + dx, y: cam.y + dy, scale: s } : null;
}
/** The largest zoom (never above the current one) at which a card fits inside the margins. */
export function fitScale(view: { width: number; height: number }, scale: number, rect: Rect, margin = 48): number {
  return Math.min(scale, (view.width - 2 * margin) / rect.width, (view.height - 2 * margin) / rect.height);
}
/** An addition must fit the final viewport after the inspector opens, beside the floating library. */
export function revealAddedCamera(view: { width: number; height: number; left?: number }, cam: Cam, rect: Rect, margin = 48): Cam | null {
  const scale = Math.max(ZOOM_MIN, fitScale({ width: view.width - (view.left ?? 0), height: view.height }, cam.scale, rect, margin));
  const fitted = { ...cam, scale };
  return revealCamera(view, fitted, rect, margin) ?? (scale !== cam.scale ? fitted : null);
}
