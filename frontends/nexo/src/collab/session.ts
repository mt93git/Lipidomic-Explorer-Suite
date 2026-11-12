import type * as Y from 'yjs';
import { adminHeaders } from '../api/adminToken';
import { liveSession, reopenLostSession, setSessionRecovery } from '../api/session';
import type { DatasetSettings, Session } from '../api/types';

// Phase 2 (W2): with collaboration on, the project's R session is the one the sidecar opens and writes into the shared
// document (map 'meta': session {id, generation}, engineRevision, engineStatus 'waiting' | 'ready'). The page keeps the
// id it was given; the alias table (api/session.ts) sends every render and read to meta.session.id instead.
export const waitingText = 'Waiting for engine capacity';
let meta: Y.Map<unknown> | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
const shared = () => (meta?.get('session') as { id?: string } | undefined)?.id;

/** provider.ts hook: the project's document, followed for the rest of the page. */
export function followSession(doc: Y.Doc) {
  meta = doc.getMap('meta'); meta.observe(changed); changed();
}

/** The sidecar's session once it is not `lost` (a lost session is reopened by the sidecar, never by this page). */
function sessionAfter(lost: string) {
  return new Promise<string>(resolve => {
    const check = () => { const id = shared(); if (id && id !== lost) { listeners.delete(check); resolve(id); } };
    listeners.add(check); check();
  });
}

/** GET /sessions/<id>/join: the joined session's snapshot (session.R api_session_join). */
async function joinSession(id: string): Promise<Pick<Session, 'design' | 'preparation' | 'samples' | 'lipids'>> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/sessions/${encodeURIComponent(id)}/join`, { headers: await adminHeaders() });
  if (!response.ok) throw new Error(`Could not join the project's analysis session (${response.status}).`);
  return response.json();
}

/** Follow meta.session for `session`: switch to every new id (snapshot from join, then `refresh` re-renders) and say
 *  while the engine waits for capacity. Returns the unsubscribe. */
export function followSharedSession(session: Session, on: { refresh(): void; waiting(waiting: boolean): void }) {
  setSessionRecovery(sessionAfter);
  let queue = Promise.resolve();
  const check = () => {
    on.waiting(meta?.get('engineStatus') === 'waiting');
    queue = queue.then(async () => {
      const id = shared();
      if (!id || id === liveSession(session.sessionId)) return;
      await reopenLostSession(session.sessionId);
      try { const { design, preparation, samples, lipids } = await joinSession(id); Object.assign(session, { design, preparation, samples, lipids }); }
      finally { on.refresh(); }
    }).catch(() => { /* A render on the new id says what went wrong on its card; the next meta change tries again. */ });
  };
  listeners.add(check); check();
  return () => { listeners.delete(check); setSessionRecovery(null); };
}

/** The project's preparation settings (meta.origin.settings, nexo-entry-build.md C3) now and whenever the sidecar writes
 *  them (a decision on the board); undefined before the board is joined. Returns the unsubscribe. */
export function followSettings(listener: (settings: DatasetSettings | undefined) => void) {
  const check = () => listener((meta?.get('origin') as { settings?: DatasetSettings } | undefined)?.settings);
  listeners.add(check); check();
  return () => { listeners.delete(check); };
}
