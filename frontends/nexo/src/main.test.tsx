import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReactElement } from 'react';

const edge = vi.hoisted(() => ({
  openSession: vi.fn(), openDatasetSession: vi.fn(), replace: vi.fn(), fetch: vi.fn(), adminHeaders: vi.fn(), view: 'staff',
  listDatasets: vi.fn(), membersPrepare: false, role: null as string | null, follow: null as null | ((settings: unknown) => void), roleListener: null as null | (() => void),
  SignInRequired: class extends Error {}, confirmDesign: vi.fn(), readOnly: false,
}));
// React's hooks as plain state kept across renders; each effect runs once (the boot effect has no dependencies).
const hooks = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as unknown[], ran: new Set<number>(), cursor: 0, refCursor: 0, effectCursor: 0, root: null as null | (() => unknown) }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [hooks.values[i], (v: unknown) => { hooks.values[i] = typeof v === 'function' ? (v as (p: unknown) => unknown)(hooks.values[i]) : v; }]; },
  useRef: (value: unknown) => { const i = hooks.refCursor++; if (!(i in hooks.refs)) hooks.refs[i] = { current: value }; return hooks.refs[i]; },
  useEffect: (effect: () => void) => { const i = hooks.effectCursor++; if (!hooks.ran.has(i)) { hooks.ran.add(i); effect(); } },
}));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: (element: { type: () => unknown }) => { hooks.root = element.type; view(); } }) }));
vi.mock('./state/readonly', () => ({ initReadOnly: vi.fn(), isReadOnly: () => edge.readOnly }));
vi.mock('./state/serialize', () => ({ fromCanvasV1: (canvas: unknown) => canvas }));
const screens = vi.hoisted(() => ({ App: vi.fn(() => null), SignInScreen: vi.fn(() => null), StartScreen: vi.fn(() => null), PrepareScreen: vi.fn(() => null), CheckScreen: vi.fn(() => null), BoardNotice: vi.fn(() => null), JoinCard: vi.fn(() => null) }));
vi.mock('./ui/App', () => ({ App: screens.App }));
vi.mock('./ui/entry/SignInScreen', () => ({ SignInScreen: screens.SignInScreen }));
vi.mock('./ui/entry/StartScreen', () => ({ StartScreen: screens.StartScreen }));
vi.mock('./ui/entry/PrepareScreen', () => ({ PrepareScreen: screens.PrepareScreen }));
vi.mock('./ui/entry/CheckScreen', async importOriginal => ({ ...await importOriginal<object>(), CheckScreen: screens.CheckScreen }));
vi.mock('./ui/entry/JoinCard', () => ({ JoinCard: screens.JoinCard }));
vi.mock('./ui/entry/BoardNotice', async importOriginal => ({ ...await importOriginal<object>(), BoardNotice: screens.BoardNotice }));
vi.mock('./api', () => ({
  openSession: edge.openSession, openDatasetSession: edge.openDatasetSession, confirmDesign: edge.confirmDesign, getCheckpoints: vi.fn(async () => []), uploadCheckpoint: vi.fn(), knownAdminView: () => edge.view,
  AdminSignInRequired: edge.SignInRequired, adminSignInUrl: () => '',
}));
vi.mock('./api/adminToken', () => ({ adminHeaders: edge.adminHeaders, adminUserId: () => 'synthetic-user', adminDisplayName: () => 'Synthetic Person' }));
vi.mock('./api/datasetsList', () => ({ listDatasets: edge.listDatasets, knownMembersPrepare: () => edge.membersPrepare }));
vi.mock('./collab/session', () => ({ followSettings: (listener: (settings: unknown) => void) => { edge.follow = listener; return () => {}; } }));
vi.mock('./collab/roles', () => ({ currentRole: () => edge.role && { role: edge.role, canShare: false }, subscribeRole: (listener: () => void) => { edge.roleListener = listener; return () => {}; } }));
beforeEach(() => { edge.readOnly = false; edge.view = 'staff'; edge.membersPrepare = false; edge.role = null; edge.follow = null; edge.roleListener = null; hooks.values = []; hooks.refs = []; hooks.ran = new Set(); hooks.root = null; edge.adminHeaders.mockImplementation(async () => ({ 'X-Nexo-Admin-Token': 'synthetic-user' })); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); vi.resetModules(); });
function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children), ...elements(node.props?.notice)]; }
/** The tree main.tsx renders now (one render with the current state). */
function view() { hooks.cursor = hooks.refCursor = hooks.effectCursor = 0; return elements(hooks.root!()); }
const shown = (screen: unknown) => view().find(e => e.type === screen);

