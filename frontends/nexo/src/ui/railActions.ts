// Rail "Palettes" and "Text & shapes": each opens the panel that holds those controls, never the plot list.
import type { Node } from '../api';
/** The card whose Appearance tab has a palette section: the first selected live plot. */
export function paletteTarget(selection: readonly string[], nodes: readonly Node[]): string | null {
  return nodes.find(n => selection.includes(n.id) && n.kind === 'plot' && !n.finished)?.id ?? null;
}
/** Retries for a few frames: the Appearance tab mounts its plot editor once the figure has loaded. */
export function whenPresent<T extends Element>(find: () => T | null, then: (el: T) => void, frames = 120) {
  const el = find(); if (el) { then(el); return; }
  if (frames > 0) requestAnimationFrame(() => whenPresent(find, then, frames - 1));
}
export function openPaletteSection(root: ParentNode = document) {
  whenPresent(() => [...root.querySelectorAll<HTMLDetailsElement>('.inspector-column details')].find(d => d.querySelector('summary')?.textContent === 'Color palette') ?? null,
    details => { details.open = true; details.querySelector<HTMLElement>('summary')?.focus(); details.scrollIntoView?.({ block: 'nearest' }); });
}
export function openFigureAdd(root: ParentNode = document) {
  whenPresent(() => root.querySelector<HTMLElement>('.figure-add button'), button => button.focus());
}
