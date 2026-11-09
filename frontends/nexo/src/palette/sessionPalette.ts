// Team's session palette (pilot F1): the data hub's "Colors & palettes" editor. Every group-coloured card takes its
// group colours from the session (R/frontends/api/palette.R), so a change here redraws them all. Nexo sends the
// change; Team's own inputs and observers compute the colours.
import type { Command } from '../state/commands';
import type { CanvasState } from '../state/types';
/** The part of Team's palette state that decides every colour (palette.R api_palette_key). */
export interface PaletteState { useCustomColors: boolean; customColors: Record<string, string>; activePalette: string }
export interface PaletteChoice { name: string; kind: 'default' | 'preset' | 'saved'; colors: string[] }
export interface PaletteGroup { name: string; color: string; shape?: number | null }
export interface PaletteContext { id: string; label: string; groups: PaletteGroup[] }
export interface SessionPalette { active: string; palettes: PaletteChoice[]; contexts: PaletteContext[]; state: PaletteState; shapesEditable: boolean }
/** A preset or saved palette (Use palette), one context's group colours (Apply color changes), or an earlier state. */
export type PaletteChange = { palette: string } | { context: string; colors: Record<string, string> } | { restore: PaletteState };
export const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
/** The PATCH for one group's colour picker; null when nothing changed or the value is not a colour. */
export function groupColourChange(palette: SessionPalette, context: string, group: string, value: string): PaletteChange | null {
  const now = palette.contexts.find(c => c.id === context)?.groups.find(g => g.name === group);
  if (!now || !isHex(value) || value.toUpperCase() === now.color.toUpperCase()) return null;
  return { context, colors: { [group]: value.toUpperCase() } };
}
/** The PATCH for "Use palette": any palette Team lists (using the active one again resets edits made on top, as in Team). */
export function paletteChoiceChange(palette: SessionPalette, name: string): PaletteChange | null {
  return palette.palettes.some(p => p.name === name) ? { palette: name } : null;
}
export const samePalette = (a: PaletteState | undefined, b: PaletteState | undefined) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
function normalize(state: PaletteState | undefined) {
  if (!state) return null;
  return { useCustomColors: !!state.useCustomColors, activePalette: state.activePalette,
    customColors: Object.fromEntries(Object.entries(state.customColors ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, String(v).toUpperCase()])) };
}
/** Only a well-formed state is sent back as a restore. */
export function validatePaletteState(value: unknown): PaletteState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>, colors = v.customColors;
  if (typeof v.useCustomColors !== 'boolean' || typeof v.activePalette !== 'string' || v.activePalette.length > 200) return undefined;
  if (colors !== undefined && (typeof colors !== 'object' || colors === null || Array.isArray(colors))) return undefined;
  const entries = Object.entries((colors ?? {}) as Record<string, unknown>);
  if (entries.length > 5000 || entries.some(([k, c]) => !k || k === '__proto__' || !isHex(c))) return undefined;
  return { useCustomColors: v.useCustomColors, activePalette: v.activePalette, customColors: Object.fromEntries(entries.map(([k, c]) => [k, (c as string).toUpperCase()])) };
}
/** The canvas document holds the session palette last applied (not saved in the canvas: Team saves it in the
 *  checkpoint), so a change is one undo step and undo/redo send the earlier state back. */
export type WithPalette = CanvasState & { sessionPalette?: PaletteState };
export function setSessionPalette(after: PaletteState, before: PaletteState): Command {
  const next = structuredClone(after), previous = structuredClone(before);
  return { kind: 'setSessionPalette',
    apply(doc) { return { ...doc, sessionPalette: structuredClone(next) }; },
    invert(doc) { return setSessionPalette((doc as WithPalette).sessionPalette ?? previous, next); } };
}
