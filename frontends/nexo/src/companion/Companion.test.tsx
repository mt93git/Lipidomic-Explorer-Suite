// The companion on Home (Start), as main.tsx mounts it: the entry bar renders it on the loading screen, before Admin says
// who is signed in, and Start follows once Admin answered. React's hooks run here as plain state with their dependencies,
// so the real component runs without a DOM; the messages are the bubbles and tips it renders.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReactElement } from 'react';

type Slot = { v?: unknown; current?: unknown; deps?: unknown[]; committed?: boolean; cleanup?: () => void };
const h = vi.hoisted(() => ({ slots: [] as Slot[], i: 0, dirty: false, layout: [] as (() => void)[], passive: [] as (() => void)[],
  user: null as string | null, answered: false }));
vi.mock('react', async importOriginal => {
  const React = await importOriginal<typeof import('react')>();
  const effect = (queue: 'layout' | 'passive') => (fn: () => void | (() => void), deps?: unknown[]) => {
    const i = h.i++, s = (h.slots[i] ??= {});
    if (s.committed && deps && s.deps && deps.length === s.deps.length && deps.every((d, k) => Object.is(d, s.deps![k]))) return;
    h[queue].push(() => { s.cleanup?.(); s.deps = deps; s.committed = true; const c = fn(); s.cleanup = typeof c === 'function' ? c : undefined; });
  };
  return { ...React,
    useState: (initial: unknown) => { const i = h.i++; const s = (h.slots[i] ??= { v: typeof initial === 'function' ? (initial as () => unknown)() : initial });
      return [s.v, (v: unknown) => { const n = typeof v === 'function' ? (v as (p: unknown) => unknown)(s.v) : v; if (!Object.is(n, s.v)) { s.v = n; h.dirty = true; } }]; },
    useRef: (value: unknown) => { const i = h.i++; return (h.slots[i] ??= { current: value }); },
    useEffect: effect('passive'), useLayoutEffect: effect('layout') };
});
vi.mock('react-dom', () => ({ createPortal: (node: unknown) => node }));
vi.mock('../api', () => ({ askCompanion: vi.fn() }));
vi.mock('../api/adminToken', () => ({ adminUserId: () => h.user, adminAnswered: () => h.answered }));

let store: Record<string, string>;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  h.slots = []; h.user = null; h.answered = false; store = {};
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', { querySelector: () => null, activeElement: null });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
  vi.stubGlobal('addEventListener', () => {}); vi.stubGlobal('removeEventListener', () => {});
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 16));
  vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
const text = (node: any): string => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
/** Mounts the companion on Home and returns: render (React's render and commit until nothing changes), wait (time passes,
 *  rendering as React would) and the messages shown so far, in order. */
async function home() {
  const { Companion } = await import('./Companion');
  let tree: unknown = null; const messages: string[] = [];
  const render = () => { for (let n = 0; n < 50; n++) {
    do { h.dirty = false; h.i = 0; h.layout = []; h.passive = []; tree = Companion({ screen: 'start' }); } while (h.dirty);
    for (const m of elements(tree).filter(e => String(e.props?.className ?? '').includes('companion-pop')).map(text)) if (messages.at(-1) !== m && !messages.includes(m)) messages.push(m);
    const queued = [...h.layout, ...h.passive]; queued.forEach(f => f());
    if (!h.dirty) return;
  } };
  const wait = (ms: number) => { for (let t = 0; t < ms; t += 50) { vi.advanceTimersByTime(50); if (h.dirty) render(); } };
  const dock = () => elements(tree).find(e => String(e.props?.className ?? '').includes('companion-dock'))!;
  render();
  return { render, wait, dock, messages };
}
const signedIn = (c: { render: () => void }) => { h.user = 'synthetic-user-1'; h.answered = true; c.render(); };

test('first arrival on Home: the arrival is the only message, and it is remembered for the signed-in person', async () => {
  const { welcome } = await import('./tips');
  const c = await home(); // the loading screen, before Admin answers
  signedIn(c);            // Start: Admin said who is signed in
  c.wait(15_000);
  expect(c.messages).toEqual([welcome.title + welcome.text]);
  expect(store['nexo.companion.seen.synthetic-user-1']).toBe('1');
});

test('a person who already saw the arrival gets no arrival and no Home tip on the next visit', async () => {
  store = { 'nexo.companion.seen.synthetic-user-1': '1', 'nexo.companion.tipped.synthetic-user-1': 'start' };
  const c = await home();
  signedIn(c);
  c.wait(15_000);
  expect(c.messages).toEqual([]);
});
