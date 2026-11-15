// ENTRY-4, scene 4 canvas: the "Prepared by X · settings" chip and, while a flagged sample is undecided, the board's banner.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { initReadOnly, setRoleReadOnly } from '../../state/readonly';
import { BoardNotice, SettingsCard, decideSettings, mayDecide, qualityNote, settingsFacts, undecided, undoChoice } from './BoardNotice';
const base = { samples: ['Control_1', 'Control_2', 'Treated_1', 'Treated_3'], minDetectionPct: 0, detectionScope: 'global', dropNonDetected: true,
  useImputation: true, imputationSeed: 42, normalizationMethod: 'median' };
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const board = (settings: Record<string, unknown>) => text(renderToStaticMarkup(<BoardNotice settings={{ ...base, ...settings }} preparedBy="Ana R."/>));
it('the chip names who prepared the board', () => { expect(board({})).toContain('Prepared by Ana R. · settings'); });
it('the banner shows while a flagged sample is undecided', () => {
  const out = board({ outlierDecisions: [{ sample: 'Treated_3', choice: 'undecided' }] });
  expect(out).toContain('Treated_3 looks like an outlier and is still undecided'); expect(out).toContain('Review');
});
it('no banner once the sample is kept or excluded, or without decisions', () => {
  expect(board({ outlierDecisions: [{ sample: 'Treated_3', choice: 'keep', by: 'u-1' }] })).not.toContain('still undecided');
  expect(board({ outlierDecisions: [{ sample: 'Treated_3', choice: 'exclude', by: 'u-1' }] })).not.toContain('still undecided');
  expect(board({})).not.toContain('still undecided');
});
it('undecided lists the samples nobody decided', () => {
  expect(undecided({ ...base, outlierDecisions: [{ sample: 'A', choice: 'undecided' }, { sample: 'B', choice: 'keep' }] })).toEqual(['A']);
});
it('the quality note says what was decided', () => {
  expect(qualityNote({ ...base, outlierDecisions: [{ sample: 'Treated_3', choice: 'keep', displayName: 'Lee M.' }] })).toBe('Treated_3 flagged, kept by Lee M.');
  expect(qualityNote({ ...base, outlierDecisions: [{ sample: 'Treated_3', choice: 'exclude', reason: 'failed injection', displayName: 'Ana R.' }] })).toBe('Treated_3 excluded by Ana R. · failed injection');
  expect(qualityNote({ ...base, outlierDecisions: [{ sample: 'Treated_3', choice: 'undecided' }] })).toBe('Treated_3 flagged, not decided yet');
  expect(qualityNote(base)).toBe('No outlier risks detected');
});
it('the settings read in words', () => {
  expect(settingsFacts(base)).toEqual([['Samples', '4'], ['Detection', 'No threshold · never-detected lipids left out'], ['Missing values', 'Estimated with QRILC (seed 42)'],
    ['Normalization', 'Median (log scale)'], ['Quality check', 'No outlier risks detected']]);
});
it('the settings card says everyone sees the same prepared data', () => {
  const out = text(renderToStaticMarkup(<SettingsCard settings={base} preparedBy="Ana R." onClose={() => {}}/>));
  expect(out).toContain('Prepared by Ana R.'); expect(out).toContain('Everyone on this board sees the same prepared data.');
});
it('the review card names the undecided sample and what it means', () => {
  const out = text(renderToStaticMarkup(<SettingsCard settings={{ ...base, outlierDecisions: [{ sample: 'Treated_3', choice: 'undecided' }] }} preparedBy="you" onClose={() => {}}/>));
  expect(out).toContain('Treated_3 sits far from the other samples');
});

// ENTRY-8: decide on the board. The card follows meta.origin.settings live (the integrator passes them).
const flagged = { ...base, outlierDecisions: [{ sample: 'Treated_3', choice: 'undecided' }] };
const card = (settings: Record<string, unknown>, more: Partial<Parameters<typeof SettingsCard>[0]> = {}) =>
  renderToStaticMarkup(<SettingsCard settings={{ ...base, ...settings }} preparedBy="Ana R." onClose={() => {}} {...more}/>);
