// Chart audit b05 F5: a card whose Team module sets its own plot height through an input (catalog heightInput,
// frontends/nexo-api/catalog.R; today only the violin view's violin_zoom_pct) is as tall as that plot plus the card
// chrome. The height is the module's value (the API's plotHeight or the input itself), never recomputed here.
import { CARD_CHROME } from '../cards';
import { setNodeInputs, type Command } from '../state/commands';
import { sizeCommands, sizeLimits } from '../ui/Inspector/cardSize';
type Box = { id: string; x: number; y: number; width: number; height: number; instance?: { inputs?: unknown } };
// Team's sliderInput (4_heatmap_module.R): min 300, max 5000, step 50.
export const PLOT_HEIGHT = { min: 300, max: 5000, step: 50 } as const;
const positive = (v: unknown): number | undefined => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined; };
/** The card height that shows the whole plot: plot + chrome, within the canvas limits (canvas_state.R: 220-4000). */
export const cardHeightFor = (plotHeight: number): number => Math.max(sizeLimits.minHeight, Math.min(sizeLimits.max, Math.round(plotHeight) + CARD_CHROME));
/** The plot height a card of this height shows, as Team's slider accepts it (stepped, clamped). */
export const plotHeightForCard = (cardHeight: number): number => {
  const stepped = Math.round((cardHeight - CARD_CHROME) / PLOT_HEIGHT.step) * PLOT_HEIGHT.step;
  return Math.max(PLOT_HEIGHT.min, Math.min(PLOT_HEIGHT.max, stepped));
};
/** The module's plot height: the one the API reported, else the card's height input; none for other cards. */
export const plotHeightOf = (input: string | undefined, inputs?: Record<string, unknown>, reported?: number): number | undefined =>
  input ? positive(reported) ?? positive(inputs?.[input]) : undefined;
/** A size change on such a card (hand resize, Size field): the card snaps to a slider value, neighbours settle, and
 *  the input follows, as commands for one undo step. */
export function heightInputCommands(nodes: readonly Box[], id: string, input: string, size: { width: number; height: number }, key: string, inputs?: Record<string, unknown>): Command[] {
  const node = nodes.find(n => n.id === id); if (!node) return [];
  const plot = plotHeightForCard(size.height), current = inputs ?? (node.instance?.inputs as Record<string, unknown> | undefined) ?? {};
  const commands = node.width === size.width && node.height === cardHeightFor(plot) ? [] : sizeCommands(nodes as Box[], id, { width: size.width, height: cardHeightFor(plot) }, key);
  return current[input] === plot ? commands : [...commands, setNodeInputs(id, { ...current, [input]: plot })];
}
/** NEXO-P6 item 5: the image height a card asks for. Team draws the module's plot at its own height (plotOutput height =
 *  the height input) and scales the image into the card (object-fit: contain), whatever the card's size; a shorter
 *  device cut a many-facet plot. Without a plot height: the body of a plot-height card, else the whole card (as before). */
export const imageHeightFor = (cardHeight: number, input: string | undefined, inputs?: Record<string, unknown>): number => {
  const plot = plotHeightOf(input, inputs);
  return plot !== undefined ? Math.round(plot) : Math.round(cardHeight) - (input ? CARD_CHROME : 0);
};
