import type { Node } from '../api';
import type { Rect } from '../tiers';
import { snap } from './snap';
/** Pointer is a screen-space delta from pointerdown. */
export function dragResult(start: Rect, pointer: { x: number; y: number }, scale: number, others: Rect[], alt: boolean) {
  return snap({ ...start, x: Math.max(0, start.x + pointer.x / scale), y: Math.max(0, start.y + pointer.y / scale) }, others, { threshold: 6 / scale, bypass: alt });
}
/** Shift+1 fits everything, Shift+0 resets to 100 % (by physical key: Shift changes the character). */
export function zoomShortcut(e: { code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): 'fit' | 'selection' | 'reset' | null {
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return null;
  return e.code === 'Digit1' ? 'fit' : e.code === 'Digit2' ? 'selection' : e.code === 'Digit0' ? 'reset' : null;
}
export function keyboardNudge(key: string, shift: boolean, alt: boolean) {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) return null;
  const step = alt ? 1 : 10;
  return { dx: key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, dy: key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0, resize: shift };
}
export function duplicateNode(node: Node): Node {
  const instanceId = 'tcinstance_' + Array.from(crypto.getRandomValues(new Uint8Array(6)), n => n.toString(16).padStart(2,'0')).join('');
  const copy = structuredClone(node), source = node.instance?.source ?? node.id;
  const output = node.id.replace(/^tcinstance_[0-9a-f]{12}-/, '').replace(/^.*-plot_/, 'plot_');
  return { ...copy, id: `${instanceId}-${output}`, x: node.x + 24, y: node.y + 24,
    instance: { ...copy.instance, id: instanceId, instanceId, source, inputs: copy.instance?.inputs ?? {} } };
}
/** Screen px a press may travel and still be a click (click-to-focus); beyond it, it drags. */
export const CLICK_SLOP = 4;
export const beyondClick = (dx: number, dy: number) => Math.hypot(dx, dy) >= CLICK_SLOP;
/** What a press on a card starts. Above the thumb tier only the header moves a card (the plot body keeps its own
 *  gestures); at the thumb tier the header is 0 px and inert (cards.ts), so a body press becomes a move once it leaves
 *  the click threshold ('pending-move'), and a press that stays within it is still a click (pilot F2). */
export function cardPress(part: { header: boolean; resize: boolean; control: boolean }, thumb: boolean): 'move' | 'resize' | 'pending-move' | null {
  if (part.control) return null;
  if (part.resize) return 'resize';
  if (part.header) return 'move';
  return thumb ? 'pending-move' : null;
}
