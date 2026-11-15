// Copied from Nexo frontends/nexo/src/companion at 2ec1f69d (model.test.ts); keep in step by hand.
// Admin: the entrance's screens are Client home and Choose client, the keys start with "admin-companion".
import { expect, test } from 'vitest';
import { startPhase, next, readFlags, autoTip, clientScreen } from '@/components/companion/model';
const store = (values: Record<string, string> = {}) => ({ getItem: (k: string) => values[k] ?? null, setItem: (k: string, v: string) => { values[k] = v; } });
test('entrance plays on Start only when the per-user flag is absent', () => {
  expect(startPhase(readFlags(store(), 'u1'), 'home')).toBe('entrance');
  expect(startPhase(readFlags(store(), 'u1'), 'choose')).toBe('entrance');
  expect(startPhase(readFlags(store(), 'u1'), 'order')).toBe('docked');
  expect(startPhase(readFlags(store({ 'admin-companion.seen.u1': '1' }), 'u1'), 'home')).toBe('docked');
  expect(startPhase(readFlags(store({ 'admin-companion.seen.u2': '1' }), 'u1'), 'home')).toBe('entrance');
  expect(startPhase(readFlags(store({ 'nexo.companion.seen.u1': '1' }), 'u1'), 'home')).toBe('entrance');
});
test('re-invoke flies out and returns to the dock', () => {
  expect(next('docked', 'invoke')).toBe('out');
  expect(next('out', 'timeout')).toBe('docked');
  expect(next('out', 'dismiss')).toBe('docked');
});
test('an automatic tip shows once per screen and never with Fewer tips', () => {
  expect(autoTip({ seen: true, fewer: false }, 'home', [])).toBe(true);
  expect(autoTip({ seen: true, fewer: false }, 'home', ['home'])).toBe(false);
  expect(autoTip({ seen: true, fewer: true }, 'home', [])).toBe(false);
});
test('Admin: the client zone path names the screen', () => {
  expect(clientScreen('/client/home')).toBe('home');
  expect(clientScreen('/client/request-order')).toBe('request');
  expect(clientScreen('/choose-client')).toBe('choose');
  expect(clientScreen('/notifications')).toBe('notifications');
  expect(clientScreen('/orders/ORD040')).toBe('order');
});
