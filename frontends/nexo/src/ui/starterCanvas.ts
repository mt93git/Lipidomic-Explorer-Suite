import type { Catalog } from '../api/types';
import type { CanvasHandle } from '../canvas/handle';
import { newCardSize } from '../catalog';
import { validateNexo, type Nexo } from '../state/nexo';
/** A new project's first Canvas, once Data and Review are done: these three cards, side by side, in this order. */
export const starterSources = ['results_dashboard-plot_pca', 'results_dashboard-plot_comp', 'results_dashboard-plot_pcascore'] as const;
/** How this page opened the board: 'alone' or 'created' (the page that created the shared project) after Data and
 *  Review, 'joined' a shared project someone else created, 'none' anything else (a checkpoint, a re-prepared board). */
export type StarterOpen = 'none' | 'alone' | 'created' | 'joined';
export function starterOpen(o: { kind: 'checkpoint' | 'dataset'; collaborating: boolean; created: boolean; reprepared?: boolean }): StarterOpen {
  if (o.kind !== 'dataset' || o.reprepared) return 'none';
  return !o.collaborating ? 'alone' : o.created ? 'created' : 'joined';
}
/** Whether this board gets the starter cards; when it does, its Nexo member records it (`starter`), so a reload of a
 *  board the user emptied, or a second open, never adds them again. Only one page of a shared project seeds: its creator. */
export function openStarter(session: { canvas: { nodes: readonly unknown[] }; nexo?: Nexo | null }, open: StarterOpen, readOnly: boolean): boolean {
  if ((open !== 'alone' && open !== 'created') || readOnly || session.canvas.nodes.length || session.nexo?.starter === true) return false;
  session.nexo = { ...validateNexo(session.nexo), starter: true };
  return true;
}
/** The cards go in through the canvas's own add (the API creates each one as if the user added it), one at a time so
 *  they keep their order, in one row at their catalog default sizes. */
export async function seedStarter(handle: Pick<CanvasHandle, 'addCard'> & Partial<Pick<CanvasHandle, 'fit' | 'ready'>>, catalog: () => Promise<Catalog>, origin = { x: 40, y: 40 }, gap = 40) {
  // A shared board (every dataset project with the sidecar: an uploaded workbook or a released dataset) takes cards only
  // once this page has joined it; a card sent before is refused ("The shared board is not connected") and the board opens
  // empty. Joined, the board must still be empty; a board that could not be joined gets nothing.
  if (handle.ready) { const opened = await handle.ready(); if (!opened || opened.cards > 0) return; }
  const { outputs } = await catalog();
  let x = origin.x, failure: unknown;
  for (const source of starterSources) {
    const entry = outputs.find(e => e.id === source); if (!entry) continue;
    // A card that cannot be created leaves its slot; the others still go in, and the first failure is reported.
    try { await handle.addCard(source, undefined, { x, y: origin.y }); } catch (error) { failure ??= error; }
    x += newCardSize(entry).width + gap;
  }
  handle.fit?.();
  if (failure !== undefined) throw failure;
}
