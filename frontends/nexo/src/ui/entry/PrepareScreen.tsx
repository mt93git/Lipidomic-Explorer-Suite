import { useEffect, useId, useState } from 'react';
import { openDatasetSession, confirmDesign, AdminSignInRequired, adminSignInUrl, type DatasetSession, type DatasetSettings, type PreparationChoices } from '../../api';
import { datasetPreview } from '../../api/datasetSession';
import type { DatasetPreview } from '../../api/types';
import { prepareState, setSample, setSamples, setValue, settingsBody, canConfirm, changeCount, sampleGroups } from '../datasetPrepare';
import { datasetStrings as d } from '../strings';
import { prepareStrings as p } from './strings';
import './entry.css';
import './PrepareScreen.css';
// Team's imputation seed (R/utils_preparation.R); the 422 does not ask it, so it is sent only when changed.
const teamSeed = '42';
const groupColour = (i: number) => ['var(--s1,#2a78d6)', 'var(--s2,#eb6834)'][i] ?? 'var(--muted)';

/** Lipids by how many samples detect them (Team's preview): kept in blue under left out in gray, with its table twin. */
function histogram(preview: DatasetPreview) {
  const W = 332, H = 150, L = 28, R = 4, T = 14, B = 30, n = preview.histogram.length - 1, band = (W - L - R) / (n + 1), bw = Math.min(24, band - 4);
  const max = Math.max(10, Math.ceil(Math.max(...preview.histogram.map(h => h.kept + h.leftOut)) / 10) * 10), y = (v: number) => T + (H - T - B) * (1 - v / max), base = y(0);
  const top = preview.histogram.reduce((a, h, k) => h.kept + h.leftOut > preview.histogram[a].kept + preview.histogram[a].leftOut ? k : a, 0);
  return <>
    <p className="ctitle">{p.chart}</p>
    <div className="legend"><span><i className="dot kept"/>{p.keptKey}</span><span><i className="dot off"/>{p.leftOutKey}</span></div>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={p.chartLabel}>
      {[0, max / 2, max].map(v => <g key={v}><line className={v ? 'grid' : 'ax'} x1={L} x2={W - R} y1={y(v)} y2={y(v)}/><text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
      {preview.histogram.map((h, k) => { const x = L + band * k + (band - bw) / 2, tip = p.bar(h.detectedIn, n, h.kept, h.leftOut);
        return <g key={k}>
          {h.kept > 0 && <rect className="kept" x={x} y={y(h.kept)} width={bw} height={base - y(h.kept)}/>}
          {h.leftOut > 0 && <rect className="off" x={x} y={y(h.kept + h.leftOut)} width={bw} height={y(h.kept) - y(h.kept + h.leftOut)}/>}
          {k === top && h.kept + h.leftOut > 0 && <text className="lbl" x={x + bw / 2} y={y(h.kept + h.leftOut) - 4} textAnchor="middle">{h.kept + h.leftOut}</text>}
          <text x={x + bw / 2} y={base + 13} textAnchor="middle">{h.detectedIn}</text>
          <rect className="hit" x={L + band * k} y={T - 10} width={band} height={base - T + 10} tabIndex={0} role="img" aria-label={tip}><title>{tip}</title></rect>
        </g>; })}
      <text x={L + (W - L - R) / 2} y={H - 2} textAnchor="middle">{p.axis(n)}</text>
    </svg>
    <details className="tbl"><summary>{p.table}</summary><table className="mini"><thead><tr>{p.tableHead.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{preview.histogram.map(h => <tr key={h.detectedIn}><td>{`${h.detectedIn} of ${n}`}</td><td>{h.kept + h.leftOut}</td><td>{h.kept}</td><td>{h.leftOut}</td></tr>)}</tbody></table></details>
  </>;
}

/** Scene 3 · Prepare the data (nexo-entry-build.md C6): the 422's samples by group and Team's settings with Team's defaults, the
 *  live preview (C3; without it the settings alone, never blocking), and "Prepare and check", which opens the prepared session,
 *  confirms the study design when both answers are given, and hands the session on (the third argument; the contract names two). */
export function PrepareScreen({ dataset, choices, onPrepared, onCancel }: {
  dataset: { adminDatasetId: string; orderCode?: string; version?: number }; choices: PreparationChoices;
  onPrepared: (settings: DatasetSettings, sessionId: string, session: DatasetSession) => void; onCancel: () => void;
}) {
  const id = useId();
  const [state, setState] = useState(() => prepareState(choices)), [seed, setSeed] = useState(teamSeed);
  const [unit, setUnit] = useState(''), [relationship, setRelationship] = useState('');
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [signIn, setSignIn] = useState(false);
  const has = (name: string) => state.fields.some(f => f.name === name), value = (name: string) => state.values[name];
  const detection = { adminDatasetId: dataset.adminDatasetId, samples: state.selected, minDetectionPct: value('minDetectionPct'), detectionScope: value('detectionScope'), dropNonDetected: value('dropNonDetected') };
  const detectionKey = JSON.stringify(detection);
  // Asked again once the slider (or any detection choice) has been still for 300 ms; an answer for older choices is dropped.
  useEffect(() => {
    if (!detection.samples.length) { setPreview(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => void datasetPreview(detection, controller.signal).then(answer => { if (!controller.signal.aborted) setPreview(answer); }), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [detectionKey]);
  const seedChanged = /^\d+$/.test(seed) && seed !== teamSeed;
  const settings = (): DatasetSettings => ({ ...settingsBody(state), ...(seedChanged && { imputationSeed: Number(seed) }) });
  const changes = changeCount(state) + (seedChanged ? 1 : 0);
  const moreChanges = ['dropNonDetected', 'imputeZerosPerFile', 'imputeRemainingNAtoZero'].filter(name => state.fields.some(f => f.name === name && state.values[name] !== f.default)).length + (seedChanged ? 1 : 0);
  const reset = () => { setState(prepareState(choices)); setSeed(teamSeed); };
  async function prepare() {
    if (!canConfirm(state)) return;
    const body = settings();
    setBusy(true); setError(''); setSignIn(false);
    try {
      const result = await openDatasetSession(dataset.adminDatasetId, body);
      if (result.status !== 'ready') throw new Error(result.choices.message);
      let session = result.session;
      // Optional here: a refused design is asked again on the Canvas. A confirmed one travels in the settings, so the
      // board's own session (the sidecar's, or one prepared again) confirms it too.
      if (unit && relationship) session = await confirmDesign(session.sessionId, unit, relationship).then(design => ({ ...session, design }), () => session);
      const design = unit && relationship && session.design?.confirmed ? { design: { unit, type: relationship, confirmed: true } } : {};
      onPrepared({ ...body, ...design }, session.sessionId, session);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSignIn(e instanceof AdminSignInRequired); }
    finally { setBusy(false); }
  }
  const groups = sampleGroups(state), ticked = (name: string) => state.selected.includes(name);
  const segment = (name: string, words: Record<string, string>, label: string, stack = false) => {
    const field = state.fields.find(f => f.name === name)!;
    return <div className={stack ? 'seg stack' : 'seg'} role="group" aria-label={label}>{(field.choices ?? []).map(choice =>
      <button key={choice} type="button" aria-pressed={value(name) === choice} onClick={() => setState(prev => setValue(prev, name, choice))}>{words[choice] ?? choice}</button>)}</div>;
  };
  const check = (name: keyof typeof p & string) => has(name) && <label className="ck" key={name}><input type="checkbox" checked={!!value(name)} onChange={e => setState(prev => setValue(prev, name, e.target.checked))}/><span>{p[name] as string}</span></label>;
  const changed = (className: string) => <p className={className}>{changes ? <>{p.changes(changes)}<button type="button" className="link" onClick={reset}>{p.reset}</button></> : p.defaults}</p>;
  const scopeWords = p.scope[String(value('detectionScope'))] ?? String(value('detectionScope'));
  const facts: [string, string][] = [
    [p.factSamples, `${state.selected.length} of ${state.samples.length}${groups.length > 1 ? ` · ${groups.map(([g, names]) => `${names.filter(ticked).length} ${g}`).join(' · ')}` : ''}`],
    [p.factDetection, `${Number(value('minDetectionPct')) ? p.threshold(value('minDetectionPct'), scopeWords) : p.noThreshold}${value('dropNonDetected') ? p.neverDetected : ''}`],
    ...preview ? [[p.factLeftOut, preview.leftOut.length ? p.more3(preview.leftOut.slice(0, 3), Math.max(0, preview.leftOut.length - 3)) : p.noLipid] as [string, string]] : [],
    [p.factMissing, preview ? `${p.missingCount(preview.missing.values, preview.missing.cells)} · ${p.handling(!!value('useImputation'), !!value('imputeRemainingNAtoZero'))}`
      : p.handling(!!value('useImputation'), !!value('imputeRemainingNAtoZero')).replace(/^./, c => c.toUpperCase())],
    [p.factNormalization, p.method[String(value('normalizationMethod'))] ?? String(value('normalizationMethod'))],
    [p.factDesign, unit && relationship ? `${unit} · ${p.relationships[relationship].toLowerCase()}` : p.designNotSet]
  ];
  const name = dataset.orderCode && dataset.version !== undefined ? d.projectTitle(dataset.orderCode, dataset.version) : null;
  return <div className="entry entry-step">
    <div className="prep">
      <section className="sheet form" aria-labelledby={`${id}-title`}>
        <button type="button" className="crumb" onClick={onCancel}><span aria-hidden="true">‹</span>{p.start}</button>
        <h1 id={`${id}-title`}>{name ? p.title(name) : p.untitled}</h1>
        <p className="lede">{p.lede(preview?.total ?? null, state.samples.length)}</p>
        <form id={`${id}-form`} noValidate onSubmit={e => { e.preventDefault(); if (!busy) return prepare(); }}>
          <fieldset disabled={busy}>
            <div className="frow" role="group" aria-labelledby={`${id}-samples`}><div><h2 id={`${id}-samples`}>{p.samples}</h2><p>{p.samplesHelp}</p></div><div className="ctl">
              {groups.map(([group, names], i) => <div className="grp" role="group" aria-label={group} key={group}><b><i className="dot" style={{ background: groupColour(i) }}/>{group}</b>
                <div className="chips">{names.map(sample => <label className="chipck" key={sample}><input type="checkbox" checked={ticked(sample)} onChange={e => setState(prev => setSample(prev, sample, e.target.checked))}/>{sample}</label>)}</div></div>)}
              <div className="sampletools"><span aria-live="polite">{p.selected(state.selected.length, state.samples.length)}</span>
                <button type="button" className="link" onClick={() => setState(prev => setSamples(prev, prev.samples))}>{p.selectAll}</button>
                <button type="button" className="link" onClick={() => setState(prev => setSamples(prev, []))}>{p.clear}</button></div>
              {!state.selected.length && <p className="err" role="alert"><span>{p.noSamples}</span></p>}
            </div></div>
            {has('minDetectionPct') && <div className="frow" role="group" aria-labelledby={`${id}-detection`}><div><h2 id={`${id}-detection`}>{p.detection}</h2><p>{p.detectionHelp}</p></div><div className="ctl">
              <label className="lab" htmlFor={`${id}-threshold`}>{p.keep}</label>
              <div className="slider"><input id={`${id}-threshold`} type="range" min={state.fields.find(f => f.name === 'minDetectionPct')!.min ?? 0} max={state.fields.find(f => f.name === 'minDetectionPct')!.max ?? 100}
                step={state.fields.find(f => f.name === 'minDetectionPct')!.step ?? 5} value={value('minDetectionPct') as number} onChange={e => setState(prev => setValue(prev, 'minDetectionPct', e.target.value))}/>
                <output htmlFor={`${id}-threshold`}>{`${value('minDetectionPct')} %`}</output><div className="ticks" aria-hidden="true"><span>0</span><span>50</span><span>100 %</span></div></div>
              {has('detectionScope') && <div className="ofrow"><span className="lab">{p.of}</span>{segment('detectionScope', p.scope, p.scopeLabel, true)}</div>}
            </div></div>}
            {has('useImputation') && <div className="frow"><div><h2>{p.missing}</h2><p>{p.missingHelp}</p></div><div className="ctl">
              <label className="switch"><input type="checkbox" role="switch" checked={!!value('useImputation')} aria-describedby={`${id}-qrilc`} onChange={e => setState(prev => setValue(prev, 'useImputation', e.target.checked))}/><span>{p.qrilc}</span></label>
              <p className="help" id={`${id}-qrilc`}>{p.qrilcHelp}</p></div></div>}
            {has('normalizationMethod') && <div className="frow"><div><h2>{p.normalization}</h2><p>{p.normalizationHelp}</p></div><div className="ctl">{segment('normalizationMethod', p.method, p.normalizationLabel)}</div></div>}
            <div className="frow"><div><h2>{p.design}</h2><p>{p.designHelp}</p></div><div className="ctl">
              <div className="pair">
                <label>{p.unit}<select className="input" value={unit} onChange={e => setUnit(e.target.value)}><option value="">{p.chooseUnit}</option>{p.units.map(u => <option key={u}>{u}</option>)}</select></label>
                <label>{p.relationship}<select className="input" value={relationship} onChange={e => setRelationship(e.target.value)}><option value="">{p.chooseRelationship}</option>{Object.entries(p.relationships).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              </div>
              <p className="help">{p.designNote}</p></div></div>
            <details className="more"><summary>{p.more} <span>{moreChanges ? p.moreChanged(moreChanges) : p.moreDefault}</span></summary><div className="in">
              {check('dropNonDetected')}{check('imputeZerosPerFile')}{check('imputeRemainingNAtoZero')}
              <div className="pair"><label>{p.seed}<input className="input seed" type="number" min="0" step="1" value={seed} onChange={e => setSeed(e.target.value)}/></label></div>
            </div></details>
          </fieldset>
          {changed('formfoot changed')}
        </form>
      </section>
      <aside className="card side" aria-label={p.sideLabel}>
        <h2>{p.side}</h2>
        {preview && <div className="hero" aria-live="polite"><b>{preview.kept}</b><span>{p.kept(preview.kept, preview.total)}</span></div>}
        {preview && preview.kept < 2 && <p className="msg bad" role="alert">{p.tooFew}</p>}
        {preview && histogram(preview)}
        <dl className="facts">{facts.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}</dl>
      </aside>
    </div>
    <div className="stickybar"><div className="in">
      <p className="stat">{preview ? <><b>{preview.kept}</b> {p.barKept(preview.kept, preview.total)}</> : p.barSamples(state.selected.length, state.samples.length)}</p>
      {error ? <p className="grow err" role="alert">{error}{signIn && <> <a className="link" href={adminSignInUrl(location.href)}>{p.signIn}</a></>}</p> : changed('grow changed')}
      <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>{p.cancel}</button>
      <button type="submit" form={`${id}-form`} className="btn primary" disabled={busy || !canConfirm(state)} aria-busy={busy || undefined}>{busy ? p.preparing : p.go}</button>
    </div></div>
  </div>;
}
