import { describe, expect, it } from 'vitest';
import { place } from './place';
const box = { width: 440, height: 330 };
describe('new card placement', () => {
  it('keeps the wanted spot when it is free', () => expect(place([{ x: 0, y: 0, width: 300, height: 300 }], { x: 600, y: 0, ...box })).toEqual({ x: 600, y: 0 }));
  it('moves right of all cards when the spot overlaps one', () => expect(place([{ x: 0, y: 0, width: 620, height: 720 }, { x: 660, y: 0, width: 620, height: 720 }], { x: 100, y: 100, ...box })).toEqual({ x: 1320, y: 0 }));
});
