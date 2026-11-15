// Steph review rows 2/12: the design the author confirmed travels in Nexo's member (nexo-canvas-v1.json) so a reopen
// can offer it; Team's own restore still clears the confirmation, so the reviewer confirms it (one click).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateNexo, withSavedDesign } from './nexo';
import { DesignDialog } from '../ui/Dialogs/DesignDialog';
import { strings as s } from '../ui/strings';
describe('saved study design in Nexo\'s member', () => {
  it('keeps a confirmed {unit, type}, beside the per-node entries', () => {
    const next = withSavedDesign(validateNexo({ version: 1, nodes: { a: { actions: ['runAnalysis'] } } }), { unit: 'Animal', type: 'independent' });
    expect(next).toEqual({ version: 1, nodes: { a: { actions: ['runAnalysis'] } }, design: { unit: 'Animal', type: 'independent' } });
    expect(validateNexo(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it('drops a malformed design and keeps the rest', () => {
    for (const design of [{ unit: 'Animal', type: 'crossover' }, { unit: '', type: 'paired' }, { unit: 'x'.repeat(81), type: 'paired' }, 'Animal', null])
      expect(validateNexo({ version: 1, nodes: {}, design })).toEqual({ version: 1, nodes: {} });
  });
});
describe('Confirm study design on reopen', () => {
  it('opens prefilled with the saved unit and type and says where they come from', () => {
    const html = renderToStaticMarkup(<DesignDialog sessionId="s" saved={{ unit: 'Human', type: 'paired' }} onConfirmed={() => {}} onClose={() => {}}/>);
    expect(html).toMatch(/<option selected="">Human<\/option>/);
    expect(html).toMatch(/<option selected="">paired<\/option>/);
    expect(html).toContain('Saved with this design by the author; confirm to enable differential plots');
    expect(s.designSaved).toBe('Saved with this design by the author; confirm to enable differential plots.');
  });
  it('a saved unit outside the usual list is still offered and selected', () => {
    const html = renderToStaticMarkup(<DesignDialog sessionId="s" saved={{ unit: 'Zebrafish', type: 'independent' }} onConfirmed={() => {}} onClose={() => {}}/>);
    expect(html).toMatch(/<option selected="">Zebrafish<\/option>/);
  });
  it('without a saved design: Team\'s defaults and no note', () => {
    const html = renderToStaticMarkup(<DesignDialog sessionId="s" onConfirmed={() => {}} onClose={() => {}}/>);
    expect(html).toMatch(/<option selected="">Animal<\/option>/);
    expect(html).not.toContain('Saved with this design');
  });
});
