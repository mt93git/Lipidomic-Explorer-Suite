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
type Cam = { x: number; y: number; scale: number };
type Size = { width: number; height: number };
/** The opening fit holds through a resize until the person moves the camera: fit again when the camera is still the one
 *  the opening fit set (`fitted`) and the window is no longer the size it was fitted in. */
export function refitOnResize(fitted: { camera: Cam; view: Size } | null, camera: Cam, view: Size) {
  return !!fitted && camera.x === fitted.camera.x && camera.y === fitted.camera.y && camera.scale === fitted.camera.scale
    && (view.width !== fitted.view.width || view.height !== fitted.view.height);
}
