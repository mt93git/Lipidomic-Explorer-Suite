// A saved trace's fillColor colours the violin and lineColor/lineWidth its line; the inner box follows the violin's fill,
// two 15% steps darker, with an outline 60% darker (Team's plot_editor.js after the analyst's box rule). Synthetic groups.
import { expect, it } from 'vitest';
import { applyEditor, sourceKey, type Figure } from './applyEditor';
const figure: Figure = { data: [
  { type: 'violin', name: 'Alpha', x: ['Alpha', 'Alpha'], y: [1, 2], fillcolor: '#1f77b4', line: { color: '#1f77b4' }, box: { visible: true, fillcolor: '#1f77b4', line: { color: '#0b2a40' } } },
  { type: 'violin', name: 'Beta', x: ['Beta', 'Beta'], y: [2, 3], fillcolor: '#d62728', line: { color: '#d62728' }, box: { visible: true, fillcolor: '#d62728', line: { color: '#4f0e0e' } } },
], layout: {} };
const trace = { index: 1, sourceKey: sourceKey(figure.data[1], figure.data), fillColor: '#e5bdd0', fillOpacity: 1, lineColor: '#b691a3', lineWidth: 2 };

it('a saved trace colours the violin and its inner box follows the fill, two shades darker, as Team', () => {
  const out = applyEditor(figure, { traces: [trace] } as never).data[1];
  expect(out.fillcolor).toBe('rgba(229,189,208,1)');
  expect(out.line).toEqual({ color: '#b691a3', width: 2 });
  expect(out.box).toEqual({ visible: true, fillcolor: '#a08492', line: { color: '#5c4c53' } });
});
