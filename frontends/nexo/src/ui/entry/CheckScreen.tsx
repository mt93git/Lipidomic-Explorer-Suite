// Scene 4 · Quality check (docs/integration/nexo-entry-proposal): Team's quality answers (C3) as one verdict and three
// checks. It warns, strongly, and never blocks (product owner): an undecided flagged sample gets an amber warning that names
// it; Keep or Exclude (Exclude prepares again with Team's sample decision outlierTreatments {sample: "remove"}, through the
// same open path, as a later board decision does, ENTRY-8); "Open the Canvas" always works.
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { getPalette, openDatasetSession, type DatasetSession, type DatasetSettings } from '../../api';
import { adminUserId } from '../../api/adminToken';
import { getQuality, type Quality } from '../../api/quality';
import { isReadOnly } from '../../state/readonly';
import type { SessionPalette } from '../../palette/sessionPalette';
import { groupColors, scale, ticks } from './charts';
import './CheckScreen.css';
export const checkStrings = {
  title: 'Quality check', loading: 'Reading Team’s quality check…', failed: (m: string) => `The quality check could not load: ${m} You can still open the Canvas.`,
  lede: (lipids: number, samples: number) => `Prepared by Team with your choices: ${lipids} lipids, ${samples} samples.`,
  back: 'Preparation settings', change: 'Change settings', open: 'Open the Canvas', ready: 'Ready for the Canvas',
  toReview: (n: number) => `${n} sample${n === 1 ? '' : 's'} to review`, oneThing: 'One thing to review',
  outlier: (s: string, d: number, limit: number) => `${s} looks like an outlier: it sits far from the other samples in the PCA (distance ${d.toFixed(2)}; Team flags beyond ${limit.toFixed(2)}). An outlier can pull group means and the statistics. Keep it or exclude it. Either way the Canvas opens, and the choice stays visible there.`,
  noScale: 'The samples are not on one scale: no normalization was applied.', notHandled: 'Missing values stay in the data: some plots and statistics will skip them.',
  keep: (s: string) => `Keep ${s}`, exclude: 'Exclude…', excludeNamed: (s: string) => `Exclude ${s}`, cancel: 'Cancel', reasonLabel: (s: string) => `Reason for excluding ${s} (optional)`,
  reason: 'Reason (optional)', undo: 'Undo', kept: (s: string) => `${s} kept`, excluded: (s: string, why?: string) => `${s} excluded${why ? ` (“${why}”)` : ''}`,
  preparing: 'Preparing again with Team…', noRisk: 'No outlier risks detected.', readyCounts: (lipids: number, samples: number) => `${lipids} lipids · ${samples} samples.`,
  later: 'You can decide later: the flag travels to the Canvas.', asIs: 'You can open the Canvas as it is, or change the settings.', allGood: 'Everything Team checks before a figure is in order.',
  checks: 'Three checks', flaggedLegend: 'Flagged by Team’s outlier rule', ok: 'OK', look: 'Look', table: 'Show as table',
  groupTitle: 'Samples group as expected', scaleTitle: 'Samples are on one scale', missingTitle: 'Missing values are handled',
  groupFlag: (s: string, d: number, limit: number) => `${s} is ${d.toFixed(2)} from the centre of the samples; Team flags beyond ${limit.toFixed(2)}.`,
  groupKept: (list: string) => `${list} flagged and kept. The others group by condition.`, groupExcluded: (list: string) => `${list} excluded. The other samples group by condition.`,
  groupOk: 'No outlier risks detected. Samples group by condition.',
  scaleNone: (gap: number) => `Not normalized: medians differ by up to ${gap.toFixed(1)}.`, scaleOk: (gap: number) => gap < 0.05 ? 'Medians line up after normalization.' : `Medians within ${gap.toFixed(2)} after normalization.`,
  missingNone: 'No missing values among the kept lipids.',
  missingSome: (n: number, how: string, worst: string, share: string) => `${n} missing values ${how}. ${worst} had the most (${share}).`,
  qrilc: 'estimated with QRILC', zero: 'set to zero', stay: 'stay missing',
  onComputer: 'Open this check on a computer to keep or exclude it.',
  pcaLabel: 'Principal components, PC1 against PC2, one point per sample', spreadLabel: 'abundance: median and middle half', missingLabel: 'missing before imputation, per sample',
};
const s = checkStrings;
/** The session palette's Group 1 colours (the groups Team's quality check names): the colours of Team's plots on the board. */
export const groupPalette = (palette: SessionPalette): Record<string, string> =>
  Object.fromEntries(palette.contexts.find(c => c.id === 'Group1')?.groups.map(g => [g.name, g.color]) ?? []);