for (const kind of ['dataset', 'checkpoint'] as const) {
  for (const flag of ['on', 'unset', 'opt-out'] as const) {
    test(`${kind} open with flag ${flag} ${flag === 'on' ? 'replaces URL with project' : 'does not call projects'}`, async () => {
      vi.stubEnv('VITE_COLLAB_URL', flag === 'unset' ? '' : 'wss://synthetic.invalid/collab');
      const url = new URL(`https://synthetic.invalid/nexo/?${kind}=synthetic-origin${flag === 'opt-out' ? '&collab=0' : ''}`);
      vi.stubGlobal('location', url);
      vi.stubGlobal('history', { replaceState: edge.replace });
      vi.stubGlobal('document', { getElementById: () => ({}), documentElement: { classList: { toggle: vi.fn() } } });
      vi.stubGlobal('window', { setTimeout, clearTimeout });
      vi.stubGlobal('fetch', edge.fetch);
      const session = { sessionId: 'synthetic-session', workspace: 'nexo-client-synthetic', canvas: { version: '2', nodes: [] } };
      edge.openSession.mockResolvedValue(session);
      edge.openDatasetSession.mockResolvedValue({ status: 'opened', session });
      // A dataset nobody opened yet has no project for GET ?dataset= (404): this open creates it.
      edge.fetch.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST'
        ? new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000001' }), { status: 201 })
        : new Response(JSON.stringify({ error: 'unknown_project' }), { status: 404 }));
      // The React entry shares its basename with the older main.ts entry.
      // @ts-expect-error Vitest resolves the explicit TSX entry.
      await import('./main.tsx');
      await vi.waitFor(() => expect(kind === 'dataset' ? edge.openDatasetSession : edge.openSession).toHaveBeenCalled());
      if (flag === 'on') {
        await vi.waitFor(() => expect(edge.replace).toHaveBeenCalledWith(null, '', expect.any(URL)));
        expect(edge.fetch).toHaveBeenCalledWith('https://synthetic.invalid/collab/projects', expect.objectContaining({
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': 'synthetic-user' },
          body: JSON.stringify({ origin: { kind, id: 'synthetic-origin' }, workspace: session.workspace }),
        }));
        const replaced = edge.replace.mock.calls.at(-1)![2] as URL;
        expect(replaced.searchParams.get('project')).toBe('0a000000-0000-4000-8000-000000000001');
        expect(replaced.searchParams.get(kind)).toBe('synthetic-origin');
      } else {
        expect(edge.fetch).not.toHaveBeenCalled();
        if (kind === 'dataset') expect(edge.replace).not.toHaveBeenCalled();
        else expect((edge.replace.mock.calls[0][2] as URL).searchParams.get('checkpoint')).toBe('synthetic-origin');
      }
    });
  }
}

test('checkpoint open with a project in the URL joins it and does not create another', async () => {
  vi.stubEnv('VITE_COLLAB_URL', 'wss://synthetic.invalid/collab');
  vi.stubGlobal('location', new URL('https://synthetic.invalid/nexo/?checkpoint=synthetic-origin&project=0a000000-0000-4000-8000-000000000002'));
  vi.stubGlobal('history', { replaceState: edge.replace });
  vi.stubGlobal('document', { getElementById: () => ({}), documentElement: { classList: { toggle: vi.fn() } } });
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('fetch', edge.fetch);
  edge.openSession.mockResolvedValue({ sessionId: 'synthetic-session', workspace: 'nexo-client-synthetic', canvas: { version: '2', nodes: [] } });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(edge.replace).toHaveBeenCalled());
  expect(edge.fetch).not.toHaveBeenCalled();
  expect((edge.replace.mock.calls.at(-1)![2] as URL).searchParams.get('project')).toBe('0a000000-0000-4000-8000-000000000002');
});

