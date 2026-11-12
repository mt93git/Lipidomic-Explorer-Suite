import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as Y from 'yjs';
// UX-B4 (prototype scene 6, plan "Phases 3–7 as cut", Phase 4): the collab Version history panel the rail clock opens.
// The project's versions from the sidecar with kind, who and when; "Current" on the restored version, else the newest
// named save; Restore on every other row; Save version and Restore are intents; Download fetches the row's checkpoint.
const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (v: any) => { hooks.values[i] = typeof v === 'function' ? v(hooks.values[i]) : v; }]; },
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
}));
const fake = vi.hoisted(() => ({ board: null as null | { url: string; project: string }, doc: null as any, readOnly: false,
  sendIntent: null as any, notify: null as any, checkpointDownload: null as any,
  view: 'staff' as 'staff' | 'client' | null, role: { role: 'editor', canShare: true } as { role: string; canShare: boolean } | null }));
vi.mock('../../collab/mode', () => ({ collab: () => fake.board }));
vi.mock('../../collab/intents', () => ({ sendIntent: (...args: unknown[]) => fake.sendIntent(...args) }));
vi.mock('../../collab/provider', () => ({ getProvider: () => ({ document: fake.doc }), subscribeBoardStatus: () => () => {} }));
vi.mock('../../api/adminToken', () => ({ adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-token' }), knownAdminView: () => fake.view }));
vi.mock('../../collab/roles', () => ({ currentRole: () => fake.role }));
vi.mock('../../state/readonly', () => ({ isReadOnly: () => fake.readOnly }));
vi.mock('../model', () => ({ notify: (...args: unknown[]) => fake.notify(...args) }));
vi.mock('../../api', () => ({ checkpointDownload: (id: string) => fake.checkpointDownload(id) }));
import { VersionHistory } from './VersionHistory';

const versions = [
  { id: 'v4', kind: 'before-restore', name: null, checkpointId: 'c4', actor: 'u1', displayName: 'Lab Owner', createdAt: '2026-11-10T10:44:00.000Z', revision: 6 },
  { id: 'v3', kind: 'named', name: 'Round 2', checkpointId: 'c3', actor: 'u1', displayName: 'Lab Owner', createdAt: '2026-11-10T10:40:00.000Z', revision: 5 },
  { id: 'v2', kind: 'autosave', name: null, checkpointId: 'c2', actor: null, displayName: null, createdAt: '2026-11-10T10:30:00.000Z', revision: 3 },
  { id: 'v1', kind: 'named', name: 'Round 1', checkpointId: 'c1', actor: 'u2', displayName: 'Client Reviewer', createdAt: '2026-11-10T10:20:00.000Z', revision: 2 },
];
let fetcher: ReturnType<typeof vi.fn>, closed: ReturnType<typeof vi.fn>;
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.effects = [];
  fake.board = { url: 'wss://synthetic.test/collab/', project: 'synthetic-project' };
  fake.doc = new Y.Doc(); fake.readOnly = false; fake.view = 'staff'; fake.role = { role: 'editor', canShare: true };
  fake.sendIntent = vi.fn(async () => ({ intentId: 'i', revision: 7 }));
  fake.notify = vi.fn(); fake.checkpointDownload = vi.fn(async () => 'https://synthetic.test/zip');
  fetcher = vi.fn(async () => new Response(JSON.stringify(versions))); closed = vi.fn();
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('location', { href: 'https://synthetic.test/nexo/' });
  vi.stubGlobal('document', { createElement: () => ({ click() {}, href: '' }) });
});
afterEach(() => vi.unstubAllGlobals());
function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function render() { hooks.cursor = 0; return elements(VersionHistory({ onClose: closed })); }
const text = (node: any): string => !node || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const rows = (tree: ReactElement<any>[]) => tree.filter(e => e.type === 'article');
const row = (tree: ReactElement<any>[], id: string) => rows(tree).find(r => r.key === id)!;
const buttons = (node: ReactElement<any>) => elements(node).filter(e => e.type === 'button').map(text);
const button = (node: ReactElement<any>, name: string) => elements(node).find(e => e.type === 'button' && text(e) === name)!;
async function mount() { render(); hooks.effects.forEach(effect => effect()); let tree: ReactElement<any>[] = []; await vi.waitFor(() => { tree = render(); expect(rows(tree).length).toBeGreaterThan(0); }); return tree; }

it('lists the project versions newest first from the sidecar with the Admin token', async () => {
  const tree = await mount();
  expect(fetcher.mock.calls[0]).toEqual(['https://synthetic.test/collab/projects/synthetic-project/versions', expect.objectContaining({ headers: expect.objectContaining({ 'X-Nexo-Admin-Token': 'synthetic-token' }) })]);
  expect(rows(tree).map(r => r.key)).toEqual(['v4', 'v3', 'v2', 'v1']);
});

// UX review 2, scene 6 "Rows": the kind once, who and when ("Autosave · 08:02", "Before restore · by …", "Saved by …").
const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
it('each row says its kind once, who and when', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T10:50:00.000Z'));
  try {
    const tree = await mount();
    expect(text(row(tree, 'v1'))).toBe(`Round 1Saved by Client Reviewer · ${hhmm(versions[3].createdAt)}RestoreDownload`);
    expect(text(row(tree, 'v2'))).toBe(`Autosave · ${hhmm(versions[2].createdAt)}RestoreDownload`);
    expect(text(row(tree, 'v4'))).toBe(`Before restore · ${hhmm(versions[0].createdAt)}by Lab OwnerRestoreDownload`);
  } finally { vi.useRealTimers(); }
});

