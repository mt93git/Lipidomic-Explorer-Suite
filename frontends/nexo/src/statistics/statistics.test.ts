import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS as a, DEFAULT_PRESENTATION as p, sanitizeSettings, sanitizePresentation, diffSettings, statusFor, STATUS } from './settings';
import { rowsForDisplay, methodsNote, provenanceOf, type Result } from './result';
import { bracketAnnotations, applyStatisticsToFigure } from './annotations';
import { statisticsCsv } from './csv';
const result: Result = {
    fingerprint: 'abc', dataFingerprint: 'def', computedAt: '2026-11-06T00:00:00Z', lipid: 'L', grouping: 'Group1',
    family: { m: 3, features: 1, comparisons: 3, untestable: 0 },
    groups: ['A', 'B', 'C'].map(group => ({ group, nSamples: 2, nExcluded: 0, nParticipants: 1 })),
    rows: [['A', 'B'], ['B', 'C'], ['A', 'C']].map(([a, b]) => ({ a, b, nA: 2, nB: 2, p: 0.001, pAdj: 0.05, note: '' })),
    provenance: { method: 'Method.', design: 'Independent.', transformation: 'log10', normalization: 'None', imputation: 'None', participantIds: 'unique' }
};
const figure = { data: [{ x: ['A', 'B', 'C'], y: [0, 5, 10] }], layout: { annotations: [{ text: 'keep' }], shapes: [] } };
describe('Team statistics pure port', () => {
    it('clamps font sizes', () => { expect(sanitizePresentation({ fontSize: 7 }).fontSize).toBe(8); expect(sanitizePresentation({ fontSize: 29 }).fontSize).toBe(28); });
    it('clamps spacing/tip and rejects unknown choices', () => { expect(sanitizePresentation({ spacing: 1, tip: -1, label: 'bad' })).toMatchObject({ spacing: .3, tip: 0, label: 'both' }); expect(sanitizeSettings({ test: 'bad' }).test).toBe('welch'); });
    it('matches effects to test and canonicalizes BH', () => { expect(sanitizeSettings({ test: 'wilcoxon', effect: 'hedges_g', correction: 'bh' })).toMatchObject({ effect: 'cliffs_delta', correction: 'BH' }); });
    it('deduplicates, rejects malformed pairs and limits comparisons', () => { const comparisons = [{ a: 'A', b: 'B' }, { a: 'B', b: 'A' }, { a: 'A', b: 'A' }, { a: 4, b: 'B' }]; expect(sanitizeSettings({ comparisons }).comparisons).toEqual([{ a: 'A', b: 'B' }]); expect(sanitizeSettings({ comparisons: Array.from({ length: 60 }, (_, i) => ({ a: 'A', b: String(i) })) }).comparisons).toHaveLength(45); });
    it('diffs only changes with Team labels', () => { expect(diffSettings(a, { ...a, test: 'wilcoxon' })).toEqual([{ setting: 'Test', applied: 'Welch t-test', next: 'Wilcoxon rank-sum (Mann-Whitney)' }]); expect(diffSettings(a, a)).toEqual([]); });
    it('uses strict star thresholds', () => { for (const [value, label] of [[.0009, '***'], [.001, '**'], [.01, '*'], [.05, 'ns']] as const) {
        expect(rowsForDisplay({ ...result, rows: [{ ...result.rows[0], pAdj: value }] }, { ...p, label: 'stars' })[0].label).toBe(label);
    } });
    it('filters hidden pairs and selects raw values', () => { expect(rowsForDisplay(result, { ...p, hidden: [{ a: 'A', b: 'B' }] })).toHaveLength(2); expect(rowsForDisplay(result, { ...p, pValue: 'raw' })[0].value).toBe(.001); });
    it('formats sample and participant counts', () => { expect(rowsForDisplay(result, { ...p, nDisplay: 'both' })[0].nLabelA).toBe('n = 2 samples<br>1 participant'); expect(rowsForDisplay(result, { ...p, nDisplay: 'hidden' })[0].nLabelA).toBe(''); });
    it('stacks three overlapping brackets with spacing, tip and font clearance', () => { const spec = bracketAnnotations(figure, rowsForDisplay(result, p), p); spec.annotations.filter(x => x.name?.startsWith('tcstat-label')).forEach((x, i) => expect(x.y).toBeCloseTo([10.48, 11.68, 12.88][i])); expect(spec.shapes[0].y0).toBeCloseTo(10.28); expect(spec.shapes).toHaveLength(9); });
    it('merges without mutation and is idempotent', () => { const before = structuredClone(figure), state = { version: '1' as const, presentation: p, applied: { ...a, comparisons: [] }, result }; const once = applyStatisticsToFigure(figure, state); expect(figure).toEqual(before); expect(applyStatisticsToFigure(once, state)).toEqual(once); expect(once.layout.annotations).toContainEqual({ text: 'keep' }); });
    it('exports exact header, CRLF, escaping and formula protection', () => { const csv = statisticsCsv({ ...result, lipid: '=L,"x"' }, a); expect(csv.split('\r\n')[0]).toBe('Lipid,Grouping,Group_A,Group_B,n_A_samples,n_B_samples,n_A_participants,n_B_participants,Excluded_A,Excluded_B,Test,Statistic_B_vs_A,df,p_unadjusted,p_adjusted,Correction,Family_scope,Family_size_m,Family_lipids,Family_comparisons,Effect_size,Effect_B_vs_A,Shown_on_plot,Note,Transformation,Normalization,Imputation,Participant_IDs,Design,Method,Computed_at,Result_fingerprint'); expect(csv).toContain('"\'=L,""x"""'); expect(csv.endsWith('\r\n')).toBe(true); });
    it('uses q for BH, raw p for no correction and handles untestable rows', () => { expect(rowsForDisplay(result, p, { ...a, correction: 'BH' })[0].symbol).toBe('q'); expect(rowsForDisplay(result, p, { ...a, correction: 'none' })[0].value).toBe(.001); const missing = { ...result, rows: [{ ...result.rows[0], p: null, pAdj: null }] }; expect(rowsForDisplay(missing, p)[0].label).toBe('n/a (adj. p = n/a)'); expect(bracketAnnotations(figure, rowsForDisplay(missing, p), p).shapes).toEqual([]); });
    it('uses axis baseline and supports horizontal traces and removal', () => { const horizontal = { data: [{ orientation: 'h', y: ['A', 'B', 'C'], x: [0, 5, 10] }], layout: { xaxis: { range: [-2, 12] } } }; const spec = bracketAnnotations(horizontal, rowsForDisplay(result, p), p); expect(spec.shapes[0].y0).toBe(0); expect(spec.shapes[0].x1).toBeCloseTo(12 + 14 * .08 * .6); expect(applyStatisticsToFigure(applyStatisticsToFigure(figure, { presentation: p, applied: a, result }), null).layout.annotations).toEqual([{ text: 'keep' }]); });
    it('copies six provenance fields and uses Team methods/status wording', () => { expect(provenanceOf(result, a)).toEqual(result.provenance); expect(provenanceOf(result, a)).not.toBe(result.provenance); expect(methodsNote(result, a)).toBe('Method. Independent. Labels use adj. p: * < 0.05, ** < 0.01, *** < 0.001, ns otherwise. Computed 2026-11-06T00:00:00Z.'); expect(statusFor({ status: 'ok' })).toBe(STATUS.current); expect(statusFor({ status: 'blocked', reason: 'Blocked.' })).toBe('Blocked.'); });
});

// UX review 2, group 5 (plan "Phases 3–7 as cut"): invalidated statistics name who changed the board (meta.lastChange).
it('invalidated statistics say who changed the board', () => {
  expect(statusFor({ status: 'invalidated' }, 'Blair Synthetic')).toBe('No current statistics: the data, displayed lipid, grouping, participant IDs or design approval changed after they were confirmed (changed by Blair Synthetic). Review and confirm to compute them again.');
  expect(statusFor({ status: 'invalidated' })).toBe(STATUS.invalid);
});
