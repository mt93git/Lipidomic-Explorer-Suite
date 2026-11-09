import { resizeNode, setGeometry, type Command } from '../../state/commands';
import { settle } from '../../canvas/settle';
import type { Box } from '../../canvas/types';
export type Size = { width: number; height: number };
// The canvas limits a drag resize uses (canvas.ts): 240-4000 wide, 220-4000 high.
export const sizeLimits = { minWidth: 240, minHeight: 220, max: 4000 };
const clamp = (v: number, min: number) => Math.max(min, Math.min(sizeLimits.max, Number.isFinite(v) ? Math.round(v) : min));
/** A size as the Inspector shows it: a drag resize can leave fractions (422.5, 498.333…), the field shows whole px. */
export const sizeText = (v: number) => String(Math.round(v));
export const clampSize = (s: Size): Size => ({ width: clamp(s.width, sizeLimits.minWidth), height: clamp(s.height, sizeLimits.minHeight) });
/** One side typed (clamped first); with the aspect locked the other follows, then is clamped too. */
export function nextSize(current: Size, change: Partial<Size>, locked: boolean): Size {
  const ratio = current.height / current.width;
  if (change.width !== undefined) { const width = clamp(change.width, sizeLimits.minWidth); return clampSize({ width, height: locked ? width * ratio : current.height }); }
  if (change.height !== undefined) { const height = clamp(change.height, sizeLimits.minHeight); return clampSize({ width: locked ? height / ratio : current.width, height }); }
  return clampSize(current);
}
export const sizePresets = [{ label: 'Single column', mm: 89 }, { label: '1.5 column', mm: 120 }, { label: 'Double column', mm: 183 }] as const;
/** Journal column width in px at 96 px per inch. */
export const presetWidth = (mm: number) => Math.round(mm / 25.4 * 96);
/** The resize and the neighbour pushes of a drag resize; dispatch folded into one undo step. */
export function sizeCommands(nodes: Box[], id: string, size: Size, key: string): Command[] {
  const resized = nodes.map(n => n.id === id ? { ...n, ...size } : n);
  return [resizeNode(id, size.width, size.height, key), ...settle(resized, [id]).map(m => {
    const n = resized.find(n => n.id === m.id)!;
    return setGeometry(m.id, { x: m.x, y: m.y, width: n.width, height: n.height }, key);
  })];
}
// F1/F2 Size & position: units, journal chips from the export presets, exact X/Y.
export type Unit = 'mm' | 'px';
/** Shown value of a px length: mm at 96 px per inch (1 decimal), or whole px. */
export const toUnit = (px: number, unit: Unit) => unit === 'mm' ? Math.round(px * 25.4 / 96 * 10) / 10 : Math.round(px);
export const fromUnit = (value: number, unit: Unit) => unit === 'mm' ? presetWidth(value) : Math.round(value);
export const px300 = (px: number) => Math.round(px / 96 * 300);
export const ratioText = (width: number, height: number) => `${Math.round(width / height * 100) / 100} : 1`;
export interface JournalChip { label: string; mm: number; px: number; disabled: boolean; reason?: string }
type PresetRow = { key: string; name: string; single_col_mm: number; double_col_mm: number };
/** Single and double column of every journal preset (not the user-defined one). */
export function journalChips(presets: { presets: readonly PresetRow[] }): JournalChip[] {
  const minMm = Math.floor(toUnit(sizeLimits.minWidth, 'mm'));
  return presets.presets.filter(p => p.key !== 'custom').flatMap(p => [[p.single_col_mm, '1-col'], [p.double_col_mm, '2-col']].map(([mm, col]) => {
    const px = presetWidth(mm as number), disabled = px < sizeLimits.minWidth;
    return { label: `${p.name.split(/\s*\//)[0]} ${col}`, mm: mm as number, px, disabled, ...(disabled ? { reason: `Below Team's 240 px card minimum (${minMm} mm). Set ${mm} mm in Export instead.` } : {}) };
  }));
}
/** ↑/↓ in a size or position field: ±1, Shift ±10; null when the key or the text is not a step. */
export function stepField(text: string, key: string, shift: boolean): string | null {
  const n = Number(text); if ((key !== 'ArrowUp' && key !== 'ArrowDown') || text.trim() === '' || !Number.isFinite(n)) return null;
  return String(Math.round((n + (key === 'ArrowUp' ? 1 : -1) * (shift ? 10 : 1)) * 10) / 10);
}
const clampPos = (v: number) => Math.max(0, Math.min(1e6, Number.isFinite(v) ? Math.round(v) : 0));
/** Exact X/Y as a drag move: the node moved, then neighbours settled; dispatch folded into one undo step. */
export function positionCommands(nodes: Box[], id: string, pos: { x: number; y: number }, key: string): Command[] {
  const at = { x: clampPos(pos.x), y: clampPos(pos.y) }, moved = nodes.map(n => n.id === id ? { ...n, ...at } : n), n = moved.find(n => n.id === id)!;
  return [setGeometry(id, { x: at.x, y: at.y, width: n.width, height: n.height }, key), ...settle(moved, [id]).map(m => {
    const o = moved.find(o => o.id === m.id)!;
    return setGeometry(m.id, { x: m.x, y: m.y, width: o.width, height: o.height }, key);
  })];
}
