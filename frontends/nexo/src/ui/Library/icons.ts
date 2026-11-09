import map from './icons-map.json';
import sprite from './icons.svg?raw';
// Chart-type glyphs for the plot library (Fable's set, docs/integration/nexo-canvas-redesign/icons*.{svg,json}).
// Decoration only: the plot's name is always shown and the icon is aria-hidden.
export const GENERIC_ICON = 'nx-bar';
export { sprite };
const outputs: Record<string, string> = map.outputs, families: Record<string, string> = map.families;
/** The symbol for a catalog entry: its own chart type, else its family glyph, else a generic plot. */
export function iconFor(entry: { id: string; group: string }): string { return outputs[entry.id] ?? families[entry.group] ?? GENERIC_ICON; }
