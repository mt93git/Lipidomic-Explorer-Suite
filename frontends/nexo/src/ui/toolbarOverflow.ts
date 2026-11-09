export type OverflowGroup = 'arrange' | 'history' | 'export' | 'add' | 'analysis' | 'figure';
// Team canvas_header.css defines four cumulative fit levels, not four pixel
// breakpoints. Use its 900/600 responsive boundaries plus 720/420 for levels 2/4.
// Width is the canvas header's observed width, not the window width.
// `more` collapses further levels when the tab strip is cut short (H9): never fewer than Team. Two Nexo-only levels
// past Team's four fold Analysis settings and Figure page too, so a narrow header still shows the active tab.
export function overflowGroups(width: number, more = 0): OverflowGroup[] {
  const groups = ['arrange', 'history', 'export', 'add', 'analysis', 'figure'] as const, team = [900, 720, 600, 420].filter(t => width <= t).length;
  return groups.slice(0, Math.min(groups.length, team + Math.max(0, more)));
}
