import { beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
// Phase 4 as cut: the collab pill says "Live · saved hh:mm" from meta.savedAt (ms), updating when meta changes.
const fake = vi.hoisted(() => ({ doc: null as any, status: (_: { text: string; unsynced: boolean }) => {}, notify: null as any, sendIntent: null as any }));
vi.mock('./provider', () => ({ getProvider: () => fake.doc && { document: fake.doc },
  subscribeBoardStatus: (listener: typeof fake.status) => { fake.status = listener; listener({ text: 'Reconnecting', unsynced: false }); return () => {}; } }));
vi.mock('./intents', () => ({ sendIntent: (...args: unknown[]) => fake.sendIntent(...args) }));
vi.mock('./mode', () => ({ collab: () => ({ url: 'wss://synthetic.test/collab/', project: 'synthetic-project' }) }));
vi.mock('../api/adminToken', () => ({ adminUserId: () => 'u-me', adminHeaders: async () => ({}) }));
vi.mock('../ui/model', () => ({ notify: (...args: unknown[]) => fake.notify(...args),
  notifyFailure: (action: string, error: Error) => fake.notify(`Could not ${action}: ${error.message}`, true) }));
import { currentVersionId, pillText, restoreVersion, subscribePill } from './versions';
beforeEach(() => {
  fake.notify = vi.fn(); fake.sendIntent = vi.fn(async () => ({ intentId: 'i', revision: 1 }));
  vi.stubGlobal('location', { href: 'https://synthetic.test/nexo/' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(newestFirst))));
});

const at = (h: number, m: number) => new Date(2026, 10, 10, h, m).getTime();

it('pill text: Live with savedAt says saved hh:mm', () => {
  expect(pillText('Live', at(9, 5))).toBe('Live · saved 09:05');
});

it('pill text: without savedAt, or not Live, is the board status', () => {
  expect(pillText('Live', undefined)).toBe('Live');
  expect(pillText('Syncing', at(9, 5))).toBe('Syncing');
});

it('the pill updates when meta.savedAt changes', () => {
  fake.doc = new Y.Doc();
  const seen: string[] = [];
  subscribePill(status => seen.push(status.text));
  fake.status({ text: 'Live', unsynced: false });
  fake.doc.getMap('meta').set('savedAt', at(10, 44));
  expect(seen).toEqual(['Reconnecting', 'Live', 'Live · saved 10:44']);
});

// UX-B4 (prototype scene 6): "Current" marks the version the board was last restored to, else the newest named save.
const v = (id: string, kind: 'named' | 'autosave' | 'before-restore') => ({ id, kind, name: kind === 'named' ? id : null, checkpointId: `c-${id}`, actor: null, displayName: null, createdAt: '2026-11-10T10:00:00.000Z', revision: 1 });
const newestFirst = [v('b1', 'before-restore'), v('a2', 'autosave'), v('n2', 'named'), v('n1', 'named')];

it('current version: the newest named save when the board was never restored', () => {
  expect(currentVersionId(newestFirst, undefined)).toBe('n2');
});

it('current version: meta.restoredFrom.versionId after a restore', () => {
  expect(currentVersionId(newestFirst, { versionId: 'n1' })).toBe('n1');
});

// UX review 2, scene 6: everyone learns of someone else's restore; Undo of a restore says how it went.
it("someone else's restore says who restored which version", async () => {
  fake.doc = new Y.Doc();
  subscribePill(() => {}); fake.status({ text: 'Live', unsynced: false });
  fake.doc.getMap('meta').set('restoredFrom', { versionId: 'n1', beforeRestoreId: 'b1', by: 'u-alex', displayName: 'Alex Synthetic', at: 1 });
  await vi.waitFor(() => expect(fake.notify).toHaveBeenCalledWith('Alex Synthetic restored n1'));
});

it('my own restore, and a restore already on the board when I join, say nothing', async () => {
  fake.doc = new Y.Doc();
  fake.doc.getMap('meta').set('restoredFrom', { versionId: 'n1', beforeRestoreId: 'b1', by: 'u-alex', displayName: 'Alex Synthetic', at: 1 });
  subscribePill(() => {}); fake.status({ text: 'Live', unsynced: false });
  fake.doc.getMap('meta').set('restoredFrom', { versionId: 'n2', beforeRestoreId: 'b2', by: 'u-me', displayName: 'Me Synthetic', at: 2 });
  await new Promise(r => setTimeout(r, 10));
  expect(fake.notify).not.toHaveBeenCalled();
});

it('Undo of a restore says Restore undone', async () => {
  fake.doc = new Y.Doc(); fake.sendIntent = vi.fn(async () => ({ intentId: 'i', revision: 2 }));
  await restoreVersion(v('n1', 'named'));
  fake.doc.getMap('meta').set('restoredFrom', { versionId: 'n1', beforeRestoreId: 'b1', by: 'u-me', displayName: 'Me Synthetic', at: 1 });
  fake.notify.mock.calls[0][2]();
  await vi.waitFor(() => expect(fake.notify).toHaveBeenLastCalledWith('Restore undone'));
  expect(fake.sendIntent.mock.calls.at(-1)).toEqual(['restore', {}, { versionId: 'b1' }]);
});

it('a failed Undo of a restore says why', async () => {
  fake.doc = new Y.Doc();
  await restoreVersion(v('n1', 'named'));
  fake.doc.getMap('meta').set('restoredFrom', { versionId: 'n1', beforeRestoreId: 'b1', by: 'u-me', displayName: 'Me Synthetic', at: 1 });
  fake.sendIntent = vi.fn(async () => { throw new Error('the engine is not available'); });
  fake.notify.mock.calls[0][2]();
  await vi.waitFor(() => expect(fake.notify).toHaveBeenLastCalledWith('Could not undo the restore: the engine is not available', true));
});
