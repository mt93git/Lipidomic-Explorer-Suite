import { expect, test } from 'vitest';
import { startPhase, next, readFlags, autoTip } from './model';
const store = (values: Record<string, string> = {}) => ({ getItem: (k: string) => values[k] ?? null, setItem: (k: string, v: string) => { values[k] = v; } });
test('entrance plays on Start only when the per-user flag is absent', () => {
  expect(startPhase(readFlags(store(), 'u1'), 'start')).toBe('entrance');
  expect(startPhase(readFlags(store({ 'nexo.companion.seen.u1': '1' }), 'u1'), 'start')).toBe('docked');
  expect(startPhase(readFlags(store({ 'nexo.companion.seen.u2': '1' }), 'u1'), 'start')).toBe('entrance');
});
test('re-invoke flies out and returns to the dock', () => {
  expect(next('docked', 'invoke')).toBe('out');
  expect(next('out', 'timeout')).toBe('docked');
  expect(next('out', 'dismiss')).toBe('docked');
});
test('an automatic tip shows once per screen and never with Fewer tips', () => {
  expect(autoTip({ seen: true, fewer: false }, 'canvas', [])).toBe(true);
  expect(autoTip({ seen: true, fewer: false }, 'canvas', ['canvas'])).toBe(false);
  expect(autoTip({ seen: true, fewer: true }, 'canvas', [])).toBe(false);
});
