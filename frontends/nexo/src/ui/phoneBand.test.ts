import { describe, expect, it } from 'vitest';
// UX review 3, group E (scene 7): on a phone the status band cut "You can comment" to "You ca…" and the undecided-sample
// banner to "Treated_3 looks like …". Under 600 px the band wraps instead: its text is never cut, and the banner's Review
// stays a 32 px target. Read from disk: vitest replaces imported CSS with an empty module (as phoneChrome.test.ts).
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const notice = readFileSync(new URL('./entry/BoardNotice.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The rules of every `@media(max-width:600px)` block, with where each sits in shell.css. */
function phoneRules() {
  const rules: { selectors: string[]; body: string; at: number }[] = [];
  for (const m of css.matchAll(/@media\s*\(\s*max-width\s*:\s*600px\s*\)\s*\{/g)) {
    let depth = 1, j = m.index! + m[0].length; const start = j;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    for (const r of css.slice(start, j - 1).matchAll(/([^{}]+)\{([^}]*)\}/g)) rules.push({ selectors: r[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')), body: r[2], at: start + r.index! });
  }
  return rules;
}
const has = (body: string, prop: string, value: string) => new RegExp(`(^|;)\\s*${prop}\\s*:\\s*${value}\\s*(;|$)`).test(body);
const rules = phoneRules();
const rule = (selector: string) => rules.filter(r => r.selectors.includes(selector));
const lastBandHeight = Math.max(...[...css.matchAll(/(^|\})\s*\.status-band\s*\{[^}]*height\s*:/g)].map(m => m.index!));

describe('phone status band (under 600 px)', () => {
  it('the band wraps onto more lines, after the rules that fix its height', () => {
    const band = rule('.status-band').filter(r => r.at > lastBandHeight);
    expect(band.some(r => has(r.body, 'flex-wrap', 'wrap') && has(r.body, 'height', 'auto'))).toBe(true);
  });
  it('the role sentence wraps instead of being cut', () => {
    expect(rule('.status-band span').some(r => has(r.body, 'white-space', 'normal') && has(r.body, 'overflow', 'visible'))).toBe(true);
  });
  it('the banner wraps instead of being cut (beats BoardNotice.css .status-band .notice-banner>span)', () => {
    expect(rule('.status-band .board-notice .notice-banner>span').some(r => has(r.body, 'white-space', 'normal'))).toBe(true);
  });
  it('the banner Review is a 32 px target', () => {
    expect(rule('.status-band .notice-link').some(r => has(r.body, 'min-height', '32px'))).toBe(true);
  });
  // FIX-JOINER-PHONE: the commenter saw "You can comment" without "32 lipids · 3 samples" before it, as desktop shows.
  it('the dataset summary stays in the band (no stylesheet hides it)', () => {
    for (const sheet of [css, notice]) for (const r of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      if (r[1].split(',').some(s => s.trim().replace(/\s+/g, ' ') === '.status-band .dataset-summary')) expect(has(r[2], 'display', 'none'), r[0]).toBe(false);
  });
});