// FIX-G12: the bare Admin link (?dataset=<id>, no project) asks the sidecar for the dataset's project first.
function bareDatasetLink(answer: () => Promise<Response>) {
  vi.stubEnv('VITE_COLLAB_URL', 'wss://synthetic.invalid/collab');
  const url = new URL('https://synthetic.invalid/nexo/?dataset=synthetic-dataset');
  vi.stubGlobal('location', url);
  vi.stubGlobal('history', { replaceState: edge.replace.mockImplementation((_: unknown, __: string, next: URL) => { url.href = String(next); }) });
  vi.stubGlobal('document', { getElementById: () => ({}), documentElement: { classList: { toggle: vi.fn() } } });
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('fetch', edge.fetch);
  edge.fetch.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000009' }), { status: 201 }) : answer());
  edge.openDatasetSession.mockResolvedValue({ status: 'choices', choices: {} });
}
const settings = { sampleSheet: 'Samples', groupColumn: 'Group' };

test('bare dataset link with a dataset project joins it with its settings', async () => {
  bareDatasetLink(async () => new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000003', workspace: 'nexo-client-synthetic', settings }), { status: 200 }));
  edge.openDatasetSession.mockResolvedValue({ status: 'opened', session: { sessionId: 'synthetic-session', workspace: 'nexo-client-synthetic', canvas: { version: '2', nodes: [] } } });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(edge.openDatasetSession).toHaveBeenCalledWith('synthetic-dataset', settings, expect.any(AbortSignal)));
  expect(edge.fetch).toHaveBeenCalledWith('https://synthetic.invalid/collab/projects?dataset=synthetic-dataset', { headers: { 'X-Nexo-Admin-Token': 'synthetic-user' } });
  expect(new URL(location.href).searchParams.get('project')).toBe('0a000000-0000-4000-8000-000000000003');
  expect(new URL(location.href).searchParams.get('dataset')).toBe('synthetic-dataset');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(edge.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
});

test('bare dataset link without a dataset project asks to prepare it', async () => {
  bareDatasetLink(async () => new Response(JSON.stringify({ error: 'unknown_project' }), { status: 404 }));
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(edge.openDatasetSession).toHaveBeenCalledWith('synthetic-dataset', undefined, expect.any(AbortSignal)));
  expect(edge.fetch).toHaveBeenCalledWith('https://synthetic.invalid/collab/projects?dataset=synthetic-dataset', expect.anything());
  expect(edge.replace).not.toHaveBeenCalled();
});

test('bare dataset link opens as before when the sidecar cannot answer', async () => {
  bareDatasetLink(async () => { throw new TypeError('Failed to fetch'); });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(edge.openDatasetSession).toHaveBeenCalledWith('synthetic-dataset', undefined, expect.any(AbortSignal)));
  expect(edge.fetch).toHaveBeenCalledWith('https://synthetic.invalid/collab/projects?dataset=synthetic-dataset', expect.anything());
  expect(edge.replace).not.toHaveBeenCalled();
});

