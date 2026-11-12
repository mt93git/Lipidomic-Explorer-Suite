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
