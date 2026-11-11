import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
// Astra #3: a project document carries meta.origin (POST /collab/projects); its board is seeded by the sidecar from R.
const fake = vi.hoisted(() => ({ meta: {} as Record<string, unknown> }));
vi.mock('../api/adminToken', async original => ({ ...await original<typeof import('../api/adminToken')>(), adminToken: async () => 'token' }));
vi.mock('./history', () => ({ createDocumentHistory: vi.fn() }));
vi.mock('./schema', () => ({ seedDoc: vi.fn(() => true) }));
vi.mock('@hocuspocus/provider', () => ({ HocuspocusProvider: class {
  document = new Y.Doc(); hasUnsyncedChanges = false; awareness = { getLocalState: () => ({}) }; destroy = vi.fn();
  constructor(public options: any) {
    for (const [key, value] of Object.entries(fake.meta)) this.document.getMap('meta').set(key, value);
    queueMicrotask(() => options.onSynced({ state: true }));
  }
} }));
async function join(meta: Record<string, unknown>) {
  vi.resetModules(); vi.clearAllMocks(); fake.meta = meta;
  const { joinBoard } = await import('./provider');
  const { seedDoc } = await import('./schema');
  const shared = await joinBoard({ url: 'ws://localhost', project: 'synthetic' }, { get: () => ({}), set: () => {} } as any, () => {});
  return { shared, seedDoc: vi.mocked(seedDoc) };
}
it('does not seed a document whose meta has an origin', async () => {
  const { shared, seedDoc } = await join({ origin: { checkpointId: 'synthetic' } });
  expect(seedDoc).not.toHaveBeenCalled();
  expect(shared.seeded).toBe(false);
});
it('seeds a document without an origin', async () => {
  const { shared, seedDoc } = await join({});
  expect(seedDoc).toHaveBeenCalledOnce();
  expect(shared.seeded).toBe(true);
});
