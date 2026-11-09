import { CORRECTIONS, TESTS, SCOPES, EFFECTS, DEFAULT_PRESENTATION, pairKey, type Settings, type Presentation } from './settings';
import type { Result } from './result';
// Team canvas_statistics.js:155–174; strings retain spreadsheet-formula protection.
function cell(v: unknown) { if (v == null)
    return ''; let s = String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s))
    s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
export function statisticsCsv(r: Result, a: Settings, p: Presentation = DEFAULT_PRESENTATION): string {
    const header = ['Lipid', 'Grouping', 'Group_A', 'Group_B', 'n_A_samples', 'n_B_samples', 'n_A_participants', 'n_B_participants', 'Excluded_A', 'Excluded_B', 'Test', 'Statistic_B_vs_A', 'df', 'p_unadjusted', 'p_adjusted', 'Correction', 'Family_scope', 'Family_size_m', 'Family_lipids', 'Family_comparisons', 'Effect_size', 'Effect_B_vs_A', 'Shown_on_plot', 'Note', 'Transformation', 'Normalization', 'Imputation', 'Participant_IDs', 'Design', 'Method', 'Computed_at', 'Result_fingerprint'];
    const hidden = new Set(p.hidden.map(pairKey)), group = (name: string) => r.groups.find(g => g.group === name);
    const lines = r.rows.map(row => [r.lipid, r.grouping, row.a, row.b, row.nA, row.nB, group(row.a)?.nParticipants, group(row.b)?.nParticipants, group(row.a)?.nExcluded, group(row.b)?.nExcluded, TESTS[a.test], row.statistic, row.df, row.p, a.correction === 'none' ? null : row.pAdj, CORRECTIONS[a.correction], SCOPES[a.scope], r.family.m, r.family.features, r.family.comparisons, a.effect === 'none' ? '' : EFFECTS[a.effect], row.effect, p.show && !hidden.has(pairKey(row)) ? 'TRUE' : 'FALSE', row.note, r.provenance.transformation, r.provenance.normalization, r.provenance.imputation, r.provenance.participantIds, r.provenance.design, r.provenance.method, r.computedAt, r.fingerprint].map(cell).join(','));
    return [header.join(','), ...lines].join('\r\n') + '\r\n';
}
