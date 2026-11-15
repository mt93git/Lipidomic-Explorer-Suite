// Plot clipboard: "Copy plot settings" keeps what a new card needs; "Paste plot" creates one through the duplicate path.
import type { Inputs, Node } from './api';
export interface PlotClip { source: string; inputs: Inputs; visual: Node['visual']; template: Node; nexoStyle?:import('./state/nexo').NexoStyle; nexoComputed?: Record<string, unknown> }
let clip: PlotClip | null = null;
const listeners = new Set<() => void>();
export function copyPlot(node: Node,nexoStyle?:import('./state/nexo').NexoStyle,nexoInputs?:Record<string, unknown>) {
  if (node.kind !== 'plot') return false;
  clip = { nexoStyle:structuredClone(nexoStyle), nexoComputed:structuredClone(nexoInputs), source: node.instance?.source ?? node.id, inputs: structuredClone(node.instance?.inputs ?? {}), visual: structuredClone(node.visual), template: structuredClone(node) };
  listeners.forEach(f => f()); return true;
}
export function clipboard() { return clip; }
export function clearClipboard() { clip = null; listeners.forEach(f => f()); }
export function onClipboard(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
/** The node to hand to the duplicate path: the copied card's frame with the copied source, inputs and visual. */
export function pasteTemplate(c: PlotClip): Node {
  const node = structuredClone(c.template);
  return { ...node, finished: null, visual: structuredClone(c.visual), instance: { ...node.instance, source: c.source, inputs: structuredClone(c.inputs) } };
}
