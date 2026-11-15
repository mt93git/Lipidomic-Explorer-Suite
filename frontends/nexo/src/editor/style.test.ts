import { beforeEach, expect, it } from 'vitest';
import { validateState } from '../state/validate';
import { styleNodes } from '../state/commands';
import { applyToTabPlan, copyStyle, matchFontsEntries, pasteEntry, readStyleClip, writeStyleClip, type StyleClip } from './style';
import { typographyPatch } from './typography';
import { positionCommands, nextSize, presetWidth } from '../ui/Inspector/cardSize';
const violin = { data: [{ type: 'violin', name: 'A', meta: { teamSourceKey: 'a' } }, { type: 'violin', name: 'B', meta: { teamSourceKey: 'b' } }], layout: {} } as never;
const bars = { data: [{ type: 'bar', name: 'X', meta: { teamSourceKey: 'x' } }], layout: {} } as never;
const editor = { layout: { 'font.size': 14, 'title.text': 'Hi' }, palette: 'Lab', traces: [{ index: 0, sourceKey: 'source:a', color: '#112233' }], annotations: [{ text: 'n', x: 0.5, y: 0.5, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 12, color: '#000000' } }] };
const plot = (id: string, extra: object = {}) => ({ id, kind: 'plot', label: id, x: 0, y: 0, width: 400, height: 300, visual: { background: '#fafafa', editor }, finished: null, ...extra }) as never;
const image = (id: string, extra: object = {}) => ({ id, kind: 'plot', label: id, x: 500, y: 0, width: 300, height: 300, visual: {}, finished: null, ...extra }) as never;
const figures: Record<string, unknown> = { v: violin, v2: violin, b: bars };
const figureOf = (id: string) => figures[id] as never;
beforeEach(() => { const data = new Map<string, string>(); (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear() }; });
it('copy style is off for image cards; a Plotly card keeps editor, size, background and its series keys', () => {
  expect(copyStyle(image('png'), undefined)).toBeNull();
  const clip = copyStyle(plot('v'), violin)!;
  expect(clip).toMatchObject({ width: 400, height: 300, background: '#fafafa', sourceKeys: ['source:a', 'source:b'] });
  expect(clip.editor.traces).toHaveLength(1);
});
it('paste: same series keeps trace patches; another chart type gets layout + palette only; image cards size and background only; finished skipped', () => {
  const clip = copyStyle(plot('v'), violin)!;
  const same = pasteEntry(clip, plot('v2', { visual: {} }), violin)!;
  expect(same.visual).toMatchObject({ background: '#fafafa', editor: { palette: 'Lab', traces: [{ index: 0 }] } });
  const other = pasteEntry(clip, plot('b', { visual: {} }), bars)!;
  expect((other.visual as { editor: { traces: unknown[]; layout: object } }).editor).toMatchObject({ traces: [], palette: 'Lab', layout: { 'font.size': 14 } });
  expect(pasteEntry(clip, image('png', { visual: { background: '#000000' } }), undefined)).toEqual({ id: 'png', width: 400, height: 300, visual: { background: '#fafafa' } });
  expect(pasteEntry(clip, plot('v2', { finished: { url: 'x' } }), violin)).toBeNull();
});
it('apply to tab: counts full, size only and finished skipped, the source excluded; image cards size only', () => {
  const clip = copyStyle(plot('v'), violin)!;
  const plan = applyToTabPlan(clip, 'v', [plot('v'), plot('v2', { visual: {} }), plot('b', { visual: {} }), image('png', { visual: { background: '#000000' } }), plot('done', { finished: { url: 'x' } })], figureOf);
  expect(plan).toMatchObject({ full: 2, sizeOnly: 1, skipped: 1 });
  expect(plan.entries.map(e => e.id)).toEqual(['v2', 'b', 'png']);
  expect(plan.entries[2]).toEqual({ id: 'png', width: 400, height: 300 });
});
it('the clipboard is mirrored to localStorage and survives a reload of the module state', () => {
  const clip = copyStyle(plot('v'), violin)!;
  writeStyleClip(clip);
  expect(JSON.parse(localStorage.getItem('nexo.styleClipboard')!)).toEqual(clip);
  expect(readStyleClip()).toEqual(clip);
  localStorage.setItem('nexo.styleClipboard', '{bad'); expect(readStyleClip(true)).toBeNull();
});
it('round trip: the output of F1-F5 passes validateState', () => {
  const nodes = [plot('v'), plot('v2', { visual: {} }), plot('b', { visual: {} }), image('png')].map(n => ({ ...(n as object), x: (n as { x: number }).x })) as never[];
  let doc = { nodes } as { nodes: never[] };
  const size = nextSize({ width: 400, height: 300 }, { width: presetWidth(89) }, true);
  const clip = copyStyle(plot('v'), violin) as StyleClip;
  const batches = [
    ...positionCommands(doc.nodes, 'v', { x: 12, y: 34 }, 'p'),
    styleNodes('size', [{ id: 'v', ...size }]),
    styleNodes('matchFonts', matchFontsEntries(plot('v'), violin, doc.nodes, figureOf)),
    styleNodes('paste', [pasteEntry(clip, plot('b', { visual: {} }), bars)!, pasteEntry(clip, image('png'), undefined)!]),
    styleNodes('applyToTab', applyToTabPlan(clip, 'v', doc.nodes, figureOf).entries)
  ];
  for (const c of batches) doc = c.apply(doc as never) as never;
  expect(Object.keys(typographyPatch(editor as never, violin)).length).toBe(10);
  const result = validateState(JSON.parse(JSON.stringify({ version: '1', libraryHidden: false, nodes: doc.nodes })));
  expect(result.ok, result.ok ? '' : result.message).toBe(true);
});
it('copy/paste and apply to tab carry the Nexo-only style: whole for the same series, axes/ticks/weights/margins for another chart, none for images; one undo', async () => {
  const { createStore } = await import('../state/store'); const { createHistory } = await import('../state/history'); const { validateNexo } = await import('../state/nexo');
  const nexoStyle = { yaxis: { type: 'log' as const, min: 1 }, titleWeight: 'bold' as const, series: [{ index: 0, lineDash: 'dot' as const }], shapes: [{ type: 'line' as const, x0: 0, x1: 1, y0: 2, y1: 2 }] };
  const clip = copyStyle(plot('v'), violin, nexoStyle)!;
  expect(clip.nexoStyle).toEqual(nexoStyle);
  expect(pasteEntry(clip, plot('v2', { visual: {} }), violin)!.nexoStyle).toEqual(nexoStyle);
  expect(pasteEntry(clip, plot('b', { visual: {} }), bars)!.nexoStyle).toEqual({ yaxis: { type: 'log', min: 1 }, titleWeight: 'bold' });
  expect(pasteEntry(clip, image('png'), undefined)!.nexoStyle).toBeUndefined();
  expect(pasteEntry(copyStyle(plot('v'), violin)!, plot('v2', { visual: {} }), violin)!.nexoStyle).toEqual({});
  const store = createStore({ nodes: [plot('v'), plot('v2', { visual: {} })], nexo: validateNexo({ version: 1, nodes: { v2: { style: { margin: { l: 9 } }, inputs: { a: 1 } } } }) } as never), h = createHistory(store as never);
  h.dispatch(styleNodes('pasteStyle', [pasteEntry(clip, plot('v2', { visual: {} }), violin)!]));
  expect((store.get() as { nexo: { nodes: Record<string, unknown> } }).nexo.nodes.v2).toEqual({ style: validateNexo({ version: 1, nodes: { x: { style: nexoStyle } } }).nodes.x.style, inputs: { a: 1 } });
  h.undo();
  expect((store.get() as { nexo: { nodes: Record<string, unknown> } }).nexo.nodes.v2).toEqual({ style: { margin: { l: 9 } }, inputs: { a: 1 } });
});