// The screen switch (nexo-entry-build.md "Flow"): signin → start → prepare → check → board.
function page(search: string, collab = true) {
  vi.stubEnv('VITE_COLLAB_URL', collab ? 'wss://synthetic.invalid/collab' : '');
  const url = new URL(`https://synthetic.invalid/nexo/${search}`);
  vi.stubGlobal('location', url);
  vi.stubGlobal('history', { replaceState: edge.replace.mockImplementation((_: unknown, __: string, next: URL) => { url.href = String(next); }) });
  vi.stubGlobal('document', { getElementById: () => ({}), documentElement: { classList: { toggle: vi.fn() } } });
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('fetch', edge.fetch);
}
const choices = { error: 'unprocessable', reason: 'preparation_choices_required', message: 'Team asks for these preparation choices: samples', missing: [], availableSamples: ['A', 'B'] };
const prepared = { samples: ['A', 'B'], minDetectionPct: 0 };
const preparedSession = { sessionId: 'synthetic-prepared', workspace: 'nexo-client-synthetic', canvas: { version: '2', nodes: [] }, dataset: { adminDatasetId: 'synthetic-dataset', orderCode: 'ORD041', version: 1 } };
const created = (body: unknown) => edge.fetch.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url, init]) => [url, JSON.parse(init.body)]).find(([, b]) => JSON.stringify(b) === JSON.stringify(body));
const posts = () => edge.fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
async function newDataset() {
  page('?dataset=synthetic-dataset');
  edge.fetch.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000010' }), { status: 201 })
    : new Response(JSON.stringify({ error: 'unknown_project' }), { status: 404 }));
  edge.openDatasetSession.mockImplementation(async (_id: string, settings?: unknown) => settings ? { status: 'ready', session: { ...preparedSession, sessionId: 'synthetic-again' } } : { status: 'choices', choices });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.PrepareScreen)).toBeDefined());
}

test('signed in to Admin, no link: Start', async () => {
  page('', false);
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.StartScreen)?.props).toMatchObject({ view: 'staff' }));
  expect(shown(screens.SignInScreen)).toBeUndefined();
});

test('signed out of Admin, no link: Sign in', async () => {
  page('', false);
  edge.adminHeaders.mockRejectedValue(new edge.SignInRequired('signed out'));
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.SignInScreen)).toBeDefined());
  expect(shown(screens.StartScreen)).toBeUndefined();
});

test('signed out on a dataset link: Sign in', async () => {
  page('?dataset=synthetic-dataset', false);
  edge.openDatasetSession.mockRejectedValue(new edge.SignInRequired('signed out'));
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.SignInScreen)).toBeDefined());
});

test('dataset link whose project exists: straight to the board, never Prepare', async () => {
  page('?dataset=synthetic-dataset');
  edge.fetch.mockImplementation(async () => new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000011', settings: prepared }), { status: 200 }));
  edge.openDatasetSession.mockResolvedValue({ status: 'ready', session: preparedSession });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.App)).toBeDefined());
  expect(edge.openDatasetSession).toHaveBeenCalledWith('synthetic-dataset', prepared, expect.any(AbortSignal));
  expect(screens.PrepareScreen).not.toHaveBeenCalled();
  expect(shown(screens.BoardNotice)?.props).toMatchObject({ settings: prepared });
  expect(posts()).toEqual([]);
});

test('a project link alone opens its origin with the project\'s settings and joins it', async () => {
  page('?project=0a000000-0000-4000-8000-000000000012');
  edge.fetch.mockImplementation(async () => new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000012', workspace: 'nexo-client-synthetic',
    origin: { kind: 'dataset', id: 'synthetic-dataset' }, settings: prepared }), { status: 200 }));
  edge.openDatasetSession.mockResolvedValue({ status: 'ready', session: preparedSession });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.App)).toBeDefined());
  expect(edge.fetch).toHaveBeenCalledWith('https://synthetic.invalid/collab/projects/0a000000-0000-4000-8000-000000000012', { headers: { 'X-Nexo-Admin-Token': 'synthetic-user' } });
  expect(edge.openDatasetSession).toHaveBeenCalledWith('synthetic-dataset', prepared, expect.any(AbortSignal));
  expect(new URL(location.href).searchParams.get('dataset')).toBe('synthetic-dataset');
  expect(posts()).toEqual([]);
});

test('new dataset: Prepare with the 422\'s choices, nothing created yet', async () => {
  await newDataset();
  expect(shown(screens.PrepareScreen)!.props).toMatchObject({ dataset: { adminDatasetId: 'synthetic-dataset' }, choices });
  expect(posts()).toEqual([]);
});

