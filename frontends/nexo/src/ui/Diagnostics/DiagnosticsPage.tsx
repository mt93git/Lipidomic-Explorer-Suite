// Diagnostics: the step after Canvas. An attractor landscape of the lipid profile (Shin et al. 2025, adapted from genes
// to lipids) between a reference and a target group, read against every metadata column for diagnosis and prognosis.
import { useEffect, useMemo, useState } from 'react';
import { getDiagnosticsOptions, runLandscape, type DiagnosticsOptions, type Landscape, type LandscapeRequest, type MetadataTest } from '../../api/diagnostics';
import { AttractorComposition, DoubleHeatmap, DoubleRanking, FlowFigure, LandscapeFigure, MetadataDetail, NetworkFigure, PairedFigure, PerturbationFigure, SampleMapFigure } from './Figures';
import { fmtP, perturbationLabel, shortName } from './landscapeMath';
import { diagnosticsStrings as t } from './strings';
import './diagnostics.css';

export function defaultRequest(options: DiagnosticsOptions): LandscapeRequest | null {
  const grouped = options.columns.filter(c => !c.numeric && c.levels.length >= 2 && c.levels.filter(l => l.n >= 3).length >= 2);
  const column = grouped.find(c => /condition|group|state|status/i.test(c.name)) ?? grouped[0];
  if (!column) return null;
  const levels = column.levels.map(l => l.level);
  const reference = levels.find(l => /control|healthy|normal|baseline|wild.?type|\bwt\b|vehicle|sham/i.test(l)) ?? levels[0];
  const target = [...levels].reverse().find(l => l !== reference && /crisis|disease|case|treat|tumou?r|sepsis|severe|knock.?out|\bko\b|mutant/i.test(l)) ?? levels.find(l => l !== reference)!;
  const subject = options.columns.find(c => /subject|patient|participant|donor/i.test(c.name));
  return { groupColumn: column.name, reference: [reference], target: [target], nodes: 12, subjectColumn: subject?.name };
}

// A new reference that is the current target swaps the two groups, so reference and target never end up equal.
export function withReference(request: LandscapeRequest, level: string): LandscapeRequest {
  return { ...request, reference: [level], target: request.target[0] === level ? [request.reference[0]] : request.target };
}

