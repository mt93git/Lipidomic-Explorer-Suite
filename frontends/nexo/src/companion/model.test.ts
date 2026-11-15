import { expect, test } from 'vitest';
import { startPhase, next, readFlags, autoTip } from './model';
const store = (values: Record<string, string> = {}) => ({ getItem: (k: string) => values[k] ?? null, setItem: (k: string, v: string) => { values[k] = v; } });
test('entrance plays on Start only when the per-user flag is absent', () => {
  expect(startPhase(readFlags(store(), 'u1'), 'start')).toBe('entrance');
  expect(startPhase(readFlags(store({ 'nexo.companion.seen.u1': '1' }), 'u1'), 'start')).toBe('docked');
  expect(startPhase(readFlags(store({ 'nexo.companion.seen.u2': '1' }), 'u1'), 'start')).toBe('entrance');
});
test('out of the bar it stays out until the person puts it back', () => {
  expect(next('docked', 'invoke')).toBe('out');
  expect(next('out', 'invoke')).toBe('out');
  expect(next('out', 'dock')).toBe('docked');
  expect(next('entrance', 'dock')).toBe('docked');
  expect(next('entrance', 'invoke')).toBe('docked');
});
test('an automatic tip shows once per screen and never with Fewer tips', () => {
  expect(autoTip({ seen: true, fewer: false }, 'canvas', [])).toBe(true);
  expect(autoTip({ seen: true, fewer: false }, 'canvas', ['canvas'])).toBe(false);
  expect(autoTip({ seen: true, fewer: true }, 'canvas', [])).toBe(false);
});