test('new dataset: Prepare and check goes to Check with the session and the settings, nothing created yet', async () => {
  await newDataset();
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  expect(shown(screens.CheckScreen)!.props).toMatchObject({ sessionId: 'synthetic-prepared', settings: prepared });
  expect(posts()).toEqual([]);
});

test('new dataset: Open the Canvas creates the project with the settings and shows the prepared session', async () => {
  await newDataset();
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  shown(screens.CheckScreen)!.props.onOpenCanvas([]);
  await vi.waitFor(() => expect(shown(screens.App)?.props.session.sessionId).toBe('synthetic-prepared'));
  expect(created({ origin: { kind: 'dataset', id: 'synthetic-dataset' }, workspace: 'nexo-client-synthetic', settings: { ...prepared, outlierDecisions: [] } })?.[0]).toBe('https://synthetic.invalid/collab/projects');
  expect(new URL(location.href).searchParams.get('project')).toBe('0a000000-0000-4000-8000-000000000010');
  expect(edge.openDatasetSession).toHaveBeenCalledTimes(1);
});

test('Check gets the dataset it prepares again for an exclusion', async () => {
  await newDataset();
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  expect(shown(screens.CheckScreen)!.props.adminDatasetId).toBe('synthetic-dataset');
});

test('Open the Canvas after an exclusion opens the board on the session Check prepared again, with its settings and the decisions', async () => {
  await newDataset();
  const decisions = [{ sample: 'B', choice: 'exclude', reason: 'Synthetic reason', by: 'synthetic-user' }];
  const again = { ...preparedSession, sessionId: 'synthetic-again', dataset: { ...preparedSession.dataset, settings: prepared } };
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  shown(screens.CheckScreen)!.props.onOpenCanvas(decisions, again);
  await vi.waitFor(() => expect(shown(screens.App)?.props.session.sessionId).toBe('synthetic-again'));
  expect(edge.openDatasetSession).toHaveBeenCalledTimes(1); // the 422 only: main.tsx never prepares again itself
  // ENTRY-INT-2: the exclusion travels as Team's outlierTreatments (CheckScreen excluding), the samples as chosen.
  expect(created({ origin: { kind: 'dataset', id: 'synthetic-dataset' }, workspace: 'nexo-client-synthetic', settings: { ...prepared, outlierTreatments: { B: 'remove' }, outlierDecisions: decisions } })).toBeDefined();
});

test('Check\'s Back returns to Prepare; Prepare\'s Cancel goes to Start', async () => {
  await newDataset();
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  shown(screens.CheckScreen)!.props.onBack();
  shown(screens.PrepareScreen)!.props.onCancel();
  expect(shown(screens.StartScreen)).toBeDefined();
  expect(posts()).toEqual([]);
});

test('Start\'s Prepare asks the dataset\'s choices', async () => {
  page('', false);
  edge.openDatasetSession.mockResolvedValue({ status: 'choices', choices });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.StartScreen)).toBeDefined());
  shown(screens.StartScreen)!.props.onPrepareDataset('synthetic-dataset');
  await vi.waitFor(() => expect(shown(screens.PrepareScreen)?.props).toMatchObject({ dataset: { adminDatasetId: 'synthetic-dataset' }, choices }));
});

// ENTRY-INT step 3: the design confirmed on Prepare is in the settings; a session opened without it confirms it.
test('alone, a board session prepared again confirms the design the settings carry', async () => {
  const design = { unit: 'Animal', type: 'paired', confirmed: true };
  edge.confirmDesign.mockResolvedValue({ allowed: true, ...design });
  await newDataset();
  const again = { ...preparedSession, sessionId: 'synthetic-again', design: { allowed: false, unit: null, type: null, confirmed: false }, dataset: { ...preparedSession.dataset, settings: { ...prepared, samples: ['A'] } } };
  vi.stubEnv('VITE_COLLAB_URL', '');
  shown(screens.PrepareScreen)!.props.onPrepared({ ...prepared, design }, 'synthetic-prepared', { ...preparedSession, design: { allowed: true, ...design } });
  shown(screens.CheckScreen)!.props.onOpenCanvas([{ sample: 'B', choice: 'exclude' }], again);
  await vi.waitFor(() => expect(shown(screens.App)?.props.session.design.confirmed).toBe(true));
  expect(edge.confirmDesign).toHaveBeenCalledWith('synthetic-again', 'Animal', 'paired');
});
test('a board session Prepare confirmed the design on is not asked again', async () => {
  const design = { unit: 'Animal', type: 'paired', confirmed: true };
  await newDataset();
  shown(screens.PrepareScreen)!.props.onPrepared({ ...prepared, design }, 'synthetic-prepared', { ...preparedSession, design: { allowed: true, ...design } });
  shown(screens.CheckScreen)!.props.onOpenCanvas([]);
  await vi.waitFor(() => expect(shown(screens.App)).toBeDefined());
  expect(edge.confirmDesign).not.toHaveBeenCalled();
});

