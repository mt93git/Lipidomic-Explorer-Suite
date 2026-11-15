import { describe, expect, it } from 'vitest';
// Chart audit b08 (N2): a module dialog (Team's showModal, e.g. the structural grid's "Show Statistic Detail") is opened
// from the Inspector's Data tab and sits inside #inspector [role=tabpanel] in the DOM. The Inspector's button rule
// (ID specificity) gave its "Close" button the paper background while `dialog button.primary` made the text paper too:
// a blank white button. Inspector button rules must leave dialog buttons alone; the console report keeps its lines.
// Read from disk: vitest replaces imported CSS with an empty module. The specifier is a variable so the app's tsc needs no node types.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selectors: m[1].split(',').map(x => x.trim()), body: m[2] }));
describe('module dialog inside the Inspector', () => {
  it('no Inspector tab-panel button rule that sets a background reaches a dialog button', () => {
    const offenders = rules.filter(r => /background/.test(r.body)).flatMap(r => r.selectors)
      .filter(sel => /^#inspector \[role=tabpanel\] button/.test(sel) && !sel.includes(':not(dialog button)'));
    expect(offenders).toEqual([]);
  });
  it('draws the console report in a monospace font even inside the Inspector (#inspector pre sets the UI font)', () => {
    // Specificity: the dialog's <pre> rule must reach it through #inspector too, or `#inspector pre` (shell.css) wins (b08 round 2).
    const pre = rules.find(r => r.selectors.includes('.module-dialog-body pre'));
    expect(pre?.body).toMatch(/font-family:\s*ui-monospace/);
    expect(pre?.selectors).toContain('#inspector .module-dialog-body pre');
  });
  it("keeps the console report's line breaks", () => {
    const pre = rules.find(r => r.selectors.includes('.module-dialog-body pre'));
    expect(pre?.body).toMatch(/white-space:\s*pre-wrap/);
  });
});