export function DiagnosticsPage({ sessionId }: { sessionId: string }) {
  const [options, setOptions] = useState<DiagnosticsOptions | null>(null), [request, setRequest] = useState<LandscapeRequest | null>(null);
  const [result, setResult] = useState<Landscape | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    getDiagnosticsOptions(sessionId, controller.signal).then(o => { setOptions(o); setRequest(r => r ?? defaultRequest(o)); }, e => { if (!controller.signal.aborted) setError(String(e?.message ?? e)); });
    return () => controller.abort();
  }, [sessionId]);
  const run = async () => {
    if (!request) return;
    setBusy(true); setError('');
    try { setResult(await runLandscape(sessionId, request)); } catch (e) { setError(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  };
  return <section className="dx-page" aria-label={t.title}>
    <header className="dx-head"><div><h2>{t.title}</h2><p>{t.intro}</p></div></header>
    {options && request ? <Controls options={options} request={request} onChange={setRequest} onRun={() => void run()} busy={busy}/> : !error && <p className="dx-note">{t.loading}</p>}
    {error && <p className="dx-error" role="alert">{error}</p>}
    {busy && <p className="dx-note" role="status">{t.running}</p>}
    {result && <Results data={result}/>}
  </section>;
}

function Controls({ options, request, onChange, onRun, busy }: { options: DiagnosticsOptions; request: LandscapeRequest; onChange: (r: LandscapeRequest) => void; onRun: () => void; busy: boolean }) {
  const grouped = options.columns.filter(c => !c.numeric && c.levels.length >= 2), numeric = options.columns.filter(c => c.numeric);
  const column = grouped.find(c => c.name === request.groupColumn) ?? grouped[0];
  const levels = column?.levels ?? [];
  const set = (patch: Partial<LandscapeRequest>) => onChange({ ...request, ...patch });
  return <form className="dx-controls" onSubmit={e => { e.preventDefault(); onRun(); }}>
    <label>{t.groupColumn}<select value={request.groupColumn} onChange={e => { const c = grouped.find(g => g.name === e.target.value)!; set({ groupColumn: c.name, reference: [c.levels[0].level], target: [c.levels[c.levels.length - 1].level] }); }}>
      {grouped.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
    <label>{t.reference}<select value={request.reference[0]} onChange={e => onChange(withReference(request, e.target.value))}>{levels.map(l => <option key={l.level} value={l.level}>{l.level} ({l.n})</option>)}</select></label>
    <label>{t.target}<select value={request.target[0]} onChange={e => set({ target: [e.target.value] })}>{levels.filter(l => l.level !== request.reference[0]).map(l => <option key={l.level} value={l.level}>{l.level} ({l.n})</option>)}</select></label>
    <label title={t.orderingHelp}>{t.ordering}<select value={request.orderingColumn ?? ''} onChange={e => set({ orderingColumn: e.target.value || undefined })}>
      <option value="">{t.orderingAxis}</option>{numeric.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
    <label title={t.subjectHelp}>{t.subject}<select value={request.subjectColumn ?? ''} onChange={e => set({ subjectColumn: e.target.value || undefined })}><option value="">{t.none}</option>{options.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
    <label>{t.nodes} <output>{request.nodes ?? 12}</output><input type="range" min={6} max={14} value={request.nodes ?? 12} onChange={e => set({ nodes: Number(e.target.value) })}/></label>
    <details className="dx-advanced"><summary>{t.advanced}</summary><div>
      <label title={t.cutHelp}>{t.cut} <output>{(request.cut ?? 0.6).toFixed(2)}</output><input type="range" min={0.3} max={0.9} step={0.05} value={request.cut ?? 0.6} onChange={e => set({ cut: Number(e.target.value) })}/></label>
      <label title={t.windowHelp}>{t.window} <output>{Math.round(100 * (request.window ?? 0.1))} %</output><input type="range" min={0.05} max={0.25} step={0.01} value={request.window ?? 0.1} onChange={e => set({ window: Number(e.target.value) })}/></label>
      <label title={t.inputsHelp}>{t.maxInputs}<select value={request.maxInputs ?? 2} onChange={e => set({ maxInputs: Number(e.target.value) })}>{[1, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
      <label title={t.parsimonyHelp}>{t.parsimony} <output>{(request.parsimony ?? 0.03).toFixed(2)}</output><input type="range" min={0} max={0.1} step={0.01} value={request.parsimony ?? 0.03} onChange={e => set({ parsimony: Number(e.target.value) })}/></label>
    </div></details>
    <button type="submit" className="dx-run" disabled={busy || request.reference[0] === request.target[0]}>{busy ? t.runningShort : t.run}</button>
    <p className="dx-dataset">{t.dataset(options.samples, options.features)}</p>
  </form>;
}

const tabs = [['landscape', 'Landscape'], ['network', 'Lipid network'], ['perturb', 'In silico perturbation'], ['diagnosis', 'Diagnosis & metadata'], ['method', 'Method']] as const;
type Tab = typeof tabs[number][0];

function Results({ data }: { data: Landscape }) {
  const [tab, setTab] = useState<Tab>('landscape');
  const ref = String(data.params.reference), target = String(data.params.target);
  const bestSingle = [...data.perturbations.single].sort((a, b) => a.score - b.score)[0], bestDouble = [...data.perturbations.double].sort((a, b) => a.score - b.score)[0];
  const n = data.attractors.find(a => a.label === ref), c = data.attractors.find(a => a.label === target);
  return <div className="dx-results">
    <dl className="dx-summary">
      <div><dt>{t.score}</dt><dd>{data.score.toFixed(3)}</dd></div>
      <div><dt>{t.attractors}</dt><dd>{data.attractors.length}</dd></div>
      <div><dt>{t.targetBasin(target)}</dt><dd>{c ? `${(100 * c.basin).toFixed(0)} %` : '—'}</dd></div>
      <div><dt>{t.referenceBasin(ref)}</dt><dd>{n ? `${(100 * n.basin).toFixed(0)} %` : '—'}</dd></div>
      {bestDouble && <div><dt>{t.bestSwitch}</dt><dd className="dx-switch">{perturbationLabel(bestDouble.first)} & {perturbationLabel(bestDouble.second)} → {bestDouble.score.toFixed(2)}</dd></div>}
    </dl>
    <p className="dx-params">{t.params(data.params)}</p>
    {data.warnings.map(w => <p key={w} className="dx-warning" role="note">{w}</p>)}
    <div className="dx-tabs" role="tablist">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'landscape' && <>
      <Panel letter="d" title={t.figLandscape} note={t.noteLandscape}><LandscapeFigure attractors={data.attractors} smax={data.smax} score={data.score} title="Attractor landscape" reference={ref} target={target} samples={data.samples}/></Panel>
      <Panel letter="b" title={t.figSamples} note={t.noteSamples}><SampleMapFigure data={data}/></Panel>
      <Panel letter="c" title={t.figFlow} note={t.noteFlow}><FlowFigure data={data}/></Panel>
    </>}
    {tab === 'network' && <Panel letter="3c" title={t.figNetwork} note={t.noteNetwork}><div className="dx-row"><NetworkFigure data={data}/>
      <table className="dx-table dx-rules"><thead><tr><th>Lipid</th><th>Boolean rule (next state)</th><th>Fit</th></tr></thead>
        <tbody>{data.rules.map(r => <tr key={r.node}><td>{shortName(r.node)}</td><td><code>{r.self ? t.selfRule : r.rule.split(/( AND | OR |NOT )/).map((part, i) => /AND|OR|NOT/.test(part) ? <b key={i}>{part}</b> : shortName(part))}</code></td><td>{(100 * r.fit).toFixed(0)} %</td></tr>)}</tbody></table></div></Panel>}
    {tab === 'perturb' && <>
      <Panel letter="e–f" title={t.figPerturb} note={t.notePerturb}><PerturbationFigure data={data}/></Panel>
      <Panel letter="g" title={t.figReshaped} note={t.noteReshaped}><div className="dx-col">
        {bestSingle && <LandscapeFigure compact attractors={bestSingle.attractors} smax={data.smax} score={bestSingle.score} title={`Perturbation (${perturbationLabel(bestSingle.id)})`} reference={ref} target={target}/>}
        {bestDouble && <LandscapeFigure compact attractors={bestDouble.attractors} smax={data.smax} score={bestDouble.score} title={`Perturbation (${perturbationLabel(bestDouble.first)} & ${perturbationLabel(bestDouble.second)})`} reference={ref} target={target}/>}</div></Panel>
      {data.perturbations.double.length > 0 && <Panel letter="h–i" title={t.figDouble} note={t.noteDouble}><div className="dx-row"><DoubleHeatmap doubles={data.perturbations.double}/><DoubleRanking doubles={data.perturbations.double}/></div></Panel>}
    </>}
    {tab === 'diagnosis' && <Diagnosis data={data}/>}
    {tab === 'method' && <Method data={data}/>}
  </div>;
}

function Panel({ letter, title, note, children }: { letter: string; title: string; note: string; children: React.ReactNode }) {
  return <section className="dx-panel"><h3><span className="dx-letter">{letter}</span>{title}</h3><p className="dx-panel-note">{note}</p>{children}</section>;
}

function Diagnosis({ data }: { data: Landscape }) {
  const [scope, setScope] = useState<'all' | 'cases'>('all'), [hideMirrors, setHideMirrors] = useState(true);
  const tests = (scope === 'all' ? data.metadata : data.metadataCases).filter(m => !(hideMirrors && m.mirrorsGroup));
  const [selected, setSelected] = useState<string | null>(null);
  const current: MetadataTest | undefined = useMemo(() => tests.find(m => m.column === selected) ?? tests[0], [tests, selected]);
  return <>
    <Panel letter="Dx" title={t.figDiagnosis} note={t.noteDiagnosis}><div className="dx-row">
      <table className="dx-table"><thead><tr><th>Group vs {String(data.params.reference)}</th><th>n</th><th>AUC (d_eff)</th><th>AUC (attractor)</th><th>In target basin</th></tr></thead>
        <tbody>{data.diagnostic.map(d => <tr key={d.group}><td>{d.group}</td><td>{d.n}</td><td>{d.aucInit.toFixed(2)}</td><td>{d.aucFinal.toFixed(2)}</td><td>{(100 * d.inTarget).toFixed(0)} %</td></tr>)}</tbody></table>
      <table className="dx-table"><thead><tr><th>Group</th><th>n</th><th>Critical transition index</th></tr></thead>
        <tbody>{data.transitionIndex.map(g => <tr key={g.group}><td>{g.group}</td><td>{g.n}</td><td>{g.index.toFixed(2)}</td></tr>)}</tbody></table>
      <AttractorComposition data={data}/></div></Panel>
    {!!data.paired?.length && <Panel letter="Pr" title={t.figPaired} note={t.notePaired}><div className="dx-row">
      {data.paired.map(pair => <PairedFigure key={`${pair.from}→${pair.to}`} pair={pair}/>)}</div></Panel>}
    <Panel letter="Md" title={t.figMetadata} note={t.noteMetadata}>
      <div className="dx-filters" role="group" aria-label={t.scope}>
        <label><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')}/>{t.scopeAll}</label>
        <label><input type="radio" checked={scope === 'cases'} onChange={() => setScope('cases')}/>{t.scopeCases(String(data.params.reference))}</label>
        <label><input type="checkbox" checked={hideMirrors} onChange={e => setHideMirrors(e.target.checked)}/>{t.hideMirrors}</label>
      </div>
      <div className="dx-row">
        <table className="dx-table dx-meta"><thead><tr><th>Metadata</th><th>Test</th><th>n</th><th>Statistic</th><th>p</th><th>FDR</th><th>Attractor p</th></tr></thead>
          <tbody>{tests.map(m => <tr key={m.column} aria-selected={current?.column === m.column} onClick={() => setSelected(m.column)} className={m.fdr < 0.05 ? 'sig' : ''}>
            <td>{m.column}{m.mirrorsGroup && <span className="dx-tag">{t.mirror}</span>}</td><td>{m.kind === 'numeric' ? 'Spearman' : 'Kruskal-Wallis'}</td><td>{m.n}</td>
            <td>{m.statistic.toFixed(2)}</td><td>{fmtP(m.p)}</td><td>{fmtP(m.fdr)}</td><td>{fmtP(m.attractorP)}</td></tr>)}</tbody></table>
        {current && <div><h4 className="dx-detail-title">{current.column}</h4><MetadataDetail test={current}/></div>}
      </div>
      {!tests.length && <p className="dx-note">{t.noTests}</p>}
    </Panel>
  </>;
}

/** How each step of Shin et al. 2025 is computed here, with the values of this run (the paper's Experimental Section). */
function Method({ data }: { data: Landscape }) {
  const p = data.params;
  const rows: [string, string, string][] = [
    ['Nodes', 'Transcription factors in the strongly connected core of a SCENIC network', `${p.nodes} lipids of ${p.features} that best separate ${String(p.reference)} from ${String(p.target)} (|effect| × −log10 p, Wilcoxon), none correlated above 0.9 with another`],
    ['Ordering', 'Monocle pseudotime of the transition-state cells', p.ordering === 'axis' ? 'No pseudotime in this project: each sample’s projection on the reference → target centroid axis. A numeric metadata column (pseudotime, time, severity) replaces it when chosen.' : `Metadata column ${p.ordering}`],
    ['Smoothing and binarisation', 'Moving window (< 10 % of cells), then binarisation', `Moving mean over ${p.window} samples along the ordering; each lipid binarised at the median of its smoothed course`],
    ['Edge weights and signs', 'Spearman correlation of the smoothed data; cutoff 0.7; positive = activation, negative = inhibition', `Spearman correlation of the smoothed lipid courses; cutoff ${p.cut}; up to 4 strongest candidates per lipid`],
    ['Boolean rules', 'S(f) = Σ_t 1[f(I_t) = O_t+k], k larger than the window; ties combined with OR', `Same score with k = ${p.step}; sign-consistent identity, AND and OR rules of up to ${p.maxInputs ?? 2} inputs; an extra input must add ${p.parsimony ?? 0.03} to the fit. Mean fit ${p.ruleFit != null ? `${(100 * p.ruleFit).toFixed(0)} %` : '—'}`],
    ['Attractors and basins', 'BoolNet, synchronous update, 1000 random initial states', `Synchronous update from all ${p.stateSpace} states of the network (exact, no seed); a cycle counts as one attractor`],
    ['Effective distance', 'd = (v − v_N)·(v_C − v_N) / |v_C − v_N|², v_N and v_C from the 20 % of cells at each end of pseudotime', `Same, from the ${Math.round(100 * (p.ends ?? 0.2))} % of samples at each end of the ordering`],
    ['Attractor entropy (depth)', 'Random perturbations (BoolNet perturbNetwork); entropy of where perturbed states settle, averaged over the basin', `Every one- and two-lipid flip of every state; S max = log2(number of flips) = ${data.smax.toFixed(2)}`],
    ['Aberrance score', 'Cancer score = Σ_k (1 − S_k/S_max) · B_k/(B_N + B_X + B_C) · d_k', `Same formula: ${data.score.toFixed(3)}`],
    ['Perturbations', 'Each gene fixed at 0 (knockdown) or 1 (overexpression); pairs of the top five', 'Each lipid fixed low (0) or high (1); pairs of the five most effective'],
    ['Prior knowledge', 'SCENIC transcription factor – target regulons', 'Not yet: lipid pathways and enzyme reactions (precursor → product) will constrain the edges in larger projects'],
    ['Robustness', 'Ensemble over hyperparameter sets (Fig. 4i)', 'Not yet: run again with other cut, window and node settings (Advanced settings) and compare'],
  ];
  return <section className="dx-panel"><h3><span className="dx-letter">M</span>Method</h3><p className="dx-panel-note">Each step of the attractor landscape analysis of Shin et al. (Adv. Sci. 2025, 12:2412503) and how this module computes it for a lipid profile, with this run’s values.</p>
    <table className="dx-table dx-method"><thead><tr><th>Step</th><th>Shin et al. 2025 (genes, single cells)</th><th>Here (lipids, samples)</th></tr></thead>
      <tbody>{rows.map(([step, paper, here]) => <tr key={step}><td><strong>{step}</strong></td><td>{paper}</td><td>{here}</td></tr>)}</tbody></table></section>;
}
