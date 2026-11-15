// The roaming behaviour shared with Admin (frontends/shared/companion/core.ts); Admin's suite runs the same file's rules
// through its component.
import { expect, test } from 'vitest';
import { clamp, DRAG_THRESHOLD, firstSpot, keyStep, newNudges, nudgeDue, overDock, placeBubble, readPlace, recordNudge, settle, asleep, writePlace, TIMING } from '../../../shared/companion/core';

test('out of the bar it never leaves the window or slips under the top bar', () => {
  expect(clamp(-50, -50, 96, 1440, 900)).toEqual({ x: 8, y: 56 });
  expect(clamp(5000, 5000, 96, 1440, 900)).toEqual({ x: 1336, y: 796 });
  expect(clamp(400, 300, 96, 1440, 900)).toEqual({ x: 400, y: 300 });
});

test('a drop on a phone snaps to the nearer bottom corner; on a desktop it stays where it fell', () => {
  expect(settle(300, 300, 96, 1440, 900)).toEqual({ x: 300, y: 300 });
  expect(settle(20, 700, 56, 390, 844)).toEqual({ x: 8, y: 780 });
  expect(settle(300, 80, 56, 390, 844)).toEqual({ x: 326, y: 780 }); // never the top corners, over the tabs
});

test('its first spot out is just under the dock, not over the middle of the page', () => {
  const spot = firstSpot({ x: 1300, y: 9, s: 38 }, 96, 1440, 900);
  expect(spot.y).toBeLessThan(120);
  expect(spot.x).toBeGreaterThan(1100);
});

test('a drop on the dock puts it back; anywhere else does not', () => {
  const dock = { x: 1300, y: 9, s: 38 };
  expect(overDock(1270, 0, 96, dock)).toBe(true);
  expect(overDock(900, 400, 96, dock)).toBe(false);
});

test("arrow keys move it Team's 16 px, 64 px with Shift; other keys do not", () => {
  expect(keyStep('ArrowLeft', false)).toEqual([-16, 0]);
  expect(keyStep('ArrowDown', true)).toEqual([0, 64]);
  expect(keyStep('a', false)).toBeNull();
  expect(DRAG_THRESHOLD).toBe(6);
});

test('its place survives a reload of the tab; broken or blocked storage reads as none', () => {
  const values: Record<string, string> = {}, store = { getItem: (k: string) => values[k] ?? null, setItem: (k: string, v: string) => { values[k] = v; } };
  writePlace(store, 'k', { out: true, x: 10, y: 80, mini: true });
  expect(readPlace(store, 'k')).toEqual({ out: true, x: 10, y: 80, mini: true });
  values.k = '{oops'; expect(readPlace(store, 'k')).toBeNull();
  expect(readPlace({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} }, 'k')).toBeNull();
});

test('the bubble goes to the side that covers no control and stays on screen', () => {
  const anchor = { x: 700, y: 300, s: 96 };
  // A button right where the left bubble would go: the bubble moves to the right.
  const p = placeBubble(anchor, 300, 120, 1440, 900, [{ x: 380, y: 280, w: 300, h: 140 }]);
  expect(p.side).toBe('right');
  // At the right edge the right side is off screen: it goes left.
  expect(placeBubble({ x: 1336, y: 300, s: 96 }, 300, 120, 1440, 900, []).side).toBe('left');
  const q = placeBubble({ x: 8, y: 56, s: 96 }, 300, 120, 390, 844, []);
  expect(q.left).toBeGreaterThanOrEqual(8); expect(q.left + 300).toBeLessThanOrEqual(382);
});

test("idle nudges follow Team's rules: 60 s in, 45 s idle, 180 s apart, at most 4 and 1 a screen", () => {
  let n = newNudges(0);
  expect(nudgeDue(n, 50_000, 'data', false, false)).toBe(false);          // too early
  n = { ...n, lastActivity: 30_000 };
  expect(nudgeDue(n, 70_000, 'data', false, false)).toBe(false);          // only 40 s idle
  expect(nudgeDue(n, 76_000, 'data', false, false)).toBe(true);
  expect(nudgeDue(n, 76_000, 'data', true, false)).toBe(false);           // Fewer tips
  expect(nudgeDue(n, 76_000, 'data', false, true)).toBe(false);           // typing or a dialog
  n = recordNudge(n, 76_000, 'data');
  expect(nudgeDue(n, 76_000 + 400_000, 'data', false, false)).toBe(false); // that screen had its one
  expect(nudgeDue(n, 76_000 + 100_000, 'review', false, false)).toBe(false); // 180 s apart
  expect(nudgeDue(n, 76_000 + TIMING.betweenMs, 'review', false, false)).toBe(true);
  for (const s of ['a', 'b', 'c']) n = recordNudge(n, n.lastNudge + TIMING.betweenMs, s);
  expect(n.count).toBe(4);
  expect(nudgeDue(n, n.lastNudge + 10 * TIMING.betweenMs, 'z', false, false)).toBe(false);
  expect(asleep(newNudges(0), 89_000)).toBe(false); expect(asleep(newNudges(0), 90_000)).toBe(true);
});

test('a place saved on a wide window opens on screen in a narrow one', async () => {
  const { fitPlace } = await import('../../../shared/companion/core');
  expect(fitPlace({ out: true, mini: true, x: 1344, y: 460 }, 390, 844)).toEqual({ out: true, mini: true, x: 326, y: 780 }); // a phone: the nearest corner
  expect(fitPlace(null, 390, 844)).toBeNull();
});

test('on a phone it is always the 56 px mini size', async () => {
  const { sizeFor } = await import('../../../shared/companion/core');
  expect(sizeFor(false, 1440)).toBe(96); expect(sizeFor(true, 1440)).toBe(56); expect(sizeFor(false, 390)).toBe(56);
});
