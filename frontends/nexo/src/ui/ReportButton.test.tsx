import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReportButton, startReport } from './ReportButton';
import { strings as s } from './strings';
describe('Export report button', () => {
  it('is a labelled toolbar button with the download icon', () => {
    const html = renderToStaticMarkup(createElement(ReportButton, { onExport: async () => {} }));
    expect(s.exportReport).toBe('Export report');
    expect(html).toMatch(/^<button type="button" class="report-export"[^>]*><svg class="icon icon-download"[^>]*>.*<\/svg>Export report<\/button>$/);
    expect(renderToStaticMarkup(createElement(ReportButton, { onExport: async () => {}, disabled: true }))).toContain('disabled=""');
  });
  it('one click runs the report export, busy while it builds', async () => {
    const busy: boolean[] = [], run = vi.fn(async () => { busy.push(true); }), fail = vi.fn();
    await startReport(run, b => busy.push(b), fail);
    expect(run).toHaveBeenCalledTimes(1); expect(busy).toEqual([true, true, false]); expect(fail).not.toHaveBeenCalled();
  });
  it('says so when the export fails, and is no longer busy', async () => {
    const error = new Error('synthetic failure'), busy: boolean[] = [], fail = vi.fn();
    await startReport(async () => { throw error; }, b => busy.push(b), fail);
    expect(fail).toHaveBeenCalledWith(s.failReport, error); expect(busy).toEqual([true, false]);
    expect(s.failReport).toBe('export the report');
  });
});
describe('canvas toolbar', () => {
  it('shows Export report next to Figure page, outside the Export menu', async () => {
    const { Toolbar } = await import('./Toolbar');
    const html = renderToStaticMarkup(createElement(Toolbar, { onAnalysis: () => {}, onSave: () => {}, onDownload: () => {}, onShortcuts: () => {}, report: { projectName: 'Synthetic board A' } }));
    const figure = html.indexOf(s.figure), report = html.indexOf('>Export report</button>'), menu = html.indexOf(s.pagePdf);
    expect(figure).toBeGreaterThan(-1); expect(report).toBeGreaterThan(figure);
    expect(menu === -1 || report < menu).toBe(true);
  });
});
const exported = vi.hoisted(() => [] as unknown[][]);
vi.mock('../figure/exportPage', async original => ({ ...await original<object>(), exportReport: async (...args: unknown[]) => { exported.push(args); } }));
describe('toolbar report export', () => {
  it('exports the canvas as a report titled with the board name and the dataset counts', async () => {
    const [{ exportCanvasReport }, { tabsBridges }] = await Promise.all([import('./reportExport'), import('../canvas/handle')]);
    const nodes = [{ id: 'a', kind: 'plot', label: 'A', x: 0, y: 0, width: 300, height: 300 }];
    const handle = { getSession: () => ({ canvas: { nodes } }) } as never;
    tabsBridges.set(handle, { document: () => ({ document: null }) } as never);
    await exportCanvasReport(handle, { projectName: 'Synthetic board A', samples: 6, lipids: 120 });
    expect(exported).toHaveLength(1);
    expect(exported[0][1]).toBe(nodes); expect(exported[0][2]).toEqual({ title: 'Synthetic board A', samples: 6, lipids: 120 });
    await exportCanvasReport(handle, { projectName: s.project, datasetName: 'ORD000 · v1' });
    expect((exported[1][2] as { title: string }).title).toBe('ORD000 · v1');
    await exportCanvasReport(null, {}); expect(exported).toHaveLength(2);
  });
});
