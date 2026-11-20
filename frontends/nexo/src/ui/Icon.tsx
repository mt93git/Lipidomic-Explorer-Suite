// One stroke icon set for chevrons and arrows: text glyphs (▾ → ↶) are missing from Nunito Sans and
// fall back to whatever system font has them, so they render with mismatched size, weight and baseline.
const PATHS = {
  down: 'M4.5 6.5 8 10l3.5-3.5', right: 'M6.5 4.5 10 8l-3.5 3.5', left: 'M9.5 4.5 6 8l3.5 3.5',
  'arrow-right': 'M3 8h10M9 4l4 4-4 4', 'arrow-left': 'M13 8H3M7 4 3 8l4 4',
  undo: 'M5.5 3.5 2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7', redo: 'M10.5 3.5l3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3',
} as const;
export type IconName = keyof typeof PATHS;
export function Icon({ name }: { name: IconName }) {
  return <svg className={`icon icon-${name}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d={PATHS[name]}/></svg>;
}
/** The same paths for DOM code outside React (canvas.ts). */
export const iconMarkup = (name: IconName) => `<svg class="icon icon-${name}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${PATHS[name]}"/></svg>`;
