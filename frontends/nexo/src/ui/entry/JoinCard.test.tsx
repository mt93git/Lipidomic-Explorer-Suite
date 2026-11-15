// ENTRY-INT step 4: a joiner's board loads behind the join card (prototype scene 3 "joiner"): who prepared it, with what.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { JoinCard } from './JoinCard';
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const settings = { samples: ['Control_1', 'Treated_3'], minDetectionPct: 0, normalizationMethod: 'median', useImputation: true,
  outlierDecisions: [{ sample: 'Treated_3', choice: 'keep', by: 'u-1' }] };
it('names who prepared the board and its settings while it opens', () => {
  const out = text(renderToStaticMarkup(<JoinCard settings={settings} preparedBy="Ana Synthetic"/>));
  expect(out).toContain('Prepared by Ana Synthetic · settings');
  expect(out).toContain('Nothing to prepare. You are joining the board Ana Synthetic prepared.');
  expect(out).toContain('Quality check Treated_3 flagged, kept');
  expect(out).toContain('Opening the shared board…');
});
