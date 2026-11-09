import { expect, it } from 'vitest';
import { validateDocument, validateState, serializeTabs } from './validate';
const node = (id: string) => ({ id, label: id, x: 0, y: 0, width: 300, height: 300, visual: {}, finished: null });
const state = (count = 3) => ({ version: '1', libraryHidden: false, nodes: Array.from({ length: count }, (_, i) => node(`plot${i}`)) });
it("41 nodes rejected with Team's message", () => {
  expect(validateState(state(41))).toEqual({ ok: false, message: 'Invalid saved figure workspace.' });
});
it('width 239 rejected', () => {
  const value = state(); value.nodes[0].width = 239;
  expect(validateState(value)).toEqual({ ok: false, message: 'Invalid saved plot settings.' });
});
it('bad finished url rejected', () => {
  const value = { ...state(), nodes: [{ ...node('plot'), finished: { url: 'https://example.org/image.png', createdAt: '2026-01-01T00:00:00Z', stale: false } }] };
  expect(validateState(value)).toEqual({ ok: false, message: 'Invalid saved figure image.' });
});
it('default tabs serialise to null', () => {
  expect(serializeTabs({ version: '1', active: 'tab-1', tabs: [{ id: 'tab-1', name: 'Canvas 1', nodes: ['plot'] }], figure: { deselected: [], order: [] } }, ['plot'])).toBeNull();
  expect(validateState({ ...state(), tabs: { version: 'unknown' } })).toEqual({ ok: true, state: state() });
});
it('a valid 3-node state round-trips unchanged', () => {
  expect(validateState(JSON.parse(JSON.stringify(state())))).toEqual({ ok: true, state: state() });
});
it('document items must remain inside the page', () => {
  expect(validateDocument({ version: '1', layout: 'pages', paper: 'letter', orientation: 'portrait', items: [{ id: 'text', type: 'text', x: 600, y: 0, width: 30, height: 30, z: 0, text: 'Hi', fontSize: 12, color: '#000000' }] }, [])).toEqual({ ok: false, message: 'Invalid saved document layout.' });
});
