// F8: the export exactly as it will be written (size in mm, DPI, transparency), with a 1:1 loupe.
import { useEffect, useId, useRef, useState } from 'react';
import { renderCard, type Node } from '../../api';
import { cardInstanceId } from '../../api/instance';
import { API_RENDER_MAX_PX, fileSizeLabel, previewPixels } from '../../export/honest';
import { exportStrings as x } from '../strings';
import { plotImage } from './ExportDialog';
const LOUPE = 220;
const isLivePlotly = (node: Node) => !!Array.from(document.querySelectorAll<HTMLElement>('.card')).find(el => el.dataset.id === node.id)?.querySelector('.js-plotly-plot');
export function PreviewDialog({ node, sessionId, widthMm, heightMm, dpi, transparent, onClose }: { node: Node; sessionId: string; widthMm: number; heightMm: number; dpi: number; transparent: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), title = useId(), px = previewPixels(widthMm, heightMm, dpi);
  const [result, setResult] = useState<{ url: string; width: number; height: number; bytes: number; rendered?: { width: number; height: number } }>();
  const [error, setError] = useState(''), [spot, setSpot] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => { const previous = document.activeElement as HTMLElement, dialog = ref.current!; dialog.showModal(); return () => { dialog.close(); previous?.focus(); }; }, []);
  useEffect(() => {
    let active = true, source: string | undefined, url: string | undefined;
    void (async () => {
      let rendered: { width: number; height: number } | undefined;
      // An image (ggplot) card: ask the API for the figure at the export pixel size (it clamps to 4000 px a side).
      if (node.kind === 'plot' && !node.finished && !isLivePlotly(node)) {
        const width = Math.min(px.width, API_RENDER_MAX_PX), height = Math.min(px.height, API_RENDER_MAX_PX);
        const r = await renderCard(sessionId, cardInstanceId(node), width, height, 'png');
        if ('blob' in r) { source = URL.createObjectURL(r.blob); const probe = new Image(); probe.src = source; await probe.decode(); rendered = { width: probe.naturalWidth, height: probe.naturalHeight }; }
      }
      const file = await plotImage(node, 'png', widthMm, heightMm, dpi, { transparent, source });
      url = URL.createObjectURL(file.blob); const image = new Image(); image.src = url; await image.decode();
      if (active) setResult({ url, width: image.naturalWidth, height: image.naturalHeight, bytes: file.blob.size, rendered });
    })().catch(e => active && setError(e instanceof Error ? e.message : String(e)));
    return () => { active = false; if (source) URL.revokeObjectURL(source); if (url) URL.revokeObjectURL(url); };
  }, []);
  const move = (dx: number, dy: number) => setSpot(s => ({ x: Math.min(1, Math.max(0, s.x + dx)), y: Math.min(1, Math.max(0, s.y + dy)) }));
  const capped = result?.rendered && (result.rendered.width < px.width || result.rendered.height < px.height) ? result.rendered : px.capped && result ? { width: Math.min(px.width, API_RENDER_MAX_PX), height: Math.min(px.height, API_RENDER_MAX_PX) } : undefined;
  return <dialog ref={ref} tabIndex={-1} className="export-dialog export-preview" aria-labelledby={title} aria-busy={!result && !error} onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id={title}>{x.previewTitle}</h2>
    <p className="export-summary" data-testid="preview-size">{x.previewSize(result?.width ?? px.width, result?.height ?? px.height, dpi, widthMm, heightMm)}</p>
    {result && <p className="export-summary">{x.previewFile(fileSizeLabel(result.bytes))}</p>}
    {capped && node.kind === 'plot' && !isLivePlotly(node) && <p className="export-reason">{x.previewCapped(capped.width, capped.height)}</p>}
    {!result && !error && <p>{x.previewLoading}</p>}
    {result && <div className="export-preview-body">
      <img className="export-preview-image" src={result.url} alt={node.label} onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setSpot({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); }}/>
      <div className="export-preview-loupe" role="img" tabIndex={0} aria-label={x.previewLoupe}
        onKeyDown={e => { const step = 40 / Math.max(result.width, result.height), map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }; const d = map[e.key]; if (d) { e.preventDefault(); move(d[0], d[1]); } }}
        style={{ width: LOUPE, height: LOUPE, backgroundImage: `url(${result.url})`, backgroundSize: `${result.width}px ${result.height}px`,
          backgroundPosition: `${LOUPE / 2 - spot.x * result.width}px ${LOUPE / 2 - spot.y * result.height}px` }}/>
    </div>}
    <p role="alert" className="export-error">{error}</p>
    <footer><button onClick={onClose}>{x.previewClose}</button></footer>
  </dialog>;
}
