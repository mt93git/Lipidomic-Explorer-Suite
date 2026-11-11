import type * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence, clearDocument } from 'y-indexeddb';
import { adminToken, AdminSignInRequired, adminUserId } from '../api/adminToken';
import type { CanvasState } from '../state/types';
import type { CanvasState as Canvas } from '../state/document';
import type { Nexo } from '../state/nexo';
import { seedDoc } from './schema';
import { createDocumentHistory } from './history';
import type { Collab } from './mode';
import { followSession } from './session';
import { onRefused, resyncing } from './refused';
import { summonHandler } from './follow';
import { currentRole, onRole } from './roles';

type BoardStatus = { text: string; unsynced: boolean };
let boardStatus: BoardStatus = { text: 'Connecting', unsynced: false };
const statusListeners = new Set<(status: BoardStatus) => void>();
/** One board per page. Reads Hocuspocus acknowledgements, never the canvas's dirty state. */
export function subscribeBoardStatus(listener: (status: BoardStatus) => void) {
  statusListeners.add(listener); listener(boardStatus);
  return () => { statusListeners.delete(listener); };
}
let activeAwareness: HocuspocusProvider['awareness'] | undefined, activeProvider: HocuspocusProvider | undefined;
export const getAwareness = () => activeAwareness;
/** The sidecar connected this page read-only (a Viewer). */
export const boardReadOnly = () => activeProvider?.authorizedScope === 'readonly';
/** Phase 6: "Bring everyone here"; the sidecar relays it to the project (a Viewer's goes nowhere). */
export const summon = () => activeProvider?.sendStateless(JSON.stringify({ type: 'summon', from: activeProvider.awareness?.clientID }));
// A summon received starts following its sender (canvas/following.ts listens).
const onSummon = summonHandler(from => dispatchEvent(new CustomEvent('nexo-summon', { detail: from })));
/** The page's board once synced (collab/intents.ts sends on it). */
export const getProvider = () => activeProvider;

/** Joins the project's shared document (name = project id, token = the Admin token the sidecar verifies). The first
 *  opener of an empty document seeds it from this canvas (origin init) and is the only one to run the reopen chain;
 *  a joiner takes the document. The provider is destroyed when the page goes (a project switch is a new page). */
export async function joinBoard<S extends CanvasState>({ url, project }: Collab, store: { get(): S; set(updater: (state: S) => S): void }, adopt: (history: ReturnType<typeof createDocumentHistory<S>>) => void) {
  // The board is kept on this device (IndexedDB) per Admin user and project, so an edit not yet sent survives a closed tab;
  // without a known user nothing is kept, and a copy kept for another user is discarded, never replayed (plan 2.1).
  const user = typeof indexedDB === 'undefined' ? null : await adminToken().then(adminUserId, () => null);
  const kept = user && `nexo-collab:${user}:${project}`;
  if (user) void indexedDB.databases?.().then(all => all.forEach(({ name }) => { if (name?.startsWith('nexo-collab:') && !name.startsWith(`nexo-collab:${user}:`)) void clearDocument(name); }), () => {});
  const provider = await new Promise<HocuspocusProvider>((resolve, reject) => {
    let provider: HocuspocusProvider | undefined, persistence: IndexeddbPersistence | undefined, connected = false, synced = false, stored = false, signedOut = false, resume = false, joined = false, offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const publish = () => {
      const unsynced = provider?.hasUnsyncedChanges ?? false;
      joined ||= connected; // Connecting until the first connection, Reconnecting after it
      const viewer = currentRole()?.role === 'viewer'; // the sidecar's role push (Phase 5)
      // meta.engineQueue: the jobs on the sidecar's project queue (engine.mjs run), prototype scenes 2 and 7.
      const queued = Number(provider?.document.getMap('meta').get('engineQueue')) || 0;
      boardStatus = { text: signedOut ? 'Signed out' : offline ? (persistence ? 'Offline · edits kept locally' : 'Offline') : !connected ? (joined ? 'Reconnecting' : 'Connecting') : viewer ? 'View only' : unsynced || !synced ? 'Syncing' : queued > 0 ? `Engine busy · ${queued} queued` : 'Live', unsynced };
      statusListeners.forEach(listener => listener(boardStatus));
    };
    // The board opens once the sidecar synced it, or offline from the copy kept on this device.
    const open = () => {
      if (!synced && !(offline && stored && provider!.document.getMap('canvas').has('version'))) return;
      activeAwareness = provider!.awareness; activeProvider = provider;
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('nexo-awareness'));
      resolve(provider!);
    };
    provider = new HocuspocusProvider({ url, name: project, token: async () => {
      try { const token = await adminToken(); signedOut = false; publish(); return token ?? ''; }
      catch (error) { if (error instanceof AdminSignInRequired) { signedOut = true; publish(); } throw error; }
    },
      // Back online while the old socket still counts as connected, connect() returns at once and disconnect() has switched
      // reconnecting off: connect again when that socket reports it closed (UX review 2, scene 7).
      onStatus: ({ status }) => {
        connected = status === 'connected'; if (!connected) synced = false;
        if (status !== 'disconnected') resume = false; else if (resume && !offline) { resume = false; provider!.connect(); }
        publish();
      },
      onUnsyncedChanges: publish,
      onAwarenessChange: publish,
      onSynced: ({ state }) => { synced = state; if (state) { connected = true; open(); } publish(); },
      onAuthenticationFailed: ({ reason }) => { provider?.destroy(); reject(new Error(reason)); },
      // A refused update resyncs by reloading (refused.ts): the copy here holds it, so it goes first.
      onStateless: ({ payload }) => { onRefused(payload); if (resyncing() && kept) { persistence?.destroy(); void clearDocument(kept); } onSummon(payload); onRole(payload); publish(); } });
    if (kept) { persistence = new IndexeddbPersistence(kept, provider.document); void persistence.whenSynced.then(() => { stored = true; open(); }); }
    if (typeof window !== 'undefined') {
      const onOffline = () => { offline = true; connected = false; synced = false; publish(); provider!.disconnect(); open(); };
      const onOnline = () => { offline = false; resume = true; publish(); provider!.connect(); };
      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnline);
      window.addEventListener('pagehide', () => {
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
        provider!.destroy(); persistence?.destroy();
      }, { once: true });
      if (offline) onOffline();
    }
    followSession(provider.document);
    provider.document.getMap('meta').observe(publish);
    publish();
  });
  const doc: Y.Doc = provider.document;
  // A project document (meta.origin, POST /collab/projects) is seeded by the sidecar from R; only a board without one here.
  const seeded = !doc.getMap('meta').has('origin') && seedDoc(doc, store.get() as unknown as Canvas & { nexo: Nexo });
  let shown = '';
  return {
    history: createDocumentHistory(store, doc, history => adopt(history as ReturnType<typeof createDocumentHistory<S>>)), seeded,
    /** Personal view (plan 2.3: the active tab is never in the document): one awareness field, sent when it changes. */
    view(activeTab: string, camera: { x: number; y: number; scale: number }, viewport?: { width: number; height: number }) {
      const value = { activeTab, camera: { x: camera.x, y: camera.y, scale: camera.scale }, ...(viewport ? { viewport: { width: viewport.width, height: viewport.height } } : {}) }, key = JSON.stringify(value);
      if (key !== shown) { shown = key; provider.awareness?.setLocalStateField('view', value); }
    },
  };
}
