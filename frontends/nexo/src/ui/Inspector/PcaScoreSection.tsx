import { useEffect, useRef, useState } from 'react';
import { getCardSchema, pcaScore, updateCard, type CardSchema, type Node } from '../../api';
import type { PcaScoreReply } from '../../api/types';
import { cardInstanceId } from '../../api/instance';
import type { CanvasHandle } from '../../canvas/handle';
import { plotlyReady } from '../../cards';
import { purgePlot } from '../../gl';
import { SchemaForm } from '../forms/SchemaForm.jsx';
import { notifyFailure } from '../model';
import { strings as s } from '../strings';
import { schemaCache as cache, cacheInputs } from './schemaCache';
// NEXO-P5: Team's PCA score analysis of a dashboard PCA card (R/results_dashboard.R rd_pca_score_ui), shown under
// Statistics as Team's inspector does (www/team/js/canvas_inspector.js). Its controls are the card's own inputs and
// its Run button (PATCH .../cards/<id>); the result is what Team's module rendered (GET .../pca-score).
const INPUTS = ['pcs_pc', 'pcs_groups', 'pcs_test', 'pcs_corr'], RUN = 'pcs_run';
export const hasPcaScore = (source: string | undefined) => source === 'results_dashboard-plot_pca';
/** Team's four controls, in Team's order, and its Run button: nothing else of the dashboard module. */
export function pcaScoreSchema(schema: CardSchema): CardSchema {
  return {...schema, controls: INPUTS.flatMap(id => schema.controls.filter(c => c.id === id)), actionControls: (schema.actionControls ?? []).filter(a => a.id === RUN)};
}
function PcaScorePlot({figure}: {figure: NonNullable<PcaScoreReply['figure']>}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => { let live = true; const gd = el.current;
    void plotlyReady().then(Plotly => { if (live && gd) return Plotly.react(gd, structuredClone(figure.data), {...structuredClone(figure.layout), autosize: true, height: 340}, {displayModeBar: false, responsive: true}); });
    return () => { live = false; }; }, [figure]);
  useEffect(() => { const gd = el.current; return () => { if (gd) purgePlot(window.Plotly, gd); }; }, []);
  return <div ref={el} className="pca-score-plot" role="img" aria-label={s.pcaScorePlot}/>;
}
export function PcaScoreSection({node, handle}: {node: Node; handle: CanvasHandle}) {
  const sessionId = handle.getSession().sessionId, instanceId = cardInstanceId(node), key = `${sessionId}/${instanceId}`;
  const [schema, setSchema] = useState(cache.get(key)), [reply, setReply] = useState<PcaScoreReply>(), [status, setStatus] = useState(''), [version, setVersion] = useState(0);
  const alive = useRef(true);
  const load = () => pcaScore(sessionId, instanceId).then(r => { if (alive.current) setReply(r); }, e => { if (alive.current) notifyFailure(s.failPcaScore, e); });
  const reloadSchema = () => getCardSchema(sessionId, instanceId).then(next => { cache.set(key, next); if (alive.current) { setSchema(next); setVersion(v => v + 1); } }, e => notifyFailure(s.failSchema, e));
  useEffect(() => { alive.current = true; if (!cache.has(key)) void reloadSchema(); void load(); return () => { alive.current = false; }; }, [key]);
  // Undo/redo or another person's change restored this card's inputs on the server: the form and result follow.
  useEffect(() => { const restored = (event: Event) => { if ((event as CustomEvent<string>).detail === node.id) { void reloadSchema(); void load(); } };
    window.addEventListener('nexo-inputs-restored', restored); return () => window.removeEventListener('nexo-inputs-restored', restored); }, [key, node.id]);
  if (!schema) return <p>Loading controls…</p>;
  // Once run (Team's status sentence is gone), a changed control runs the analysis again.
  const ran = !!reply && reply.status === null;
  return <section aria-label={s.pcaScoreTitle} className="pca-score">
    <p className="field-help">{s.pcaScoreHelp}</p>
    <SchemaForm key={version} schema={pcaScoreSchema(schema)} sessionId={sessionId} instanceId={instanceId} onStatus={setStatus}
      onUpdated={async inputs => { handle.updateCardInputs(node.id, inputs); cacheInputs(key, inputs); if (ran) await updateCard(sessionId, instanceId, {}, [RUN]); await load(); }}
      onActed={async (inputs, action) => { handle.recordAction?.(node.id, action); cacheInputs(key, inputs); await load(); }}/>
    <p role="status" className="field-help" data-pca-score={ran ? 'ran' : 'waiting'}>{status === 'Updating…' ? status : reply?.status ?? ''}</p>
    {reply?.message && <p role="alert">{reply.message}</p>}
    {reply?.figure && <PcaScorePlot figure={reply.figure}/>}
    {reply?.table && <table className="pca-score-table" aria-label={s.pcaScoreTable}><thead><tr>{reply.table.columns.map((c, i) => <th key={c} className={i ? 'num' : undefined}>{c}</th>)}</tr></thead>
      <tbody>{reply.table.rows.map(r => <tr key={r.cells[0]}><td><span className="pca-score-swatch" style={{background: r.color}}/>{r.cells[0]}</td>{r.cells.slice(1).map((c, i) => <td key={i} className="num">{c}</td>)}</tr>)}</tbody></table>}
    {reply?.report.map((r, i) => <p key={i} className={r.note ? 'field-help' : 'pca-score-line'}>{r.text}</p>)}
  </section>;
}
