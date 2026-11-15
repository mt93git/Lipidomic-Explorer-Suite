import { describe, expect, it } from 'vitest';
// Chart audit b02 round 2 (#10 phone view, 375 px): chrome text is at least 12 px on phones. A rule in shell.css that
// sets a literal font-size under 12 px must be raised in a max-width:480px or 600px block (to var(--font-label), 12 px there,
// tokens.css, or to a literal >= 12 px). The audit found the top bar's "LE" logo at 11 px.
// Read from disk: vitest replaces imported CSS with an empty module. The specifier is a variable so the app's tsc needs no node types.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');

/** Top-level rules (outside any @media/@container block) and the bodies of each `@media(max-width:480px|600px)` block (both apply at 375 px). */
function split(text: string, offset = 0) {
  // `at`: where the rule sits in shell.css; an override must come after the rule it raises (same specificity)
  const top: { selectors: string[]; body: string; at: number }[] = [], phone: { text: string; at: number }[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i); if (open < 0) break;
    const head = text.slice(i, open).trim();
    if (head.startsWith('@')) {
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      if (/^@media\s*\(\s*max-width\s*:\s*(480|600)px\s*\)$/.test(head)) phone.push({ text: text.slice(open + 1, j - 1), at: offset + open + 1 });
      i = j; continue;
    }
    const close = text.indexOf('}', open);
    top.push({ selectors: head.split(',').map(s => s.trim().replace(/\s+/g, ' ')), body: text.slice(open + 1, close), at: offset + open });
    i = close + 1;
  }
  return { top, phone };
}
const px = (body: string) => { const m = body.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/); return m ? Number(m[1]) : null; };
const labelOnPhone = Number(tokens.match(/@media\s*\(max-width:480px\)\s*\{[^}]*--font-label:\s*(\d+)px/)?.[1]);

describe('phone chrome text (375 px)', () => {
  it('--font-label is 12 px on phones', () => { expect(labelOnPhone).toBeGreaterThanOrEqual(12); });
  const { top, phone } = split(css);
  const rules = phone.flatMap(block => split(block.text, block.at).top);
  // font-size 0 with a ::before glyph of >= 12 px: the text is replaced by an icon (.records-warning, shell.css:410)
  const icon = (sel: string) => rules.some(r => r.selectors.includes(`${sel}::before`) && (px(r.body) ?? 0) >= 12);
  const raised = (after: number) => rules.filter(r => r.at > after).flatMap(r => r.selectors.filter(sel => /font-size\s*:\s*var\(--font-label\)/.test(r.body) || (px(r.body) ?? 0) >= 12 || (/font-size\s*:\s*0\s*[;}]?/.test(r.body + ';') && icon(sel))));
  const smallRules = top.filter(r => { const v = px(r.body); return v !== null && v > 0 && v < 12; });
  const small = smallRules.flatMap(r => r.selectors);
  const lastAt = (sel: string) => Math.max(...smallRules.filter(r => r.selectors.includes(sel)).map(r => r.at));
  it('finds the small chrome rules it checks', () => { expect(small).toContain('.topbar .logo'); });
  it.each(small)('%s is raised to >= 12 px on phones, after its own rule', sel => { expect(raised(lastAt(sel))).toContain(sel); });
});
