import { afterEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { byPerson, me, Stack } from './Avatars';
import { inkOn } from '../../collab/awareness';
import type { Person } from '../../collab/awareness';

const tomas: Person = { displayName: 'Tomás', kind: 'staff', role: 'editor', colour: 'hsl(20 65% 45%)', device: 'desktop' };
const lee: Person = { displayName: 'Dr. Lee', kind: 'client', role: 'commenter', colour: 'hsl(270 65% 45%)', device: 'phone' };
const ana: Person = { displayName: 'Ana R.', kind: 'staff', role: 'owner', device: 'desktop' };
function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
const text = (node: any): string => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const avatars = (tree: ReactElement<any>[]) => tree.filter(e => e.props?.className?.split(' ').includes('presence-avatar'));
afterEach(() => vi.unstubAllGlobals());

it('my avatar comes first, ringed, says You and does nothing when clicked', () => {
  const [mine] = avatars(elements(Stack({ people: [{ id: 1, person: ana, me: true }, { id: 2, person: tomas }] })));
  expect(mine.props['aria-label']).toBe('You, Ana R., Lab, Owner');
  expect(mine.props.className).toContain('me');
  expect(mine.props.onClick).toBeUndefined();
});
it('another person is labelled with name, Lab or Client and role, and clicking follows them', () => {
  const dispatch = vi.fn(); vi.stubGlobal('dispatchEvent', dispatch);
  const [, other, client] = avatars(elements(Stack({ people: [{ id: 1, person: ana, me: true }, { id: 2, person: tomas }, { id: 3, person: { ...lee, device: 'desktop' } }] })));
  expect(other.props['aria-label']).toBe('Follow Tomás, Lab, Editor');
  expect(client.props['aria-label']).toBe('Follow Dr. Lee, Client, Commenter');
  expect(text(other)).toContain('T');
  other.props.onClick();
  expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'nexo-follow', detail: 2 });
});
it('a person on a phone has a phone mark', () => {
  const tree = elements(Stack({ people: [{ id: 1, person: ana, me: true }, { id: 3, person: lee }] }));
  expect(avatars(tree)[1].props['aria-label']).toBe('Follow Dr. Lee, Client, Commenter, on a phone');
  expect(elements(avatars(tree)[1]).filter(e => e.props?.className === 'presence-device')).toHaveLength(1);
  expect(elements(avatars(tree)[0]).filter(e => e.props?.className === 'presence-device')).toHaveLength(0);
});
it('more than four people show four avatars and +N', () => {
  const people = [{ id: 1, person: ana, me: true }, ...[2, 3, 4, 5, 6].map(id => ({ id, person: { ...tomas, displayName: `Person ${id}` } }))];
  const tree = elements(Stack({ people }));
  expect(avatars(tree)).toHaveLength(4);
  expect(text(tree.find(e => e.props?.className === 'presence-more'))).toBe('+2');
});
it('the hover card says name, Lab or Client, role, device and Follow', () => {
  const dispatch = vi.fn(); vi.stubGlobal('dispatchEvent', dispatch);
  const cards = elements(Stack({ people: [{ id: 1, person: ana, me: true }, { id: 3, person: lee }] })).filter(e => e.props?.role === 'tooltip');
  expect(text(cards[1])).toBe('Dr. LeeClient · CommenterOn a phoneFollow');
  expect(text(cards[0])).toBe('Ana R. · YouLab · OwnerOn a computer');
  elements(cards[1]).find(e => e.type === 'button')!.props.onClick();
  expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'nexo-follow', detail: 3 });
});
it('my name is the one Admin gave with my token, my role the one the sidecar pushed', () => {
  expect(me({ device: 'phone' }, 'Ana R.', 'staff', 'owner')).toEqual({ device: 'phone', displayName: 'Ana R.', kind: 'staff', role: 'owner' });
  expect(me({}, null, 'client', null).displayName).toBe('Member');
});
it("my initials and label come from Admin's displayName, else Lab staff", () => {
  const mine = (name: string | null) => elements(Stack({ people: [{ id: 1, person: me({}, name, 'staff', null), me: true }] }));
  expect(text(avatars(mine('Robin Synthetic'))[0])).toBe('RSL');
  expect(avatars(mine('Robin Synthetic'))[0].props['aria-label']).toBe('You, Robin Synthetic, Lab');
  expect(text(avatars(mine(null))[0])).toBe('LSL');
  expect(avatars(mine(null))[0].props['aria-label']).toBe('You, Lab staff, Lab');
});
it('initials are readable on every avatar colour (at least 4.5:1), dark ink on a light colour', () => {
  const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const hsl = (h: number) => { const a = 0.65 * Math.min(0.45, 0.55), f = (n: number) => { const k = (n + h / 30) % 12; return Math.round((0.45 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
  const ratio = (x: string, y: string) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
  expect(inkOn('hsl(120 65% 45%)')).toBe('#000000');
  for (let hue = 0; hue < 360; hue++) expect(ratio(inkOn(`hsl(${hue} 65% 45%)`), hsl(hue))).toBeGreaterThanOrEqual(4.5);
  const [, green] = avatars(elements(Stack({ people: [{ id: 1, person: ana, me: true }, { id: 2, person: { ...tomas, colour: 'hsl(120 65% 45%)' } }] })));
  expect(green.props.style).toMatchObject({ backgroundColor: 'hsl(120 65% 45%)', color: '#000000' });
});
it('a person with two tabs appears once', () => {
  const people = byPerson([[1, {}], [2, { ...tomas, userId: 'u-t' }], [3, { ...tomas, userId: 'u-t' }], [4, { ...lee, userId: 'u-l' }]], 1, 'u-a');
  expect(people.map(p => [p.id, p.person.displayName ?? 'me'])).toEqual([[1, 'me'], [2, 'Tomás'], [4, 'Dr. Lee']]);
});
it('my own other tab is me and is never offered to follow', () => {
  const people = byPerson([[1, {}], [2, { ...ana, userId: 'u-a' }], [3, { ...tomas, userId: 'u-t' }]], 1, 'u-a');
  expect(people.map(p => [p.id, !!p.me])).toEqual([[1, true], [3, false]]);
});
it('the avatar I follow is pressed, the others are not', () => {
  const people = [{ id: 1, person: ana, me: true }, { id: 2, ids: [2, 5], person: tomas }, { id: 3, person: lee }];
  const [mine, followed, other] = avatars(elements(Stack({ people, following: 5 })));
  expect([mine.props['aria-pressed'], followed.props['aria-pressed'], other.props['aria-pressed']]).toEqual([undefined, true, false]);
});
it('a narrow top bar shows fewer avatars, then +N', () => {
  const people = [{ id: 1, person: ana, me: true }, { id: 2, person: tomas }, { id: 3, person: lee }];
  const tree = elements(Stack({ people, max: 1 }));
  expect(avatars(tree)).toHaveLength(1);
  expect(text(tree.find(e => e.props?.className === 'presence-more'))).toBe('+2');
});
