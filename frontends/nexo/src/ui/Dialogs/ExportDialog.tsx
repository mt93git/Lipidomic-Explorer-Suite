import { exportReceipts } from '../../export/changedNotice';
import { useEffect, useId, useRef, useState } from 'react';
import { cardCsv, exportBundle, getExportPresets, type FileDownload, type Node } from '../../api';
import type { CanvasHandle } from '../../canvas/handle';
import { dataUrl as illustrationUrl } from '../../illustrations/assets';
import { cardInstanceId } from '../../api/instance';
export { cardInstanceId };
import { applyPreset, clampForm, defaultForm, exportRequest, imageSize, mmToInches, setFormat, validateForm, type ExportFormat, type ExportForm, type ExportPresets, type FigureKey, type FontKey } from '../../export/presets';
import { strings as s, phrases as p, exportStrings as x } from '../strings';
import { notify } from '../model';
import { pngPdf } from '../../export/pngPdf';
import { PreviewDialog } from './PreviewDialog';
import { svgBlockedReason, transparentLayout, transparentPreference, uses3d } from '../../export/honest';
export type ExportScope = 'plot' | 'publication';
const FORMAT_LABELS: Record<ExportFormat, string> = { pdf: 'PDF', svg: 'SVG', png: 'PNG', tiff: 'TIFF', csv: 'Data (CSV)', rscript: 'R script' };
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
export function saveFile({ blob, filename }: FileDownload, node?: Node) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (node && /\.(png|svg|pdf)$/i.test(filename)) { exportReceipts.exported(node); window.dispatchEvent(new CustomEvent('nexo-plot-exported')); }
  notify(p.downloaded(filename)); // Journey review 7.2: say that the file was saved.
}
const cardElement = (node: Node) => Array.from(document.querySelectorAll<HTMLElement>('.card')).find(el => el.dataset.id === node.id);
const livePlot = (node: Node) => node.kind==='illustration'||node.finished ? undefined : cardElement(node)?.querySelector<HTMLElement>('.js-plotly-plot') ?? undefined;
/** Where a plot image comes from: illustration art, the finished snapshot, the card's rendered image, or the canvas a live
 * network card draws Team's vis-network on (as Finish takes it, cards.ts). */
export const imageSource = (node: Node) => { if (node.kind==='illustration'&&node.assetId) return illustrationUrl(node.assetId,node.color??undefined,node.label);
  if (node.finished?.url) return node.finished.url; const el = cardElement(node);
  return el?.querySelector('img')?.src ?? el?.querySelector<HTMLCanvasElement>('.network canvas')?.toDataURL('image/png'); };
const isSvg = (url?: string) => !!url && /^data:image\/svg|\.svg(\?|$)/.test(url);
/** Why SVG cannot be saved for this plot (null when it can): raster images, and Plotly's WebGL (3D) scenes. */
export const svgReason = (node: Node) => { const gd = livePlot(node) as (HTMLElement & { data?: { type?: string }[] }) | undefined;
  return svgBlockedReason({ illustration: node.kind==='illustration'&&!!node.assetId, svgSnapshot: isSvg(node.finished?.url), plotly: !!(gd && window.Plotly), webgl: uses3d(gd?.data) }); };
