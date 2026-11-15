import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import * as tabsModel from '../state/tabs';
import type { Node } from '../state/document';
import { toDoc } from './schema';
import { toNexoV1, toTeamCanvasV1 } from './export';
vi.mock('../api/adminToken', () => ({ adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic' }) }));
import { byState, comments, findMention, insertMention, loadPeople, matching, mentioned, mentionsMe, org, segments, voteCount } from './comments';

const node: Node = { kind: 'plot', id: 'tcinstance_1-plot_pca', label: 'PCA', x: 0, y: 0, width: 440, height: 330, visual: {}, finished: null,
  instance: { id: 'tcinstance_1', source: 'results_dashboard-plot_pca', inputs: { color_by: 'Group1' } } };
const board = () => toDoc({ version: '1', libraryHidden: false, nodes: [node], document: null }, tabsModel.initial([node.id]), { version: 1, nodes: {} });

test('add drops a pin with its text, author left to the sidecar', () => {
  const doc = board(), id = comments(doc, { readOnly: false }).add({ nodeId: node.id, x: 40, y: 60, text: 'Check the PC scale' });
  expect(comments(doc, { readOnly: false }).list()).toEqual([{ id, nodeId: node.id, x: 40, y: 60, author: '', displayName: '',
    text: 'Check the PC scale', createdAt: expect.any(String), resolved: false, replies: [], votes: {} }]);
});

test('reply appends to the thread', () => {
  const doc = board(), mine = comments(doc, { readOnly: false }), id = mine.add({ x: 1, y: 2, text: 'Why log2?' })!;
  expect(mine.reply(id, 'Variance')).toBe(true);
  expect(mine.reply(id, 'And scale')).toBe(true);
  expect(mine.list()[0].replies.map(r => r.text)).toEqual(['Variance', 'And scale']);
});

test('resolve marks the thread resolved', () => {
  const doc = board(), mine = comments(doc, { readOnly: false }), id = mine.add({ x: 1, y: 2, text: 'Done?' })!;
  expect(mine.resolve(id)).toBe(true);
  expect(mine.list()[0].resolved).toBe(true);
});

// UX review 2, scene 3: a resolved thread can be reopened.
test('reopen puts a resolved thread back to open', () => {
  const mine = comments(board(), { readOnly: false }), id = mine.add({ x: 1, y: 2, text: 'Legend overlaps' })!;
  mine.resolve(id);
  expect(mine.reopen(id)).toBe(true);
  expect(mine.list()[0].resolved).toBe(false);
});

test('a viewer cannot add, reply or resolve', () => {
  const doc = board(), id = comments(doc, { readOnly: false }).add({ x: 1, y: 2, text: 'Editor note' })!;
  const viewer = comments(doc, { readOnly: true }), before = Y.encodeStateAsUpdate(doc);
  expect(viewer.add({ x: 3, y: 4, text: 'Viewer note' })).toBeNull();
  expect(viewer.reply(id, 'Viewer reply')).toBe(false);
  expect(viewer.resolve(id)).toBe(false);
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
});

test('comments never enter the Team or Nexo export', () => {
  const doc = board(), expected = [toTeamCanvasV1(doc), toNexoV1(doc)];
  const mine = comments(doc, { readOnly: false }), id = mine.add({ nodeId: node.id, x: 1, y: 2, text: 'Private note' })!;
  mine.reply(id, 'Private reply'); mine.resolve(id);
  expect([toTeamCanvasV1(doc), toNexoV1(doc)]).toEqual(expected);
  expect(JSON.stringify([toTeamCanvasV1(doc), toNexoV1(doc)])).not.toMatch(/Private|comments/);
});

test('byState lists open threads first, then resolved, oldest first in each', () => {
  const thread = (id: string, createdAt: string, resolved: boolean) => ({ id, x: 0, y: 0, author: '', displayName: '', text: id, createdAt, resolved, replies: [] });
  const list = [thread('a', '2026-11-10T09:00:00Z', true), thread('b', '2026-11-10T09:01:00Z', false), thread('c', '2026-11-10T09:02:00Z', false)];
  const { open, resolved } = byState(list);
  expect([open.map(c => c.id), resolved.map(c => c.id)]).toEqual([['b', 'c'], ['a']]);
});

test('org names lab staff Lab and client members Client', () => {
  expect([org('staff'), org('client'), org(undefined)]).toEqual(['Lab', 'Client', '']);
});

// UX-A4: @mentions and votes (prototype-v2 scene 3). Synthetic people.
const lee = { userId: 'u-lee', displayName: 'Dr. Lee', kind: 'client' }, mia = { userId: 'u-mia', displayName: 'Mia S.', kind: 'client' };
const tomas = { userId: 'u-tomas', displayName: 'Tomás', kind: 'staff' };

test('a comment and a reply keep the people they mention', () => {
  const doc = board(), mine = comments(doc, { readOnly: false }), id = mine.add({ x: 1, y: 2, text: '@Dr. Lee see this', mentions: [lee.userId] })!;
  mine.reply(id, '@Mia S. too', [mia.userId]);
  expect([mine.list()[0].mentions, mine.list()[0].replies[0].mentions]).toEqual([[lee.userId], [mia.userId]]);
});

test('mentionsMe finds me in the thread or in a reply', () => {
  const doc = board(), mine = comments(doc, { readOnly: false });
  mine.add({ x: 1, y: 2, text: 'No one' }); const id = mine.add({ x: 1, y: 2, text: 'Plain' })!; mine.reply(id, '@Dr. Lee yes', [lee.userId]);
  expect(mine.list().map(c => mentionsMe(c, lee.userId))).toEqual([false, true]);
  expect(mine.list().map(c => mentionsMe(c, undefined))).toEqual([false, false]);
});

test('vote toggles my thumbs-up on a thread', () => {
  const doc = board(), mine = comments(doc, { readOnly: false }), id = mine.add({ x: 1, y: 2, text: 'Panel C?' })!;
  expect(mine.vote(id, lee.userId)).toBe(true); mine.vote(id, mia.userId);
  expect([mine.list()[0].votes, voteCount(mine.list()[0])]).toEqual([{ [lee.userId]: true, [mia.userId]: true }, 2]);
  mine.vote(id, lee.userId);
  expect(mine.list()[0].votes).toEqual({ [mia.userId]: true });
});

test('a vote on a thread from before votes creates its map', () => {
  const doc = board(), mine = comments(doc, { readOnly: false }), id = mine.add({ x: 1, y: 2, text: 'Old' })!;
  doc.getMap<Y.Map<unknown>>('comments').get(id)!.delete('votes');
  mine.vote(id, lee.userId);
  expect(mine.list()[0].votes).toEqual({ [lee.userId]: true });
});

test('a viewer cannot vote', () => {
  const doc = board(), id = comments(doc, { readOnly: false }).add({ x: 1, y: 2, text: 'Panel C?' })!;
  expect(comments(doc, { readOnly: true }).vote(id, lee.userId)).toBe(false);
  expect(voteCount(comments(doc, { readOnly: true }).list()[0])).toBe(0);
});

test('findMention reads the @ word being typed before the caret', () => {
  expect(findMention('Looks good, @Dr', 15)).toEqual({ start: 12, query: 'Dr' });
  expect(findMention('@', 1)).toEqual({ start: 0, query: '' });
  expect(findMention('mail me@lab', 11)).toBeNull();
  expect(findMention('@Dr. Lee\nnext', 13)).toBeNull();
  expect(findMention('no mention', 10)).toBeNull();
});

test('matching filters people by name as typed, any case', () => {
  expect(matching([lee, mia, tomas], 'dr')).toEqual([lee]);
  expect(matching([lee, mia, tomas], '')).toEqual([lee, mia, tomas]);
});

test('insertMention replaces the typed @ word with @Name and puts the caret after it', () => {
  expect(insertMention('Looks good, @Dr and', { start: 12, query: 'Dr' }, lee)).toEqual({ text: 'Looks good, @Dr. Lee  and', caret: 21 });
});

test('mentioned keeps the picked people whose @Name is still in the text, once each', () => {
  expect(mentioned('@Dr. Lee and @Dr. Lee', [lee, mia, lee])).toEqual([lee.userId]);
});

test('segments marks each @Name of a mentioned person', () => {
  expect(segments('@Dr. Lee yes, ask @Mia S.', ['Dr. Lee', 'Mia S.'])).toEqual([
    { text: '@Dr. Lee', mention: true }, { text: ' yes, ask ', mention: false }, { text: '@Mia S.', mention: true }]);
  expect(segments('plain @Dr', [])).toEqual([{ text: 'plain @Dr', mention: false }]);
});

const share = { url: 'ws://collab.test/collab', project: '0a000000-0000-4000-8000-0000000000f5' };
test('loadPeople merges members and people from the members route, once each, named', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ members: [{ ...lee, role: 'editor' }, { userId: 'u-x', displayName: null, kind: null, role: 'viewer' }], people: [lee, mia] })));
  expect(await loadPeople(share, fetcher)).toEqual([lee, mia]);
  expect(fetcher).toHaveBeenCalledWith(`http://collab.test/collab/projects/${share.project}/members`, { headers: { 'X-Nexo-Admin-Token': 'synthetic' } });
});

test('loadPeople is empty when the list cannot be loaded', async () => {
  expect(await loadPeople(share, async () => new Response('', { status: 503 }))).toEqual([]);
  expect(await loadPeople(share, async () => { throw new TypeError('offline'); })).toEqual([]);
});
