/** Chart audit b12 (Astra review 2026-11-08): Team turns a click on a cell plot's Plotly point into an input change
 * (R/frontends/team/plot_instances.R: a class bar selects cell_class, a comparison point selects cell_sample). A live
 * Plotly card forwards the click to the API (POST .../cards/<id>/events, cards.R api_card_event), which sets it as
 * Shiny's plotly binding does, so Team's own observer runs. Only for the catalog's clickSource of the card, and only
 * when the figure's event source is an instance's private one (`tcinstance_<id>-<clickSource>`: this card's, or the
 * render worker's / disk cache's copy that drew it). */
import type { CatalogEntry } from './api';

export interface ClickPoint { curveNumber: number; pointNumber: number | number[]; x: unknown; y: unknown; z?: unknown; customdata?: unknown; key?: unknown }
export interface CardEventReply { settled: boolean; inputs: Record<string, unknown>; changed: string[] }
type PlotlyPoint = { curveNumber: number; pointNumber: number | number[]; x: unknown; y: unknown; z?: unknown; customdata?: unknown };
type Trace = { key?: unknown; _isSimpleKey?: boolean };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** plotly's htmlwidgets/plotly.js eventDataWithKey (plotly R 4.12): the array Shiny receives as plotly_click-<source>. */
export function plotlyClickPoints(event: unknown, data: unknown[]): ClickPoint[] | undefined {
  const points = (event as { points?: PlotlyPoint[] } | undefined)?.points;
  if (!event || typeof event !== 'object' || !own(event, 'points') || !Array.isArray(points)) return undefined;
  return points.map(pt => {
    const obj: ClickPoint = { curveNumber: pt.curveNumber, pointNumber: pt.pointNumber, x: pt.x, y: pt.y };
    if (own(pt, 'z')) obj.z = pt.z;
    if (own(pt, 'customdata')) obj.customdata = pt.customdata;
    const trace = (data[pt.curveNumber] ?? {}) as Trace;
    if (trace._isSimpleKey) obj.key = trace.key;
    else if (Array.isArray(trace.key)) {
      const key = typeof pt.pointNumber === 'number' ? trace.key[pt.pointNumber] : (trace.key[pt.pointNumber[0]] as unknown[] | undefined)?.[pt.pointNumber[1]];
      if (key !== undefined) obj.key = key;
    }
    return obj;
  });
}

/** The catalog's click source for a card's Team source (catalog.R clickSource), if any. */
export function clickSourceFor(node: { id: string; instance?: { source?: unknown } | null }, catalog: CatalogEntry[]): string | undefined {
  const source = typeof node.instance?.source === 'string' ? node.instance.source : undefined;
  const entry = catalog.find(e => e.id === source) ?? catalog.find(e => e.id === node.id || node.id.endsWith(`-${e.output}`));
  return entry?.clickSource;
}

export interface ClickTarget { data: unknown[]; on(name: string, fn: (event: unknown) => void): void }
export interface ClickBinding {
  instanceId: string | undefined; clickSource: string | undefined; figureSource: unknown;
  send: (body: { event: 'plotly_click'; source: string; points: ClickPoint[] }) => Promise<CardEventReply>;
  /** The module changed the card's inputs (e.g. cell_class): the card records them as one edit and draws again. */
  onChanged: (inputs: Record<string, unknown>) => void;
  onError?: (error: unknown) => void;
}
/** Listens for plotly_click on a drawn Plotly div; true when bound. Clicks are sent one at a time, in order. */
export function bindPlotClick(gd: ClickTarget, b: ClickBinding): boolean {
  const { instanceId, clickSource } = b;
  // The figure carries the private source of the instance that drew it: this card's, or a render worker's copy /
  // a disk-cached render (tcinstance_pool<hash>-<source>, pool.R). The event always goes to this card's instance.
  const drawn = typeof b.figureSource === 'string' ? /^tcinstance_[a-z0-9_]+-(.+)$/.exec(b.figureSource)?.[1] : undefined;
  if (!instanceId || !clickSource || drawn !== clickSource) return false;
  let chain: Promise<void> = Promise.resolve();
  gd.on('plotly_click', event => {
    const points = plotlyClickPoints(event, gd.data);
    if (!points?.length) return;
    chain = chain.then(async () => {
      try {
        const reply = await b.send({ event: 'plotly_click', source: clickSource, points });
        if (reply.changed?.length) b.onChanged(reply.inputs);
      } catch (error) { b.onError?.(error); }
    });
  });
  return true;
}
