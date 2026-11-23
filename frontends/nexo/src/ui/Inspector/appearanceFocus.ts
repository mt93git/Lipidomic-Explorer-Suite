// A link elsewhere in Nexo can open one Style section: the Inspector switches to Style, which opens it and scrolls to it.
import type { StyleSectionId } from '../PlotEditor/styleSections';
export type AppearanceSection = StyleSectionId;
let pending: AppearanceSection | null = null;
/** Switch the inspector to Style and ask it to open (and scroll to) one section. */
export function openAppearanceSection(section: AppearanceSection) {
  pending = section;
  window.dispatchEvent(new CustomEvent('nexo-inspector-tab', {detail: 'Style'}));
}
/** The section a link asked for, if any. Cleared once the Style tab has opened it. */
export function pendingAppearanceSection(): AppearanceSection | null { return pending; }
export function clearAppearanceSection() { pending = null; }
/** Open the Style section `section` inside `root` and scroll it into view. False when not drawn yet. */
export function revealSection(root: ParentNode, section: AppearanceSection): boolean {
  const details = root.querySelector<HTMLDetailsElement>(`details.style-section[data-section="${section}"]`);
  if (!details) return false;
  details.open = true;
  details.scrollIntoView?.({block: 'start'});
  return true;
}
