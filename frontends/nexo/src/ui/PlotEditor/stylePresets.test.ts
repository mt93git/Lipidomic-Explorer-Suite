import { describe, expect, it } from 'vitest';
import { exportStyles, loadStyles, parseStyles, presetEntries, saveStyle, storeStyles } from './stylePresets';
import type { Node } from '../../state/document';
const fig = { data: [{ type: 'scatter', name: 'A', x: [1], y: [2] }], layout: {} };
const node = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'plot', x: 0, y: 0, width: 400, height: 300, label: id, instance: { source: 's', inputs: { secret: 1 } }, visual: { background: '#fafafa', editor: { layout: { 'font.size': 14 }, traces: [] } }, ...extra }) as unknown as Node;
describe('F6 saved style presets', () => {
  it('saves style only: never data inputs, size only when asked', () => {
    const s = saveStyle('Lab', node('a'), fig, { titleWeight: 'bold' }, false);
    expect(JSON.stringify(s)).not.toContain('secret');
    expect(s).toMatchObject({ name: 'Lab', editor: { layout: { 'font.size': 14 } }, nexoStyle: { titleWeight: 'bold' }, background: '#fafafa' });
    expect(s.size).toBeUndefined();
    expect(saveStyle('Lab', node('a'), fig, undefined, true).size).toEqual({ width: 400, height: 300 });
  });
  it('apply writes visual and Nexo style, keeps target size unless the preset has one', () => {
    const s = saveStyle('Lab', node('a'), fig, { titleWeight: 'bold' }, false);
    const target = node('b', { width: 600, height: 500, visual: {} });
    const [e] = presetEntries(s, [target], () => fig);
    expect(e).toMatchObject({ id: 'b', visual: { editor: { layout: { 'font.size': 14 } }, background: '#fafafa' }, nexoStyle: { titleWeight: 'bold' } });
    expect(e.width).toBeUndefined(); expect(e.height).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain('instance');
    const sized = saveStyle('L2', node('a'), fig, undefined, true);
    expect(presetEntries(sized, [target], () => fig)[0]).toMatchObject({ width: 400, height: 300 });
  });
  it('skips finished cards; image cards get size/background only', () => {
    const s = saveStyle('Lab', node('a'), fig, undefined, false);
    expect(presetEntries(s, [node('f', { finished: true }), node('img')], id => id === 'img' ? undefined : fig)).toEqual([{ id: 'img', visual: { background: '#fafafa', editor: { layout: { 'font.size': 14 }, traces: [] } } }]);
  });
  it('round-trips through JSON export/import and storage, dropping junk', () => {
    const s = saveStyle('Lab', node('a'), fig, { margin: { l: 10 } }, true);
    expect(parseStyles(exportStyles([s]))).toEqual([s]);
    expect(parseStyles('{"nexoStyles":1,"styles":[{"name":""},{"name":"x","editor":{"layout":{"font.size":999}}}]}')).toEqual([{ name: 'x', editor: { layout: {}, traces: [] } }]);
    expect(parseStyles('nope')).toEqual([]);
    const mem = new Map<string, string>(), storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    storeStyles([s], storage); expect(loadStyles(storage)).toEqual([s]);
    expect(loadStyles({ getItem: () => { throw new Error('private'); }, setItem: () => {} })).toEqual([]);
  });
});
