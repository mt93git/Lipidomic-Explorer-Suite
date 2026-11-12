import type { Rect } from '../tiers';
import type { Cam } from './reveal';
/** The map is useful when any part of the active board lies outside the viewport. */
export function minimapVisible(view: { width: number; height: number }, camera: Cam, board: Rect[], pinned: boolean, corner: boolean): boolean {
  return pinned || corner || board.some(r => r.x * camera.scale + camera.x < -1 || r.y * camera.scale + camera.y < -1 ||
    (r.x + r.width) * camera.scale + camera.x > view.width + 1 || (r.y + r.height) * camera.scale + camera.y > view.height + 1);
}
export type RemoteViewport = { id: number; name: string; colour: string; rect: Rect };
type ViewState = { displayName?: string; colour?: string; view?: { activeTab?: string; camera?: Cam; viewport?: { width: number; height: number } } };
/** Other people on this tab (awareness `view`, published by collab/provider.ts): the canvas rectangle each one sees. */
export function remoteViewports(states: Map<number, unknown>, self: number, activeTab: string): RemoteViewport[] {
  const out: RemoteViewport[] = [];
  for (const [id, state] of states) {
    const { displayName, colour, view } = (state ?? {}) as ViewState;
    if (id === self || view?.activeTab !== activeTab || !view.camera?.scale || !view.viewport) continue;
    const { x, y, scale } = view.camera;
    out.push({ id, name: displayName || 'Collaborator', colour: colour || '#7256b5', rect: { x: -x / scale, y: -y / scale, width: view.viewport.width / scale, height: view.viewport.height / scale } });
  }
  return out;
}
