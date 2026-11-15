// Scene 4 on the Canvas: the "Prepared by X · settings" chip with the settings card, and, while a flagged sample is
// undecided (settings.outlierDecisions, C3, row 'undecided'), a banner on the board whose Review opens the decision.
// ENTRY-8: people who may decide (`canDecide`, from the integrator) keep, exclude or undo it on the board (sidecar
// PUT decisions); the settings come back live from meta.origin.settings, so everyone's banner and card follow.
// ENTRY-INT-2: a board alone (no sidecar, no project) decides through `save` with decideSettings, the same settings.
import { useState } from 'react';
import type { DatasetSettings } from '../../api';
import { putDecision, type BoardDecision } from '../../api/decisions';
import { excluding, type OutlierDecision } from './CheckScreen';
import { readOnlyReason } from '../../state/readonly';
import './BoardNotice.css';
export const noticeStrings = {
  chip: (who: string) => `Prepared by ${who} · settings`, title: (who: string) => `Prepared by ${who}`, closeSettings: 'Close settings',
  banner: (sample: string) => `${sample} looks like an outlier and is still undecided`, review: 'Review',
  same: 'Everyone on this board sees the same prepared data.',
  meaning: (sample: string) => `${sample} sits far from the other samples in Team’s quality check, and nobody has kept or excluded it yet. An outlier can pull group means and the statistics.`,
  mayDecide: 'Keep it or exclude it before you rely on group comparisons. Excluding prepares the data again without it, for everyone on this board.',
  readOnly: 'Lab staff, or someone allowed to prepare this board, can keep or exclude it.',
  onComputer: 'Open this board on a computer to keep or exclude it.', withEditLink: 'Open this board with an edit link to keep or exclude it.',
  keep: (s: string) => `Keep ${s}`, exclude: 'Exclude…', excludeNamed: (s: string) => `Exclude ${s}`, cancel: 'Cancel', undo: 'Undo',
  reason: 'Reason (optional)', reasonLabel: (s: string) => `Reason for excluding ${s} (optional)`,
  saving: 'Saving the decision…', preparing: 'Preparing again with Team…', failed: (m: string) => `The decision was not saved: ${m}`,
  samples: 'Samples', detection: 'Detection', missing: 'Missing values', normalization: 'Normalization', quality: 'Quality check',
  noThreshold: 'No threshold', atLeast: (pct: unknown, scope: unknown) => `At least ${pct} % of ${scope === 'group' ? 'at least one condition group' : 'all selected samples'}`,
  dropped: ' · never-detected lipids left out', qrilc: (seed: unknown) => `Estimated with QRILC${seed !== undefined ? ` (seed ${seed})` : ''}`, zero: 'Set to zero', left: 'Left missing',
  norm: { median: 'Median (log scale)', pqn: 'PQN (linear scale)', none: 'None' } as Record<string, string>,
  kept: (s: string, who?: string) => `${s} flagged, kept${who ? ` by ${who}` : ''}`,
  excluded: (s: string, why?: string, who?: string) => `${s} excluded${who ? ` by ${who}` : ''}${why ? ` · ${why}` : ''}`, open: (s: string) => `${s} flagged, not decided yet`,
  noRisk: 'No outlier risks detected', theLab: 'the lab',
};
const s = noticeStrings;
type Row = OutlierDecision & { displayName?: string };
const decisions = (settings: DatasetSettings) => (Array.isArray(settings.outlierDecisions) ? settings.outlierDecisions : []) as Row[];
export const undecided = (settings: DatasetSettings) => decisions(settings).filter(d => d.choice === 'undecided').map(d => d.sample);
/** Undo on the board: an excluded sample goes back to kept, a kept one to undecided (ENTRY-8). */
export const undoChoice = (d: OutlierDecision): BoardDecision['choice'] => d.choice === 'exclude' ? 'keep' : 'undecided';
// A row from the quality check has no name: whoever prepared the board took it.
// UX3-B: a phone or a ?mode=view link is the reason, not the person; only the role reason names who can decide.
const cannot = (why = readOnlyReason()) => why === 'device' ? s.onComputer : why === 'link' ? s.withEditLink : s.readOnly;
const note = (d: Row, preparedBy?: string) => d.choice === 'keep' ? s.kept(d.sample, d.displayName ?? preparedBy)
  : d.choice === 'exclude' ? s.excluded(d.sample, d.reason, d.displayName ?? preparedBy) : s.open(d.sample);
/** The settings once `decision` is taken, as the sidecar's PUT decisions writes them (projects.mjs decided): one row per
 *  sample {sample, choice, reason?, by, displayName, at}, and the exclusions as Team's outlierTreatments (excluding). */
