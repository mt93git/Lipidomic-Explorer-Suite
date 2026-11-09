import { notifyFailure, ui } from '../model';
import { strings as s } from '../strings';
import { useEffect, useState } from 'react';
import { getCardSchema, type CardSchema, type Node } from '../../api';
import { cardInstanceId } from '../../api/instance';
import type { CanvasHandle } from '../../canvas/handle';
import { SchemaForm } from '../forms/SchemaForm.jsx';
import { dashboardSchema } from '../forms/dashboardControls';
import { ComputedControls, isComputedControl } from './ComputedControls';
import { onReplayFailures, replayFailedMessage, replayFailures } from '../../state/actions';
import { UploadControls } from './UploadControls';
import { isBucketControl } from '../../timecourse/designer';
import { schemaCache as cache, cacheInputs } from './schemaCache';
import { paletteNoteKind } from './paletteNote';
import { followsSessionPalette, PALETTE_FOLLOWERS_EVENT } from '../../palette/paletteRedraw';
// Team's status notes (schema.R api_control_status) follow the session's design and analysis settings: after a design
// confirmation or an analysis change every cached schema is stale, and the open Data tab reloads its own.
export const SCHEMA_STALE_EVENTS = ['nexo-design-confirmed', 'nexo-analysis-applied'] as const; // an analysis undo applies through accept() too
if (typeof window !== 'undefined') SCHEMA_STALE_EVENTS.forEach(name => window.addEventListener(name, () => cache.clear()));
export function DataTab({node,handle,onStatus}:{node:Node;handle:CanvasHandle;onStatus:(s:string)=>void}) {
  const sessionId = handle.getSession().sessionId, instanceId = cardInstanceId(node), key = sessionId + '/' + instanceId;
  const [schema,setSchema] = useState(cache.get(key));
  useEffect(() => {
    let active = true;
    if (!cache.has(key)) void getCardSchema(sessionId,instanceId).then(s => { cache.set(key,s); if(active) setSchema(s); },e => {if(active) { notifyFailure(s.failSchema, e); onStatus(s.settingsUnavailable); }});
    return () => {active=false;};
  },[key,sessionId,instanceId,onStatus]);
  // Undo/redo restored this card's inputs on the server: reload the form from the server's values.
  const [version,setVersion] = useState(0);
  useEffect(() => {
    const restored = (event: Event) => { if ((event as CustomEvent<string>).detail !== node.id) return;
      void getCardSchema(sessionId,instanceId).then(next => { cache.set(key,next); setSchema(next); setVersion(v => v + 1); onStatus('Up to date'); },e => notifyFailure(s.failSchema, e)); };
    window.addEventListener('nexo-inputs-restored', restored);
    return () => window.removeEventListener('nexo-inputs-restored', restored);
  },[node.id,key,sessionId,instanceId,onStatus]);
  useEffect(() => {
    let active = true;
    const stale = () => { void getCardSchema(sessionId,instanceId).then(next => { cache.set(key,next); if (active) setSchema(next); },e => { if (active) notifyFailure(s.failSchema, e); }); };
    SCHEMA_STALE_EVENTS.forEach(name => window.addEventListener(name, stale));
    return () => { active = false; SCHEMA_STALE_EVENTS.forEach(name => window.removeEventListener(name, stale)); };
  },[key,sessionId,instanceId]);
  // Steph review 4b: what the last session palette change showed of this card (redrew or kept its colours).
  const [, setFollowers] = useState(0);
  useEffect(() => { const seen = () => setFollowers(v => v + 1); window.addEventListener(PALETTE_FOLLOWERS_EVENT, seen); return () => window.removeEventListener(PALETTE_FOLLOWERS_EVENT, seen); }, []);
  // Chart audit b07 F3: a recorded module button Nexo could not press again on this copy / reopened card.
  const [failed,setFailed] = useState(() => replayFailures(node.id));
  useEffect(() => { setFailed(replayFailures(node.id)); return onReplayFailures(id => { if (id === node.id) setFailed(replayFailures(node.id)); }); },[node.id]);
  const replayNote = failed.length ? <p className="replay-failed field-help" role="alert">{replayFailedMessage(failed.map(id => schema?.actionControls?.find(a => a.id === id)?.label ?? id))}</p> : null;
  if (!schema) return <p>Loading controls…</p>;
  // Pilot F1: this card's group colours come from Team's session palette (its own per-group pickers, when the module
  // has any that reach the plot, stay below): say so once and open the palette from here. Steph review 4b: a card
  // that does not follow it (the schema says so, or the last palette change left it as it was) says it has its own.
  const noteKind = paletteNoteKind(schema, followsSessionPalette(node.id, schema.sessionPalette));
  const paletteNote = noteKind === 'follows' ? <p className="session-palette-note field-help">{s.paletteFollowsSession} <button type="button" onClick={() => ui({paletteOpen: true})}>{s.paletteOpen}</button></p>
    : noteKind === 'own' ? <p className="session-palette-note field-help">{s.paletteOwnColours}</p> : null;
  // A fixed dashboard card draws with the inputs kept in Nexo's member; the server's form only knows the
  // session's dashboard values, so show the card's own (after a reopen they differ).
  const own = node.instance?.instanceId || node.instance?.id ? undefined : handle.nexoInputs(node.id);
  const shown = own ? {...schema, controls: schema.controls.map(c => c.id in own ? {...c, value: own[c.id]} : c)} as CardSchema : schema;
  // b11 F3: the module's configuration file inputs (pathway "Upload Layout JSON (.json):"), above the controls.
  const files = schema.uploads?.length ? <UploadControls uploads={schema.uploads} sessionId={sessionId} instanceId={instanceId} onStatus={onStatus}
    onUploaded={(id, file, result) => handle.recordUpload?.(node.id, id, file, result.inputs)}/> : null;
  if (!schema.controls.length && !schema.actionControls?.length) return files || noteKind === 'follows' ? <>{paletteNote}{files}</> : <>{paletteNote}<p>This figure has no data controls.</p></>;
  // Computed controls (Team's run-time renderUI) are Nexo's own: mounted beside the schema form, kept in Nexo's member.
  const computed = shown.controls.filter(isComputedControl), member = handle.nexoInputs(node.id);
  const plain = computed.length ? {...shown, controls: shown.controls.filter(c => !isComputedControl(c))} as CardSchema : shown;
  const extra = computed.length ? <ComputedControls key={`computed-${version}-${computed.map(c => c.id).join('|')}`} controls={computed} own={member} sessionId={sessionId} instanceId={instanceId} onStatus={onStatus} onCommit={(patch, baseline) => handle.setComputedInputs?.(node.id, patch, baseline)}/> : null;
  if (!plain.controls.length && !plain.actionControls?.length) return <>{replayNote}{paletteNote}{files}{extra}</>;
  return <>{replayNote}{paletteNote}{files}{extra}<SchemaForm key={version} schema={dashboardSchema(node.instance?.source ?? node.id, plain)} sessionId={sessionId} instanceId={instanceId} onStatus={onStatus} onUpdated={async (inputs,refresh) => {
    handle.updateCardInputs(node.id,inputs); cacheInputs(key,inputs);
    if(refresh) { const next = await getCardSchema(sessionId,instanceId); cache.set(key,next); setSchema(next); }
  }} onActed={async (_inputs, action) => {
    handle.recordAction?.(node.id, action);
    // Team's renderUI may build controls only after a module button (b07 F4): re-read the schema with the redraw.
    await Promise.all([handle.refreshCard(node.id), getCardSchema(sessionId,instanceId).then(next => { cache.set(key,next); setSchema(next); if (computed.some(isBucketControl)) setVersion(v => v + 1); }, e => notifyFailure(s.failSchema, e))]);
  }}/></>;
}
