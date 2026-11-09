import type { Figure } from '../api/types';
import type { Statistics } from '../state/document';
import { sanitizeSettings, sanitizePresentation, type Settings, type Presentation } from './settings';
import { rowsForDisplay, nLabel, type DisplayRows } from './result';
export interface PlotlyAnnotation {
    name?: string;
    x?: number;
    y?: number;
    [key: string]: unknown;
}
export interface PlotlyShape {
    name?: string;
    x0?: number;
    x1?: number;
    y0?: number;
    y1?: number;
    [key: string]: unknown;
}
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' ? v as Record<string, unknown> : {};
function values(v: unknown): unknown[] { return v == null ? [] : Array.isArray(v) ? v : ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<unknown>) : [v]; }
/** Team canvas_statistics.js:186–235. Explicit range replaces runtime Plotly baseline;
 * without a rendered axis use the finite data extent. No DOM/autorange dependency. */
export function bracketAnnotations(figure: Figure, rows: DisplayRows, p: Presentation): {
    annotations: PlotlyAnnotation[];
    shapes: PlotlyShape[];
} {
    const traces = figure.data.map(record), horizontal = traces.some(t => t.orientation === 'h'), catAxis = horizontal ? 'yaxis' : 'xaxis', valueAxis = horizontal ? 'xaxis' : 'yaxis';
    const full = record(record((figure as unknown as Record<string, unknown>)._fullLayout)[catAxis]);
    const configured = full._categories ?? record(figure.layout[catAxis]).categoryarray;
    const cats: string[] = Array.isArray(configured) ? configured.map(String) : [];
    if (!cats.length)
        for (const t of traces)
            for (const x of values(horizontal ? t.y : t.x))
                if (!cats.includes(String(x)))
                    cats.push(String(x));
    const seen = new Set<string>();
    let lo = Infinity, hi = -Infinity;
    for (const t of traces) {
        if (t.visible === false || t.visible === 'legendonly' || t.x == null || t.y == null)
            continue;
        const xs = values(horizontal ? t.y : t.x), ys = values(horizontal ? t.x : t.y);
        ys.forEach((v, i) => { const y = Number(v); if (!Number.isFinite(y))
            return; seen.add(String(xs.length === 1 ? xs[0] : xs[i])); lo = Math.min(lo, y); hi = Math.max(hi, y); });
    }
    if (!Number.isFinite(lo))
        return { annotations: [], shapes: [] };
    const range = record(figure.layout[valueAxis]).range;
    const [bottom, top] = Array.isArray(range) && range.length === 2 && range.every(v => typeof v === 'number' && Number.isFinite(v)) ? range as number[] : [lo, hi];
    const span = top - bottom > 0 ? top - bottom : 1, scale = p.fontSize / 12;
    const items = (p.show ? rows : []).filter(r => r.p != null && seen.has(r.a) && seen.has(r.b) && cats.includes(r.a) && cats.includes(r.b)).map(row => ({ row, i0: Math.min(cats.indexOf(row.a), cats.indexOf(row.b)), i1: Math.max(cats.indexOf(row.a), cats.indexOf(row.b)), lane: 0 })).sort((a, b) => (a.i1 - a.i0) - (b.i1 - b.i0) || a.i0 - b.i0);
    const used: typeof items[] = [];
    for (const item of items) {
        while (used[item.lane]?.some(other => !(other.i1 < item.i0 || other.i0 > item.i1)))
            item.lane++;
        (used[item.lane] ??= []).push(item);
    }
    const annotations: PlotlyAnnotation[] = [], shapes: PlotlyShape[] = [];
    items.forEach((item, n) => {
        const y = top + span * p.spacing * (item.lane + .6) + span * .04 * scale * item.lane, tip = span * p.tip;
        [[item.i0, y - tip, item.i0, y], [item.i0, y, item.i1, y], [item.i1, y, item.i1, y - tip]].forEach((c, k) => shapes.push({ type: 'line', name: `tcstat-bracket-${n}-${k}`, xref: 'x', yref: 'y', x0: c[0], y0: c[1], x1: c[2], y1: c[3], line: { color: '#172d4b', width: 1.2 }, layer: 'above' }));
        annotations.push({ name: `tcstat-label-${n}`, xref: 'x', yref: 'y', x: (item.i0 + item.i1) / 2, y, yanchor: 'bottom', showarrow: false, text: item.row.label, font: { size: p.fontSize, color: '#172d4b' }, bgcolor: 'rgba(255,255,255,0.85)' });
    });
    if (p.nDisplay !== 'hidden')
        cats.forEach((cat, i) => { const text = nLabel(rows.groups?.find(g => g.group === cat), p.nDisplay); if (!text || !seen.has(cat))
            return; annotations.push({ name: `tcstat-n-${i}`, xref: 'x', yref: 'y', x: i, y: bottom, yanchor: 'top', showarrow: false, text, font: { size: Math.max(8, p.fontSize - 1), color: '#526477' }, bgcolor: 'rgba(255,255,255,0.94)', borderpad: 2 }); });
    if (horizontal) {
        for (const s of shapes) {
            [s.x0, s.y0] = [s.y0, s.x0];
            [s.x1, s.y1] = [s.y1, s.x1];
        }
        for (const a of annotations) {
            [a.x, a.y] = [a.y, a.x];
            a.xanchor = a.yanchor === 'bottom' ? 'left' : 'right';
            delete a.yanchor;
        }
    }
    return { annotations, shapes };
}
export type StatisticsInput = {
    presentation: Presentation;
    applied?: Settings | null;
    result?: Statistics['result'];
} | Statistics;
export function applyStatisticsToFigure(figure: Figure, statistics: StatisticsInput | null | undefined): Figure {
    const next = structuredClone(figure), layout = next.layout;
    const keep = (raw: unknown) => Array.isArray(raw) ? raw.filter(item => !(typeof record(item).name === 'string' && (record(item).name as string).startsWith('tcstat-'))) : [];
    let spec: {
        annotations: PlotlyAnnotation[];
        shapes: PlotlyShape[];
    } = { annotations: [], shapes: [] };
    if (statistics?.result && statistics.applied) {
        const applied = sanitizeSettings(statistics.applied), presentation = sanitizePresentation(statistics.presentation);
        spec = bracketAnnotations(figure, rowsForDisplay(statistics.result, presentation, applied), presentation);
    }
    layout.annotations = [...keep(layout.annotations), ...spec.annotations];
    layout.shapes = [...keep(layout.shapes), ...spec.shapes];
    return next;
}
