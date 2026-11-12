import { useEffect, useRef, useState } from 'react';
import { getCardSchema, pcaScore, type CardSchema, type Node } from '../../api';
import type { PcaScoreReply } from '../../api/types';
import { cardInstanceId } from '../../api/instance';
import type { CanvasHandle } from '../../canvas/handle';
import { SchemaForm } from '../forms/SchemaForm.jsx';
import { notifyFailure } from '../model';
import { strings as s } from '../strings';
import { schemaCache as cache, cacheInputs } from './schemaCache';
// NEXO-P5/P8: Team's PCA score analysis (R/results_dashboard.R rd_pca_score_ui), shown under Statistics of a dashboard
// PCA card and of its PCA score card, as Team's inspector does (www/team/js/canvas_inspector.js). Its controls are the
// card's own inputs (PATCH .../cards/<id>) and the report follows them (GET .../pca-score). Since Team 8e2f5c07 there is
// no Run: the PCA card's "Plot on canvas" adds the boxplot and the group table as a PCA score card (canvas.js addPcaScore).
const INPUTS = ['pcs_pc', 'pcs_groups', 'pcs_test', 'pcs_corr'];
export const hasPcaScore = (source: string | undefined) => source === 'results_dashboard-plot_pca' || source === 'results_dashboard-plot_pcascore';
/** Team hides the button on the PCA score card itself (dashboard.css .is-score-card). */
export const plotsOnCanvas = (source: string | undefined) => source === 'results_dashboard-plot_pca';
/** Team's four controls, in Team's order: nothing else of the dashboard module. */
export function pcaScoreSchema(schema: CardSchema): CardSchema {
  return {...schema, controls: INPUTS.flatMap(id => schema.controls.filter(c => c.id === id)), actionControls: []};
}
export function PcaScoreSection({node, source, handle}: {node: Node; source: string | undefined; handle: CanvasHandle}) {
  const sessionId = handle.getSession().sessionId, instanceId = cardInstanceId(node), key = `${sessionId}/${instanceId}`;
  const [schema, setSchema] = useState(cache.get(key)), [reply, setReply] = useState<PcaScoreReply>(), [status, setStatus] = useState(''), [version, setVersion] = useState(0);
  const alive = useRef(true);
  const load = () => pcaScore(sessionId, instanceId).then(r => { if (alive.current) setReply(r); }, e => { if (alive.current) notifyFailure(s.failPcaScore, e); });
  const reloadSchema = () => getCardSchema(sessionId, instanceId).then(next => { cache.set(key, next); if (alive.current) { setSchema(next); setVersion(v => v + 1); } }, e => notifyFailure(s.failSchema, e));
  useEffect(() => { alive.current = true; if (!cache.has(key)) void reloadSchema(); void load(); return () => { alive.current = false; }; }, [key]);
  // Undo/redo or another person's change restored this card's inputs on the server: the form and report follow.
  useEffect(() => { const restored = (event: Event) => { if ((event as CustomEvent<string>).detail === node.id) { void reloadSchema(); void load(); } };
    window.addEventListener('nexo-inputs-restored', restored); return () => window.removeEventListener('nexo-inputs-restored', restored); }, [key, node.id]);
  if (!schema) return <p>Loading controls…</p>;
  return <section aria-label={s.pcaScoreTitle} className="pca-score">
    <p className="field-help">{s.pcaScoreHelp}</p>
    <SchemaForm key={version} schema={pcaScoreSchema(schema)} sessionId={sessionId} instanceId={instanceId} onStatus={setStatus}
      onUpdated={async inputs => { handle.updateCardInputs(node.id, inputs); cacheInputs(key, inputs); await load(); }}/>
    {plotsOnCanvas(source) && <>
      <button type="button" className="primary pca-score-plot" data-pcs-plot onClick={() => void handle.addPcaScore(node.id).catch(e => notifyFailure(s.failPcaScorePlot, e))}>{s.pcaScorePlotButton}</button>
      <p className="field-help">{s.pcaScorePlotNote}</p></>}
    <p role="status" className="field-help">{status === 'Updating…' ? status : ''}</p>
    {reply?.message && <p role="alert">{reply.message}</p>}
    {reply?.report.map((r, i) => <p key={i} className={r.note ? 'field-help' : 'pca-score-line'}>{r.text}</p>)}
  </section>;
}
