// Honest exports: say why a download cannot work, what the export will be, and keep backgrounds when asked.
import type { BodyStatus } from '../cardStatus';
import { imageSize } from './presets';
/** R/frontends/api/cards.R clamps a render to 100–4000 px per side. */
export const API_RENDER_MAX_PX = 4000;
const TRANSPARENT = 'rgba(0,0,0,0)';
const shorten = (text: string, max = 90) => {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1), space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, '')}…`;
};
/** A card that draws a module placeholder or validate() message cannot produce the module's own downloads. */
export function downloadBlockedReason(card: { status: BodyStatus | undefined; message: string }): string | null {
  return card.status === 'error' && card.message.trim() ? shorten(card.message) : null;
}
const WEBGL = new Set(['scatter3d', 'mesh3d', 'surface', 'cone', 'streamtube', 'isosurface', 'volume', 'scattergl', 'splom', 'heatmapgl', 'pointcloud', 'parcoords']);
export const uses3d = (data: { type?: string }[] | undefined) => !!data?.some(t => WEBGL.has(t.type ?? 'scatter'));
export const SVG_WEBGL_REASON = '3D and WebGL plots are drawn by the graphics card; Plotly cannot save them as vector SVG. Use PNG or PDF.';
export const SVG_RASTER_REASON = 'This figure is a raster image; SVG is not available.';
export function svgBlockedReason(f: { illustration: boolean; svgSnapshot: boolean; plotly: boolean; webgl: boolean }): string | null {
  if (f.illustration || f.svgSnapshot) return null;
  if (f.plotly) return f.webgl ? SVG_WEBGL_REASON : null;
  return SVG_RASTER_REASON;
}
/** Pixel size of the export (mm and DPI), and whether an API render of it is clamped. */
export function previewPixels(widthMm: number, heightMm: number, dpi: number) {
  const { px } = imageSize(widthMm, heightMm, dpi);
  return { width: px.width, height: px.height, capped: px.width > API_RENDER_MAX_PX || px.height > API_RENDER_MAX_PX };
}
export const fileSizeLabel = (bytes: number) => bytes < 1024 ? `${Math.round(bytes)} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
type Layout = Record<string, unknown>;
/** Paper, plot and every 3D scene background transparent; the figure itself is not modified. */
export function transparentLayout<T extends Layout>(layout: T): T {
  const out: Layout = { ...layout, paper_bgcolor: TRANSPARENT, plot_bgcolor: TRANSPARENT };
  for (const key of Object.keys(layout)) if (/^scene\d*$/.test(key) && layout[key] && typeof layout[key] === 'object') out[key] = { ...(layout[key] as Layout), bgcolor: TRANSPARENT };
  return out as T;
}
const KEY = 'nexo.export.transparent';
export const transparentPreference = {
  get: () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } },
  set: (on: boolean) => { try { sessionStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } },
};
