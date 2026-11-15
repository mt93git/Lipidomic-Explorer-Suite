import { beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { Session } from '../api/types';
vi.mock('../api/adminToken', async original => ({ ...await original<typeof import('../api/adminToken')>(),
  adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-token' }) }));

// The R API's GET /sessions/<id>/join answer (session.R api_session_join), synthetic.
const joined = (id: string) => ({ sessionId: id, generation: 'g1', engineRevision: 0, preparation: { revision: 2, check: 'synthetic' },
  samples: 6, lipids: 40, design: { allowed: true, unit: 'Animal', type: 'independent', confirmed: true }, cards: [] });
const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(joined(decodeURIComponent(url.split('/').at(-2)!)))));
beforeEach(() => { fetch.mockClear(); vi.stubGlobal('fetch', fetch); });
const write = (doc: Y.Doc, values: Record<string, unknown>) => doc.transact(() => {
  for (const [key, value] of Object.entries(values)) doc.getMap('meta').set(key, value);
}, 'server');
/** The page holds its own id ('own'); the sidecar's document says which R session the project uses. */
async function follow(meta: Record<string, unknown>) {
  vi.resetModules();
  const sessions = await import('../api/session'), shared = await import('./session');
  const doc = new Y.Doc(); write(doc, meta); shared.followSession(doc);
  const session = { sessionId: 'own' } as Session, waiting = vi.fn();
  let refreshed = () => {};
  const refresh = vi.fn(() => refreshed());
  const rendered = () => new Promise<void>(resolve => { refreshed = resolve; });
  const next = rendered();
  shared.followSharedSession(session, { refresh, waiting });
  return { doc, session, sessions, refresh, waiting, next, rendered };
}

it('renders use meta.session.id', async () => {
  const { session, sessions, next } = await follow({ session: { id: 'r-1', generation: 'g1' }, engineStatus: 'ready' });
  await next;
  expect(sessions.liveSession('own')).toBe('r-1');
  expect(await sessions.withSession('own', async live => live)).toBe('r-1');
  expect(fetch).toHaveBeenCalledWith('/api/v1/sessions/r-1/join', { headers: { 'X-Nexo-Admin-Token': 'synthetic-token' } });
  expect(session.preparation).toEqual({ revision: 2, check: 'synthetic' });
});

it('a meta.session change switches the id and re-renders', async () => {
  const { doc, sessions, refresh, next, rendered } = await follow({ session: { id: 'r-1', generation: 'g1' }, engineStatus: 'ready' });
  await next;
  const again = rendered();
  write(doc, { session: { id: 'r-2', generation: 'g2' } });
  await again;
  expect(sessions.liveSession('own')).toBe('r-2');
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('engine waiting shows the notice until ready', async () => {
  const { doc, waiting } = await follow({ engineStatus: 'waiting' });
  expect(waiting).toHaveBeenLastCalledWith(true);
  write(doc, { engineStatus: 'ready' });
  expect(waiting).toHaveBeenLastCalledWith(false);
});

it('a lost session waits for the sidecar\'s next session instead of reopening', async () => {
  const { doc, sessions } = await follow({ engineStatus: 'waiting' });
  const lost = Object.assign(new Error('lost'), { status: 409, code: 'session_lost' });
  const answer = sessions.withSession('own', async (live, attempt) => { if (!attempt) throw lost; return live; });
  write(doc, { session: { id: 'r-1', generation: 'g1' }, engineStatus: 'ready' });
  expect(await answer).toBe('r-1');
});

it('followSettings tells the project settings now and when the sidecar writes new ones', async () => {
  const { doc } = await follow({ origin: { adminDatasetId: 'd-1', settings: { samples: ['A'] } } });
  const shared = await import('./session'), seen = vi.fn();
  shared.followSettings(seen);
  expect(seen).toHaveBeenLastCalledWith({ samples: ['A'] });
  write(doc, { origin: { adminDatasetId: 'd-1', settings: { samples: ['A'], outlierDecisions: [{ sample: 'A', choice: 'keep' }] } } });
  expect(seen).toHaveBeenLastCalledWith({ samples: ['A'], outlierDecisions: [{ sample: 'A', choice: 'keep' }] });
});
