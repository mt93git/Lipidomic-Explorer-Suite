// ENTRY-4, scene 4: the quality check warns strongly and never blocks (product owner); the decisions travel to onOpenCanvas (C3).
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { boardSettings, checkModel, excluding, groupPalette, outlierDecisions, rerun, CheckView, type CheckViewProps, type Decisions } from './CheckScreen';
import type { Quality } from '../../api/quality';
const point = (sample: string, pc1: number, pc2: number, distance: number, flagged = false) => ({ sample, group: sample.split('_')[0], pc1, pc2, distance, flagged });
const quality = (flag: boolean): Quality => ({
  pca: [point('Control_1', -2, 0, 1.1), point('Control_2', -2, 1, 1.2), point('Treated_1', 2, 0, 1.0), point('Treated_3', 1, 6, 5.4, flag)],
  limit: 2.9, variance: [58, 21],
  spread: ['Control_1', 'Control_2', 'Treated_1', 'Treated_3'].map(s => ({ sample: s, group: s.split('_')[0], median: 20.1, q1: 18.5, q3: 21.8 })),
  missing: ['Control_1', 'Control_2', 'Treated_1', 'Treated_3'].map((s, i) => ({ sample: s, missing: i * 2, of: 74 })),
});
const settings = { samples: ['Control_1', 'Control_2', 'Treated_1', 'Treated_3'], normalizationMethod: 'median', useImputation: true };
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const markup = (q: Quality, decisions: Decisions = {}, more: Partial<CheckViewProps> = {}) => renderToStaticMarkup(<CheckView quality={q} settings={settings} decisions={decisions} busy={false}
  onKeep={() => {}} onExclude={() => {}} onUndo={() => {}} onOpenCanvas={() => {}} onBack={() => {}} {...more}/>);
const view = (q: Quality, decisions: Decisions = {}, more: Partial<CheckViewProps> = {}) => text(markup(q, decisions, more));

