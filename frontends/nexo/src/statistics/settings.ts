// Team canvas_statistics.js:8–21,49–62,445,488–493,604.
export const TESTS = { welch: 'Welch t-test', wilcoxon: 'Wilcoxon rank-sum (Mann-Whitney)' } as const;
export const CORRECTIONS = { holm: 'Holm', BH: 'Benjamini-Hochberg (FDR, q)', bonferroni: 'Bonferroni', none: 'None (unadjusted)' } as const;
export const SCOPES = { displayed: 'This lipid only', all_in_scope: 'Every lipid in the current scope' } as const;
export const EFFECTS = { none: 'None', hedges_g: "Hedges' g", cliffs_delta: "Cliff's delta" } as const;
export interface Pair {
    a: string;
    b: string;
}
export interface Settings {
    test: keyof typeof TESTS;
    correction: keyof typeof CORRECTIONS;
    scope: keyof typeof SCOPES;
    comparisons: Pair[];
    effect: keyof typeof EFFECTS;
}
export interface Presentation {
    show: boolean;
    pValue: 'adjusted' | 'raw';
    label: 'exact' | 'stars' | 'both';
    fontSize: number;
    spacing: number;
    tip: number;
    nDisplay: 'samples' | 'participants' | 'both' | 'hidden';
    hidden: Pair[];
}
export const DEFAULT_SETTINGS: Settings = { test: 'welch', correction: 'holm', scope: 'displayed', comparisons: [], effect: 'none' };
export const DEFAULT_PRESENTATION: Presentation = { show: true, pValue: 'adjusted', label: 'both', fontSize: 12, spacing: .08, tip: .02, nDisplay: 'samples', hidden: [] };
export const STATUS = {
    none: 'No statistics applied. Choose the analysis below, then Review and confirm to compute p-values.',
    computing: 'Computing statistics from the values drawn in this plot…',
    verifying: 'Checking the saved statistics against the current data…',
    checking: 'The plot updated. Checking that the statistics still match the drawn data…',
    current: 'Statistics match the values drawn in this plot.',
    invalid: 'No current statistics: the data, displayed lipid, grouping, participant IDs or design approval changed after they were confirmed. Review and confirm to compute them again.'
};
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
function choice<T extends string>(v: unknown, values: readonly T[], fallback: T): T { return values.includes(v as T) ? v as T : fallback; }
export function pairKey(p: Pair) { return JSON.stringify([p.a, p.b]); }
function pairs(raw: unknown): Pair[] {
    const seen = new Set<string>(), out: Pair[] = [];
    for (const entry of Array.isArray(raw) ? raw : []) {
        if (Array.isArray(entry) && entry.length !== 2)
            continue;
        const p = Array.isArray(entry) ? { a: entry[0], b: entry[1] } : object(entry);
        const valid = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 500 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
        if (!valid(p.a) || !valid(p.b) || p.a === p.b)
            continue;
        const key = JSON.stringify([p.a, p.b].sort());
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ a: p.a, b: p.b });
        if (out.length === 45)
            break;
    }
    return out;
}
export function effectAllowedFor(test: Settings['test']) { return test === 'wilcoxon' ? 'cliffs_delta' : 'hedges_g'; }
export function sanitizeSettings(raw: unknown): Settings {
    const v = object(raw), test = choice(v.test, ['welch', 'wilcoxon'], 'welch'), effect = choice(v.effect, ['none', 'hedges_g', 'cliffs_delta'], 'none');
    return { test, correction: choice(v.correction === 'bh' ? 'BH' : v.correction, ['holm', 'BH', 'bonferroni', 'none'], 'holm'), scope: choice(v.scope, ['displayed', 'all_in_scope'], 'displayed'), comparisons: pairs(v.comparisons), effect: effect === 'none' ? 'none' : effectAllowedFor(test) };
}
export function sanitizePresentation(raw: unknown): Presentation {
    const v = object(raw);
    const clamp = (key: keyof Presentation, min: number, max: number) => typeof v[key] === 'number' && Number.isFinite(v[key]) ? Math.min(max, Math.max(min, v[key] as number)) : DEFAULT_PRESENTATION[key] as number;
    return { show: typeof v.show === 'boolean' ? v.show : true, pValue: choice(v.pValue, ['adjusted', 'raw'], 'adjusted'), label: choice(v.label, ['exact', 'stars', 'both'], 'both'), fontSize: Math.round(clamp('fontSize', 8, 28)), spacing: clamp('spacing', .03, .3), tip: clamp('tip', 0, .1), nDisplay: choice(v.nDisplay, ['samples', 'participants', 'both', 'hidden'], 'samples'), hidden: pairs(v.hidden) };
}
export function diffSettings(applied: Settings | null | undefined, staged: Settings) {
    const describe = (s: Settings) => [TESTS[s.test], CORRECTIONS[s.correction], SCOPES[s.scope], s.comparisons.length ? s.comparisons.map(p => `${p.b} vs ${p.a}`).join('; ') : 'None', EFFECTS[s.effect]];
    const before = applied ? describe(applied) : [], next = describe(staged);
    return ['Test', 'Correction', 'Correction family', 'Comparisons', 'Effect size'].flatMap((setting, i) => before[i] === next[i] ? [] : [{ setting, applied: before[i] || 'Not applied', next: next[i] }]);
}
/** Stateless reply mapping; pass matchesCurrent for fingerprint-aware checks (Team:357–362). */
export function statusFor(reply: {
    status?: string;
    reason?: string;
    matchesCurrent?: boolean;
} | null | undefined): string {
    if (!reply)
        return STATUS.none;
    const status = reply.status;
    if (status === 'blocked' || status === 'error')
        return (status === 'error' ? 'Could not check statistics. ' : '') + (reply.reason || 'No p-values were computed.');
    if (status === 'ok')
        return STATUS.current;
    if (status === 'unchanged' || status === 'invalidated')
        return reply.matchesCurrent === true ? STATUS.current : STATUS.invalid;
    return STATUS[status as keyof typeof STATUS] || '';
}
