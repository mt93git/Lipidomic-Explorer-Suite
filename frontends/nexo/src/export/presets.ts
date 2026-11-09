// Pure rules of Team's Export studio (R/modules/99_export_studio_module.R) for the Nexo Export dialog.
export type FigureKey = 'pca_2d' | 'volcano' | 'class_abundance' | 'heatmap';
export type ExportFormat = 'pdf' | 'svg' | 'png' | 'tiff' | 'csv' | 'rscript';
export type FontKey = 'sans' | 'serif' | 'mono';
export interface JournalPreset {
  key: string; name: string; publisher: string; single_col_mm: number; mid_col_mm: number; double_col_mm: number; max_height_mm: number;
  target_font_pt: number; min_font_pt: number; max_font_pt: number; recommended_dpi: number; font_family: string;
}
export interface ExportPresets {
  version: string; presets: JournalPreset[]; figures: { key: FigureKey; title: string }[]; formats: ExportFormat[];
  fonts: { key: FontKey; title: string }[]; dpi: number[];
  limits: { widthMm: [number, number] | number[]; heightMm: [number, number] | number[]; basePt: [number, number] | number[] }; svgAvailable: boolean;
}
export interface ExportForm {
  figureKey: FigureKey; preset: string; widthMm: number; heightMm: number; dpi: number; basePt: number; fontFamily: FontKey; hybridMode: boolean; formats: ExportFormat[];
}
export type ExportRequest = ExportForm;
const ORDER: ExportFormat[] = ['pdf', 'svg', 'png', 'tiff', 'csv', 'rscript'];
const ordered = (formats: Iterable<ExportFormat>) => { const set = new Set(formats); return ORDER.filter(f => set.has(f)); };
/** Team: the reproduction script always ships with its CSV; SVG only when the server has svglite. */
function normalize(formats: Iterable<ExportFormat>, p: ExportPresets): ExportFormat[] {
  const set = new Set(formats);
  if (set.has('rscript')) set.add('csv');
  if (!p.svgAvailable) set.delete('svg');
  return ordered(set);
}
/** Team's Export studio defaults (Nature, single column, 1:1, 7.5 pt, 600 DPI, every format). */
export function defaultForm(p: ExportPresets): ExportForm {
  return { figureKey: 'pca_2d', preset: 'nature', widthMm: 89, heightMm: 89, dpi: 600, basePt: 7.5, fontFamily: 'sans', hybridMode: true, formats: normalize(ORDER, p) };
}
/** Choosing a journal sets width to its single column, height = width, base font to its target; custom keeps values. */
export function applyPreset(form: ExportForm, p: ExportPresets, key: string): ExportForm {
  if (key === 'custom') return { ...form, preset: key };
  const spec = p.presets.find(x => x.key === key);
  if (!spec) return form;
  return { ...form, preset: key, widthMm: spec.single_col_mm, heightMm: spec.single_col_mm, basePt: spec.target_font_pt };
}
const within = (value: number, [lo, hi]: number[]) => Number.isFinite(value) && value >= lo && value <= hi;
const clampTo = (value: number, [lo, hi]: number[], fallback: number) => Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
export function clampForm(form: ExportForm, p: ExportPresets): ExportForm {
  const d = defaultForm(p);
  return { ...form, widthMm: clampTo(form.widthMm, p.limits.widthMm, d.widthMm), heightMm: clampTo(form.heightMm, p.limits.heightMm, d.heightMm),
    basePt: clampTo(form.basePt, p.limits.basePt, d.basePt), dpi: p.dpi.includes(form.dpi) ? form.dpi : d.dpi };
}
const list = (values: number[]) => values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
/** Messages for fields the server would reject (400), in form order. */
export function validateForm(form: ExportForm, p: ExportPresets): string[] {
  const errors: string[] = [], { widthMm: w, heightMm: h, basePt: b } = p.limits;
  if (!within(form.widthMm, w)) errors.push(`Width must be between ${w[0]} and ${w[1]} mm.`);
  if (!within(form.heightMm, h)) errors.push(`Height must be between ${h[0]} and ${h[1]} mm.`);
  if (!within(form.basePt, b)) errors.push(`Base font must be between ${b[0]} and ${b[1]} pt.`);
  if (!p.dpi.includes(form.dpi)) errors.push(`Resolution must be ${list(p.dpi)} DPI.`);
  if (!normalize(form.formats, p).length) errors.push('Choose at least one format.');
  return errors;
}
export const mmToInches = (mm: number) => mm / 25.4;
export const mmToPx = (mm: number, dpi: number) => Math.round(mmToInches(mm) * dpi);
/** Plotly export size: CSS pixels at 96 DPI and a scale, so the file has the physical size without resizing the card. */
export function imageSize(widthMm: number, heightMm: number, dpi: number) {
  const px = { width: mmToPx(widthMm, dpi), height: mmToPx(heightMm, dpi) }, scale = dpi / 96;
  // A hair over the exact pixel count, so a renderer that truncates width × scale still lands on it.
  return { width: (px.width + 1e-3) / scale, height: (px.height + 1e-3) / scale, scale, px };
}
/** Check or uncheck one bundle format; CSV stays while R script is on. */
export function setFormat(formats: ExportFormat[], format: ExportFormat, on: boolean, p: ExportPresets): ExportFormat[] {
  const set = new Set(formats);
  if (on) set.add(format); else if (!(format === 'csv' && set.has('rscript'))) set.delete(format);
  return normalize(set, p);
}
/** Body of POST /sessions/{id}/export. */
export function exportRequest(form: ExportForm, p: ExportPresets): ExportRequest {
  const { figureKey, preset, widthMm, heightMm, dpi, basePt, fontFamily, hybridMode } = form;
  return { figureKey, preset, widthMm, heightMm, dpi, basePt, fontFamily, hybridMode, formats: normalize(form.formats, p) };
}
