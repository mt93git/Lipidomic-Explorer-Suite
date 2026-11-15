import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
// UX-A6 (plan 2.1 and Phase 2 row): the board is kept in IndexedDB per (userId, project), so an edit made offline survives
// a closed tab; a board stored for another user is discarded, never replayed.
const fake = vi.hoisted(() => ({ user: 'u1' as string | null, stored: false, provider: null as any, persisted: [] as any[], cleared: [] as string[], databases: [] as string[] }));
vi.mock('../api/adminToken', async original => ({ ...await original<typeof import('../api/adminToken')>(), adminToken: async () => 'token', adminUserId: () => fake.user }));
vi.mock('./history', () => ({ createDocumentHistory: vi.fn() }));
vi.mock('./schema', () => ({ seedDoc: vi.fn(() => false) }));
// The sidecar is never reached: only this device can open the board.
vi.mock('@hocuspocus/provider', () => ({ HocuspocusProvider: class {
  document = new Y.Doc(); hasUnsyncedChanges = false; awareness = { getLocalState: () => ({}) };
  destroy = vi.fn(); disconnect = vi.fn(); connect = vi.fn();
  constructor(public options: any) { fake.provider = this; }
} }));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    destroy = vi.fn();
    whenSynced: Promise<unknown>;
    constructor(public name: string, doc: Y.Doc) {
      fake.persisted.push(this);
      this.whenSynced = Promise.resolve().then(() => { if (fake.stored) doc.getMap('canvas').set('version', 1); return this; });
    }
  },
  clearDocument: vi.fn(async (name: string) => { fake.cleared.push(name); }),
}));
beforeEach(() => {
  Object.assign(fake, { user: 'u1', stored: false, provider: null, persisted: [], cleared: [], databases: [] });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('indexedDB', { databases: async () => fake.databases.map(name => ({ name })) });
});
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });
async function load() {
  vi.resetModules();
  const provider = await import('./provider');
  const seen: string[] = [];
  provider.subscribeBoardStatus(status => seen.push(status.text));
  return { ...provider, seen };
}
const join = (joinBoard: typeof import('./provider').joinBoard) => joinBoard({ url: 'ws://localhost', project: 'synthetic' }, { get: () => ({}), set: () => {} } as any, () => {});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

it('keeps the board on this device under the signed-in user and the project', async () => {
  const { joinBoard } = await load();
  void join(joinBoard); await settle();
  expect(fake.persisted.map(p => p.name)).toEqual(['nexo-collab:u1:synthetic']);
});
it('opens the board kept on this device when offline', async () => {
  vi.stubGlobal('navigator', { onLine: false }); fake.stored = true;
  const { joinBoard, seen } = await load();
  const shared = await join(joinBoard);
  expect(shared.seeded).toBe(false);
  expect(seen.at(-1)).toBe('Offline · edits kept locally');
});
it('discards a board kept on this device for another user', async () => {
  fake.databases = ['nexo-collab:u0:synthetic', 'nexo-collab:u0:other', 'nexo-collab:u1:synthetic', 'unrelated'];
  const { joinBoard } = await load();
  void join(joinBoard); await settle();
  expect(fake.cleared).toEqual(['nexo-collab:u0:synthetic', 'nexo-collab:u0:other']);
});
it('keeps nothing on this device without a signed-in user', async () => {
  fake.user = null;
  const { joinBoard, seen } = await load();
  void join(joinBoard); await settle();
  window.dispatchEvent(new Event('offline'));
  expect(fake.persisted).toEqual([]);
  expect(seen.at(-1)).toBe('Offline');
});
it('drops the copy on this device when the sidecar refuses an update', async () => {
  vi.stubGlobal('location', { reload: vi.fn() }); vi.stubGlobal('sessionStorage', { setItem: () => {} });
  const { joinBoard } = await load();
  void join(joinBoard); await settle();
  fake.provider.options.onStateless({ payload: JSON.stringify({ type: 'refused', reason: 'protected path' }) });
  expect(fake.persisted[0].destroy).toHaveBeenCalled();
  expect(fake.cleared).toEqual(['nexo-collab:u1:synthetic']);
});
// UX review 2, scene 7 (group 3): back online while the old socket still counts as connected, connect() returns at once;
// the board connects again when the browser reports that socket closed.
it('connects again when the old socket reports it closed after coming back online', async () => {
  const { joinBoard } = await load();
  void join(joinBoard); await settle();
  window.dispatchEvent(new Event('offline'));
  window.dispatchEvent(new Event('online'));
  fake.provider.options.onStatus({ status: 'disconnected' });
  expect(fake.provider.connect).toHaveBeenCalledTimes(2);
});
it('leaves a later disconnect to the provider once the board is connecting again', async () => {
  const { joinBoard } = await load();
  void join(joinBoard); await settle();
  window.dispatchEvent(new Event('offline'));
  window.dispatchEvent(new Event('online'));
  fake.provider.options.onStatus({ status: 'connecting' });
  fake.provider.options.onStatus({ status: 'disconnected' });
  expect(fake.provider.connect).toHaveBeenCalledOnce();
});