it('a row from another day also says the day', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));
  try { expect(text(row(await mount(), 'v2'))).toContain(`Autosave · 10 Nov ${hhmm(versions[2].createdAt)}`); } finally { vi.useRealTimers(); }
});

it('Current is on the newest named save when never restored, with no Restore there', async () => {
  const tree = await mount();
  expect(text(row(tree, 'v3'))).toContain('Current');
  expect(buttons(row(tree, 'v3'))).toEqual(['Download']);
  expect(rows(tree).filter(r => text(r).includes('Current')).map(r => r.key)).toEqual(['v3']);
});

it('every other row has Restore and Download', async () => {
  const tree = await mount();
  for (const id of ['v4', 'v2', 'v1']) expect(buttons(row(tree, id))).toEqual(['Restore', 'Download']);
});

it('Current moves to meta.restoredFrom.versionId when the board is restored', async () => {
  await mount();
  fake.doc.getMap('meta').set('restoredFrom', { versionId: 'v1', beforeRestoreId: 'v4', by: 'u1', displayName: 'Lab Owner', at: 1 });
  const tree = render();
  expect(rows(tree).filter(r => text(r).includes('Current')).map(r => r.key)).toEqual(['v1']);
  expect(buttons(row(tree, 'v3'))).toEqual(['Restore', 'Download']);
});

it('the list reloads when a version is written (meta.savedAt)', async () => {
  await mount();
  fake.doc.getMap('meta').set('savedAt', 1);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});

it('Save version… with a name sends one save intent', async () => {
  const tree = await mount();
  tree.find(e => e.type === 'button' && text(e) === 'Save version…')!.props.onClick();
  render().find(e => e.type === 'input' && e.props['aria-label'] === 'Version name')!.props.onChange({ target: { value: 'Round 3' } });
  render().find(e => e.type === 'form')!.props.onSubmit({ preventDefault() {} });
  await vi.waitFor(() => expect(fake.sendIntent).toHaveBeenCalledTimes(1));
  expect(fake.sendIntent).toHaveBeenCalledWith('save', {}, { name: 'Round 3' });
});

it('a saved version says Version saved', async () => {
  const tree = await mount();
  tree.find(e => e.type === 'button' && text(e) === 'Save version…')!.props.onClick();
  render().find(e => e.type === 'input' && e.props['aria-label'] === 'Version name')!.props.onChange({ target: { value: 'Round 3' } });
  render().find(e => e.type === 'form')!.props.onSubmit({ preventDefault() {} });
  await vi.waitFor(() => expect(fake.notify).toHaveBeenCalledWith('Version saved'));
});

it('Restore sends one restore intent for the row and the toast says Restored <name>', async () => {
  const tree = await mount();
  button(row(tree, 'v1'), 'Restore').props.onClick();
  await vi.waitFor(() => expect(fake.notify).toHaveBeenCalled());
  expect(fake.sendIntent.mock.calls).toEqual([['restore', {}, { versionId: 'v1' }]]);
  expect(fake.notify).toHaveBeenCalledWith('Restored Round 1', false, expect.any(Function));
});

it('Undo on the restore toast restores meta.restoredFrom.beforeRestoreId read at click time', async () => {
  const tree = await mount();
  button(row(tree, 'v1'), 'Restore').props.onClick();
  await vi.waitFor(() => expect(fake.notify).toHaveBeenCalled());
  fake.doc.getMap('meta').set('restoredFrom', { versionId: 'v1', beforeRestoreId: 'v9', by: 'u1', displayName: 'Lab Owner', at: 1 });
  fake.notify.mock.calls[0][2]();
  expect(fake.sendIntent.mock.calls.at(-1)).toEqual(['restore', {}, { versionId: 'v9' }]);
});

it('Download fetches the row checkpoint', async () => {
  const tree = await mount();
  await button(row(tree, 'v1'), 'Download').props.onClick();
  await vi.waitFor(() => expect(fake.checkpointDownload).toHaveBeenCalledWith('c1'));
});

it('read-only: no Save version and no Restore', async () => {
  fake.readOnly = true;
  const tree = await mount();
  expect(tree.some(e => e.type === 'button' && text(e) === 'Save version…')).toBe(false);
  for (const r of rows(tree)) expect(buttons(r)).toEqual(['Download']);
});

// Who restores (Gerardo, 2026-11-10, UX review 2 question 2): the project's Owner and lab staff, as the sidecar allows.
it('a client Editor sees no Restore', async () => {
  fake.view = 'client'; fake.role = { role: 'editor', canShare: false };
  const tree = await mount();
  for (const r of rows(tree)) expect(buttons(r)).toEqual(['Download']);
});

it('a client Owner sees Restore', async () => {
  fake.view = 'client'; fake.role = { role: 'owner', canShare: true };
  const tree = await mount();
  expect(buttons(row(tree, 'v1'))).toEqual(['Restore', 'Download']);
});

it('a lab staff Editor sees Restore', async () => {
  const tree = await mount();
  expect(buttons(row(tree, 'v1'))).toEqual(['Restore', 'Download']);
});

it('a project with no versions says so', async () => {
  fetcher = vi.fn(async () => new Response('[]')); vi.stubGlobal('fetch', fetcher);
  render(); hooks.effects.forEach(effect => effect());
  await vi.waitFor(() => expect(render().some(e => e.type === 'p' && text(e) === 'No versions yet. Save one to start the history.')).toBe(true));
});

it('Close closes the panel', async () => {
  const tree = await mount();
  tree.find(e => e.type === 'button' && e.props['aria-label'] === 'Close version history')!.props.onClick();
  expect(closed).toHaveBeenCalledTimes(1);
});
