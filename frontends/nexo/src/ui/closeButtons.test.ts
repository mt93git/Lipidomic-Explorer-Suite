// Chart audit b05 round 2 (small fixes item 2): strings.close ('×') was the accessible name of the Analysis settings close
// button, read as "times". Every icon-only close button keeps its glyph and is named in words.
import { expect, it } from 'vitest';
import { strings } from './strings';
const sources = import.meta.glob<string>('./**/*.tsx', { query: '?raw', import: 'default', eager: true });
it('no accessible name is the × glyph', () => {
  for (const [file, source] of Object.entries(sources)) {
    expect(source, file).not.toMatch(/aria-label=\{s\.close\}|aria-label="×"|aria-label=\{'×'\}/);
    // A button that shows only the glyph has its own aria-label.
    for (const m of source.matchAll(/<button([^>]*)>(?:\{s\.close\}|×)<\/button>/g)) expect(m[1], `${file}: ${m[0].slice(0, 80)}`).toMatch(/aria-label=/);
  }
});
it('Analysis settings close is named "Close Analysis settings"', () => {
  expect(strings.closeAnalysisSettings).toBe('Close Analysis settings');
  expect(sources['./AnalysisSettings.tsx']).toMatch(/aria-label=\{s\.closeAnalysisSettings\}[^>]*>\{s\.close\}<\/button>/);
});