it('no flag and every check in order: Ready for the Canvas', () => {
  const m = checkModel(quality(false), settings, {});
  expect(m.verdict).toBe('ready');
  expect(view(quality(false))).toContain('Ready for the Canvas');
});
it('an undecided flagged sample is a strong warning that names it and says what it means', () => {
  const m = checkModel(quality(true), settings, {});
  expect(m.verdict).toBe('review'); expect(m.undecided.map(p => p.sample)).toEqual(['Treated_3']);
  const out = view(quality(true));
  expect(out).toContain('1 sample to review');
  expect(out).toContain('Treated_3 looks like an outlier');
  expect(out).toContain('Keep Treated_3'); expect(out).toContain('Exclude…');
});
it('Open the Canvas is offered and never disabled while a sample is undecided', () => {
  const html = renderToStaticMarkup(<CheckView quality={quality(true)} settings={settings} decisions={{}} busy={false}
    onKeep={() => {}} onExclude={() => {}} onUndo={() => {}} onOpenCanvas={() => {}} onBack={() => {}}/>);
  expect(html).toMatch(/<button[^>]*class="check-btn primary"[^>]*>Open the Canvas/);
  expect(html).not.toMatch(/disabled[^>]*>Open the Canvas/);
});
it('a kept sample is decided: the verdict is ready and the decision shows with Undo', () => {
  const decisions: Decisions = { Treated_3: { choice: 'keep' } };
  expect(checkModel(quality(true), settings, decisions).verdict).toBe('ready');
  expect(view(quality(true), decisions)).toMatch(/Treated_3 kept .*Undo/);
});
it('the payload carries the decisions with who decided, and the undecided flag', () => {
  expect(outlierDecisions({ Treated_3: { choice: 'exclude', reason: 'failed injection' } }, [], 'u-1'))
    .toEqual([{ sample: 'Treated_3', choice: 'exclude', reason: 'failed injection', by: 'u-1' }]);
  expect(outlierDecisions({ Treated_3: { choice: 'keep' } }, [], 'u-1')).toEqual([{ sample: 'Treated_3', choice: 'keep', by: 'u-1' }]);
  const m = checkModel(quality(true), settings, {});
  expect(outlierDecisions({}, m.undecided, 'u-1')).toEqual([{ sample: 'Treated_3', choice: 'undecided' }]);
});
it('Exclude re-prepares with Team\'s sample decision (outlierTreatments remove) and reads the new quality', async () => {
  const open = vi.fn(async () => ({ status: 'ready' as const, session: { sessionId: 's-2' } }));
  const read = vi.fn(async () => quality(false));
  const result = await rerun({ adminDatasetId: 'd-1', sessionId: 's-1', settings, excluded: ['Treated_3'], open, read });
  expect(open).toHaveBeenCalledWith('d-1', { ...settings, outlierTreatments: { Treated_3: 'remove' } });
  expect(read).toHaveBeenCalledWith('s-2');
  expect(result.session).toEqual({ sessionId: 's-2' });
});
it('Undo of the last exclusion goes back to the first session without preparing again', async () => {
  const open = vi.fn(), read = vi.fn(async () => quality(true));
  const result = await rerun({ adminDatasetId: 'd-1', sessionId: 's-1', settings, excluded: [], open, read });
  expect(open).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledWith('s-1'); expect(result.session).toBeUndefined();
});
it('no normalization is one thing to review, and still opens', () => {
  const m = checkModel(quality(false), { ...settings, normalizationMethod: 'none' }, {});
  expect(m.verdict).toBe('review'); expect(m.scaleOk).toBe(false);
});
it('each check has a chart with Show as table', () => {
  const out = view(quality(true));
  expect(out.match(/Show as table/g)).toHaveLength(3);
  for (const title of ['Samples group as expected', 'Samples are on one scale', 'Missing values are handled']) expect(out).toContain(title);
});
it('the board opens with the decisions, an undecided flag included, on the prepared settings', () => {
  const decisions = [{ sample: 'Treated_3', choice: 'undecided' as const }];
  expect(boardSettings(settings, decisions)).toEqual({ ...settings, outlierDecisions: decisions });
});
it('after an exclusion the board opens with the settings Team prepared the re-run session with, the exclusion as Team\'s outlierTreatments', () => {
  const decisions = [{ sample: 'Treated_3', choice: 'exclude' as const, by: 'u-1' }];
  const session = { dataset: { settings: { ...settings, imputationSeed: 42 } } };
  expect(boardSettings(settings, decisions, session)).toEqual({ ...session.dataset.settings, outlierTreatments: { Treated_3: 'remove' }, outlierDecisions: decisions });
});
// ENTRY-INT-2: one rule for an exclusion (Check's re-run, Check → board, a decision on a board alone), as the sidecar's.
it('an exclusion is Team\'s outlierTreatments remove, with the samples as chosen', () => {
  expect(excluding(settings, ['Treated_3'])).toEqual({ ...settings, outlierTreatments: { Treated_3: 'remove' } });
});
it('no exclusion leaves no outlierTreatments', () => {
  expect(excluding({ ...settings, outlierTreatments: { Treated_3: 'remove' } }, [])).toEqual(settings);
});
it('the confirmed design stays in the board\'s settings after an exclusion (Team\'s re-run settings do not carry it)', () => {
  const design = { unit: 'Animal', type: 'paired', confirmed: true };
  const session = { dataset: { settings: { samples: ['Control_1'], normalizationMethod: 'median' } } };
  expect(boardSettings({ ...settings, design }, [], session)).toEqual({ ...session.dataset.settings, design, outlierDecisions: [] });
});

// UX3-C: Check names the dataset, follows the phone rule (D13) and draws the groups in the session's colours.
it('the check names the dataset it checks', () => {
  expect(view(quality(false), {}, { name: 'ORD041 · v1' })).toContain('Quality check ORD041 · v1');
});
it('on a view-only device the check offers no Keep or Exclude and says to decide on a computer', () => {
  const out = view(quality(true), {}, { readOnly: true });
  expect(out).not.toContain('Keep Treated_3'); expect(out).not.toContain('Exclude…');
  expect(out).toContain('Open this check on a computer to keep or exclude it.');
});
it('the charts draw the groups in the session palette\'s colours', () => {
  const html = markup(quality(true), {}, { palette: { Control: '#E41A1C', Treated: '#377EB8' } });
  expect(html).toContain('fill="#E41A1C"'); expect(html).toContain('fill="#377EB8"');
  expect(html).not.toContain('#2a78d6'); expect(html).not.toContain('#eb6834');
});
it('the session palette\'s group colours are its Group 1 colours, as Team\'s plots take them', () => {
  expect(groupPalette({ active: 'Default', palettes: [], shapesEditable: false, state: { useCustomColors: false, customColors: {}, activePalette: 'Default' },
    contexts: [{ id: 'Group2', label: 'Sample groups (Group 2)', groups: [{ name: 'Control', color: '#4DAF4A' }] },
      { id: 'Group1', label: 'Sample groups (Group 1)', groups: [{ name: 'Control', color: '#E41A1C' }, { name: 'Treated', color: '#377EB8' }] }] }))
    .toEqual({ Control: '#E41A1C', Treated: '#377EB8' });
});
it('the legend lists the data\'s groups only, not every group the session palette names', () => {
  expect(view(quality(false), {}, { palette: { Case: '#4DAF4A', Control: '#E41A1C', Treated: '#377EB8' } })).not.toContain('Case');
});
