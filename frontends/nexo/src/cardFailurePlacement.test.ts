import { describe, expect, it } from 'vitest';
// A card's failure message (Team's wording, with its actions) sits at the top of the card body, under the header,
// so it is on screen whenever the header is: a 1000x1100 card centred it ~550 px down (heatmap "Significant only").
// The card element carries no native title: its tooltip followed the pointer over the header's status badge.
// Read from disk: vitest replaces imported CSS with an empty module (as tokens.test.ts).
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./ui/shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const cards = readFileSync(new URL('./cards.ts', import.meta.url), 'utf8');
// The last rule for a selector wins: collect every declaration block for it in order.
const declarations = (selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(m => m[1].split(',').map(s => s.trim()).includes(selector)).map(m => m[2]).join(';');
const last = (block: string, prop: string) => [...block.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))].pop()?.[1].trim();
describe('card failure message placement', () => {
  const block = declarations('.card .body.message');
  it('finds the message rule', () => { expect(block.length).toBeGreaterThan(20); });
  it('is laid out from the top left of the body, not centred (a wide card centred it off screen too)', () => {
    expect(last(block, 'align-content')).toBe('start');
    expect(last(block, 'place-items')).toBe('start');
    expect(last(block, 'justify-content')).toBe('start');
    expect(last(block, 'text-align')).toBe('left');
  });
});
describe('card title tooltip', () => {
  const update = cards.slice(cards.indexOf('  updateTitle() {'), cards.indexOf('  updateTitle() {') + 600);
  it('is anchored to the title text: the title keeps its tooltip, the card element has none', () => {
    expect(update).toMatch(/this\.title\.title = this\.node\.label/);
    expect(update).not.toMatch(/this\.el\.title = /);
  });
  it('the title is only as wide as its text, so empty header space shows no title tooltip', () => {
    expect(last(declarations('.card header .card-title'), 'flex')).toBe('0 1 auto');
  });
});
