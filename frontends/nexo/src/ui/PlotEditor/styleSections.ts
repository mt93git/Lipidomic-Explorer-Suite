// The Style tab's sections (approved layout 2026-11-23), in order. Which ones are open is a browser preference,
// not checkpoint data: kept in localStorage when it can be, Colours only by default.
import { inspectorStrings as is } from '../strings';
import type { IconName } from '../Icon';
export type StyleSectionId = 'colours' | 'text' | 'axes' | 'legend' | 'points' | 'annotations' | 'size' | 'library' | 'colourblind';
export const STYLE_SECTIONS: readonly { id: StyleSectionId; title: string; icon: IconName }[] = [
  { id: 'colours', title: is.colours, icon: 'palette' }, { id: 'text', title: is.text, icon: 'type' }, { id: 'axes', title: is.axes, icon: 'axes' },
  { id: 'legend', title: is.legend, icon: 'legend' }, { id: 'points', title: is.points, icon: 'points' }, { id: 'annotations', title: is.annotations, icon: 'annotate' },
  { id: 'size', title: is.size, icon: 'size' }, { id: 'library', title: is.library, icon: 'library' }, { id: 'colourblind', title: is.colourBlind, icon: 'eye' },
];
const KEY = 'nexo.style.open', DEFAULT: StyleSectionId[] = ['colours'];
const known = (v: unknown): v is StyleSectionId => STYLE_SECTIONS.some(s => s.id === v);
const storage = (): Storage | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };
/** The sections open in this browser (Colours when nothing is stored or storage is blocked). */
export function openSections(from: Storage | undefined = storage()): StyleSectionId[] {
  try { const raw = from?.getItem(KEY); if (raw == null) return [...DEFAULT]; const list = JSON.parse(raw); return Array.isArray(list) ? list.filter(known) : [...DEFAULT]; }
  catch { return [...DEFAULT]; }
}
export function rememberSections(open: readonly StyleSectionId[], to: Storage | undefined = storage()): void {
  try { to?.setItem(KEY, JSON.stringify(open)); } catch { /* private mode: this page only */ }
}
