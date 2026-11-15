import { LIVE_FROM, type Rect } from '../tiers';
import type { Cam } from './reveal';
/** Below this zoom a card is a frozen image: a click (or Enter) brings it up to work on, instead of only selecting it.
 *  It is the live threshold, so a click always either reaches a live plot or focuses the card (review R03). */
export const FOCUS_BELOW = LIVE_FROM;
/** The camera that frames one card: centred, as large as fits with a margin, never above 100 % and never
 *  smaller than the current zoom (focus only ever brings a card closer). */
export function focusCamera(view: { width: number; height: number }, cam: Cam, rect: Rect, margin = 56): Cam {
  const fit = Math.min(1, (view.width - 2 * margin) / rect.width, (view.height - 2 * margin) / rect.height);
  const scale = Math.max(cam.scale, fit);
  return { scale, x: view.width / 2 - (rect.x + rect.width / 2) * scale, y: view.height / 2 - (rect.y + rect.height / 2) * scale };
}
