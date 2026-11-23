// Staging check of the rebuilt Inspector (2026-11-23) at the 320 px panel width: the Export tab's Download figure was an
// empty box (white text on the generic white tabpanel button), and the Style presets were cut to "Tea…" / "Pub…".
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Node } from '../../api';
import { ExportTab } from './ExportTab';
import PlotEditor, { type PlotEditorProps } from '../PlotEditor/PlotEditor';
// The stylesheets as written (Vite's ?raw gives CSS empty under vitest); node:fs by name keeps node types out of tsc.
const read = async (path: string): Promise<string> => { const fsName = 'node:fs'; const { readFileSync } = await import(fsName); return readFileSync(new URL(path, import.meta.url), 'utf8'); };

afterEach(() => vi.unstubAllGlobals());
const noop = () => {};
const node = { kind: 'plot', id: 'pca', label: 'Synthetic PCA', x: 0, y: 0, width: 720, height: 740, visual: {}, instance: { id: 'tcinstance_pca', source: 'results_dashboard-plot_pca', inputs: {} } } as Node;
/** The declarations of every rule whose selector list contains `selector`. */
const rulesFor = (css: string, selector: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].split(',').some(s => s.trim() === selector)).map(m => m[2]);

it('Download figure is a labelled button with the download icon, drawn in accent with paper text', async () => {
  const shell = await read('../shell.css');
  vi.stubGlobal('document', { querySelectorAll: () => [] });
  const html = renderToStaticMarkup(createElement(ExportTab, { node, onStatus: noop }));
  const button = html.match(/<button[^>]*class="[^"]*export-download[^"]*"[^>]*>(.*?)<\/button>/)!;
  expect(button).not.toBeNull();
  expect(button[0]).not.toContain('aria-label');
  expect(button[1]).toContain('icon-download');
  expect(button[1].replace(/<[^>]+>/g, '')).toBe('Download figure');
  // The generic tabpanel button rule (paper background) must not reach it, and its own rule sets both colours.
  const generic = shell.match(/#inspector \[role=tabpanel\] button:not\(\[role=tab\]\)[^{]*\{/)![0];
  expect(generic).toContain(':not(.export-download)');
  const own = rulesFor(shell, '#inspector .export-tab button.export-download').join(';');
  expect(own).toMatch(/background:var\(--accent\)/);
  expect(own).toMatch(/color:var\(--paper\)/);
});

it('the Style presets read Team, Nexo, Publication in full on their own row, with the actions on the next', async () => {
  const editorCss = await read('../PlotEditor/plotEditor.css');
  const figure = { data: [{ type: 'scatter', name: 'A', x: [1], y: [2] }], layout: { xaxis: {}, yaxis: {} } };
  const props: PlotEditorProps = { figure, traces: figure.data, editor: {}, legendGroups: [], onChange: noop, onUndo: noop, onRedo: noop, onReset: noop, onPreset: noop, onTeamView: noop };
  const html = renderToStaticMarkup(createElement(PlotEditor, props));
  const bar = html.slice(html.indexOf('<div class="style-topbar"'), html.indexOf('<p class="style-note"'));
  const presets = bar.match(/<div class="plot-editor-presets"[^>]*>(.*?)<\/div>/)!;
  expect([...presets[1].matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1])).toEqual(['Team', 'Nexo', 'Publication']);
  expect(presets[1]).toContain('title="Team original"');
  // Presets, then a row with Undo / Redo / Reset and "Show as Team draws it".
  expect(bar.indexOf('class="style-topbar-actions"')).toBeGreaterThan(bar.indexOf('class="plot-editor-presets"') + presets[0].length - 1);
  expect(bar).toMatch(/<div class="style-topbar-row">.*aria-label="Undo".*Show as Team draws it/s);
  // No ellipsis or forced single line on the preset buttons.
  const css = rulesFor(editorCss, '.plot-editor .style-topbar .plot-editor-presets button').join(';');
  expect(css).not.toMatch(/text-overflow|nowrap/);
  expect(rulesFor(editorCss, '.plot-editor .style-topbar .plot-editor-presets').join(';')).toMatch(/width:100%/);
});

it('the card name button names the card in full in its tooltip when it is cut', async () => {
  const { Inspector } = await import('./Inspector');
  const { ui } = await import('../model');
  ui({ inspectorOpen: true });
  const handle = { selection: () => ['pca'], onChange: () => noop, getSession: () => ({ sessionId: 's', canvas: { nodes: [node] }, preparation: {} }), figureOf: () => undefined, nexoInputs: () => undefined } as never;
  expect(renderToStaticMarkup(createElement(Inspector, { handle }))).toMatch(/class="inspector-name-button"[^>]*data-tip="Synthetic PCA · Click to rename"/);
});
