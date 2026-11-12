import type { StatisticsResult } from '../state/document';
import { DEFAULT_SETTINGS, DEFAULT_PRESENTATION, pairKey, type Settings, type Presentation } from './settings';
export type Result = StatisticsResult;
export type Row = Result['rows'][number];
export interface DisplayRow extends Row {
    value: number | null | undefined;
    symbol: string;
    label: string;
    nLabelA: string;
    nLabelB: string;
}
export type DisplayRows = DisplayRow[] & {
    groups?: Result['groups'];
};
// Team canvas_statistics.js:120–143.
export function formatP(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v))
        return 'n/a';
    if (v < 1e-300)
        return '< 1e-300';
    let formatted = '';
    for (let digits = 2; digits <= 17; digits++) {
        formatted = v < .001 ? v.toExponential(digits - 1) : v.toPrecision(digits);
        if ([.05, .01, .001].every(t => (v < t) === (Number(formatted) < t)))
            break;
    }
    return formatted;
}
export function stars(v: number | null | undefined) { return v == null || !Number.isFinite(v) ? 'n/a' : v < .001 ? '***' : v < .01 ? '**' : v < .05 ? '*' : 'ns'; }
/** NEXO-P6 item 4: Team attaches violin statistics (describe, n labels) only to an instance copy of the dashboard violin
 *  (www/team/js/canvas.js: r.instance && TeamCanvasStatistics.supports(r.instance.source)); a fixed view gets none. */
export const describesGroups = (node: { id: string; instance?: { source?: string } | null }) => node.instance?.source === 'results_dashboard-plot_violin';
export function nLabel(g: Result['groups'][number] | undefined, mode: Presentation['nDisplay']) {
    if (!g || mode === 'hidden')
        return '';
    const participants = g.nParticipants == null ? null : `${g.nParticipants} participant${g.nParticipants === 1 ? '' : 's'}`, samples = `n = ${g.nSamples} sample${g.nSamples === 1 ? '' : 's'}`;
    return mode === 'participants' ? participants || samples : mode === 'both' && participants ? samples + '<br>' + participants : samples;
}
export function rowsForDisplay(result: Result, presentation: Presentation, applied: Settings = DEFAULT_SETTINGS): DisplayRows {
    const hidden = new Set(presentation.hidden.map(pairKey)), adjusted = presentation.pValue === 'adjusted' && applied.correction !== 'none', symbol = adjusted ? (applied.correction === 'BH' ? 'q' : 'adj. p') : 'p';
    const rows: DisplayRows = result.rows.filter(row => !hidden.has(pairKey(row))).map(row => {
        const value = adjusted ? row.pAdj : row.p, exact = symbol + (value != null && value < 1e-300 ? ' ' : ' = ') + formatP(value), star = stars(value);
        return { ...row, value, symbol, label: presentation.label === 'exact' ? exact : presentation.label === 'stars' ? star : `${star} (${exact})`, nLabelA: nLabel(result.groups.find(g => g.group === row.a), presentation.nDisplay), nLabelB: nLabel(result.groups.find(g => g.group === row.b), presentation.nDisplay) };
    });
    rows.groups = result.groups.map(g => ({ ...g }));
    return rows;
}
export function methodsNote(result: Result | null | undefined, applied: Settings, presentation: Presentation = DEFAULT_PRESENTATION) {
    if (!result)
        return 'No current results.';
    const symbol = presentation.pValue === 'raw' || applied.correction === 'none' ? 'p' : applied.correction === 'BH' ? 'q' : 'adj. p';
    return result.provenance.method + ' ' + result.provenance.design + ' Labels use ' + symbol + ': * < 0.05, ** < 0.01, *** < 0.001, ns otherwise. Computed ' + result.computedAt + '.';
}
export function provenanceOf(result: Result, _applied: Settings): Result['provenance'] { return { ...result.provenance }; }
