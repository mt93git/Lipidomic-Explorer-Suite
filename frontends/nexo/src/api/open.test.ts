import { afterEach, expect, it, vi } from 'vitest';
import { openSession, createCard } from '../api';
import { useAdminTokenFetch } from './adminToken';
// No Admin on this host: the checkpoint open goes without a token (nexo-store-scope.md), and the stubbed fetch sees only the API.
useAdminTokenFetch(async () => new Response('not found', { status: 404 }));
afterEach(() => vi.unstubAllGlobals());
it('does not send a checkpoint request cancelled while queued', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
  const controller = new AbortController(); controller.abort();
  await expect(openSession('cancelled', controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(fetch).not.toHaveBeenCalled();
});
it('cancelling a hung open frees the request queue for another checkpoint', async () => {
  const fetch = vi.fn().mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve,reject) => {
    options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {once:true});
  })).mockResolvedValueOnce(new Response(JSON.stringify({sessionId:'next'}),{headers:{'Content-Type':'application/json'}}));
  vi.stubGlobal('fetch',fetch);
  const controller = new AbortController(), first = openSession('hung',controller.signal);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)); controller.abort();
  await expect(first).rejects.toMatchObject({name:'AbortError'});
  await expect(openSession('next')).resolves.toMatchObject({sessionId:'next'});
});

it('does not create a card whose Library add was cancelled in the API queue', async () => {
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const controller=new AbortController();controller.abort();
 await expect(createCard('session','plot',{},'instance',controller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(fetch).not.toHaveBeenCalled();
});
