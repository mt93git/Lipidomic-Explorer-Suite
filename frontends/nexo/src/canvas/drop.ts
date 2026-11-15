import type { Cam } from './reveal';
export type DropPoint = { x: number; y: number };
/** Client coordinates include the rail/header; remove them before undoing the camera transform. */
export function dropWorldPoint(client: DropPoint, viewport: { left: number; top: number }, camera: Cam): DropPoint {
  return { x: (client.x - viewport.left - camera.x) / camera.scale, y: (client.y - viewport.top - camera.y) / camera.scale };
}
