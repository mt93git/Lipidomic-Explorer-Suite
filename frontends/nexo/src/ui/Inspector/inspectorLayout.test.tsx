// The approved Inspector layout (2026-11-23): a sticky header with the card name and a status pill, the tabs
// Data · Style · Stats · Export (Stats only where a card has statistics), the Style sections in one order with only
// Colours open, one Reset for the card, and every control of the old inspector still reachable. Synthetic data only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CanvasHandle } from '../../canvas/handle';
import type { Node } from '../../api';
import { Inspector } from './Inspector';
import { AppearanceTab } from './AppearanceTab';
import { DataTab } from './DataTab';
import { StatisticsTab } from './StatisticsTab';
import { GroupComparisonView } from './GroupComparisonSection';
import { ExportTab, DataFiles } from './ExportTab';
import { schemaCache } from './schemaCache';
import { hasStatistics, normaliseTab, pillState, tabsFor } from './inspectorTabs';
import { ui } from '../model';
import PlotEditor, { type PlotEditorProps } from '../PlotEditor/PlotEditor';
import { AnnotationAddMenu } from '../PlotEditor/Annotations';
import { STYLE_SECTIONS, openSections, rememberSections } from '../PlotEditor/styleSections';
import { confirmedMessage } from '../../groupComparison/fixture';

const noop = () => {};
const plot = (id: string, source: string | undefined, extra: Partial<Node> = {}): Node => ({ kind: 'plot', id, label: `Synthetic ${id}`, x: 0, y: 0, width: 440, height: 330, visual: {},
  instance: source ? { id: `tcinstance_${id}`, source, inputs: {} } : null, ...extra } as Node);