// ENTRY-INT step 4: "Prepared by" names a person: the project's creator for a joiner, the person for a first open.
test('a joiner sees the join card with who prepared the board while it opens, and the board names them', async () => {
  page('?dataset=synthetic-dataset');
  edge.fetch.mockImplementation(async () => new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000014', settings: prepared,
    createdBy: { userId: 'u-ana', displayName: 'Ana Synthetic' } }), { status: 200 }));
  let ready = (_: unknown) => {};
  edge.openDatasetSession.mockReturnValue(new Promise(resolve => { ready = resolve; }));
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.JoinCard)?.props).toMatchObject({ settings: prepared, preparedBy: 'Ana Synthetic' }));
  ready({ status: 'ready', session: preparedSession });
  await vi.waitFor(() => expect(shown(screens.BoardNotice)?.props.preparedBy).toBe('Ana Synthetic'));
});
test('a first open names the person who prepared it on the board', async () => {
  await newDataset();
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  shown(screens.CheckScreen)!.props.onOpenCanvas([]);
  await vi.waitFor(() => expect(shown(screens.BoardNotice)?.props.preparedBy).toBe('Synthetic Person'));
});

// ENTRY-INT-2: the board's notice (ENTRY-8's BoardNotice): the live project settings, the project, who may decide
// (lab staff, or a client member whose client prepares with an editor or owner role, as the sidecar's PUT decisions
// checks) and who prepared it. Alone (no sidecar) the board saves a decision itself, with the same settings.
const flagged = { ...prepared, outlierDecisions: [{ sample: 'B', choice: 'undecided' }] };
async function sharedBoard(dataset = 'synthetic-dataset') {
  page(`?dataset=${dataset}`);
  edge.fetch.mockImplementation(async () => new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000013', settings: flagged,
    createdBy: { userId: 'u-ana', displayName: 'Ana Synthetic' } }), { status: 200 }));
  edge.openDatasetSession.mockResolvedValue({ status: 'ready', session: preparedSession });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.App)).toBeDefined());
  return () => shown(screens.BoardNotice)!.props;
}
test('on a shared board the notice gets the project and who prepared it, and lab staff decide through the sidecar', async () => {
  const props = await sharedBoard();
  expect(props()).toMatchObject({ settings: flagged, projectId: '0a000000-0000-4000-8000-000000000013', preparedBy: 'Ana Synthetic', canDecide: true });
  expect(props().save).toBeUndefined();
});
test('on a shared board the notice follows the project settings the sidecar writes', async () => {
  const props = await sharedBoard();
  await vi.waitFor(() => expect(edge.follow).toBeTypeOf('function'));
  const kept = { ...prepared, outlierDecisions: [{ sample: 'B', choice: 'keep', by: 'u-lee', displayName: 'Lee Synthetic', at: 1 }] };
  edge.follow!(kept);
  expect(props().settings).toEqual(kept);
});
for (const [membersPrepare, role, decides] of [[true, 'editor', true], [true, 'owner', true], [true, 'commenter', false], [true, 'viewer', false], [false, 'editor', false]] as const) {
  test(`a client member (${role}) whose client ${membersPrepare ? 'prepares' : 'does not prepare'} ${decides ? 'decides' : 'does not decide'} on the board`, async () => {
    edge.view = 'client'; edge.role = role;
    edge.listDatasets.mockResolvedValue([{ adminDatasetId: 'synthetic-dataset', membersPrepare }]);
    const props = await sharedBoard();
    await vi.waitFor(() => expect(edge.listDatasets).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(props().canDecide).toBe(decides);
  });
}
test('a client member\'s role arriving after the board opened is followed', async () => {
  edge.view = 'client';
  edge.listDatasets.mockResolvedValue([{ adminDatasetId: 'synthetic-dataset', membersPrepare: true }]);
  const props = await sharedBoard();
  await vi.waitFor(() => expect(edge.listDatasets).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(props().canDecide).toBe(false);
  edge.role = 'editor'; edge.roleListener?.();
  expect(props().canDecide).toBe(true);
});
test('a client member who prepares decides on the board of a workbook they uploaded (not in the released list)', async () => {
  edge.view = 'client'; edge.membersPrepare = true; edge.role = 'editor';
  edge.listDatasets.mockResolvedValue([]);
  const props = await sharedBoard('upload-0a000000-0000-4000-8000-000000000015');
  await vi.waitFor(() => expect(edge.listDatasets).toHaveBeenCalled());
  await vi.waitFor(() => expect(props().canDecide).toBe(true));
});
async function aloneBoard() {
  page('?dataset=synthetic-dataset', false);
  edge.openDatasetSession.mockImplementation(async (_id: string, settings: unknown) => settings ? { status: 'ready', session: { ...preparedSession, sessionId: JSON.stringify(settings) } } : { status: 'choices', choices });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.PrepareScreen)).toBeDefined());
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  shown(screens.CheckScreen)!.props.onOpenCanvas(flagged.outlierDecisions);
  await vi.waitFor(() => expect(shown(screens.App)).toBeDefined());
  return () => shown(screens.BoardNotice)!.props;
}
// Deciding re-prepares the board for everyone: a view-only board (phone layout, ?mode=view, D13) never offers it.
test('a view-only board does not offer the decision, even to lab staff', async () => {
  edge.readOnly = true;
  const props = await aloneBoard();
  expect(props().canDecide).toBe(false);
});
test('alone, the notice has no project and lab staff decide by saving the settings themselves', async () => {
  const props = await aloneBoard();
  expect(props()).toMatchObject({ projectId: undefined, canDecide: true, preparedBy: 'Synthetic Person' });
  expect(props().save).toBeTypeOf('function');
});
test('alone, Keep writes the decision into the board\'s settings without preparing again', async () => {
  const props = await aloneBoard(), opens = edge.openDatasetSession.mock.calls.length;
  await props().save({ sample: 'B', choice: 'keep' });
  expect(props().settings.outlierDecisions).toEqual([{ sample: 'B', choice: 'keep', by: 'synthetic-user', displayName: 'Synthetic Person', at: expect.any(Number) }]);
  expect(edge.openDatasetSession).toHaveBeenCalledTimes(opens);
});
test('alone, Exclude prepares the board again with Team\'s outlierTreatments, the samples as chosen', async () => {
  const props = await aloneBoard();
  await props().save({ sample: 'B', choice: 'exclude', reason: 'Synthetic reason' });
  const [, settings] = edge.openDatasetSession.mock.calls.at(-1)!;
  expect(settings).toMatchObject({ samples: ['A', 'B'], outlierTreatments: { B: 'remove' },
    outlierDecisions: [{ sample: 'B', choice: 'exclude', reason: 'Synthetic reason', by: 'synthetic-user', displayName: 'Synthetic Person' }] });
  await vi.waitFor(() => expect(shown(screens.App)?.props.session.sessionId).toBe(JSON.stringify(settings)));
  expect(props().settings).toEqual(settings);
});

