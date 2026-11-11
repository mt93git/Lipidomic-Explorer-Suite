import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { checkpointDownload } from '../../api';
import { collab } from '../../collab/mode';
import { getProvider } from '../../collab/provider';
import { currentRole } from '../../collab/roles';
import { knownAdminView } from '../../api/adminToken';
import { currentVersionId, listVersions, restoreVersion, saveVersion, type Version } from '../../collab/versions';
import { notify } from '../model';
import { isReadOnly } from '../../state/readonly';
import { ActivityList } from '../ActivityList';
// UX-B4 (prototype scene 6; plan "Phases 3–7 as cut", Phase 4): the project's versions in collab mode, opened from the
// rail clock. Collab only, so it is loaded lazily by Rail and flag off loads no yjs.
const kinds = { named: 'Named', autosave: 'Autosave', 'before-restore': 'Before restore' } as const;
// UX review 2, scene 6: a row says its kind once, who and when: "Round 2" / "Saved by Blair · 10:31", "Autosave · 10:20",
// "Before restore · 10:44" / "by Alex"; a version from another day also says the day.
const when = (iso: string) => { const d = new Date(iso), time = d.toTimeString().slice(0, 5);
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`; };
const title = (v: Version) => v.kind === 'named' ? v.name ?? kinds.named : `${kinds[v.kind]} · ${when(v.createdAt)}`;
const note = (v: Version) => v.kind === 'named' ? `Saved${v.displayName ? ` by ${v.displayName}` : ''} · ${when(v.createdAt)}` : v.kind === 'before-restore' && v.displayName ? `by ${v.displayName}` : '';
const style = { position: 'fixed', top: 'var(--bar-top)', right: 0, bottom: 0, width: 'var(--width-inspector)', zIndex: 30, overflow: 'auto', background: 'var(--paper)', color: 'var(--ink)', borderLeft: '1px solid var(--line)', padding: '12px 16px', boxSizing: 'border-box', display: 'grid', alignContent: 'start', gap: 8 } as const;
export function VersionHistory({ onClose }: { onClose: () => void }) {
  const [versions, setVersions] = useState<Version[]>([]), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [naming, setNaming] = useState(false), [name, setName] = useState(''), [, rerender] = useState(0);
  const meta = getProvider()?.document.getMap('meta') as Y.Map<unknown> | undefined, readOnly = isReadOnly();
  // Who restores (product owner, 2026-11-10): the project's Owner and lab staff, as the sidecar allows (commits.mjs permit).
  const canRestore = !readOnly && (currentRole()?.role === 'owner' || knownAdminView() === 'staff');
  const refresh = async () => { setVersions(await listVersions(collab()!)); setLoaded(true); };
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  useEffect(() => { void run(refresh); }, []);
  // A version written or a restore by anyone: reload the list and move Current.
  useEffect(() => {
    if (!meta) return;
    const changed = (event: Y.YMapEvent<unknown>) => { rerender(n => n + 1); if (event.keysChanged.has('savedAt')) void refresh().catch(() => {}); };
    meta.observe(changed); return () => meta.unobserve(changed);
  }, [meta]);
  const current = currentVersionId(versions, meta?.get('restoredFrom') as { versionId?: string } | undefined);
  const download = async (version: Version) => { const a = document.createElement('a'); a.href = await checkpointDownload(version.checkpointId); a.download = `${version.name ?? kinds[version.kind]}.zip`; a.click(); if (a.href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const valid = name.trim().length >= 1 && name.trim().length <= 80;
  return <aside aria-label="Version history" className="version-history" style={style}>
    <header style={{ display: 'flex', alignItems: 'center' }}><h2 style={{ flex: 1, margin: 0, fontSize: 14 }}>Version history</h2><button type="button" aria-label="Close version history" onClick={onClose}>×</button></header>
    {!readOnly && (naming
      ? <form onSubmit={e => { e.preventDefault(); if (valid) void run(async () => { await saveVersion(name.trim()); setName(''); setNaming(false); notify('Version saved'); await refresh(); }); }}>
        <input aria-label="Version name" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80}/> <button disabled={busy || !valid}>Save</button>
      </form>
      : <button type="button" onClick={() => setNaming(true)}>Save version…</button>)}
    <p role="alert" style={{ margin: 0 }}>{error}</p>
    <div aria-busy={busy}>{loaded && !versions.length && <p>No versions yet. Save one to start the history.</p>}
      {versions.map(version => <article key={version.id} aria-current={version.id === current || undefined} style={{ display: 'flex', gap: 8, padding: '8px 4px', borderBottom: '1px solid var(--line)', background: version.id === current ? 'var(--tint)' : undefined }}>
        <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block' }}>{title(version)}</strong>{note(version) && <small style={{ color: 'var(--muted)' }}>{note(version)}</small>}</span>
        <span style={{ display: 'grid', gap: 4, justifyItems: 'end', alignContent: 'start' }}>
          {version.id === current ? <span style={{ background: 'var(--green)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999 }}>Current</span> : canRestore && <button disabled={busy} onClick={() => void run(async () => { await restoreVersion(version); await refresh(); })}>Restore</button>}
          <button disabled={busy} onClick={() => void run(() => download(version))}>Download</button>
        </span>
      </article>)}
    </div>
    <ActivityList/>
  </aside>;
}
