import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as (() => void)[], loaded: () => {} }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (v: any) => { hooks.values[i] = typeof v === 'function' ? v(hooks.values[i]) : v; if (i === 0 && hooks.values[i]) hooks.loaded(); }]; },
  useId: () => 'share-id', useEffect: (effect: () => void) => { hooks.effects.push(effect); }, useRef: () => ({ current: { showModal() {}, close() {} } }),
}));
const me = vi.hoisted(() => ({ userId: 'owner' as string | null, toasts: [] as string[] }));
vi.mock('../../api/adminToken', () => ({ adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-token' }), adminUserId: () => me.userId }));
vi.mock('../model', () => ({ notify: (message: string) => { me.toasts.push(message); } }));
import { Share } from './Share';
const project = { url: 'wss://synthetic.test/collab/', project: 'synthetic-project' };
const data = { workspace: 'nexo-client-synthetic', members: [{ userId: 'owner', displayName: 'Lab Owner', kind: 'staff', role: 'owner' }, { userId: 'member', displayName: 'Client One', kind: 'client', role: 'editor' }], people: [{ userId: 'member', displayName: 'Client One', kind: 'client' }, { userId: 'new', displayName: 'Client Two', kind: 'client' }] };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => { me.userId = 'owner'; me.toasts = []; hooks.values = []; hooks.cursor = 0; hooks.effects = []; fetcher = vi.fn(async () => new Response(JSON.stringify(data))); vi.stubGlobal('fetch', fetcher); vi.stubGlobal('location', { href: 'https://synthetic.test/nexo/' }); vi.stubGlobal('document', { activeElement: { focus() {} } }); });
afterEach(() => vi.unstubAllGlobals());
const closed = vi.fn();
function render() { hooks.cursor = 0; return Share({ board: project, projectName: 'Synthetic board', onClose: closed }); }
const text = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
async function mount() { const loaded = new Promise<void>(resolve => { hooks.loaded = resolve; }); render(); hooks.effects.forEach(effect => effect()); await loaded; return elements(render()); }
it('lists members and only people not already members, with Owner uneditable', async () => {
  const tree = await mount();
  expect(fetcher.mock.calls[0]).toEqual(['https://synthetic.test/collab/projects/synthetic-project/members', expect.objectContaining({ headers: expect.objectContaining({ 'X-Nexo-Admin-Token': 'synthetic-token' }) })]);
  expect(tree.filter(e => e.type === 'select').map(e => e.props['aria-label'])).toEqual(['Role for Client One', 'Add Client Two as']);
  expect(tree.some(e => e.props?.children === 'Owner')).toBe(true);
});
it('changing a role sends one PUT with role', async () => { const tree = await mount(); await tree.find(e => e.props?.['aria-label'] === 'Role for Client One')!.props.onChange({ target: { value: 'viewer' } }); expect(fetcher.mock.calls.filter((c: any[]) => c[1]?.method === 'PUT')).toEqual([['https://synthetic.test/collab/projects/synthetic-project/members/member', expect.objectContaining({ body: '{"role":"viewer"}' })]]); });
it('remove sends DELETE', async () => { const tree = await mount(); await tree.find(e => e.props?.['aria-label'] === 'Remove Client One')!.props.onClick(); expect(fetcher).toHaveBeenCalledWith('https://synthetic.test/collab/projects/synthetic-project/members/member', expect.objectContaining({ method: 'DELETE' })); });
it('Add as sends the chosen role', async () => { const tree = await mount(); await tree.find(e => e.props?.['aria-label'] === 'Add Client Two as')!.props.onChange({ target: { value: 'commenter' } }); expect(fetcher).toHaveBeenCalledWith('https://synthetic.test/collab/projects/synthetic-project/members/new', expect.objectContaining({ method: 'PUT', body: '{"role":"commenter"}' })); });
it('the title names the project and says who can open it', async () => {
  const tree = await mount();
  expect(text(tree.find(e => e.type === 'h2'))).toBe('Share Synthetic board');
  expect(tree.some(e => e.type === 'p' && text(e) === "Lab staff and this client's members can open this project. Roles decide what each person can change.")).toBe(true);
});
it('a lab-only project says only lab staff can open it', async () => {
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ ...data, workspace: 'nexo-lab', people: [] })));
  const tree = await mount();
  expect(tree.filter(e => e.type === 'p' && text(e).includes('can open this project')).map(text)).toEqual(['Lab staff can open this project. Roles decide what each person can change.']);
});
it('my own row says (you) and has no controls', async () => {
  me.userId = 'member';
  const tree = await mount();
  expect(tree.some(e => e.type === 'li' && text(e).startsWith('Client One (you)'))).toBe(true);
  expect(tree.some(e => e.props?.['aria-label'] === 'Role for Client One' || e.props?.['aria-label'] === 'Remove Client One')).toBe(false);
});
it('People has the hint for someone not listed', async () => {
  const tree = await mount();
  expect(tree.some(e => e.type === 'p' && text(e) === 'Not listed? Add the person as a client member in Admin first.')).toBe(true);
});
it('Copy link is the first control and copies the page address', async () => {
  const writeText = vi.fn(async () => {}); vi.stubGlobal('navigator', { clipboard: { writeText } });
  const tree = await mount();
  const first = tree.find(e => e.type === 'button' || e.type === 'select')!;
  expect(text(first)).toBe('Copy link');
  await first.props.onClick();
  expect(writeText).toHaveBeenCalledWith('https://synthetic.test/nexo/');
  expect(elements(render()).some(e => e.type === 'button' && text(e) === 'Link copied')).toBe(true);
});
it('a refused copy says so inside the dialog', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: async () => { throw new Error('denied'); } } });
  const tree = await mount();
  await tree.find(e => e.type === 'button' && text(e) === 'Copy link')!.props.onClick();
  expect(elements(render()).filter(e => e.props?.role === 'alert').map(text)).toEqual(['Could not copy the link: copy it from the address bar.']);
});
it('Done closes the dialog', async () => {
  const tree = await mount();
  tree.find(e => e.type === 'button' && text(e) === 'Done')!.props.onClick();
  expect(closed).toHaveBeenCalled();
});
it('a member of unknown kind is not labelled Client', async () => {
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ members: [{ userId: 'x', displayName: 'Someone', kind: null, role: 'editor' }], people: [] })));
  const tree = await mount();
  expect(tree.some(e => e.type === 'small' && text(e) === 'Client')).toBe(false);
});
