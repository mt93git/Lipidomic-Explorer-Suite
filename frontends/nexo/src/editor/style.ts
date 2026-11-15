// F3/F4/F5 style transfer between cards. Writes only width/height and visual (editor through serializeEditor).
import type { Node, Visual } from '../state/document';
import type { StyleEntry } from '../state/commands';
import { serializeEditor } from './editorState';
import { typographyPatch } from './typography';
import type { Figure } from './applyEditor';
type FigureOf = (id: string) => Figure | undefined;
import type { NexoStyle } from '../state/nexo';
/** Nexo-only style that makes sense on another kind of chart: no per-series patches, no data-anchored marks. */
function portableNexoStyle(style: NexoStyle): NexoStyle {
  const { series: _s, shapes: _sh, annotations: _a, legendOrder: _l, ...rest } = structuredClone(style);
  return rest;
}
const editable = (n: Node, figureOf: FigureOf) => n.kind === 'plot' && !n.finished && !!figureOf(n.id);
/** F3 "Match fonts across tab": the source's typography onto every unfinished Plotly card of the tab. */
export function matchFontsEntries(source: Node, figure: Figure | undefined, tab: readonly Node[], figureOf: FigureOf): StyleEntry[] {
  const patch = typographyPatch(source.visual?.editor, figure);
  return tab.filter(n => editable(n, figureOf)).map(n => {
    const editor = n.id === source.id ? source.visual?.editor : n.visual?.editor;
    return { id: n.id, visual: { ...n.visual, editor: serializeEditor({ ...editor, layout: { ...editor?.layout, ...patch } }) } as Visual };
  });
}
import { sourceKey } from './applyEditor';
import type { Editor } from '../state/document';
import { clampSize } from '../ui/Inspector/cardSize';
/** F4 style clipboard: what Paste style writes. Never the plot's data or inputs. */
export interface StyleClip { sourceId: string; editor: Editor; width: number; height: number; background?: string; sourceKeys: string[]; nexoStyle?: NexoStyle }
const keysOf = (figure: Figure) => figure.data.map(t => sourceKey(t, figure.data)).filter(Boolean).sort();
/** Image cards have nothing to copy but size: copy style is off for them (null). */
export function copyStyle(node: Node, figure: Figure | undefined, nexoStyle?: NexoStyle): StyleClip | null {
  if (!figure || node.kind !== 'plot') return null;
  return { sourceId: node.id, editor: serializeEditor(node.visual?.editor), width: node.width, height: node.height, ...(node.visual?.background ? { background: node.visual.background } : {}), sourceKeys: keysOf(figure), ...(nexoStyle && Object.keys(nexoStyle).length ? { nexoStyle: structuredClone(nexoStyle) } : {}) };
}
/** Plotly target: whole editor; trace patches and category labels only for the same series. Image target: size and background. */
export function pasteEntry(clip: StyleClip, target: Node, figure: Figure | undefined): StyleEntry | null {
  if (target.finished || target.kind !== 'plot') return null;
  const background = clip.background ? { background: clip.background } : {};
  if (!figure) return { id: target.id, width: clip.width, height: clip.height, visual: { ...target.visual, ...background } };
  const same = JSON.stringify(keysOf(figure)) === JSON.stringify(clip.sourceKeys);
  const { traces: _, categoryLabels: __, ...shared } = structuredClone(clip.editor);
  const editor = serializeEditor(same ? clip.editor : { ...shared, traces: [] });
  // The target takes the source's Nexo-only style too (none on the source clears the target's).
  const nexoStyle = clip.nexoStyle ? (same ? structuredClone(clip.nexoStyle) : portableNexoStyle(clip.nexoStyle)) : {};
  return { id: target.id, width: clip.width, height: clip.height, visual: { ...target.visual, ...background, editor }, nexoStyle };
}
/** F5 over the tab: the source excluded, finished cards skipped, image cards size only. */
export function applyToTabPlan(clip: StyleClip, sourceId: string, tab: readonly Node[], figureOf: FigureOf) {
  let full = 0, sizeOnly = 0, skipped = 0; const entries: StyleEntry[] = [];
  for (const n of tab) {
    if (n.id === sourceId || n.kind !== 'plot') continue;
    if (n.finished) { skipped++; continue; }
    const figure = figureOf(n.id);
    if (figure) { const e = pasteEntry(clip, n, figure); if (e) { entries.push(e); full++; } }
    else { entries.push({ id: n.id, width: clip.width, height: clip.height }); sizeOnly++; }
  }
  return { entries, full, sizeOnly, skipped };
}
const STORE_KEY = 'nexo.styleClipboard';
let memory: StyleClip | null = null;
const styleListeners = new Set<() => void>();
/** In memory, mirrored to localStorage for paste in another browser tab. */
export function writeStyleClip(clip: StyleClip) { memory = structuredClone(clip); try { localStorage.setItem(STORE_KEY, JSON.stringify(clip)); } catch { /* private mode */ } styleListeners.forEach(f => f()); }
export function readStyleClip(fromStorage = false): StyleClip | null {
  if (memory && !fromStorage) return memory;
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || typeof raw.sourceId !== 'string' || !Number.isFinite(raw.width) || !Number.isFinite(raw.height) || !Array.isArray(raw.sourceKeys)) return null;
    const size = clampSize({ width: raw.width, height: raw.height });
    return { sourceId: raw.sourceId, editor: serializeEditor(raw.editor), ...size, ...(typeof raw.background === 'string' && /^#[\da-f]{6}$/i.test(raw.background) ? { background: raw.background } : {}), sourceKeys: raw.sourceKeys.filter((k: unknown) => typeof k === 'string') };
  } catch { return null; }
}
export function onStyleClip(f: () => void) { styleListeners.add(f); return () => { styleListeners.delete(f); }; }
