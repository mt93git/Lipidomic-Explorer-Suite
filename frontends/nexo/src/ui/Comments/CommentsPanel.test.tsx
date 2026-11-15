import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { comments } from '../../collab/comments';
const state = vi.hoisted(() => ({ doc: undefined as unknown, canComment: true, me: 'u-me' }));
vi.mock('../../api/adminToken', () => ({ adminUserId: () => state.me, adminHeaders: async () => ({}) }));
vi.mock('../../collab/provider', () => ({ getAwareness: () => ({ doc: state.doc }), boardReadOnly: () => false }));
vi.mock('../../state/readonly', () => ({ canComment: () => state.canComment }));
import { CommentsButton, CommentsPanel, showComments } from './CommentsPanel';

// Two threads by synthetic people: an open one by lab staff with a reply, a resolved one by a client member.
let doc: Y.Doc, open: string, closed: string;
beforeEach(() => {
  doc = new Y.Doc(); state.doc = doc; state.canComment = true;
  const board = comments(doc, { readOnly: false });
  closed = board.add({ x: 1, y: 2, text: 'Legend overlaps the last point' })!; board.resolve(closed);
  open = board.add({ nodeId: 'n1', x: 3, y: 4, text: 'Can we show PC 34:1 instead?' })!; board.reply(open, 'Changing it now');
  const stamp = (id: string, displayName: string, kind: string) => { const m = doc.getMap<Y.Map<unknown>>('comments').get(id)!; m.set('displayName', displayName); m.set('kind', kind); };
  stamp(closed, 'Mia S.', 'client'); stamp(open, 'Ana R.', 'staff');
});
const html = (component: () => unknown) => renderToStaticMarkup(createElement(component as never));

test('the rail button counts open threads', () => {
  expect(html(CommentsButton)).toContain('aria-label="Comments (1 open)"');
});

test('the panel lists open threads first, each with author, Lab or Client, snippet, reply count and time', () => {
  showComments({ list: true });
  const out = html(CommentsPanel);
  expect(out).toContain('1 open · 1 resolved');
  expect(out.indexOf('Ana R.')).toBeLessThan(out.indexOf('Mia S.'));
  expect(out).toMatch(/Ana R\.<\/strong> <small>Lab<\/small> <small>\d\d:\d\d<\/small>/);
  expect(out).toContain('Can we show PC 34:1 instead?');
  expect(out).toContain('1 reply');
  expect(out).toMatch(/Mia S\.<\/strong> <small>Client<\/small>/);
});

test('resolved threads sit in a collapsed section', () => {
  showComments({ list: true });
  expect(html(CommentsPanel)).toMatch(/<details><summary>Resolved \(1\)<\/summary>.*Legend overlaps/);
});

test('a commenter gets Reply and Resolve in the thread view', () => {
  showComments({ id: open });
  const out = html(CommentsPanel);
  expect(out).toContain('Changing it now');
  expect(out).toContain('aria-label="Reply"');
  expect(out).toContain('>Resolve</button>');
});

test('a viewer reads the thread without Reply or Resolve', () => {
  state.canComment = false; showComments({ id: open });
  const out = html(CommentsPanel);
  expect(out).toContain('Changing it now');
  expect(out).not.toContain('aria-label="Reply"');
  expect(out).not.toContain('>Resolve</button>');
});

// UX-A4: Mentions (N) and votes. The open thread has a reply that mentions me and two votes.
const mentionAndVotes = () => {
  const board = comments(doc, { readOnly: false });
  board.reply(open, '@Ana R. have a look', ['u-me']); board.vote(open, 'u-lee'); board.vote(open, 'u-mia');
};

test('the list offers This board and Mentions (N), N the threads that mention me', () => {
  mentionAndVotes(); showComments({ list: true });
  const out = html(CommentsPanel);
  expect(out).toMatch(/<button type="button" aria-pressed="true">This board<\/button>/);
  expect(out).toMatch(/<button type="button" aria-pressed="false">Mentions \(1\)<\/button>/);
});

test('Mentions lists only the threads that mention me', () => {
  mentionAndVotes(); showComments({ list: true, mentions: true });
  const out = html(CommentsPanel);
  expect(out).toMatch(/aria-pressed="true">Mentions \(1\)</);
  expect(out).toContain('Can we show PC 34:1 instead?');
  expect(out).not.toContain('Legend overlaps');
});

test("a thread row shows its 👍 count", () => {
  mentionAndVotes(); showComments({ list: true });
  expect(html(CommentsPanel)).toContain('2 replies · 👍 2');
});

test('a commenter toggles 👍 in the thread, pressed once it is theirs', () => {
  mentionAndVotes(); showComments({ id: open });
  expect(html(CommentsPanel)).toMatch(/<button type="button" title="Vote" aria-pressed="false">👍 2<\/button>/);
  comments(doc, { readOnly: false }).vote(open, 'u-me');
  expect(html(CommentsPanel)).toMatch(/<button type="button" title="Vote" aria-pressed="true">👍 3<\/button>/);
});

test('a viewer sees the 👍 count without the toggle', () => {
  mentionAndVotes(); state.canComment = false; showComments({ id: open });
  const out = html(CommentsPanel);
  expect(out).toContain('👍 2');
  expect(out).not.toContain('title="Vote"');
});

// UX review 2, scene 3 (group 8) and the FIX-G78 task: Mentions (N) counts open threads only; a thread pinned to a card
// names the card and offers Jump to card; a resolved thread offers Reopen.
test('Mentions (N) counts only the open threads that mention me', () => {
  mentionAndVotes(); comments(doc, { readOnly: false }).reply(closed, '@Ana R. fixed', ['u-me']); showComments({ list: true });
  expect(html(CommentsPanel)).toMatch(/aria-pressed="false">Mentions \(1\)<\/button>/);
});

test('a thread pinned to a card names it and offers Jump to card', () => {
  const card = new Y.Map<unknown>(); doc.getMap('nodes').set('n1', card); card.set('label', new Y.Text('PCA scores'));
  showComments({ id: open });
  const out = html(CommentsPanel);
  expect(out).toContain('Pinned to PCA scores');
  expect(out).toContain('>Jump to card</button>');
});

test('a thread on the board itself has no Jump to card', () => {
  showComments({ id: closed });
  expect(html(CommentsPanel)).not.toContain('Jump to card');
});

test('a resolved thread offers Reopen, not Resolve', () => {
  showComments({ id: closed });
  const out = html(CommentsPanel);
  expect(out).toContain('>Reopen</button>');
  expect(out).not.toContain('>Resolve</button>');
});

test('a viewer cannot reopen', () => {
  state.canComment = false; showComments({ id: closed });
  expect(html(CommentsPanel)).not.toContain('>Reopen</button>');
});
