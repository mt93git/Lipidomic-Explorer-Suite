import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as Y from 'yjs';
// Flag off this is the workspace checkpoints dialog. In collab mode the project's versions live in the Version history
// panel (ui/Panels/VersionHistory.tsx, UX-B4): the Checkpoints title opens that panel instead.
const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (v: any) => { hooks.values[i] = typeof v === 'function' ? v(hooks.values[i]) : v; }]; },
  useEffect: (effect: () => void) => { hooks.effects.push(effect); }, useRef: () => ({ current: { showModal() {}, close() {} } }),
}));
const fake = vi.hoisted(() => ({ board: null as null | { url: string; project: string }, doc: null as any,
  sendIntent: null as any, notify: null as any, ui: null as any, listCheckpoints: null as any, checkpointDownload: null as any }));
vi.mock('../../collab/mode', () => ({ collab: () => fake.board }));
vi.mock('../../collab/intents', () => ({ sendIntent: (...args: unknown[]) => fake.sendIntent(...args) }));
vi.mock('../../collab/provider', () => ({ getProvider: () => ({ document: fake.doc }), subscribeBoardStatus: () => () => {} }));
vi.mock('../../api/adminToken', () => ({ adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-token' }) }));
vi.mock('../model', () => ({ notify: (...args: unknown[]) => fake.notify(...args), ui: (...args: unknown[]) => fake.ui(...args) }));
vi.mock('../../api', () => ({ listCheckpoints: () => fake.listCheckpoints(), checkpointDownload: (id: string) => fake.checkpointDownload(id),
  uploadCheckpoint: vi.fn(), deleteCheckpoint: vi.fn(), knownAdminView: () => 'staff', adminSignInUrl: () => '/admin/sign-in',
  AdminSignInRequired: class extends Error {} }));
import { CheckpointsDialog } from './CheckpointsDialog';

const versions = [
  { id: 'v3', kind: 'before-restore', name: null, checkpointId: 'c3', actor: 'u1', displayName: 'Lab Owner', createdAt: '2026-11-10T10:44:00.000Z', revision: 5 },
  { id: 'v2', kind: 'named', name: 'Round 2', checkpointId: 'c2', actor: 'u1', displayName: 'Lab Owner', createdAt: '2026-11-10T10:40:00.000Z', revision: 4 },
  { id: 'v1', kind: 'autosave', name: null, checkpointId: 'c1', actor: null, displayName: null, createdAt: '2026-11-10T10:30:00.000Z', revision: 2 },
];
const checkpoints = [{ id: 'store-1', name: 'Synthetic checkpoint', createdAt: '2026-11-10T10:00:00.000Z', sizeBytes: 10, source: 'store' }];
let fetcher: ReturnType<typeof vi.fn>, closed: ReturnType<typeof vi.fn>;
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.effects = [];
  fake.board = { url: 'wss://synthetic.test/collab/', project: 'synthetic-project' };
  fake.doc = new Y.Doc();
  fake.sendIntent = vi.fn(async () => ({ intentId: 'i', revision: 6 }));
  fake.notify = vi.fn(); fake.ui = vi.fn(); fake.listCheckpoints = vi.fn(async () => checkpoints); fake.checkpointDownload = vi.fn(async () => 'https://synthetic.test/zip');
  fetcher = vi.fn(async () => new Response(JSON.stringify(versions))); closed = vi.fn();
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('location', { href: 'https://synthetic.test/nexo/' });
  vi.stubGlobal('document', { activeElement: { focus() {} }, createElement: () => ({ click() {}, href: '' }) });
});
afterEach(() => vi.unstubAllGlobals());
function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function render() { hooks.cursor = 0; return elements(CheckpointsDialog({ onClose: closed, save: vi.fn() })); }
const text = (node: any): string => !node || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const rows = (tree: ReactElement<any>[]) => tree.filter(e => e.type === 'article');
async function mount() { render(); hooks.effects.forEach(effect => effect()); let tree: ReactElement<any>[] = []; await vi.waitFor(() => { tree = render(); expect(rows(tree).length).toBeGreaterThan(0); }); return tree; }

it('collab: the Checkpoints title opens the Version history panel instead (no checkpoint list, no versions here)', async () => {
  render(); hooks.effects.forEach(effect => effect());
  expect(fake.ui).toHaveBeenCalledWith({ versionsOpen: true });
  expect(closed).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled(); expect(fake.listCheckpoints).not.toHaveBeenCalled();
  expect(render().some(e => e.type === 'dialog')).toBe(false);
});

it('flag off: the checkpoints dialog, unchanged', async () => {
  fake.board = null;
  const tree = await mount();
  expect(fetcher).not.toHaveBeenCalled();
  expect(fake.listCheckpoints).toHaveBeenCalledTimes(1);
  expect(elements(rows(tree)[0]).filter(e => e.type === 'button').map(text)).toEqual(['Open', 'Download', 'Delete']);
});
