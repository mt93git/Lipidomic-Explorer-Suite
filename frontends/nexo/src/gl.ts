// WebGL contexts of Plotly 3D scenes. Each gl3d scene owns a context; Plotly.purge drops the plot but WebKit frees
// the context only on GC and, past 16 live contexts on the page, loses the oldest one ("too many active WebGL
// contexts"). WEBGL_lose_context does not free the slot in WebKit (measured, WebKit 2370), so a 3D card parks its plot
// while off the live tier and draws it again in the same context (cards.ts). Plotly's exports (toImage, staticPlot)
// share one module-level context and are left alone. A purged 3D plot still loses its contexts: other engines free them.

type PlotlyPurge = { purge(el: HTMLElement): void };
type Traces = { data?: unknown };

const GL3D = /^(scatter3d|surface|mesh3d|cone|streamtube|volume|isosurface)$/;
/** True when a figure (or a drawn plot div) has a gl3d trace, the only WebGL traces Nexo cards draw. */
export function hasGl3d(figure: Traces | HTMLElement | null | undefined): boolean {
  const data = (figure as Traces | null | undefined)?.data;
  return Array.isArray(data) && data.some(t => GL3D.test(String((t as { type?: unknown } | null)?.type ?? '')));
}

/** Lose the WebGL context of each canvas. getContext returns a canvas's existing context of that type. */
export function releaseCanvases(canvases: Iterable<HTMLCanvasElement>) {
  for (const canvas of canvases) {
    const gl = canvas.getContext('webgl') ?? canvas.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Plotly.purge, first releasing the contexts of a 3D plot's scenes. Used by every purge site in cards.ts. */
export function purgePlot(Plotly: PlotlyPurge | undefined, el: HTMLElement) {
  if (hasGl3d(el)) releaseCanvases(el.querySelectorAll('canvas'));
  Plotly?.purge(el);
}
