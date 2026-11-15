import { describe, expect, it } from 'vitest';
import { runNeedFor, UNAVAILABLE_INPUTS } from './runNeeds';
// Chart audit b10-longitudinal #1: a new time-course card failed its first render with the API's 422 "The plot inputs are
// unavailable for this session." (red "Could not update") because Team builds time courses only after the module's
// "Generate Analysis". Team Canvas names that step on the card and offers the button (www/team/js/canvas_catalog.js,
// kind 'run', button submit_longitudinal_btn, action 'Generate analysis'); Nexo must too.
// No DOM in this vitest setup: the card wiring is read from source (as cardBodyMessage.test.ts does).
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const cards = readFileSync(new URL('./cards.ts', import.meta.url), 'utf8');

describe('run needs (Team Canvas "Generate analysis")', () => {
  it('names Generate analysis for the five time courses, by node id', () => {
    for (const output of ['macroclass_plot', 'subclass_plot', 'index_plot', 'struct_plot', 'allmetrics_plot']) {
      const need = runNeedFor(`tcinstance_0123456789ab-${output}`, UNAVAILABLE_INPUTS);
      expect(need?.button).toBe('submit_longitudinal_btn');
      expect(need?.action).toBe('Generate analysis');
      expect(need?.status).toBe('Needs Generate Analysis');
    }
  });
  it('only for the module refusal, and not for other plots', () => {
    expect(runNeedFor('tcinstance_0123456789ab-macroclass_plot', 'Request failed (500)')).toBeUndefined();
    expect(runNeedFor('tcinstance_0123456789ab-heatmapPlot', UNAVAILABLE_INPUTS)).toBeUndefined();
  });
  it('the card shows the need with the module button, and reads as waiting, not failed', () => {
    const failed = cards.slice(cards.indexOf('  private renderFailed('), cards.indexOf('  private snapshot('));
    expect(failed).toMatch(/runNeedFor\(this\.node\.id/);
    expect(failed).toMatch(/run-need/);
    expect(failed).toMatch(/updateCard\(this\.session\.sessionId, instance, \{\}, \[need\.button\]\)/);
    expect(cards).toMatch(/confirming:!!this\.body\.querySelector\('\.gc-confirm,\.run-need'\)/);
  });
});

// NEXO-P2 (www/team/js/card_status.js autoRun, Team e83593ee): Remodeling shifts and Species run their structural analysis on
// their own once the comparison is ready, once per card and step. Species' second step ("Load species plot") waits until the
// shift list (selectedDetails) exists. Only structural_tab- cards.
describe('structural steps press themselves', async () => {
  const { autoRunStep, claimAutoRun } = await import('./runNeeds') as unknown as {
    autoRunStep: (source: string, ready: boolean, pressed: readonly string[], inputs: Record<string, unknown>) => string | undefined;
    claimAutoRun: (key: string) => boolean };
  it('Remodeling shifts runs its structural analysis once the comparison is ready', () => {
    expect(autoRunStep('structural_tab-summaryPlot', false, [], {})).toBeUndefined();
    expect(autoRunStep('structural_tab-summaryPlot', true, [], {})).toBe('runAnalysis');
    expect(autoRunStep('structural_tab-summaryPlot', true, ['runAnalysis'], {})).toBeUndefined();
  });
  it('Species loads its plot only once the shift list exists', () => {
    const species = 'structural_tab-speciesPlotPlot';
    expect(autoRunStep(species, true, [], {})).toBe('runAnalysis');
    expect(autoRunStep(species, true, ['runAnalysis'], {})).toBeUndefined();
    expect(autoRunStep(species, true, ['runAnalysis'], { selectedDetails: [] })).toBeUndefined();
    expect(autoRunStep(species, true, ['runAnalysis'], { selectedDetails: ['PC | PC 34:1'] })).toBe('updateSpecies');
    expect(autoRunStep(species, true, ['runAnalysis', 'updateSpecies'], { selectedDetails: ['PC | PC 34:1'] })).toBeUndefined();
  });
  it('only structural_tab- cards press themselves', () => {
    for (const source of ['longitudinal_tab-macroclass_plot', 'structural_grid_tab-dotplotPlot', 'structural_tab-networkPlot'])
      expect(autoRunStep(source, true, [], {}), source).toBeUndefined();
  });
  it('a step is pressed once per card', () => {
    expect(claimAutoRun('s1/tcinstance_0123456789ab|runAnalysis')).toBe(true);
    expect(claimAutoRun('s1/tcinstance_0123456789ab|runAnalysis')).toBe(false);
    expect(claimAutoRun('s1/tcinstance_0123456789ab|updateSpecies')).toBe(true);
  });
  it('the canvas presses the step through the card run action once the design gate is clear', () => {
    const canvas = readFileSync(new URL('./canvas.ts', import.meta.url), 'utf8');
    expect(canvas).toMatch(/autoRunStep\(/);
    expect(canvas).toMatch(/claimAutoRun\(/);
  });
});