// ENTRY-INT step 6: the sign-in page (ENTRY-5) for a bare page and for a refused call.
test('signed out, the sign-in page stands alone under its own bar', async () => {
  const { EntryBar } = await import('./ui/entry/EntryBar');
  page('', false);
  edge.adminHeaders.mockRejectedValue(new edge.SignInRequired('signed out'));
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.SignInScreen)).toBeDefined());
  expect(view().some(e => e.type === EntryBar)).toBe(false);
});
test('a refused open signs in, says it goes back to the board, and opens it again once signed in', async () => {
  page('?dataset=synthetic-dataset', false);
  edge.openDatasetSession.mockRejectedValueOnce(new edge.SignInRequired('signed out')).mockResolvedValue({ status: 'choices', choices });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.SignInScreen)?.props.signedOutFrom).toBe('your board'));
  shown(screens.SignInScreen)!.props.onSignedIn();
  await vi.waitFor(() => expect(shown(screens.PrepareScreen)).toBeDefined());
  expect(edge.openDatasetSession).toHaveBeenCalledTimes(2);
});
test('signed out on a bare page, the sign-in page names nothing to go back to', async () => {
  page('', false);
  edge.adminHeaders.mockRejectedValue(new edge.SignInRequired('signed out'));
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.SignInScreen)).toBeDefined());
  expect(shown(screens.SignInScreen)!.props.signedOutFrom).toBeUndefined();
});
test('the board\'s notice goes into the board\'s status band (App\'s notice), not after the board', async () => {
  page('?dataset=synthetic-dataset');
  edge.fetch.mockImplementation(async () => new Response(JSON.stringify({ projectId: '0a000000-0000-4000-8000-000000000016', settings: prepared }), { status: 200 }));
  edge.openDatasetSession.mockResolvedValue({ status: 'ready', session: preparedSession });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.App)).toBeDefined());
  expect(shown(screens.App)!.props.notice.type).toBe(screens.BoardNotice);
});