const scatter = { data: [{ type: 'scatter', name: 'Control', legendgroup: 'Control', x: [1, 2, 3], y: [2, 3, 4], mode: 'markers' }, { type: 'scatter', name: 'Case', legendgroup: 'Case', x: [1, 2, 3], y: [3, 1, 2], mode: 'lines+markers' }], layout: { xaxis: {}, yaxis: {} } };
const heatmap = { data: [{ type: 'heatmap', z: [[1, 2], [3, 4]], colorscale: [[0, '#0000ff'], [.5, '#ffffff'], [1, '#ff0000']], showlegend: false }], layout: { xaxis: {}, yaxis: {} } };
function fakeHandle(nodes: Node[], figures: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return { selection: () => [nodes[0].id], onChange: () => noop, getSession: () => ({ sessionId: 'synthetic-session', canvas: { nodes }, preparation: {} }),
    figureOf: (id: string) => figures[id], nexoStyle: () => ({}), isTeamView: () => false, tabNodeIds: (id: string) => [id], nexoInputs: () => undefined,
    cardShown: () => undefined, ...extra } as unknown as CanvasHandle;
}
const inspector = (nodes: Node[], figures: Record<string, unknown> = {}) => { ui({ inspectorOpen: true }); return renderToStaticMarkup(createElement(Inspector, { handle: fakeHandle(nodes, figures) })); };
const tabsOf = (html: string) => [...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map(m => m[1]);
const sectionsOf = (html: string) => [...html.matchAll(/<details class="style-section"([^>]*)>/g)].map(m => ({ id: /data-section="([^"]+)"/.exec(m[1])![1], open: m[1].includes('open=""') }));
const styleOf = (node: Node, figure?: unknown, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(AppearanceTab, { node, handle: fakeHandle([node], figure ? { [node.id]: figure } : {}, extra) }));
const editorProps = (figure: typeof scatter | typeof heatmap): PlotEditorProps => ({ figure, traces: figure.data as never, editor: {}, legendGroups: [...new Set(figure.data.map(t => (t as { legendgroup?: string }).legendgroup).filter(Boolean))] as string[],
  onChange: noop, onUndo: noop, onRedo: noop, onReset: noop, onPreset: noop, nexoStyle: {}, onNexoStyle: noop, teamView: false, onTeamView: noop });

afterEach(() => { vi.unstubAllGlobals(); schemaCache.clear(); });

describe('header', () => {
  it('is sticky and shows the card name (click to rename) and a status pill; Figure details is gone', () => {
    const html = inspector([plot('violin', 'results_dashboard-plot_violin')]);
    expect(html).toMatch(/<div class="inspector-sticky">.*<header class="inspector-head">.*role="tablist".*<\/div><div role="tabpanel"/s);
    expect(html).toMatch(/<h2 class="inspector-name"><button type="button" class="inspector-name-button"[^>]*aria-label="Rename Synthetic violin"[^>]*>Synthetic violin<\/button><\/h2>/);
    expect(html).toMatch(/<p role="status" class="status-pill" data-state="ok">Up to date<\/p>/);
    for (const gone of ['Figure details', '>Tier<', 'Finished figure.']) expect(html).not.toContain(gone);
  });
  it('colours the pill by state', () => {
    expect(pillState('Up to date')).toBe('ok');
    expect(pillState('Updating…')).toBe('updating');
    expect(pillState('Changes pending')).toBe('pending');
    expect(pillState('Needs data')).toBe('waiting');
    expect(pillState('Needs settings')).toBe('waiting');
    expect(pillState('Update failed')).toBe('error');
    expect(pillState('Finished')).toBe('finished');
    expect(pillState('Finished · out of date')).toBe('stale');
  });
});

describe('tabs per card', () => {
  it('Stats only on cards with statistics; illustrations get Style and Export; a finished plot Export only', () => {
    const names = (node: Node) => tabsFor(node);
    expect(names(plot('pca', 'results_dashboard-plot_pca'))).toEqual(['Data', 'Style', 'Stats', 'Export']);
    expect(names(plot('score', 'results_dashboard-plot_pcascore'))).toEqual(['Data', 'Style', 'Stats', 'Export']);
    expect(names(plot('gc', 'group_comparison-plot'))).toEqual(['Data', 'Style', 'Stats', 'Export']);
    expect(names(plot('results_dashboard-plot_violin', undefined))).toEqual(['Data', 'Style', 'Stats', 'Export']);
    expect(names(plot('heat', 'results_dashboard-plot_heat'))).toEqual(['Data', 'Style', 'Export']);
    expect(names(plot('volcano', 'differential-volcanoPlot'))).toEqual(['Data', 'Style', 'Export']);
    expect(names({ ...plot('art', undefined), kind: 'illustration' })).toEqual(['Style', 'Export']);
    expect(names(plot('done', 'results_dashboard-plot_pca', { finished: { url: 'data:x', createdAt: '', stale: false } }))).toEqual(['Export']);
    expect(hasStatistics(plot('heat', 'results_dashboard-plot_heat'))).toBe(false);
  });
  it('the old tab names still select the new tabs', () => {
    expect(normaliseTab('Appearance')).toBe('Style');
    expect(normaliseTab('Statistics')).toBe('Stats');
    expect(normaliseTab('Data')).toBe('Data');
  });
  it('the inspector draws the tabs of the card', () => {
    expect(tabsOf(inspector([plot('pca', 'results_dashboard-plot_pca')]))).toEqual(['Data', 'Style', 'Stats', 'Export']);
    expect(tabsOf(inspector([plot('heat', 'results_dashboard-plot_heat')]))).toEqual(['Data', 'Style', 'Export']);
  });
});

describe('Style tab', () => {
  it('has the sections in the approved order, only Colours open, one Reset for the card and the preset bar on top', () => {
    const html = styleOf(plot('scatter', 'differential-volcanoPlot'), scatter);
    expect(sectionsOf(html)).toEqual(['colours', 'text', 'axes', 'legend', 'points', 'annotations', 'size', 'library', 'colourblind'].map(id => ({ id, open: id === 'colours' })));
    for (const title of ['Colours', 'Text', 'Axes and grid', 'Legend', 'Points and series', 'Annotations', 'Size and layout', 'Style library', 'Colour-blind check']) expect(html).toContain(`<span class="style-section-title">${title}</span>`);
    expect(html.match(/aria-label="Reset presentation"/g)).toHaveLength(1);
    expect(html).not.toContain('Reset Nexo style');
    const bar = html.slice(html.indexOf('<div class="style-topbar"'), html.indexOf('<details class="style-section"'));
    for (const text of ['Team original', 'Nexo', 'Publication', 'aria-label="Undo"', 'aria-label="Redo"', 'aria-label="Reset presentation"', 'Show as Team draws it', 'Presentation changes only']) expect(bar).toContain(text);
    // The name is edited in the header now: no Label field here, no Figure details.
    expect(html).not.toMatch(/>Label<input/);
    // Backgrounds: the card's, the page's and the plot's, together under Colours.
    const colours = html.slice(html.indexOf('data-section="colours"'), html.indexOf('data-section="text"'));
    for (const text of ['Colour palette', 'Healthy in grey', 'Backgrounds', 'Card background', 'Page background', 'Plot background']) expect(colours).toContain(text);
    expect(colours).not.toContain('Heat scale presets');
    // Legend order moved from Series style to Legend; line dash to Points and series.
    const legend = html.slice(html.indexOf('data-section="legend"'), html.indexOf('data-section="points"'));
    for (const text of ['Legend order', 'Legend position', 'Show legend']) expect(legend).toContain(text);
    expect(html.slice(html.indexOf('data-section="points"'), html.indexOf('data-section="annotations"'))).toContain('Line dash');
    const size = html.slice(html.indexOf('data-section="size"'), html.indexOf('data-section="library"'));
    for (const text of ['Width', 'Height', 'Margin left', 'Change orientation']) expect(size).toContain(text);
    const library = html.slice(html.indexOf('data-section="library"'), html.indexOf('data-section="colourblind"'));
    for (const text of ['Copy style', 'Paste style', 'Apply to tab…', 'Save current style']) expect(library).toContain(text);
  }, 30_000);
  it('hides what cannot act: Legend without a legend, heat presets off heatmaps, orientation when unsupported', () => {
    const html = renderToStaticMarkup(createElement(PlotEditor, editorProps(heatmap)));
    expect(sectionsOf(html).map(s => s.id)).not.toContain('legend');
    expect(html.slice(html.indexOf('data-section="colours"'), html.indexOf('data-section="text"'))).toContain('Heat scale presets');
    const pie = { data: [{ type: 'pie', labels: ['A', 'B'], values: [1, 2] }], layout: {} };
    expect(renderToStaticMarkup(createElement(PlotEditor, { ...editorProps(scatter), figure: pie, traces: pie.data as never }))).not.toContain('Change orientation');
  });
  it('an image (PNG) card shows Size and layout, its background, the colour-blind check and a short note', () => {
    const html = styleOf(plot('png', 'qc-boxplotAfterNorm'));
    expect(sectionsOf(html).map(s => s.id)).toEqual(['colours', 'size', 'library', 'colourblind']);
    expect(html).toContain('Card background');
    expect(html).toContain('class="style-note"');
    expect(html).not.toContain('Page background');
  });
  it('remembers which sections are open per browser, Colours by default', () => {
    expect(openSections(undefined)).toEqual(['colours']);
    const stored: Record<string, string> = {}, storage = { getItem: (k: string) => stored[k] ?? null, setItem: (k: string, v: string) => { stored[k] = v; } } as Storage;
    rememberSections(['text', 'legend'], storage);
    expect(openSections(storage)).toEqual(['text', 'legend']);
    expect(openSections({ getItem: () => { throw new Error('blocked'); } } as unknown as Storage)).toEqual(['colours']);
    expect(STYLE_SECTIONS.map(s => s.id)).toEqual(['colours', 'text', 'axes', 'legend', 'points', 'annotations', 'size', 'library', 'colourblind']);
  });
});

describe('Data tab', () => {
  it('has Plotted data, Groups with the session-colours link, and Advanced (closed) for file uploads', () => {
    const node = plot('pathway', 'pathway-pathwayPlot');
    schemaCache.set('synthetic-session/tcinstance_pathway', { controls: [{ id: 'threshold', type: 'number', label: 'Threshold', value: 1, min: 0, max: 5 }], actions: [], tabs: {}, sessionPalette: true,
      uploads: [{ id: 'upload_config', label: 'Upload Layout JSON (.json):', accept: '.json' }] });
    const html = renderToStaticMarkup(createElement(DataTab, { node, handle: fakeHandle([node]), onStatus: noop }));
    const plotted = html.indexOf('<h3>Plotted data</h3>'), groups = html.indexOf('<h3>Groups</h3>'), advanced = html.indexOf('<details class="inspector-advanced"><summary>Advanced</summary>');
    expect(plotted).toBeGreaterThanOrEqual(0); expect(groups).toBeGreaterThan(plotted); expect(advanced).toBeGreaterThan(groups);
    expect(html.slice(plotted, groups)).toContain('Threshold');
    expect(html.slice(groups, advanced)).toContain('>Edit session colours</button>');
    expect(html.slice(advanced)).toContain('Upload Layout JSON');
    expect(html).not.toContain('Appearance ›');
  });
});

describe('Stats tab', () => {
  const headings = (html: string) => [...html.matchAll(/<h3 class="stats-heading">([^<]+)<\/h3>/g)].map(m => m[1]);
  it('violin statistics read Test, Show on plot, Results, with no inline styles', () => {
    const node = plot('results_dashboard-plot_violin', undefined);
    const html = renderToStaticMarkup(createElement(StatisticsTab, { node, handle: fakeHandle([node]) }));
    expect(headings(html)).toEqual(['Test', 'Show on plot', 'Results']);
    expect(html).not.toContain('style=');
  });
  it('PCA score fits the same headings', () => {
    const node = plot('pca', 'results_dashboard-plot_pca');
    schemaCache.set('synthetic-session/tcinstance_pca', { controls: [{ id: 'pcs_pc', type: 'select', label: 'Principal component', value: 'PC1', options: [{ value: 'PC1', label: 'PC1' }] }], actions: [], tabs: {} });
    expect(headings(renderToStaticMarkup(createElement(StatisticsTab, { node, handle: fakeHandle([node]) })))).toEqual(['Test', 'Show on plot', 'Results']);
  });
  it('group comparison fits the same headings, with no inline styles', () => {
    const node = plot('gc', 'group_comparison-plot');
    const html = renderToStaticMarkup(createElement(GroupComparisonView, { node, handle: fakeHandle([node]), message: confirmedMessage }));
    expect(headings(html)).toEqual(['Test', 'Show on plot', 'Results']);
    expect(html).not.toContain('style=');
  });
});

describe('Export tab', () => {
  it('one Download figure button after PNG / SVG / PDF chips and the size line; Copy figure JSON and more options under More', () => {
    vi.stubGlobal('document', { querySelectorAll: () => [] });
    const html = renderToStaticMarkup(createElement(ExportTab, { node: plot('volcano', 'differential-volcanoPlot'), onStatus: noop }));
    expect(html.match(/>Download figure<\/button>/g)).toHaveLength(1);
    for (const chip of ['PNG', 'SVG', 'PDF']) expect(html).toMatch(new RegExp(`role="radio"[^>]*>${chip}</button>`));
    expect(html).toContain('class="export-size"');
    expect(html).not.toContain('Download PNG');
    expect(html).toMatch(/<details class="inspector-more"><summary>More<\/summary>.*More export options…/s);
  });
  it('lists the module downloads under Data files', () => {
    const html = renderToStaticMarkup(createElement(DataFiles, { downloads: [{ id: 'csv', label: 'Plot data (CSV)' }], busy: false, onDownload: noop }));
    expect(html).toMatch(/<h3>Data files<\/h3><ul class="export-files"[^>]*>.*Plot data \(CSV\)/s);
  });
});

describe('coverage', () => {
  it('every control of the old inspector is still reachable', () => {
    const node = plot('scatter', 'differential-volcanoPlot');
    const style = styleOf(node, scatter) + renderToStaticMarkup(createElement(PlotEditor, editorProps(heatmap))) + renderToStaticMarkup(createElement(AnnotationAddMenu, { open: true, onAdd: noop }));
    const controls = ['Undo', 'Redo', 'Reset presentation', 'Change orientation', 'Team original', 'Nexo', 'Publication', 'Show as Team draws it', 'Colour palette', 'Healthy in grey',
      'Card background', 'Page background', 'Plot background', 'Heat scale presets', 'Heatmap scale', 'Font family', 'Base size', 'Tick labels', 'Axis titles', 'Match fonts across tab', 'Reset scale',
      'Plot title', 'Title weight', 'Axis title weight', 'Legend weight', 'x Scale', 'x Minimum', 'y Maximum', 'x Tick format', 'y Tick spacing', 'x Tick count', 'Vertical grid lines',
      'Horizontal grid lines', 'X = 0 reference line', 'Legend presets', 'Top Left', 'Bottom Right', 'Show legend', 'Legend order', 'Conditions', 'Group outlines', 'Show all series',
      'Show series', 'Series label', 'Line dash 1', 'Text annotation', 'Arrow annotation', 'Reference line', 'Shaded band', 'Width', 'Height', 'Margin left', 'Margin padding',
      'Copy style', 'Paste style', 'Apply to tab…', 'Saved styles', 'Save current style', 'Import JSON', 'Colour-blind check', 'Deuteranopia'];
    for (const label of controls) expect(style, label).toContain(label);
    const header = renderToStaticMarkup(createElement(Inspector, { handle: fakeHandle([node]) }));
    for (const label of ['Duplicate', 'Finish plot', 'More plot actions', 'Rename Synthetic scatter']) expect(header, label).toContain(label);
    vi.stubGlobal('document', { querySelectorAll: () => [{ dataset: { id: 'scatter' }, querySelector: (sel: string) => sel === '.js-plotly-plot' ? {} : null }] });
    vi.stubGlobal('window', {});
    const exports = renderToStaticMarkup(createElement(ExportTab, { node, onStatus: noop }));
    for (const label of ['Download figure', 'Copy figure JSON', 'More export options…']) expect(exports, label).toContain(label);
  }, 30_000);
});
