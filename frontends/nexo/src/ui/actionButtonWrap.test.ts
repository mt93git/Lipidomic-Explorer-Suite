import { describe, expect, it } from 'vitest';
// Chart audit b05 (F1): a module action button in the Data tab ("Show Condensed Class Formulas in Statistics Tab",
// heatmap module) kept the global `button{white-space:nowrap}` and the Inspector's fixed 28px height, so its label ran
// 15px past its field at 1440x900 and 1024x768 (audit check 12, spill). An action button must wrap inside its field.
// Read from disk: vitest replaces imported CSS with an empty module. The specifier is a variable so the app's tsc needs no node types.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selectors: m[1].split(',').map(x => x.trim()), body: m[2] }));
describe('module action buttons in the Data tab', () => {
  const body = rules.filter(r => r.selectors.includes('#inspector .schema-form .field-action button')).map(r => r.body).join(';');
  it('wrap a long label inside the field', () => {
    expect(body).toMatch(/white-space:\s*normal/);
    expect(body).toMatch(/max-width:\s*100%/);
  });
  it('grow with the wrapped label instead of the fixed Inspector button height', () => {
    expect(body).toMatch(/height:\s*auto\s*!important/);
  });
});
