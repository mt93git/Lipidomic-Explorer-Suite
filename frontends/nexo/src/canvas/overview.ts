import type { Rect } from '../tiers';
/** Nexo v0 zoom range starts here (canvas zoom() clamps to it). */
export const ZOOM_MIN = .1;
/** The overview camera (opening zoom and Fit): the board centred as large as fits with a margin, never above
 *  100 % and never below ZOOM_MIN; `limited` says the board is wider than the minimum zoom can show. */
export function overviewCamera(view: { width: number; height: number }, b: Rect, margin = 30) {
  const raw = Math.min((view.width - 2 * margin) / b.width, (view.height - 2 * margin) / b.height);
  const scale = Math.min(1, Math.max(ZOOM_MIN, raw));
  return { scale, x: view.width / 2 - (b.x + b.width / 2) * scale, y: view.height / 2 - (b.y + b.height / 2) * scale, limited: raw < ZOOM_MIN };
}
