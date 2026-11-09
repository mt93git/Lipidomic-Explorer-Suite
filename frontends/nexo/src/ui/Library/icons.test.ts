import { describe, expect, it } from 'vitest';
import catalog from '../../mock/catalog.json';
import { iconFor, GENERIC_ICON } from './icons';
// The sprite is read from disk: vitest replaces raw imports of assets with empty modules.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const sprite = readFileSync(new URL('./icons.svg', import.meta.url), 'utf8');
const symbols = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
describe('library icons', () => {
  it('every catalog plot has a chart-type symbol that exists in the sprite', () => {
    for (const entry of catalog.outputs) expect(symbols.has(iconFor(entry)), entry.id).toBe(true);
  });
  it('an unknown plot falls back to its family glyph, then to a generic plot glyph', () => {
    expect(iconFor({ id: 'new_family-new_plot', group: 'Heatmaps' })).toBe('nx-heatmap');
    expect(iconFor({ id: 'new_family-new_plot', group: 'Something new' })).toBe(GENERIC_ICON);
    expect(symbols.has(GENERIC_ICON)).toBe(true);
  });
  it('the sprite is static drawing only', () => {
    expect(sprite).not.toMatch(/<script|\son[a-z]+=|href="(?!#)|javascript:/i);
  });
});