export type Decisions = Record<string, { choice: 'keep' | 'exclude'; reason?: string }>;
/** C3 settings.outlierDecisions, plus one 'undecided' row per flagged sample nobody decided (the board's banner reads it). */
export type OutlierDecision = { sample: string; choice: 'keep' | 'exclude' | 'undecided'; reason?: string; by?: string };
type Point = Quality['pca'][number];
const pct = (a: number, b: number) => b ? `${(100 * a / b).toFixed(1).replace(/\.0$/, '')} %` : '0 %';
export function checkModel(quality: Quality, settings: DatasetSettings, decisions: Decisions) {
  const flagged = quality.pca.filter(p => p.flagged), undecided = flagged.filter(p => !decisions[p.sample]);
  const kept = flagged.filter(p => decisions[p.sample]?.choice === 'keep').map(p => p.sample);
  const excluded = Object.keys(decisions).filter(k => decisions[k].choice === 'exclude');
  const scaleOk = settings.normalizationMethod !== 'none';
  const medians = quality.spread.map(r => r.median), gap = medians.length ? Math.max(...medians) - Math.min(...medians) : 0;
  const missing = quality.missing.reduce((a, r) => a + r.missing, 0), worst = [...quality.missing].sort((a, b) => b.missing - a.missing)[0];
  const handled = settings.useImputation === true || settings.imputeRemainingNAtoZero === true || missing === 0;
  const looks = undecided.length + (scaleOk ? 0 : 1) + (handled ? 0 : 1);
  return { flagged, undecided, kept, excluded, scaleOk, gap, missing, worst, handled, verdict: looks ? 'review' as const : 'ready' as const,
    lipids: quality.missing[0]?.of ?? 0, samples: quality.pca.length };
}
export function outlierDecisions(decisions: Decisions, undecided: Point[], by: string | null): OutlierDecision[] {
  return [...Object.entries(decisions).map(([sample, d]) => ({ sample, choice: d.choice, ...(d.reason && { reason: d.reason }), ...(by && { by }) })),
    ...undecided.map(p => ({ sample: p.sample, choice: 'undecided' as const }))];
}
/** Team's sample decision for exactly these exclusions (C3 as ENTRY-8 built it): every excluded sample is
 *  outlierTreatments {sample: "remove"} and Team leaves it out of the prepared data; `samples` stays as chosen. The one
 *  client rule for Check's re-run, Check → board and a decision on a board alone (the sidecar's PUT decisions writes
 *  the same, nexo-collab projects.mjs decided). */
export function excluding({ outlierTreatments: _, ...given }: DatasetSettings, excluded: string[]): DatasetSettings {
  // A project from before outlierTreatments (C3 until 2026-11-10) left an excluded sample out of `samples`: every sample
  // with a decision row is chosen again (the API puts `samples` in the workbook's order), so it can be included again.
  const rows = Array.isArray(given.outlierDecisions) ? given.outlierDecisions as { sample: string }[] : [];
  const back = [...new Set(rows.map(d => d.sample))].filter(x => !given.samples?.includes(x));
  const settings = back.length ? { ...given, samples: [...given.samples ?? [], ...back] } : given;
  return excluded.length ? { ...settings, outlierTreatments: Object.fromEntries(excluded.map(x => [x, 'remove'])) } : settings;
}
/** The project's settings for "Open the Canvas" (C3): those Team prepared the re-run session with when there is one, else
 *  the prepared ones, with the exclusions as Team's treatment, the design confirmed on Prepare and every decision, an
 *  undecided flag included. */