// UX3-C: Prepare and Check name the dataset as the board's title does ("ORD041 · v1"); the entry bar names the person.
const releasedRow = { adminDatasetId: 'synthetic-dataset', orderCode: 'ORD041', version: 1, clientId: 'synthetic-client', clientName: 'Synthetic Client', releasedAt: '2026-11-01T00:00:00Z', membersPrepare: false };
test('Prepare names the dataset from its released row', async () => {
  edge.listDatasets.mockResolvedValue([releasedRow]);
  await newDataset();
  await vi.waitFor(() => expect(shown(screens.PrepareScreen)!.props.dataset).toEqual({ adminDatasetId: 'synthetic-dataset', orderCode: 'ORD041', version: 1 }));
});
// FIX-PROD-B: on the real path the list can miss the dataset (Admin's list filters differently from the open, R busy, Admin
// down); R's 422 names it from the row it just read, so Prepare's title never depends on the list.
test('Prepare names the dataset from the 422 when the released list cannot', async () => {
  edge.listDatasets.mockRejectedValue(new Error('Request failed (503)'));
  page('?dataset=synthetic-dataset');
  edge.fetch.mockImplementation(async () => new Response(JSON.stringify({ error: 'unknown_project' }), { status: 404 }));
  edge.openDatasetSession.mockResolvedValue({ status: 'choices', choices: { ...choices, orderCode: 'ORD900', version: 1 } });
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.PrepareScreen)!.props.dataset).toEqual({ adminDatasetId: 'synthetic-dataset', orderCode: 'ORD900', version: 1 }));
});
test('Check names the dataset its session prepared', async () => {
  await newDataset();
  shown(screens.PrepareScreen)!.props.onPrepared(prepared, 'synthetic-prepared', preparedSession);
  expect(shown(screens.CheckScreen)!.props.name).toBe('ORD041 · v1');
});
test('the entry bar names the signed-in person', async () => {
  page('', false);
  // @ts-expect-error Vitest resolves the explicit TSX entry.
  await import('./main.tsx');
  await vi.waitFor(() => expect(shown(screens.StartScreen)).toBeDefined());
  expect(view().find(e => (e.type as { name?: string }).name === 'EntryBar')!.props.account).toBe('Synthetic Person');
});
