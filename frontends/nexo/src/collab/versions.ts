import type * as Y from 'yjs';
import { adminHeaders, adminUserId } from '../api/adminToken';
import { notify, notifyFailure } from '../ui/model';
import { collab, type Collab } from './mode';
import { getProvider, subscribeBoardStatus } from './provider';
import { sendIntent } from './intents';

// Versions as cut (docs/integration/nexo-collab-plan.md, "Phases 3–7 as cut", Phase 4): rows in the sidecar pointing at
// checkpoints R stores. Save and restore are intents; Undo of a restore is a restore of meta.restoredFrom.beforeRestoreId.
export interface Version { id: string; kind: 'named' | 'autosave' | 'before-restore'; name: string | null; checkpointId: string;
  actor: string | null; displayName: string | null; createdAt: string; revision: number | null }

/** GET <collab http base>/projects/<project>/versions, newest first. */
export async function listVersions(board: Collab, signal?: AbortSignal): Promise<Version[]> {
  const endpoint = new URL(board.url, location.href);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : endpoint.protocol === 'ws:' ? 'http:' : endpoint.protocol;
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/projects/${encodeURIComponent(board.project)}/versions`;
  const response = await fetch(endpoint.href, { signal, headers: await adminHeaders(signal, true) });
  if (!response.ok) throw new Error(`Could not load versions (${response.status}).`);
  return response.json();
}

/** "Current": the version the board was last restored to, else the newest named save (versions newest first). */
export const currentVersionId = (versions: Version[], restoredFrom: { versionId?: string } | undefined) =>
  restoredFrom?.versionId ?? versions.find(v => v.kind === 'named')?.id;

export const saveVersion = (name: string) => sendIntent('save', {}, { name });

const meta = () => getProvider()?.document.getMap('meta') as Y.Map<unknown> | undefined;

/** A version in a sentence: its name, else what it is (as the Activity list says it). */
export const versionName = (v: Version) => v.name ?? (v.kind === 'before-restore' ? 'the safety snapshot' : 'an autosave');

/** Restores `version`; the toast's Undo restores the before-restore snapshot the sidecar names at click time. */
export async function restoreVersion(version: Version) {
  await sendIntent('restore', {}, { versionId: version.id });
  notify(`Restored ${versionName(version)}`, false, () => {
    const versionId = (meta()?.get('restoredFrom') as { beforeRestoreId?: string } | undefined)?.beforeRestoreId;
    if (versionId) void sendIntent('restore', {}, { versionId }).then(() => notify('Restore undone'), error => notifyFailure('undo the restore', error));
  });
}

type RestoredFrom = { versionId: string; by?: string; displayName?: string | null };
/** UX review 2, scene 6: someone else's restore (a new meta.restoredFrom not by me) says "<name> restored <version>".
 *  Starts from the synced document, so a restore already there on joining says nothing. */
function followRestores(map: Y.Map<unknown>) {
  let seen = JSON.stringify(map.get('restoredFrom') ?? null);
  const check = () => {
    const from = map.get('restoredFrom') as RestoredFrom | undefined, key = JSON.stringify(from ?? null);
    if (key === seen) return;
    seen = key;
    if (!from || from.by === adminUserId()) return;
    void listVersions(collab()!).then(list => list.find(v => v.id === from.versionId), () => undefined)
      .then(v => notify(`${from.displayName ?? 'Someone'} restored ${v ? versionName(v) : 'a version'}`));
  };
  map.observe(check);
  return () => map.unobserve(check);
}

const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const pillText = (status: string, savedAt: number | undefined) => status === 'Live' && savedAt ? `Live · saved ${hhmm(savedAt)}` : status;

/** The board status (provider.ts) with the time of the last version once Live. */
export function subscribePill(listener: (status: { text: string; unsynced: boolean }) => void) {
  let observed: Y.Map<unknown> | undefined, last = { text: '', unsynced: false }, restores = () => {};
  const emit = () => listener({ ...last, text: pillText(last.text, observed?.get('savedAt') as number | undefined) });
  const off = subscribeBoardStatus(status => {
    last = status;
    const current = meta();
    if (current && current !== observed) { observed?.unobserve(emit); observed = current; observed.observe(emit); restores(); restores = followRestores(current); }
    emit();
  });
  return () => { off(); observed?.unobserve(emit); restores(); };
}
