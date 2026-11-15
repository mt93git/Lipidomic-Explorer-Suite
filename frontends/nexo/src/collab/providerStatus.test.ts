import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { AdminSignInRequired } from '../api/adminToken';
const fake = vi.hoisted(() => ({ provider: null as any, token: vi.fn() }));
vi.mock('../api/adminToken', async original => ({ ...await original<typeof import('../api/adminToken')>(), adminToken: fake.token }));
vi.mock('./history', () => ({ createDocumentHistory: vi.fn() }));
vi.mock('./schema', () => ({ seedDoc: vi.fn(() => false) }));
vi.mock('@hocuspocus/provider', () => ({ HocuspocusProvider: class {
  document = new Y.Doc(); unsyncedChanges = 0; hasUnsyncedChanges = false;
  awareness = { getLocalState: () => ({ role: this.role }) }; role = 'Editor';
  destroy = vi.fn(); disconnect = vi.fn(); connect = vi.fn();
  constructor(public options: any) { fake.provider = this; this.document.getMap('canvas').set('seeded', true); queueMicrotask(() => options.onSynced({ state: true })); }
} }));
beforeEach(() => { fake.token.mockReset(); vi.stubGlobal('window', new EventTarget()); });
async function board() {
  vi.resetModules();
  (await import('./mode')).initCollab({ url: 'ws://localhost', search: '?project=00000000-0000-4000-8000-000000000001' });
  const { joinBoard, subscribeBoardStatus } = await import('./provider');
  const seen: { text: string; unsynced: boolean }[] = [];
  const off = subscribeBoardStatus(status => seen.push(status));
  await joinBoard({ url: 'ws://localhost', project: 'synthetic' }, { get: () => ({}), set: () => {} } as any, () => {});
  return { p: fake.provider, seen, off };
}
it('reports Live, Syncing and Reconnecting from the provider', async () => {
  const { p, seen, off } = await board();
  expect(seen.at(-1)?.text).toBe('Live');
  p.hasUnsyncedChanges = true; p.options.onUnsyncedChanges({ number: 1 });
  expect(seen.at(-1)).toEqual({ text: 'Syncing', unsynced: true });
  p.options.onStatus({ status: 'disconnected' });
  expect(seen.at(-1)).toEqual({ text: 'Reconnecting', unsynced: true });
  off(); const length = seen.length; p.options.onStatus({ status: 'disconnected' }); expect(seen).toHaveLength(length);
});
// UX review 2, scene 7: the role comes from the sidecar's role push (Phase 5), never from awareness.
it('says View only once the role push makes this person a Viewer', async () => {
  const { p, seen } = await board();
  p.options.onStateless({ payload: JSON.stringify({ type: 'role', role: 'viewer', canShare: false }) });
  expect(seen.at(-1)?.text).toBe('View only');
});
it('says Connecting before the first connection and Reconnecting after one', async () => {
  vi.resetModules();
  const { subscribeBoardStatus } = await import('./provider');
  const seen: string[] = []; subscribeBoardStatus(status => seen.push(status.text));
  expect(seen).toEqual(['Connecting']);
  const { p, seen: later } = await board();
  p.options.onStatus({ status: 'disconnected' });
  expect(later.at(-1)?.text).toBe('Reconnecting');
});
it('says Signed out only for Admin token 401, never a socket authentication failure or missing token', async () => {
  const { p, seen, off } = await board();
  fake.token.mockResolvedValue(null); await p.options.token(); expect(seen.at(-1)?.text).not.toBe('Signed out');
  p.options.onAuthenticationFailed({ reason: 'forbidden_scope' }); expect(seen.at(-1)?.text).not.toBe('Signed out');
  fake.token.mockRejectedValue(new AdminSignInRequired()); await expect(p.options.token()).rejects.toThrow();
  expect(seen.at(-1)?.text).toBe('Signed out'); off();
});

afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });
it('disconnects and reports Offline when the browser goes offline', async () => {
  const { p, seen } = await board();
  window.dispatchEvent(new Event('offline'));
  expect(seen.at(-1)?.text).toBe('Offline');
  expect(p.disconnect).toHaveBeenCalledOnce();
});
it('connects again when the browser comes online', async () => {
  const { p, seen } = await board();
  window.dispatchEvent(new Event('offline'));
  window.dispatchEvent(new Event('online'));
  expect(p.connect).toHaveBeenCalledOnce();
  expect(seen.at(-1)?.text).toBe('Reconnecting');
});
it('says Engine busy with the project queue length while meta.engineQueue is above 0, then Live again', async () => {
  const { p, seen } = await board();
  p.document.getMap('meta').set('engineQueue', 2);
  expect(seen.at(-1)?.text).toBe('Engine busy · 2 queued');
  p.document.getMap('meta').set('engineQueue', 0);
  expect(seen.at(-1)?.text).toBe('Live');
});
