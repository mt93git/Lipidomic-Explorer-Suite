import type { Rect } from '../tiers';
import type { Cam } from './reveal';
/** The map is useful when any part of the active board lies outside the viewport. */
export function minimapVisible(view: { width: number; height: number }, camera: Cam, board: Rect[], pinned: boolean, corner: boolean): boolean {
  return pinned || corner || board.some(r => r.x * camera.scale + camera.x < -1 || r.y * camera.scale + camera.y < -1 ||
    (r.x + r.width) * camera.scale + camera.x > view.width + 1 || (r.y + r.height) * camera.scale + camera.y > view.height + 1);
}
