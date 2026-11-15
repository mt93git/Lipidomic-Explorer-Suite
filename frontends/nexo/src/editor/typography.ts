// F3 Typography: one family, a base size and a scale per element, all in the editor's allow-listed layout keys.
import type { EditorLayout } from '../state/document';
import { FONTS } from './editorState';
import { readPath, type Figure } from './applyEditor';
export const ELEMENTS = { title: ['title.font.size'], axisTitles: ['xaxis.title.font.size', 'yaxis.title.font.size'], ticks: ['xaxis.tickfont.size', 'yaxis.tickfont.size'], legend: ['legend.font.size'] } as const;
export type Element = keyof typeof ELEMENTS;
export const DEFAULT_SCALE: Record<Element, number> = { title: 1.4, axisTitles: 1.15, ticks: 1, legend: 1 };
const FAMILY_KEYS = ['font.family', 'title.font.family', 'legend.font.family'] as const;
const size = (v: number) => Math.max(6, Math.min(72, Math.round(v)));
type Layout = Record<string, unknown>;
const read = (editor: { layout?: EditorLayout | null } | undefined, figure: Figure | undefined, key: string): unknown => (editor?.layout as Layout | undefined)?.[key] ?? readPath(figure?.layout, key);
export function typographyOf(editor: { layout?: EditorLayout | null } | undefined, figure?: Figure) {
  const family = read(editor, figure, 'font.family'), rawBase = Number(read(editor, figure, 'font.size'));
  const base = Number.isFinite(rawBase) && rawBase > 0 ? size(rawBase) : 12;
  const sizes = Object.fromEntries((Object.keys(ELEMENTS) as Element[]).map(e => {
    const v = Number(read(editor, figure, ELEMENTS[e][0]));
    return [e, Number.isFinite(v) && v > 0 ? size(v) : size(base * DEFAULT_SCALE[e])];
  })) as Record<Element, number>;
  return { family: (FONTS as readonly string[]).includes(family as string) ? family as string : 'Arial', base, sizes };
}
export const setElementPatch = (element: Element, value: number): EditorLayout => Object.fromEntries(ELEMENTS[element].map(k => [k, size(value)])) as EditorLayout;
/** A new base keeps each element's current proportion to the old base. */
export function setBasePatch(editor: { layout?: EditorLayout | null } | undefined, figure: Figure | undefined, base: number): EditorLayout {
  const t = typographyOf(editor, figure), next = size(base);
  return Object.assign({ 'font.size': next }, ...(Object.keys(ELEMENTS) as Element[]).map(e => setElementPatch(e, next * t.sizes[e] / t.base)));
}
export const resetScalePatch = (base: number): EditorLayout => Object.assign({}, ...(Object.keys(ELEMENTS) as Element[]).map(e => setElementPatch(e, base * DEFAULT_SCALE[e])));
export const familyPatch = (family: string): EditorLayout => (FONTS as readonly string[]).includes(family) ? Object.fromEntries(FAMILY_KEYS.map(k => [k, family])) as EditorLayout : {};
/** "Match fonts across tab": the card's whole typography as one layout patch. */
export function typographyPatch(editor: { layout?: EditorLayout | null } | undefined, figure?: Figure): EditorLayout {
  const t = typographyOf(editor, figure);
  return { ...familyPatch(t.family), 'font.size': t.base, ...Object.assign({}, ...(Object.keys(ELEMENTS) as Element[]).map(e => setElementPatch(e, t.sizes[e]))) };
}
