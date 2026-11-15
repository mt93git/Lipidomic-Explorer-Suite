import { describe, expect, it } from 'vitest';
// Chart audit b05 (F3): Analysis settings (a <dialog>) mounts its own Toast. `dialog button` gives every button inside a
// dialog the paper background while `.toast button` makes the text paper: "Analysis settings applied" showed two blank
// white buttons (Undo, Close) — `b05-heatmaps/filteredHeatmapPlot-4-de-settings.png`. A toast inside a dialog keeps
// the toast's own button look.
// Read from disk: vitest replaces imported CSS with an empty module. The specifier is a variable so the app's tsc needs no node types.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selectors: m[1].split(',').map(x => x.trim()), body: m[2] }));
const bodyOf = (sel: string) => rules.filter(r => r.selectors.includes(sel)).map(r => r.body).join(';');
describe('toast buttons inside a dialog', () => {
  it('are not painted with the dialog button paper background', () => {
    expect(bodyOf('dialog .toast button')).toMatch(/background:\s*transparent/);
    expect(bodyOf('dialog .toast button')).toMatch(/border:\s*0/);
  });
  it('hover like a toast button, not like a dialog button (outranks dialog button:hover:not(:disabled))', () => {
    expect(bodyOf('dialog .toast button:hover:not(:disabled)')).toMatch(/background:\s*var\(--accent\)/);
  });
});
