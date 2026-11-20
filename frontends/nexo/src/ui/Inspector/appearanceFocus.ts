// Gerardo 2026-11-19: colours, point borders and shapes live in Appearance, but a click on a plot opens Data.
// Data links straight to the Appearance section that holds them; the Appearance tab opens it and scrolls to it.
export type AppearanceSection = 'Series' | 'Color palette';
let pending: AppearanceSection | null = null;
/** Switch the inspector to Appearance and ask it to open (and scroll to) one section. */
export function openAppearanceSection(section: AppearanceSection) {
  pending = section;
  window.dispatchEvent(new CustomEvent('nexo-inspector-tab', {detail: 'Appearance'}));
}
/** The section a link asked for, if any. Cleared once the Appearance tab has opened it. */
export function pendingAppearanceSection(): AppearanceSection | null { return pending; }
export function clearAppearanceSection() { pending = null; }
/** Open the <details> whose summary reads `section` inside `root` and scroll it into view. False when not drawn yet. */
export function revealSection(root: ParentNode, section: AppearanceSection): boolean {
  const summary = [...root.querySelectorAll('details > summary')].find(s => s.textContent?.trim() === section);
  const details = summary?.parentElement as HTMLDetailsElement | undefined;
  if (!details) return false;
  details.open = true;
  details.scrollIntoView?.({block: 'start'});
  return true;
}
