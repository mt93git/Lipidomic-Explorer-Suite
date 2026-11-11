// UX-A3 (prototype scene 6): the project's activity feed, the document's 'activity' array the sidecar appends to.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Y from 'yjs';
const shared = vi.hoisted(() => ({ doc: undefined as Y.Doc | undefined }));
vi.mock('../collab/provider', () => ({ getAwareness: () => shared.doc && { doc: shared.doc } }));
import { ActivityList } from './ActivityList';
const now = Date.parse('2026-11-10T10:44:00Z'), min = 60_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); shared.doc = new Y.Doc(); });
afterEach(() => vi.useRealTimers());
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
it('lists who did what in plain words and when, newest first', () => {
  shared.doc!.getArray('activity').push([
    { at: now - 70 * min, actor: null, displayName: null, kind: 'autosave' },
    { at: now - 23 * min, actor: 'bo', displayName: 'Bo Example', kind: 'save', label: 'Client review, round 2' },
    { at: now - 20 * min, actor: 'bo', displayName: 'Bo Example', kind: 'inputs', nodeId: 'n1', label: 'Feature distributions' },
    { at: now, actor: 'ada', displayName: 'Ada Example', kind: 'restore', label: 'Client review, round 2' },
  ]);
  const html = renderToStaticMarkup(<ActivityList/>);
  expect(html).toContain('aria-label="Activity"');
  expect(text(html)).toBe('Activity Ada Example restored Client review, round 2 now Bo Example changed Feature distributions 20 min ' +
    'Bo Example named version Client review, round 2 23 min Autosave saved a version 1 h');
});
it('says when there is no activity yet', () => {
  expect(text(renderToStaticMarkup(<ActivityList/>))).toBe('Activity No activity yet.');
});
it('names a restored version without a name by its kind in plain words', () => {
  shared.doc!.getArray('activity').push([{ at: now, actor: 'ada', displayName: 'Ada Example', kind: 'restore', label: 'before-restore' }]);
  expect(text(renderToStaticMarkup(<ActivityList/>))).toBe('Activity Ada Example restored the safety snapshot now');
});
// ENTRY-8: a sample decided on the board (nexo-collab projects.mjs PUT decisions; the label says what was done).
it('says a board decision on a flagged sample in plain words', () => {
  shared.doc!.getArray('activity').push([{ at: now, actor: 'ana', displayName: 'Ana R.', kind: 'decision', label: 'excluded Treated_3' }]);
  expect(text(renderToStaticMarkup(<ActivityList/>))).toBe('Activity Ana R. excluded Treated_3 now');
});