it('people who may decide get Keep and Exclude in the card', () => {
  const out = text(card(flagged, { canDecide: true, onDecide: () => {} }));
  expect(out).toContain('Keep Treated_3'); expect(out).toContain('Exclude…');
});
it('others read the explanation without the buttons', () => {
  const out = text(card(flagged));
  expect(out).toContain('Treated_3 sits far from the other samples');
  expect(out).toContain('Lab staff, or someone allowed to prepare this board, can keep or exclude it.');
  expect(out).not.toContain('Keep Treated_3'); expect(out).not.toContain('Exclude…');
});
it('a decided sample shows who decided and why, with Undo for people who may decide', () => {
  const excluded = { outlierDecisions: [{ sample: 'Treated_3', choice: 'exclude', reason: 'failed injection', by: 'u-1', displayName: 'Ana R.' }] };
  expect(text(card(excluded, { canDecide: true, onDecide: () => {} }))).toMatch(/Treated_3 excluded by Ana R\. · failed injection · Undo/);
  expect(text(card(excluded))).toContain('Treated_3 excluded by Ana R. · failed injection');
  expect(text(card(excluded))).not.toContain('Undo');
});
it('undo of an exclusion keeps the sample; undo of a keep makes it undecided again', () => {
  expect(undoChoice({ sample: 'Treated_3', choice: 'exclude' })).toBe('keep');
  expect(undoChoice({ sample: 'Treated_3', choice: 'keep' })).toBe('undecided');
});
it('a decision taken on the quality check names who prepared the board', () => {
  expect(qualityNote({ ...base, outlierDecisions: [{ sample: 'Treated_3', choice: 'keep', by: 'u-1' }] }, 'Ana R.')).toBe('Treated_3 flagged, kept by Ana R.');
});
it('while Team prepares again the card says so and the buttons wait', () => {
  const html = card(flagged, { canDecide: true, onDecide: () => {}, busy: 'Preparing again with Team…' });
  expect(text(html)).toContain('Preparing again with Team…');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Keep Treated_3/);
});
it('a refused decision is said in the card', () => {
  expect(text(card(flagged, { canDecide: true, onDecide: () => {}, error: 'The decision was not saved: forbidden_role' }))).toContain('The decision was not saved: forbidden_role');
});
it('the board notice takes the project and whether the person may decide', () => {
  expect(text(renderToStaticMarkup(<BoardNotice settings={flagged} preparedBy="Ana R." projectId="p-1" canDecide/>))).toContain('Review');
});
it('the sample count leaves out the samples Team excludes', () => {
  expect(settingsFacts({ ...base, outlierTreatments: { Treated_3: 'remove' } })[0]).toEqual(['Samples', '3']);
});

// ENTRY-INT-2: a board alone (no sidecar, no project) decides through `save`, with the same settings the sidecar writes.
it('someone who may decide gets the buttons on a shared board (its project) or alone (a way to save)', () => {
  expect(mayDecide({ canDecide: true, save: async () => {} })).toBe(true);
  expect(mayDecide({ canDecide: true })).toBe(false);
  expect(mayDecide({ canDecide: true, projectId: 'p-1' })).toBe(true);
});
const by = { by: 'u-1', displayName: 'Ana R.' };
it('keep records the decision as the sidecar does: who, their name and when', () => {
  const next = decideSettings(flagged, { sample: 'Treated_3', choice: 'keep' }, by, 7);
  expect(next).toEqual({ ...base, outlierDecisions: [{ sample: 'Treated_3', choice: 'keep', by: 'u-1', displayName: 'Ana R.', at: 7 }] });
});
it('exclude adds Team\'s outlierTreatments remove and keeps the samples as chosen', () => {
  const next = decideSettings(flagged, { sample: 'Treated_3', choice: 'exclude', reason: 'failed injection' }, by, 7);
  expect(next).toEqual({ ...base, outlierTreatments: { Treated_3: 'remove' },
    outlierDecisions: [{ sample: 'Treated_3', choice: 'exclude', reason: 'failed injection', by: 'u-1', displayName: 'Ana R.', at: 7 }] });
});
it('undo of an exclusion takes the treatment away again', () => {
  const excluded = decideSettings(flagged, { sample: 'Treated_3', choice: 'exclude' }, by, 7);
  expect(decideSettings(excluded, { sample: 'Treated_3', choice: 'keep' }, by, 8).outlierTreatments).toBeUndefined();
});
// FIX-PROD-C 3: a project from before outlierTreatments (C3 until 2026-11-10) excluded a sample by leaving it out of
// `samples`. Including it again must put it back, through the one rule (CheckScreen excluding).
const older = { ...base, samples: ['Control_1', 'Treated_1', 'Treated_3'], outlierDecisions: [{ sample: 'Control_2', choice: 'exclude', by: 'u-0' }] };
it('an old project\'s excluded sample is included again: back in the samples, no treatment', () => {
  const next = decideSettings(older, { sample: 'Control_2', choice: 'keep' }, by, 7);
  expect(next.samples).toEqual(['Control_1', 'Treated_1', 'Treated_3', 'Control_2']);
  expect(next.outlierTreatments).toBeUndefined();
});
it('another decision on an old project keeps its excluded sample out as Team\'s treatment', () => {
  const next = decideSettings(older, { sample: 'Treated_3', choice: 'keep' }, by, 7);
  expect(next.samples).toEqual(['Control_1', 'Treated_1', 'Treated_3', 'Control_2']);
  expect(next.outlierTreatments).toEqual({ Control_2: 'remove' });
  expect(settingsFacts(next)[0]).toEqual(['Samples', '3']);
});

// UX3-B: the sentence for someone who may not decide says why. A phone or a ?mode=view link is the reason, not the person.
afterEach(() => { initReadOnly({ search: '', width: 1440, coarse: false }); setRoleReadOnly(false); });
it('on a view-only phone the card says to open the board on a computer', () => {
  initReadOnly({ search: '', width: 390, coarse: true });
  const out = text(card(flagged));
  expect(out).toContain('Open this board on a computer to keep or exclude it.'); expect(out).not.toContain('Lab staff');
});
it('on a mode=view link the card says to open the board with an edit link', () => {
  initReadOnly({ search: '?mode=view', width: 1440, coarse: false });
  const out = text(card(flagged));
  expect(out).toContain('Open this board with an edit link to keep or exclude it.'); expect(out).not.toContain('Lab staff');
});
it('when the role is the reason the card says who can decide', () => {
  initReadOnly({ search: '', width: 390, coarse: true }); setRoleReadOnly(true);
  expect(text(card(flagged))).toContain('Lab staff, or someone allowed to prepare this board, can keep or exclude it.');
});
