import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { getAwareness } from '../collab/provider';
// UX-A3 (prototype scene 6): the document's 'activity' array, one entry per committed intent or version the sidecar
// writes (nexo-collab commits.mjs logActivity), newest first. Names are Admin display names (D12).
// A version without a name is labelled with its kind by the sidecar (versions.mjs restore).
const unnamed: Record<string, string> = { 'before-restore': 'the safety snapshot', autosave: 'an autosave' };
type Entry = { at: number; actor: string | null; displayName: string | null; kind: string; nodeId?: string; label?: string };
const what: Record<string, (label: string) => string> = {
  inputs: l => `changed ${l}`, action: l => `ran an action on ${l}`, createCard: l => `added ${l}`, parkCard: l => `removed ${l}`,
  design: () => 'confirmed the study design', analysis: () => 'changed the analysis settings', cohort: () => 'changed the targeted lipids',
  palette: () => 'changed the palette', applyViolin: l => `applied statistics on ${l}`, confirmBaseline: l => `confirmed statistics on ${l}`,
  finish: l => `finished ${l}`, editFigure: l => `reopened ${l} for editing`, save: l => `named version ${l}`,
  restore: l => `restored ${unnamed[l] ?? l}`,
  autosave: () => 'saved a version', decision: l => l, // ENTRY-8: the sidecar's label ("excluded Treated_3")
};
const when = (at: number) => {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes} min` : minutes < 24 * 60 ? `${Math.floor(minutes / 60)} h` : new Date(at).toLocaleDateString();
};
export function ActivityList() {
  const [doc, setDoc] = useState<Y.Doc | undefined>(() => getAwareness()?.doc), [, refresh] = useState(0);
  useEffect(() => { const connect = () => setDoc(getAwareness()?.doc); addEventListener('nexo-awareness', connect); connect(); return () => removeEventListener('nexo-awareness', connect); }, []);
  useEffect(() => { if (!doc) return; const list = doc.getArray('activity'), changed = () => refresh(n => n + 1); list.observe(changed); return () => list.unobserve(changed); }, [doc]);
  const entries = (doc?.getArray<Entry>('activity').toArray() ?? []).slice().reverse();
  return <section aria-label="Activity"><h3>Activity</h3>
    {entries.length ? <ol style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 240, overflowY: 'auto' }}>{entries.map((e, i) =>
      <li key={entries.length - i} style={{ display: 'flex', gap: 8, padding: '4px 0' }}><span><strong>{e.displayName ?? (e.actor ? 'Someone' : 'Autosave')}</strong> {what[e.kind]?.(e.label ?? 'a card') ?? e.kind}</span> <small style={{ marginLeft: 'auto' }}>{when(e.at)}</small></li>)}</ol>
      : <p>No activity yet.</p>}
  </section>;
}
