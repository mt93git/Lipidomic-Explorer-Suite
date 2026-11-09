import { describe, it, expect } from 'vitest';
import { tier, assignTiers, isThumb, LIVE_FROM } from './tiers';
const card = { x: 10, y: 10, width: 100, height: 100 };
const viewport = { x: 0, y: 0, width: 800, height: 600 };
describe('card thumb chrome', () => {
  it.each([.1, .15, .199999])('hides the header at %s zoom', scale => expect(isThumb(scale)).toBe(true));
  it.each([.2, .25, .5, 1, 4])('restores the header at %s zoom', scale => expect(isThumb(scale)).toBe(false));
  it('changes presentation only: plots still become live at 50 %', () => {
    expect(LIVE_FROM).toBe(.5);
    for (const scale of [.15, .2, .25, .49999]) expect(tier(card, viewport, scale, true, false)).toBe('frozen');
    expect(tier(card, viewport, .5, true, false)).toBe('live');
    expect(tier({ ...card, x: 1200 }, viewport, .15, true, false)).toBe('culled');
  });
});
describe('U3 render tiers', () => {
  it('in view at 100 % → live', () => expect(tier(card, viewport, 1, false, false)).toBe('live'));
  it('in view at 25 % → frozen', () => expect(tier(card, viewport, .25, false, false)).toBe('frozen'));
  it('out of view → culled', () => expect(tier({ ...card, x: 1200 }, viewport, 1, false, false)).toBe('culled'));
  it('selected in view at 60 % during no gesture → live', () => expect(tier(card, viewport, .6, true, false)).toBe('live'));
  it('in view at 100 % while gesturing → frozen', () => expect(tier(card, viewport, 1, false, true)).toBe('frozen'));
  it('card partially in the 200 px margin → not culled', () => expect(tier({ ...card, x: 950 }, viewport, 1, false, false)).not.toBe('culled'));
});
describe('H7b live cap', () => {
  const view = { x: 0, y: 0, width: 1000, height: 800 };
  // Six plot cards in view; the centre is (500, 400).
  const at = (id: string, x: number, y: number, renderer: 'plotly' | 'image' = 'plotly') => ({ id, rect: { x, y, width: 100, height: 100 }, renderer });
  const six = [at('far-a', 0, 0), at('near-1', 450, 350), at('near-2', 300, 350), at('near-3', 600, 350), at('near-4', 450, 150), at('far-b', 900, 700)];
  it('5th Plotly card in view → frozen', () => {
    const t = assignTiers(six.slice(0, 5), view, 1, new Set(), false);
    expect([...t.values()].filter(v => v === 'live')).toHaveLength(4);
    expect(t.get('far-a')).toBe('frozen');
  });
  it('keeps at most 4 live, nearest the viewport centre', () => {
    const t = assignTiers(six, view, 1, new Set(), false);
    expect(['near-1', 'near-2', 'near-3', 'near-4'].map(id => t.get(id))).toEqual(['live', 'live', 'live', 'live']);
    expect([t.get('far-a'), t.get('far-b')]).toEqual(['frozen', 'frozen']);
  });
  it('a selected card stays live even far from the centre', () => {
    const t = assignTiers(six, view, 1, new Set(['far-b']), false);
    expect(t.get('far-b')).toBe('live');
    expect([...t.values()].filter(v => v === 'live')).toHaveLength(4);
    expect(t.get('near-4')).toBe('frozen');
  });
  it('culled stays culled', () => {
    const t = assignTiers([...six, at('away', 3000, 0)], view, 1, new Set(['away']), false);
    expect(t.get('away')).toBe('culled');
  });
  it('gesturing still freezes non-selected cards', () => {
    const t = assignTiers(six, view, 1, new Set(['near-2']), true);
    expect(t.get('near-2')).toBe('live');
    expect(six.filter(c => c.id !== 'near-2').map(c => t.get(c.id))).toEqual(Array(5).fill('frozen'));
  });
  it('image cards do not count against the cap', () => {
    const t = assignTiers([...six.slice(1, 5), at('png', 0, 0, 'image')], view, 1, new Set(), false);
    expect(t.get('png')).toBe('live');
    expect([...t.values()].filter(v => v === 'live')).toHaveLength(5);
  });
  it('below 50 % everything visible is frozen', () => {
    const t = assignTiers(six, view, .4, new Set(['near-1']), false);
    expect([...t.values()].every(v => v === 'frozen')).toBe(true);
  });
  it('maxLive is configurable', () => expect([...assignTiers(six, view, 1, new Set(), false, 2).values()].filter(v => v === 'live')).toHaveLength(2));
});