export const svgAvailable = (node: Node) => svgReason(node) === null;
/** One plot as PNG/SVG: the finished snapshot when finished, else live Plotly, else the rendered PNG. The card is never resized. */
export async function plotImage(node: Node, format: 'png' | 'svg' | 'pdf', widthMm: number, heightMm: number, dpi: number, options: { transparent?: boolean; source?: string } = {}): Promise<FileDownload> {
  // Transparent paper and plot background (F21) for PNG and SVG; a finished snapshot is never changed.
  const clear = !!options.transparent && !node.finished && format !== 'pdf';
  // PDF as Team makes it (www/team/js/plot_exports.js): the PNG of this export size on one page.
  if (format === 'pdf') return { blob: await pngPdf((await plotImage(node, 'png', widthMm, heightMm, dpi)).blob, widthMm, heightMm), filename: `${node.label}.pdf` };
  const size = imageSize(widthMm, heightMm, dpi), filename = `${node.label}.${format}`, gd = livePlot(node);
  if (gd && window.Plotly) {
    const live = gd as HTMLElement & { data?: unknown[]; layout?: Record<string, unknown> };
    const figure = clear && live.data ? { data: live.data, layout: transparentLayout(live.layout ?? {}) } : gd;
    const url = await window.Plotly.toImage(figure, { format, width: size.width, height: size.height, scale: format === 'png' ? size.scale : 1 });
    return { blob: await (await fetch(url)).blob(), filename };
  }
  const src = options.source ?? imageSource(node);
  if (!src) throw new Error('Wait for the figure to load.');
  const blob = await (await fetch(src)).blob();
  if (format === 'svg') { if (!blob.type.includes('svg')) throw new Error('This figure is a raster image; SVG is not available.'); return { blob, filename }; }
  const image = new Image(); image.src=src; await image.decode(); const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
  canvas.width = size.px.width; canvas.height = size.px.height; if (!clear) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const fit = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight), w = image.naturalWidth * fit, h = image.naturalHeight * fit;
  ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  return { blob: await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode the PNG.')), 'image/png')), filename };
}
const pxSummary = (widthMm: number, heightMm: number, dpi: number) => {
  const { px } = imageSize(widthMm, heightMm, dpi);
  return `${widthMm} × ${heightMm} mm (${mmToInches(widthMm).toFixed(2)} × ${mmToInches(heightMm).toFixed(2)} in) · ${px.width} × ${px.height} px at ${dpi} DPI`;
};
export function ExportDialog({ handle, scope: initialScope, nodeId, onClose }: { handle: CanvasHandle; scope: ExportScope; nodeId?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), open = useRef(true), title = useId();
  const [scope, setScope] = useState<ExportScope>(initialScope), [presets, setPresets] = useState<ExportPresets>(), [form, setForm] = useState<ExportForm>();
  const [plot, setPlot] = useState({ widthMm: 120, heightMm: 90, dpi: 300 }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const session = handle.getSession(), id = nodeId ?? handle.selection()[0];
  const node = session.canvas.nodes.find(n => n.id === id);
  const noSvg = node ? svgReason(node) : null;
  const [transparent, setTransparentState] = useState(transparentPreference.get()), setTransparent = (on: boolean) => { transparentPreference.set(on); setTransparentState(on); };
  const [preview, setPreview] = useState(false), clear = { transparent };
  const selectedScope=node?.kind==='illustration'?s.exportIllustrationScope:s.exportPlotScope;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement, dialog = ref.current!; open.current = true; dialog.showModal();
    return () => { open.current = false; dialog.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    void getExportPresets().then(p => { if (!active) return; setPresets(p); setForm(defaultForm(p)); 
      // The plot export starts at the card's on-screen size (96 px per inch), within the server limits.
      if (node) setPlot(v => { const { widthMm, heightMm } = clampForm({ ...defaultForm(p), widthMm: Math.round(node.width / 96 * 25.4), heightMm: Math.round(node.height / 96 * 25.4) }, p); return { ...v, widthMm, heightMm }; }); })
      .catch(e => active && setError(message(e)));
    return () => { active = false; };
  }, []);
  // Busy disables the control that had focus, which drops focus to the inert page: Esc and the
  // focus trap would stop working. Hold focus on the dialog while busy, then give it back.
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open.current || dialog.contains(document.activeElement)) return;
    if (busy) { dialog.focus(); return; }
    const back = trigger.current; trigger.current = null;
    (back?.isConnected && !(back as HTMLButtonElement).disabled ? back : dialog).focus();
  }, [busy]);
  async function run(action: () => Promise<FileDownload>) {
    trigger.current = ref.current?.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    setBusy(true); setError('');
    // A file that arrives after the dialog closed is dropped rather than downloaded unexpectedly.
    try { const file = await action(); if (open.current) saveFile(file, scope === 'plot' ? node : undefined); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const update = (patch: Partial<ExportForm>) => setForm(f => f && { ...f, ...patch });
  const number = (value: string) => value === '' ? Number.NaN : Number(value);
  const problems = form && presets ? validateForm(form, presets) : [], plotProblems = presets ? validateForm({ ...defaultForm(presets), ...plot }, presets) : [];
  const limits = presets?.limits;
  const dpiSelect = (value: number, onChange: (dpi: number) => void) => <label>Resolution (DPI)<select aria-label="Resolution (DPI)" value={value} disabled={busy} onChange={e => onChange(Number(e.target.value))}>
    {(presets?.dpi ?? [300, 600, 1200]).map(d => <option key={d} value={d}>{d} DPI</option>)}</select></label>;
  const size = (w: number, h: number, set: (patch: { widthMm?: number; heightMm?: number }) => void) => <div className="export-row">
    <label>Width (mm)<input type="number" min={limits?.widthMm[0]} max={limits?.widthMm[1]} step={1} value={Number.isFinite(w) ? w : ''} disabled={busy} onChange={e => set({ widthMm: number(e.target.value) })}/></label>
    <label>Height (mm)<input type="number" min={limits?.heightMm[0]} max={limits?.heightMm[1]} step={1} value={Number.isFinite(h) ? h : ''} disabled={busy} onChange={e => set({ heightMm: number(e.target.value) })}/></label></div>;
  return <dialog ref={ref} tabIndex={-1} className="export-dialog" aria-labelledby={title} aria-busy={busy} onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id={title}>{s.exportTitle}</h2>
    <fieldset className="export-scope"><legend>Scope</legend>
      {(['plot', 'publication'] as const).map(value => <label key={value}><input type="radio" name="export-scope" checked={scope === value} disabled={busy} onChange={() => { setScope(value); setError(''); }}/>{value === 'plot' ? selectedScope : s.exportPublicationScope}</label>)}
    </fieldset>
    {scope === 'plot' ? <section aria-label={selectedScope}>
      {node ? <p><strong>{node.label}</strong>{node.finished ? ' · finished snapshot' : ''}</p> : <p>{s.exportSelectPlot}</p>}
      {size(plot.widthMm, plot.heightMm, patch => setPlot(v => ({ ...v, ...patch })))}
      {dpiSelect(plot.dpi, dpi => setPlot(v => ({ ...v, dpi })))}
      <p className="export-summary">{plotProblems.length ? plotProblems.join(' ') : `PNG ${pxSummary(plot.widthMm, plot.heightMm, plot.dpi)}`}</p>
      <label className="export-check" title={node?.finished ? x.transparentFinished : undefined}><input type="checkbox" checked={transparent && !node?.finished} disabled={busy || !!node?.finished} onChange={e => setTransparent(e.target.checked)}/>{x.transparent}</label>
      <footer className="export-actions">
        <button className="primary" disabled={busy || !node || !!plotProblems.length} onClick={() => node && void run(() => plotImage(node, 'png', plot.widthMm, plot.heightMm, plot.dpi, clear))}>{s.exportPng}</button>
        <button disabled={busy || !node || !!noSvg} aria-describedby={noSvg ? `${title}-svg` : undefined} onClick={() => node && void run(() => plotImage(node, 'svg', plot.widthMm, plot.heightMm, plot.dpi, clear))}>{s.exportSvg}</button>
        <button disabled={busy || !node || !!plotProblems.length} onClick={() => node && void run(() => plotImage(node, 'pdf', plot.widthMm, plot.heightMm, plot.dpi))}>{s.exportPdf}</button>
        {node?.kind==='plot'&&<button disabled={busy} onClick={() => void run(() => cardCsv(session.sessionId, cardInstanceId(node)))}>{s.exportCsv}</button>}
        <button disabled={busy || !node || !!plotProblems.length} onClick={() => setPreview(true)}>{x.preview}</button>
      </footer>
      {preview && node && <PreviewDialog node={node} sessionId={session.sessionId} widthMm={plot.widthMm} heightMm={plot.heightMm} dpi={plot.dpi} transparent={transparent && !node.finished} onClose={() => setPreview(false)}/>}
      {noSvg && <p id={`${title}-svg`} className="export-reason">{noSvg}</p>}
    </section> : <section aria-label={s.exportPublicationScope}>
      <p className="export-scope-help">{s.exportPublicationHelp}</p>
      {!form || !presets ? <p>{error ? '' : 'Loading presets…'}</p> : <>
        <label>Figure<select aria-label="Figure" value={form.figureKey} disabled={busy} onChange={e => update({ figureKey: e.target.value as FigureKey })}>
          {presets.figures.map(f => { const gated = f.key === 'volcano' && !session.design?.allowed; return <option key={f.key} value={f.key} disabled={gated}>{gated ? `${f.title} · ${s.exportNeedsDesign}` : f.title}</option>; })}</select></label>
        <label>Journal preset<select aria-label="Journal preset" value={form.preset} disabled={busy} onChange={e => setForm(applyPreset(form, presets, e.target.value))}>
          {presets.presets.map(p => <option key={p.key} value={p.key}>{p.key === 'custom' ? 'Custom dimensions' : `${p.name} (${p.single_col_mm} / ${p.mid_col_mm} / ${p.double_col_mm} mm)`}</option>)}</select></label>
        {size(form.widthMm, form.heightMm, patch => update(patch))}
        <div className="export-row">
          <label>Base font (pt)<input type="number" min={limits?.basePt[0]} max={limits?.basePt[1]} step={0.5} value={Number.isFinite(form.basePt) ? form.basePt : ''} disabled={busy} onChange={e => update({ basePt: number(e.target.value) })}/></label>
          {dpiSelect(form.dpi, dpi => update({ dpi }))}
        </div>
        <label>Font<select aria-label="Font" value={form.fontFamily} disabled={busy} onChange={e => update({ fontFamily: e.target.value as FontKey })}>
          {presets.fonts.map(f => <option key={f.key} value={f.key}>{f.title}</option>)}</select></label>
        <label className="export-check"><input type="checkbox" checked={form.hybridMode} disabled={busy} onChange={e => update({ hybridMode: e.target.checked })}/>{s.exportHybrid}</label>
        <fieldset className="export-formats"><legend>Formats</legend>
          {presets.formats.map(f => {
            const locked = f === 'svg' ? !presets.svgAvailable : f === 'csv' && form.formats.includes('rscript');
            return <label key={f} className="export-check" title={f === 'svg' && !presets.svgAvailable ? s.exportSvgMissing : locked ? s.exportCsvLocked : undefined}>
              <input type="checkbox" checked={form.formats.includes(f)} disabled={busy || locked} onChange={e => update({ formats: setFormat(form.formats, f, e.target.checked, presets) })}/>{FORMAT_LABELS[f]}</label>;
          })}
        </fieldset>
        <p className="export-summary">{problems.length ? problems.join(' ') : pxSummary(form.widthMm, form.heightMm, form.dpi)}</p>
        <footer className="export-actions">
          <button className="primary" disabled={busy || !!problems.length} onClick={() => void run(() => exportBundle(session.sessionId, exportRequest(clampForm(form, presets), presets)))}>{busy ? s.exportBusy : s.exportBundle}</button>
        </footer>
      </>}
    </section>}
    <p role="alert" className="export-error">{error}</p>
    <footer><button onClick={onClose}>{s.exportClose}</button></footer>
  </dialog>;
}
