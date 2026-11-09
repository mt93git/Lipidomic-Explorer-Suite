import { describe, expect, it } from 'vitest';
import { strings, phrases, saveLabel } from './strings';
const retired = /workspace|print preview|copy plot|\breturn\b/i;
const sources = { ...import.meta.glob<string>('./**/*.tsx', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>(['../figure/**/*.ts', '!../figure/**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) };
/** Text a user can read: string literals and JSX text, with comments removed. */
function shown(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const literals = code.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  const jsx = [...code.matchAll(/>([^<>{}=;()]*[A-Za-z][^<>{}=;()]*)</g)].map(m => m[1]);
  return [...literals, ...jsx];
}
describe('shell language', () => {
  it('matches all five Team save pill strings', () => {
    expect(saveLabel('ready')).toBe('Autosave ready');
    expect(saveLabel('dirty')).toBe('Unsaved changes · Autosave on');
    expect(saveLabel('saving')).toBe('Saving…');
    expect(saveLabel('saved', '09:07')).toBe('Saved · 09:07');
    expect(saveLabel('readonly')).toBe('View-only access');
  });
  it('has non-empty strings and no retired wording', () => {
    expect(Object.keys(strings).length).toBeGreaterThan(20);
    for (const value of Object.values(strings)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toMatch(retired);
    }
    expect(phrases.deleteNamed('A')).not.toMatch(retired);
  });
  it('shows no retired wording in the shell or figure page source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const hits = Object.entries(sources).flatMap(([f, source]) => shown(source).filter(text => retired.test(text)).map(text => `${f}: ${text}`));
    expect(hits).toEqual([]);
  });
});

// Chart audit b08 round 2: the live schema sends "max": null for Team's numericInput without a max (gridLog2fcThresh).
describe('numberBounds', () => {
  it('treats a null bound as absent', () => {
    expect(phrases.numberBounds(0, null)).toBe('Enter a number of at least 0.');
    expect(phrases.numberBounds(null, 5)).toBe('Enter a number of at most 5.');
    expect(phrases.numberBounds(null, null)).toBe('Enter a number.');
    expect(phrases.numberBounds(0, 1)).toBe('Enter a number from 0 to 1.');
  });
});
