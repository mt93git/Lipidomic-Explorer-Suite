// F6 saved style presets ("My lab style"): Team visual + Nexo style, never data inputs; size only when ticked.
// Per browser (localStorage) in Phase 1; export/import as a small JSON file.
import type { Editor, Node } from '../../state/document';
import type { StyleEntry } from '../../state/commands';
import { sourceKey, type Figure } from '../../editor/applyEditor';
import { serializeEditor } from '../../editor/editorState';
import { pasteEntry, type StyleClip } from '../../editor/style';
import { validateNexoStyle, type NexoStyle } from '../../state/nexo';
import { clampSize } from '../Inspector/cardSize';
export interface SavedStyle { name: string; editor: Editor; nexoStyle?: NexoStyle; background?: string; size?: { width: number; height: number }; sourceKeys?: string[] }
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const KEY = 'nexo.savedStyles.v1', hex = (v: unknown): v is string => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
export function saveStyle(name: string, node: Node, figure: Figure | undefined, nexoStyle: NexoStyle | undefined, includeSize: boolean, editor = node.visual?.editor): SavedStyle {
  const out: SavedStyle = { name: name.trim().slice(0, 80), editor: serializeEditor(editor) };
  const style = validateNexoStyle(nexoStyle); if (Object.keys(style).length) out.nexoStyle = style;
  if (hex(node.visual?.background)) out.background = node.visual!.background;
  if (includeSize) out.size = { width: node.width, height: node.height };
  const keys = figure ? figure.data.map(t => sourceKey(t, figure.data)).filter(Boolean).sort() : [];
  if (keys.length) out.sourceKeys = keys;
  return out;
}
/** One style-batch entry per editable target (finished and non-plot cards skipped); size only if the preset has it. */
export function presetEntries(preset: SavedStyle, targets: readonly Node[], figureOf: (id: string) => Figure | undefined): StyleEntry[] {
  return targets.flatMap(n => {
    const clip: StyleClip = { sourceId: '', editor: preset.editor, width: preset.size?.width ?? n.width, height: preset.size?.height ?? n.height, sourceKeys: preset.sourceKeys ?? [], ...(preset.background ? { background: preset.background } : {}), ...(preset.nexoStyle ? { nexoStyle: preset.nexoStyle } : {}) };
    const e = pasteEntry(clip, n, figureOf(n.id)); if (!e) return [];
    if (!preset.size) { delete e.width; delete e.height; }
    return [e];
  });
}
function validStyle(raw: unknown): SavedStyle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>; if (typeof r.name !== 'string' || !r.name.trim()) return null;
  const out: SavedStyle = { name: r.name.trim().slice(0, 80), editor: serializeEditor(r.editor) };
  const style = validateNexoStyle(r.nexoStyle); if (Object.keys(style).length) out.nexoStyle = style;
  if (hex(r.background)) out.background = r.background;
  const size = r.size as Record<string, unknown> | undefined;
  if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) out.size = clampSize({ width: size.width as number, height: size.height as number });
  if (Array.isArray(r.sourceKeys) && r.sourceKeys.length) out.sourceKeys = r.sourceKeys.filter((k): k is string => typeof k === 'string').slice(0, 100);
  return out;
}
export function parseStyles(text: string): SavedStyle[] {
  try { const v = JSON.parse(text), list = Array.isArray(v) ? v : v?.styles; return Array.isArray(list) ? list.slice(0, 100).map(validStyle).filter((s): s is SavedStyle => !!s) : []; } catch { return []; }
}
export const exportStyles = (styles: readonly SavedStyle[]) => JSON.stringify({ nexoStyles: 1, styles }, null, 2);
export function loadStyles(storage: Storage | undefined = globalThis.localStorage): SavedStyle[] { try { return parseStyles(storage?.getItem(KEY) ?? '[]'); } catch { return []; } }
export function storeStyles(styles: readonly SavedStyle[], storage: Storage | undefined = globalThis.localStorage) { try { storage?.setItem(KEY, JSON.stringify(styles)); } catch { /* private mode: kept for this session only */ } }
