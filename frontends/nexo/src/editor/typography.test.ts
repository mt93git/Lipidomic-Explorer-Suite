import { expect, it } from 'vitest';
import { serializeEditor } from './editorState';
import { familyPatch, resetScalePatch, setBasePatch, setElementPatch, typographyOf, typographyPatch } from './typography';
const figure = { data: [{ type: 'violin' }], layout: { font: { size: 12 } } } as never;
it('reads base, family and per-element size; unset elements follow the default scale', () => {
  const t = typographyOf({}, figure);
  expect(t).toMatchObject({ family: 'Arial', base: 12 });
  expect(t.sizes).toEqual({ title: 17, axisTitles: 14, ticks: 12, legend: 12 });
});
it('editing the base rescales all four proportionally; editing one element breaks the proportion for it only', () => {
  const one = setElementPatch('title', 24);
  expect(one).toEqual({ 'title.font.size': 24 });
  const editor = { layout: { 'font.size': 12, ...one } };
  const patch = setBasePatch(editor, figure, 6);
  expect(patch).toEqual({ 'font.size': 6, 'title.font.size': 12, 'xaxis.title.font.size': 7, 'yaxis.title.font.size': 7, 'xaxis.tickfont.size': 6, 'yaxis.tickfont.size': 6, 'legend.font.size': 6 });
  expect(setElementPatch('axisTitles', 100)).toEqual({ 'xaxis.title.font.size': 72, 'yaxis.title.font.size': 72 });
});
it('reset scale restores the default proportion; family sets the three family keys from the 8 names', () => {
  expect(resetScalePatch(10)).toEqual({ 'title.font.size': 14, 'xaxis.title.font.size': 12, 'yaxis.title.font.size': 12, 'xaxis.tickfont.size': 10, 'yaxis.tickfont.size': 10, 'legend.font.size': 10 });
  expect(familyPatch('Georgia')).toEqual({ 'font.family': 'Georgia', 'title.font.family': 'Georgia', 'legend.font.family': 'Georgia' });
  expect(familyPatch('Comic Sans')).toEqual({});
});
it('match fonts across tab: the full typography of one card, every key survives serializeEditor', () => {
  const patch = typographyPatch({ layout: { 'font.family': 'Verdana', 'font.size': 10 } }, figure);
  expect(Object.keys(patch).sort()).toEqual(['font.family', 'font.size', 'legend.font.family', 'legend.font.size', 'title.font.family', 'title.font.size', 'xaxis.tickfont.size', 'xaxis.title.font.size', 'yaxis.tickfont.size', 'yaxis.title.font.size']);
  expect(serializeEditor({ layout: patch }).layout).toEqual(patch);
});
