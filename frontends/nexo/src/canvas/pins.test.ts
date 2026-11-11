import { expect, test } from 'vitest';
import { pinCamera, pinColour, pinLabel, pinText } from './pins';

test('pinCamera centres the pin in the visible part of the viewport at the current zoom', () => {
  expect(pinCamera({ width: 800, height: 600 }, 0.5, { x: 1000, y: 200 })).toEqual({ x: 400 - 500, y: 300 - 100, scale: 0.5 });
});

// UX-A4: a thread's 👍 count shows on its pin (prototype-v2 scene 3), in its text and its label.
const thread = { id: 'c1', x: 0, y: 0, author: 'u1', displayName: 'Dr. Lee', text: 'Panel C?', createdAt: '2026-11-10T10:31:00Z', resolved: false,
  replies: [], votes: { 'u-a': true, 'u-b': true } as Record<string, true> };
test('a pin shows its 👍 count in its text and its label', () => {
  expect(pinText(thread)).toBe('1 · 👍 2');
  expect(pinLabel(thread)).toBe('Comment by Dr. Lee: Panel C? (0 replies, 2 votes)');
});
test('a pin without votes keeps its text and label', () => {
  const plain = { ...thread, votes: {} };
  expect([pinText(plain), pinLabel(plain)]).toEqual(['1', 'Comment by Dr. Lee: Panel C? (0 replies)']);
});

// UX review 2, scene 3: a pin in its author's colour, the colour the sidecar gives that person (admission.mjs identity:
// the first 8 hex digits of sha256(userId) mod 360; 309 for 'u-alex').
test("a pin's colour is its author's presence colour", async () => {
  expect(await pinColour('u-alex')).toBe('hsl(309 65% 45%)');
});
