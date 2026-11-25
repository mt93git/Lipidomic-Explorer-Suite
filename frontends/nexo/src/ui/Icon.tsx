// One stroke icon set for chevrons and arrows: text glyphs (▾ → ↶) are missing from Nunito Sans and
// fall back to whatever system font has them, so they render with mismatched size, weight and baseline.
const PATHS = {
  down: 'M4.5 6.5 8 10l3.5-3.5', right: 'M6.5 4.5 10 8l-3.5 3.5', left: 'M9.5 4.5 6 8l3.5 3.5',
  'arrow-right': 'M3 8h10M9 4l4 4-4 4', 'arrow-left': 'M13 8H3M7 4 3 8l4 4',
  undo: 'M5.5 3.5 2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7', redo: 'M10.5 3.5l3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3',
  download: 'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10',
  // Inspector Style sections and its Reset (approved layout 2026-11-23).
  reset: 'M3 8a5 5 0 1 0 1.5-3.5M3 2.5v3h3',
  palette: 'M8 2.5a5.5 5.5 0 1 0 0 11c1 0 1.2-.8.8-1.5s0-1.5 1-1.5h1.2a2.5 2.5 0 0 0 2.5-2.5C13.5 5 11 2.5 8 2.5M5 7h.01M7 5h.01M10 5.5h.01',
  type: 'M3 4V3h10v1M8 3v10M6 13h4', axes: 'M3 2.5v10.5h10.5M3 9.5l3-3 2.5 2 4-4.5', legend: 'M3 4.5h2M7 4.5h6M3 8h2M7 8h6M3 11.5h2M7 11.5h6',
  points: 'M4.5 11.5h.01M7.5 6.5h.01M11 9h.01M12 4h.01', annotate: 'M3 13l2-.5 7.5-7.5-1.5-1.5L3.5 11 3 13M9.5 5l1.5 1.5',
  size: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10', library: 'M3 3h3v10H3zM7 3h3v10H7zM11 3.5l2.5.7-2 8.8-2.4-.6',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
} as const;
export type IconName = keyof typeof PATHS;
export function Icon({ name }: { name: IconName }) {
  return <svg className={`icon icon-${name}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d={PATHS[name]}/></svg>;
}
/** The same paths for DOM code outside React (canvas.ts). */
export const iconMarkup = (name: IconName) => `<svg class="icon icon-${name}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${PATHS[name]}"/></svg>`;