export function decideSettings(settings: DatasetSettings, { sample, choice, reason }: BoardDecision, by: { by?: string; displayName?: string }, at = Date.now()): DatasetSettings {
  const rows = [...decisions(settings).filter(d => d.sample !== sample), { sample, choice, ...(reason && { reason }), ...by, at }];
  return { ...excluding(settings, rows.filter(d => d.choice === 'exclude').map(d => d.sample)), outlierDecisions: rows };
}
export function qualityNote(settings: DatasetSettings, preparedBy?: string) {
  return decisions(settings).map(d => note(d, preparedBy)).join(', ') || s.noRisk;
}
export function settingsFacts(p: DatasetSettings, preparedBy?: string): [string, string][] {
  const removed = (p.outlierTreatments ?? {}) as Record<string, unknown>; // Team leaves "remove" samples out of the prepared data
  return [[s.samples, String((p.samples ?? []).filter(x => removed[x] !== 'remove').length)],
    [s.detection, `${p.minDetectionPct ? s.atLeast(p.minDetectionPct, p.detectionScope) : s.noThreshold}${p.dropNonDetected === true ? s.dropped : ''}`],
    [s.missing, p.useImputation === true ? s.qrilc(p.imputationSeed) : p.imputeRemainingNAtoZero === true ? s.zero : s.left],
    [s.normalization, s.norm[String(p.normalizationMethod)] ?? String(p.normalizationMethod ?? '')], [s.quality, qualityNote(p, preparedBy)]];
}
type Decide = (sample: string, choice: BoardDecision['choice'], reason?: string) => void;
export function SettingsCard({ settings, preparedBy, onClose, canDecide = false, busy, error, onDecide }: { settings: DatasetSettings; preparedBy: string; onClose(): void;
  canDecide?: boolean; busy?: string; error?: string; onDecide?: Decide }) {
  const open = undecided(settings), decided = decisions(settings).filter(d => d.choice !== 'undecided'), may = canDecide && !!onDecide;
  const [excluding, setExcluding] = useState<string | null>(null), [reason, setReason] = useState('');
  const exclude = (sample: string) => { setExcluding(null); onDecide?.(sample, 'exclude', reason.trim() || undefined); };
  return <section className="notice-card" aria-labelledby="notice-card-title" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <header><h2 id="notice-card-title">{s.title(preparedBy)}</h2><button type="button" className="notice-close" aria-label={s.closeSettings} onClick={onClose}>×</button></header>
    {open.map(sample => <div key={sample} className="notice-meaning"><p>{s.meaning(sample)} {may ? s.mayDecide : cannot()}</p>
      {may && (excluding === sample ? <div className="notice-decide"><label className="notice-sr" htmlFor="notice-why">{s.reasonLabel(sample)}</label>
          <input id="notice-why" className="notice-input" placeholder={s.reason} maxLength={120} value={reason} autoFocus onChange={e => setReason(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); exclude(sample); } }}/>
          <button type="button" className="notice-btn" disabled={!!busy} onClick={() => exclude(sample)}>{s.excludeNamed(sample)}</button>
          <button type="button" className="notice-link" onClick={() => setExcluding(null)}>{s.cancel}</button></div>
        : <div className="notice-decide"><button type="button" className="notice-btn" disabled={!!busy} onClick={() => onDecide?.(sample, 'keep')}>{s.keep(sample)}</button>
          <button type="button" className="notice-btn" disabled={!!busy} onClick={() => { setReason(''); setExcluding(sample); }}>{s.exclude}</button></div>)}</div>)}
    {busy && <p className="notice-status" role="status">{busy}</p>}
    {error && <p className="notice-error" role="alert">{error}</p>}
    <dl>{settingsFacts(settings, preparedBy).map(([k, v]) => <div key={k}><dt>{k}</dt>
      <dd>{k === s.quality && may && decided.length ? decided.map(d => <span key={d.sample} className="notice-decided">{note(d, preparedBy)} · <button type="button" className="notice-link"
        disabled={!!busy} onClick={() => onDecide?.(d.sample, undoChoice(d))}>{s.undo}</button></span>) : v}</dd></div>)}</dl>
    <p className="notice-same">{s.same}</p></section>;
}
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
/** Whether the card offers the decision: the person may decide (`canDecide`) and the board has a way to save it. */
export const mayDecide = ({ canDecide = false, projectId, save }: { canDecide?: boolean; projectId?: string; save?: Save }) => canDecide && (!!projectId || !!save);
type Save = (decision: BoardDecision) => Promise<unknown>;
/** C6 plus ENTRY-8's additive props: `projectId` (the board's project) and `canDecide` (lab staff, or a client member
 *  whose client has members_prepare on and whose role may edit; the sidecar checks the same rule). ENTRY-INT-2: `save`,
 *  how a board without a project keeps a decision (main.tsx); with a project it is the sidecar's PUT decisions. */
export function BoardNotice({ settings, preparedBy, projectId, canDecide = false, save }: { settings: DatasetSettings; preparedBy: string; projectId?: string; canDecide?: boolean; save?: Save }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState<string>(), [error, setError] = useState<string>(), first = undecided(settings)[0];
  async function decide(sample: string, choice: BoardDecision['choice'], reason?: string) {
    const reprepares = choice === 'exclude' || decisions(settings).some(d => d.sample === sample && d.choice === 'exclude');
    setBusy(reprepares ? s.preparing : s.saving); setError(undefined);
    try { const decision = { sample, choice, ...(reason && { reason }) }; await (save ? save(decision) : putDecision(projectId!, decision)); } catch (e) { setError(s.failed(message(e))); } finally { setBusy(undefined); }
  }
  return <div className="board-notice">
    <button type="button" className="notice-chip" aria-expanded={open} onClick={() => setOpen(!open)}>{s.chip(preparedBy)}</button>
    {first && <p className="notice-banner"><svg className="notice-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>
      <span>{s.banner(first)}</span> · <button type="button" className="notice-link" onClick={() => setOpen(true)}>{s.review}</button></p>}
    {open && <SettingsCard settings={settings} preparedBy={preparedBy} onClose={() => setOpen(false)} canDecide={mayDecide({ canDecide, projectId, save })} busy={busy} error={error} onDecide={decide}/>}
  </div>;
}