export const boardSettings = (settings: DatasetSettings, decisions: OutlierDecision[], session?: { dataset: { settings?: DatasetSettings } }): DatasetSettings =>
  ({ ...excluding(session?.dataset.settings ?? settings, decisions.filter(d => d.choice === 'exclude').map(d => d.sample)),
    ...(settings.design !== undefined && { design: settings.design }), outlierDecisions: decisions });
/** The quality for the current exclusions: the first session when none, else a new preparation with Team's treatment. */
export async function rerun<S extends { sessionId: string }>(o: { adminDatasetId: string; sessionId: string; settings: DatasetSettings; excluded: string[];
  open: (id: string, settings: DatasetSettings) => Promise<{ status: 'ready'; session: S } | { status: 'choices' }>; read: (sessionId: string) => Promise<Quality> }): Promise<{ quality: Quality; session?: S }> {
  if (!o.excluded.length) return { quality: await o.read(o.sessionId) };
  const result = await o.open(o.adminDatasetId, excluding(o.settings, o.excluded));
  if (result.status !== 'ready') throw new Error('Team asked for preparation choices again.');
  return { quality: await o.read(result.session.sessionId), session: result.session };
}
const Icon = ({ d }: { d: string }) => <svg className="check-ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }}/>;
const WARN = '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>', OK = '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>';
const ARROW = '<path d="M5 12h14M13 6l6 6-6 6"/>', BACK = '<path d="M15 6l-6 6 6 6"/>';
const Status = ({ ok }: { ok: boolean }) => <span className={`check-st ${ok ? 'ok' : 'look'}`}><Icon d={ok ? OK : WARN}/>{ok ? s.ok : s.look}</span>;
// A hover/focus tooltip for any mark with data-tip inside the chart (one per chart, positioned over the mark).
function TipBox({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const show = (e: PointerEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) => {
    const mark = e.target as Element, text = mark.getAttribute?.('data-tip');
    if (!text) { setTip(null); return; }
    const box = e.currentTarget.getBoundingClientRect(), r = mark.getBoundingClientRect();
    setTip({ text, x: r.left + r.width / 2 - box.left, y: r.top - box.top });
  };
  return <div className="check-chart" onPointerOver={show} onFocus={show} onPointerLeave={() => setTip(null)} onBlur={() => setTip(null)}>
    {children}{tip && <div className="check-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}</div>;
}
const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => <details className="check-tbl"><summary>{s.table}</summary>
  <table><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table></details>;
const AMBER = '#b45309';
function PcaChart({ quality, colors }: { quality: Quality; colors: Record<string, string> }) {
  const W = 300, H = 192, L = 30, R = 12, T = 18, B = 30, xs = quality.pca.map(p => p.pc1), ys = quality.pca.map(p => p.pc2);
  const x0 = Math.floor(Math.min(...xs) - 1), x1 = Math.ceil(Math.max(...xs) + 1), y0 = Math.floor(Math.min(...ys) - 1), y1 = Math.ceil(Math.max(...ys) + 1);
  const X = scale(x0, x1, L, W - R), Y = scale(y0, y1, H - B, T), step = Math.max(1, Math.ceil(Math.max(x1 - x0, y1 - y0) / 6));
  return <TipBox><svg className="check-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={s.pcaLabel}>
    {ticks(x0, x1, step).map(v => <g key={`x${v}`}><line className={v ? 'grid' : 'ax'} x1={X(v)} x2={X(v)} y1={T} y2={H - B}/><text x={X(v)} y={H - B + 13} textAnchor="middle">{v}</text></g>)}
    {ticks(y0, y1, step).map(v => <g key={`y${v}`}><line className={v ? 'grid' : 'ax'} x1={L} x2={W - R} y1={Y(v)} y2={Y(v)}/>{v !== y0 && <text x={L - 6} y={Y(v) + 4} textAnchor="end">{v}</text>}</g>)}
    {quality.pca.map(p => { const tip = `${p.sample} · ${p.group} · PC1 ${p.pc1}, PC2 ${p.pc2} · distance ${p.distance.toFixed(2)}, limit ${quality.limit.toFixed(2)}${p.flagged ? ' · flagged' : ''}`;
      return <g key={p.sample}>{p.flagged && <circle cx={X(p.pc1)} cy={Y(p.pc2)} r={10} fill="none" stroke={AMBER} strokeWidth={2}/>}
        <circle cx={X(p.pc1)} cy={Y(p.pc2)} r={5} fill={colors[p.group]} stroke="#fff" strokeWidth={2}/>
        {p.flagged && <text className="lbl" x={X(p.pc1) + 14} y={Y(p.pc2) + 4} textAnchor={X(p.pc1) > W - 90 ? 'end' : 'start'} dx={X(p.pc1) > W - 90 ? -28 : 0}>{p.sample}</text>}
        <circle className="hit" cx={X(p.pc1)} cy={Y(p.pc2)} r={14} tabIndex={0} role="img" aria-label={tip} data-tip={tip}/></g>; })}
    <text x={L} y={10}>PC2 ({Math.round(quality.variance[1])} %)</text><text x={W - R} y={H - 2} textAnchor="end">PC1 ({Math.round(quality.variance[0])} %)</text></svg></TipBox>;
}
type Row = { id: string; group: string; tip: string };
function RowsChart<T extends Row>({ rows, min, max, marks, unit, label, draw }: { rows: T[]; min: number; max: number; marks: number[]; unit: string; label: string; draw: (r: T, cy: number, X: (v: number) => number) => ReactNode }) {
  const W = 300, L = 70, R = 28, T = 6, B = 30, rh = Math.max(14, Math.min(30, 156 / Math.max(1, rows.length))), H = Math.max(192, T + B + rh * rows.length), X = scale(min, max, L, W - R);
  return <TipBox><svg className="check-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label}>
    {marks.map(v => <g key={v}><line className={v === min ? 'ax' : 'grid'} x1={X(v)} x2={X(v)} y1={T} y2={H - B}/><text x={X(v)} y={H - B + 13} textAnchor="middle">{v}{unit}</text></g>)}
    {rows.map((r, i) => { const cy = T + i * rh + rh / 2; return <g key={r.id}><text x={L - 8} y={cy + 4} textAnchor="end">{r.id}</text>{draw(r, cy, X)}
      <rect className="hit" x={0} y={cy - rh / 2} width={W} height={rh} tabIndex={0} role="img" aria-label={r.tip} data-tip={r.tip}/></g>; })}
    <text x={L + (W - L - R) / 2} y={H - 2} textAnchor="middle">{label}</text></svg></TipBox>;
}
/** `name`: the dataset ("ORD041 · v1"); `readOnly`: a view-only device (D13), no decision; `palette`: the session's group colours. */
export interface CheckViewProps { quality: Quality; settings: DatasetSettings; decisions: Decisions; busy: boolean; error?: string; name?: string; readOnly?: boolean; palette?: Record<string, string>;
  onKeep(sample: string): void; onExclude(sample: string, reason: string): void; onUndo(sample: string): void; onOpenCanvas(): void; onBack(): void }
export function CheckView({ quality, settings, decisions, busy, error, name, readOnly, palette, onKeep, onExclude, onUndo, onOpenCanvas, onBack }: CheckViewProps) {
  const m = checkModel(quality, settings, decisions), f = m.undecided[0], colors = Object.fromEntries(Object.entries(groupColors([...quality.pca.map(p => p.group), ...quality.spread.map(r => r.group)]))
    .map(([group, colour]) => [group, palette?.[group] ?? colour]));
  const [excluding, setExcluding] = useState(false), [reason, setReason] = useState('');
  const decided = Object.entries(decisions).map(([id, d]) => <span key={id} className="check-decided">{d.choice === 'exclude' ? s.excluded(id, d.reason) : s.kept(id)} · <button type="button" className="check-link" disabled={busy} onClick={() => onUndo(id)}>{s.undo}</button></span>);
  const statLine = m.verdict === 'ready' ? s.ready : f ? s.toReview(m.undecided.length) : s.oneThing;
  const how = settings.useImputation === true ? s.qrilc : settings.imputeRemainingNAtoZero === true ? s.zero : s.stay;
  const maxShare = Math.max(0, ...quality.missing.map(r => r.of ? 100 * r.missing / r.of : 0)), maxMiss = Math.max(25, Math.ceil(maxShare / 25) * 25);
  const lo = Math.floor(Math.min(...quality.spread.map(r => r.q1), 20)) - 1, hi = Math.ceil(Math.max(...quality.spread.map(r => r.q3), 20)) + 1;
  const groups = Object.keys(colors);
  return <><div className="entry-check"><div className="check-sheet">
    <button type="button" className="check-crumb" onClick={onBack}><Icon d={BACK}/>{s.back}</button>
    <Title name={name}/><p className="check-lede">{s.lede(m.lipids, m.samples)}</p>
    {m.verdict === 'review' ? <section className="check-verdict warn" aria-labelledby="check-verdict"><Icon d={WARN}/><div className="check-grow">
      <h2 id="check-verdict">{statLine}</h2>
      <p>{f ? s.outlier(f.sample, f.distance, quality.limit) : !m.scaleOk ? s.noScale : s.notHandled}</p>
      {f && readOnly && <p>{s.onComputer}</p>}
      {f && !readOnly && (excluding ? <div className="check-decide"><label className="check-sr" htmlFor="check-why">{s.reasonLabel(f.sample)}</label>
          <input id="check-why" className="check-input" placeholder={s.reason} maxLength={120} value={reason} autoFocus onChange={e => setReason(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setExcluding(false); onExclude(f.sample, reason.trim()); } }}/>
          <button type="button" className="check-btn secondary small" disabled={busy} onClick={() => { setExcluding(false); onExclude(f.sample, reason.trim()); }}>{s.excludeNamed(f.sample)}</button>
          <button type="button" className="check-link" onClick={() => setExcluding(false)}>{s.cancel}</button></div>
        : <div className="check-decide"><button type="button" className="check-btn secondary small" disabled={busy} onClick={() => onKeep(f.sample)}>{s.keep(f.sample)}</button>
          <button type="button" className="check-btn secondary small" disabled={busy} onClick={() => { setReason(''); setExcluding(true); }}>{s.exclude}</button></div>)}
      {decided.length > 0 && <p className="check-decisions">{decided}</p>}</div></section>
    : <section className="check-verdict good" aria-labelledby="check-verdict"><Icon d={OK}/><div className="check-grow"><h2 id="check-verdict">{s.ready}</h2>
      <p>{s.readyCounts(m.lipids, m.samples)} {decided.length ? <span className="check-decisions">{decided}</span> : s.noRisk}</p></div></section>}
    {busy && <p className="check-status" role="status">{s.preparing}</p>}
    {error && <p className="check-error" role="alert">{error}</p>}
    <div className="check-head"><h2>{s.checks}</h2><div className="check-legend" aria-label="Legend">{groups.map(g => <span key={g}><i style={{ background: colors[g] }}/>{g}</span>)}
      {m.flagged.length > 0 && <span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke={AMBER} strokeWidth="2"/></svg>{s.flaggedLegend}</span>}</div></div>
    <div className="check-cards">
      <section aria-labelledby="check-c1"><h3 id="check-c1">{s.groupTitle} <Status ok={!m.undecided.length}/></h3>
        <p className="check-res">{f ? s.groupFlag(f.sample, f.distance, quality.limit) : m.kept.length ? s.groupKept(m.kept.join(', ')) : m.excluded.length ? s.groupExcluded(m.excluded.join(', ')) : s.groupOk}</p>
        <PcaChart quality={quality} colors={colors}/>
        <Table head={['Sample', 'Group', 'PC1', 'PC2', 'Distance', 'Flag']} rows={quality.pca.map(p => [p.sample, p.group, p.pc1, p.pc2, p.distance.toFixed(2), p.flagged ? 'Flagged' : '—'])}/></section>
      <section aria-labelledby="check-c2"><h3 id="check-c2">{s.scaleTitle} <Status ok={m.scaleOk}/></h3>
        <p className="check-res">{m.scaleOk ? s.scaleOk(m.gap) : s.scaleNone(m.gap)}</p>
        <RowsChart rows={quality.spread.map(r => ({ ...r, id: r.sample, tip: `${r.sample}: median ${r.median.toFixed(1)}, middle half ${r.q1.toFixed(1)} to ${r.q3.toFixed(1)}` }))} min={lo} max={hi} marks={ticks(lo, hi, 2)} unit="" label={s.spreadLabel}
          draw={(r, cy, X) => <><line x1={X(r.q1)} x2={X(r.q3)} y1={cy} y2={cy} stroke={colors[r.group]} strokeWidth={2} strokeLinecap="round"/><circle cx={X(r.median)} cy={cy} r={5} fill={colors[r.group]} stroke="#fff" strokeWidth={2}/></>}/>
        <Table head={['Sample', 'Median', 'Q1', 'Q3']} rows={quality.spread.map(r => [r.sample, r.median.toFixed(1), r.q1.toFixed(1), r.q3.toFixed(1)])}/></section>
      <section aria-labelledby="check-c3"><h3 id="check-c3">{s.missingTitle} <Status ok={m.handled}/></h3>
        <p className="check-res">{m.missing === 0 || !m.worst ? s.missingNone : s.missingSome(m.missing, how, m.worst.sample, pct(m.worst.missing, m.worst.of))}</p>
        <RowsChart rows={quality.missing.map(r => ({ ...r, id: r.sample, group: quality.pca.find(p => p.sample === r.sample)?.group ?? '', v: r.of ? 100 * r.missing / r.of : 0,
          tip: `${r.sample}: ${r.missing} of ${r.of} lipids missing before imputation (${pct(r.missing, r.of)})` }))} min={0} max={maxMiss} marks={[0, maxMiss / 2, maxMiss]} unit=" %" label={s.missingLabel}
          draw={(r, cy, X) => <>{r.v > 0 && <rect x={X(0)} y={cy - 5} width={Math.max(0, X(r.v) - X(0))} height={10} rx={3} fill={colors[r.group] ?? '#9aa5b1'}/>}
            {r.sample === m.worst?.sample && r.v > 0 && <text className="lbl" x={X(r.v) + 5} y={cy + 4}>{Math.round(r.v)} %</text>}</>}/>
        <Table head={['Sample', 'Missing', 'Of lipids', 'Share']} rows={quality.missing.map(r => [r.sample, r.missing, r.of, pct(r.missing, r.of)])}/></section>
    </div></div></div>
    <ActionBar look={m.verdict === 'review'} stat={statLine} note={f ? s.later : m.verdict === 'review' ? s.asIs : s.allGood} onBack={onBack} onOpenCanvas={onOpenCanvas}/></>;
}
function ActionBar({ look, stat, note, onBack, onOpenCanvas }: { look: boolean; stat: string; note: string; onBack(): void; onOpenCanvas(): void }) {
  return <div className="check-bar"><div className="check-bar-in"><p className={`check-stat ${look ? 'look' : 'ok'}`}><Icon d={look ? WARN : OK}/>{stat}</p>
    <p className="check-grow check-note">{note}</p>
    <button type="button" className="check-btn secondary check-change" onClick={onBack}>{s.change}</button>
    <button type="button" className="check-btn primary" onClick={onOpenCanvas}>{s.open} <Icon d={ARROW}/></button></div></div>;
}
// The heading stays "Quality check"; the dataset's name sits beside it, as the prototype's title reads.
const Title = ({ name }: { name?: string }) => <div className="check-title"><h1>{s.title}</h1>{name && <span className="check-name">{name}</span>}</div>;
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
/** C6. `adminDatasetId` (the dataset prepared, for Exclude's new preparation) and `onOpenCanvas`'s second argument (the
 *  session prepared without the excluded samples, when there is one: open the board with it) go beyond C6's table. */
export function CheckScreen({ sessionId, settings, onOpenCanvas, onBack, adminDatasetId, name }: { sessionId: string; settings: DatasetSettings;
  onOpenCanvas(outlierDecisions: OutlierDecision[], session?: DatasetSession): void; onBack(): void; adminDatasetId?: string; name?: string }) {
  const [quality, setQuality] = useState<Quality>(), [decisions, setDecisions] = useState<Decisions>({}), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [palette, setPalette] = useState<Record<string, string>>();
  const session = useRef<DatasetSession | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    getQuality(sessionId, controller.signal).then(q => { if (!controller.signal.aborted) setQuality(q); }, e => { if (!controller.signal.aborted) setError(s.failed(message(e))); });
    // Team's group colours for this session, as the board's plots draw them; without them the charts keep their own.
    getPalette(sessionId).then(p => { if (!controller.signal.aborted) setPalette(groupPalette(p)); }, () => {});
    return () => controller.abort();
  }, [sessionId]);
  // A decision that changes the samples applies once Team has prepared them: the charts and the board always agree.
  async function prepare(next: Decisions) {
    setBusy(true); setError(undefined);
    try {
      const result = await rerun({ adminDatasetId: adminDatasetId ?? '', sessionId, settings, excluded: Object.keys(next).filter(k => next[k].choice === 'exclude'), open: openDatasetSession, read: getQuality });
      session.current = result.session; setQuality(result.quality); setDecisions(next);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const open = () => onOpenCanvas(quality ? outlierDecisions(decisions, checkModel(quality, settings, decisions).undecided, adminUserId()) : [], session.current);
  if (!quality) return <><div className="entry-check"><div className="check-sheet"><button type="button" className="check-crumb" onClick={onBack}><Icon d={BACK}/>{s.back}</button><Title name={name}/>
    {error ? <p className="check-error" role="alert">{error}</p> : <p className="check-status" role="status">{s.loading}</p>}</div></div>
    <ActionBar look={!!error} stat={error ? s.oneThing : s.loading} note={error ? s.asIs : ''} onBack={onBack} onOpenCanvas={open}/></>;
  return <CheckView quality={quality} settings={settings} decisions={decisions} busy={busy} error={error} name={name} readOnly={isReadOnly()} palette={palette} onBack={onBack} onOpenCanvas={open}
    onKeep={sample => setDecisions({ ...decisions, [sample]: { choice: 'keep' } })}
    onExclude={(sample, reason) => void prepare({ ...decisions, [sample]: { choice: 'exclude', ...(reason && { reason }) } })}
    onUndo={sample => { const { [sample]: gone, ...rest } = decisions; if (gone?.choice === 'exclude') void prepare(rest); else setDecisions(rest); }}/>;
}
