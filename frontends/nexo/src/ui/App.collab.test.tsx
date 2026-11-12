import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Session } from '../api';
const test = vi.hoisted(() => ({ readers: [] as ((listener: () => void) => () => void)[], effects: [] as (() => void | (() => void))[], setters: [] as ReturnType<typeof vi.fn>[], handle: null as any, status: null as any, refs: 0, cursor: 0, values: [] as unknown[] }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useEffect: (effect: () => void) => { test.effects.push(effect); },
  useState: (initial: unknown) => {
    const index = test.cursor++;
    if (!(index in test.values)) test.values[index] = initial === null ? test.handle : initial;
    const setter = vi.fn(value => { test.values[index] = typeof value === 'function' ? value(test.values[index]) : value; });
    test.setters.push(setter); return [test.values[index], setter];
  },
  useRef: (initial: unknown) => ({ current: test.refs++ === 0 ? new EventTarget() : initial === false ? true : initial }),
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, get: () => unknown) => { test.readers.push(subscribe); return get(); },
}));
vi.mock('../canvas', () => ({ mountCanvas: vi.fn() }));
vi.mock('../collab/provider', () => ({ getProvider: () => undefined, subscribeBoardStatus: (listener: unknown) => { test.status = listener; return vi.fn(); } }));
vi.mock('./sessionRecovery', () => ({ reopenSession: vi.fn(async () => 'reopened') }));
import { App } from './App';
import { initCollab } from '../collab/mode';
import { tabsBridges } from '../canvas/handle';
import { store } from './model';
import * as autosave from '../state/autosave';
import * as Y from 'yjs';
import { reopenSession } from './sessionRecovery';
import { resetSessions, withSession } from '../api/session';
import { followSession } from '../collab/session';
import { onRefused } from '../collab/refused';
const cleanups: (() => void)[] = [];
beforeEach(() => {
  test.readers = []; test.refs = 0; test.cursor = 0; test.values = []; test.effects = []; test.setters = []; test.status = null;
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('location', { href: 'http://localhost/nexo/' });
  const canvas = { nodes: [], tabs: store.get().tabs };
  test.handle = { onChange: () => () => {}, refreshCard: vi.fn(), getSession: () => ({ canvas }), savedDesign: () => ({ unit: 'Animal', type: 'paired' }) };
  tabsBridges.set(test.handle, { document: () => canvas, camera: {}, refresh: () => {}, fitWhenShown: () => {} } as any);
});
afterEach(() => { resetSessions(); cleanups.splice(0).reverse().forEach(off => off()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(collaborating: boolean) {
  initCollab({ url: collaborating ? 'ws://localhost' : undefined, search: '?project=00000000-0000-0000-0000-000000000001' });
  App({ session: { sessionId: 'synthetic', design: {} } as Session });
  for (const effect of test.effects) { const off = effect(); if (off) cleanups.push(off); }
  await vi.dynamicImportSettled();
}
it('skips the autosave loop in collaboration', async () => {
  const save = vi.spyOn(autosave, 'createAutosave'); await mount(true); expect(save).not.toHaveBeenCalled();
});
it('keeps the autosave loop with the flag off', async () => {
  const save = vi.spyOn(autosave, 'createAutosave'); await mount(false); expect(save).toHaveBeenCalledOnce();
});
it.each([false, true])('still prompts for a saved design (collab %s)', async enabled => {
  await mount(enabled); expect(test.setters.some(set => set.mock.calls.some(([value]) => value === true))).toBe(true);
});
it('guards leaving only while the provider has unsent updates, including a closed socket', async () => {
  await mount(true);
  for (const [text, unsynced, guarded] of [['Live', false, false], ['Syncing', true, true], ['Reconnecting', true, true], ['Reconnecting', false, false]] as const) {
    test.status({ text, unsynced });
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented, `${text}, unsynced=${unsynced}`).toBe(guarded);
  }
});
it('keeps the flag-off leave guard tied to autosave revisions', async () => {
  const save = vi.spyOn(autosave, 'createAutosave'); await mount(false);
  const a = save.mock.results[0].value;
  const leaving = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
  expect(leaving()).toBe(false); a.markDirty('changed'); expect(leaving()).toBe(true);
  a.markDirty(JSON.stringify(tabsBridges.get(test.handle)!.document())); expect(leaving()).toBe(false);
});
it('feeds provider status text to the status pill', async () => {
  await mount(true);
  for (const text of ['Live', 'Syncing', 'Reconnecting', 'View only', 'Signed out']) {
    test.status({ text, unsynced: text === 'Syncing' });
    test.cursor = 0;
    const bar = App({ session: { sessionId: 'synthetic', design: {} } as Session }).props.children[0];
    expect(bar.props.saveText).toBe(text);
  }
});
it('starts the collaboration pill on Connecting', async () => {
  await mount(true);
  const bar = App({ session: { sessionId: 'synthetic', design: {} } as Session }).props.children[0];
  expect(bar.props.saveText).toBe('Connecting');
});
// UX review 2, scene 7: one dot colour per state (ui/shell.css colours saving and paused). FIX-JOINER-PHONE: Live is the
// connected board, every edit acknowledged: the saved state's green dot, not the grey default.
it('gives the pill dot a state per board status', async () => {
  await mount(true);
  for (const [text, state] of [['Live', 'saved'], ['Live · saved 10:44', 'saved'], ['Connecting', 'saving'], ['Syncing', 'saving'], ['Reconnecting', 'saving'],
    ['Offline', 'paused'], ['Offline · edits kept locally', 'paused'], ['Signed out', 'paused'], ['View only', 'collab'], ['Engine busy · 2 queued', 'dirty']]) {
    test.status({ text, unsynced: false });
    test.cursor = 0;
    const bar = App({ session: { sessionId: 'synthetic', design: {} } as Session }).props.children[0];
    expect(bar.props.saveStatus, text).toBe(state);
  }
});
// W2: the project's R session comes from the sidecar's document (meta.session), never a reopen of the page's own.
const lostOnce = async (live: string, attempt: number) => { if (!attempt) throw Object.assign(new Error('lost'), { status: 409, code: 'session_lost' }); return live; };
const meta = (values: Record<string, unknown>) => { const doc = new Y.Doc(); for (const [k, v] of Object.entries(values)) doc.getMap('meta').set(k, v); followSession(doc); return doc; };
it('flag off keeps the client reopen of a lost session', async () => {
  await mount(false);
  expect(await withSession('synthetic', lostOnce)).toBe('reopened');
  expect(reopenSession).toHaveBeenCalledOnce();
});
it('collaboration takes a lost session\'s replacement from the document', async () => {
  vi.mocked(reopenSession).mockClear(); const doc = meta({}); await mount(true);
  const answer = withSession('synthetic', lostOnce);
  doc.getMap('meta').set('session', { id: 'r-1', generation: 'g1' });
  expect(await answer).toBe('r-1'); expect(reopenSession).not.toHaveBeenCalled();
});
it('engine waiting shows in the status pill', async () => {
  meta({ engineStatus: 'waiting' }); await mount(true); test.status({ text: 'Live', unsynced: false });
  test.cursor = 0;
  const bar = App({ session: { sessionId: 'synthetic', design: {} } as Session }).props.children[0];
  expect(bar.props.saveText).toBe('Waiting for engine capacity');
});
it('the resync reload after a refusal skips the leave guard', async () => {
  vi.stubGlobal('location', { href: 'http://localhost/nexo/', reload: vi.fn() }); vi.stubGlobal('sessionStorage', { setItem: vi.fn() });
  await mount(true); test.status({ text: 'Syncing', unsynced: true });
  onRefused(JSON.stringify({ type: 'refused', reason: 'protected', paths: ['meta.session'] }));
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
  expect(location.reload).toHaveBeenCalledOnce(); expect(event.defaultPrevented).toBe(false);
});

it('role read-only uses the StatusBand instead of the device banner', async () => {
  const { setRoleReadOnly } = await import('../state/readonly');
  Object.assign(document, { documentElement: { classList: { toggle() {} } } });
  setRoleReadOnly(true);
  try {
    const tree = App({ session: { sessionId: 'synthetic', design: {} } as Session });
    const find = (node: any): any => Array.isArray(node) ? node.map(find).find(Boolean) : node?.type?.name === 'ReadOnlyBanner' ? node : node?.props ? find(node.props.children) : undefined;
    const banner = find(tree); expect(banner).toBeDefined(); expect(banner.type(banner.props)).toBeNull();
  } finally { setRoleReadOnly(false); }
});


it('the first role message notifies the shell to render its read-only controls', async () => {
  const { onRole } = await import('../collab/roles');
  const { setRoleReadOnly } = await import('../state/readonly');
  Object.assign(document, { documentElement: { classList: { toggle() {} } } });
  initCollab({ url: 'ws://synthetic.test/collab', search: '?project=00000000-0000-4000-8000-000000000001' });
  App({ session: { sessionId: 'synthetic', design: {} } as Session });
  const render = vi.fn(), off = test.readers.map(subscribe => subscribe(render));
  try { onRole(JSON.stringify({ type: 'role', role: 'viewer', canShare: false })); expect(render).toHaveBeenCalled(); }
  finally { off.forEach(unsubscribe => unsubscribe()); setRoleReadOnly(false); }
});
