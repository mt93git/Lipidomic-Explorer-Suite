// Prepare -> "Open the Canvas": the board mounts on the prepare session's id, CohortEntry queues its background cohort
// read, then the sidecar's session takes over (collab/session.ts) and the prepare session is closed. The queued read
// must go to the Canvas session, never to the closed prepare session (which answers 409 session_lost).
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { Session } from './api/types';
vi.mock('./api/adminToken', async original => ({ ...await original<typeof import('./api/adminToken')>(), adminHeaders: async () => ({}) }));
const settle = () => new Promise(r => setTimeout(r, 0));
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

it('after the hand-off to the Canvas session, no cohort request goes to the closed prepare session', async () => {
  const urls: string[] = [];
  let finishRender!: () => void;
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    urls.push(url);
    if (url.endsWith('/render')) return new Promise<Response>(r => { finishRender = () => r(json({ figure: { data: [], layout: {} } })); });
    if (url.endsWith('/join')) return Promise.resolve(json({ samples: 6, lipids: 40, preparation: { revision: 1 }, design: { confirmed: true } }));
    if (url.includes('/sessions/prepare-1/')) return Promise.resolve(json({ error: 'session_lost' }, 409));
    return Promise.resolve(json({ lipids: [], available: ['PC 34:1'], active: false }));
  }));
  vi.resetModules();
  const { renderCard, getCohort } = await import('./api'), shared = await import('./collab/session');
  // The board opens on the prepare session: a card render is in flight, the cohort read waits behind it.
  const render = renderCard('prepare-1', 'card-a', 400, 300, 'json');
  const cohort = getCohort('prepare-1', { background: true });
  await settle();
  // The sidecar's Canvas session takes over.
  const doc = new Y.Doc(); doc.getMap('meta').set('session', { id: 'canvas-1', generation: 'g1' }); shared.followSession(doc);
  const switched = new Promise<void>(resolve => shared.followSharedSession({ sessionId: 'prepare-1' } as Session, { refresh: resolve, waiting: () => {} }));
  await switched;
  finishRender(); await render;
  expect(await cohort).toMatchObject({ available: ['PC 34:1'] });
  expect(urls.filter(u => u.endsWith('/cohort'))).toEqual(['/api/v1/sessions/canvas-1/cohort']);
});

// Issue #61: with collaboration on, the sidecar opening the project's session makes the API close the prepare session
// (two sessions at most, session.R api_session_make_room) before the page hears of the switch, so a cohort read sent on
// the prepare session meanwhile came back 409 session_lost. The read waits until the page follows the shared session.
it('with collaboration on, the cohort read waits for the shared session and never goes to the prepare session', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    urls.push(url);
    if (url.endsWith('/join')) return Promise.resolve(json({ samples: 6, lipids: 40, preparation: { revision: 1 }, design: { confirmed: true } }));
    if (url.includes('/sessions/prepare-1/')) return Promise.resolve(json({ error: 'session_lost', message: 'This session was closed or evicted; reopen the checkpoint.' }, 409));
    return Promise.resolve(json({ lipids: [], available: ['PC 34:1'], active: false }));
  }));
  vi.resetModules();
  (await import('./collab/mode')).initCollab({ url: 'wss://collab.test', search: '?project=00000000-0000-4000-8000-000000000001' });
  const { getCohort } = await import('./api'), shared = await import('./collab/session');
  const doc = new Y.Doc(); shared.followSession(doc);
  const switched = new Promise<void>(resolve => shared.followSharedSession({ sessionId: 'prepare-1' } as Session, { refresh: resolve, waiting: () => {} }));
  const cohort = getCohort('prepare-1', { background: true });
  await settle(); await settle();
  expect(urls).toEqual([]);
  doc.getMap('meta').set('session', { id: 'canvas-1', generation: 'g1' });
  await switched;
  expect(await cohort).toMatchObject({ available: ['PC 34:1'] });
  expect(urls.filter(u => u.endsWith('/cohort'))).toEqual(['/api/v1/sessions/canvas-1/cohort']);
});
