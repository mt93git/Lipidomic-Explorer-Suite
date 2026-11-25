import { notifyFailure } from '../model';
import { useContext, useEffect, useId, useState } from 'react';
import { cardDownload, cardDownloads, type Node } from '../../api';
import type { CardDownload } from '../../api/types';
import { CanvasHandleContext } from '../../canvas/handle';
import { ExportDialog, cardInstanceId, plotImage, saveFile, svgReason } from '../Dialogs/ExportDialog';
import { downloadBlockedReason } from '../../export/honest';
import type { BodyStatus } from '../../cardStatus';
import { strings as s, inspectorStrings as is } from '../strings';
import { Icon } from '../Icon';
type Format = 'png' | 'svg' | 'pdf';
const FORMATS: [Format, string][] = [['png', 'PNG'], ['svg', 'SVG'], ['pdf', 'PDF']];
// Quick exports at the card's on-screen size (96 px per inch, 300 DPI PNG); the dialog sets the size.
const mm = (px: number) => Math.min(250, Math.max(40, Math.round(px / 96 * 25.4)));
/** What the card body shows now: its status and, for a placeholder or validate() message, that message. */
function useCardBody(id: string) {
  const read = () => { const el = Array.from(document.querySelectorAll<HTMLElement>('.card')).find(c => c.dataset.id === id), body = el?.querySelector<HTMLElement>('.body');
    return { status: el?.querySelector<HTMLElement>('.card-status')?.dataset.state as BodyStatus | undefined, message: body?.querySelector('p')?.textContent?.trim() ?? '', note: !!body?.querySelector('.validation-note') }; };
  const [state, setState] = useState(read);
  useEffect(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('.card')).find(c => c.dataset.id === id);
    setState(read()); if (!el) return;
    const observer = new MutationObserver(() => setState(v => { const next = read(); return next.status === v.status && next.message === v.message && next.note === v.note ? v : next; }));
    observer.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-state'] });
    return () => observer.disconnect();
  }, [id]);
  return state;
}
export function ExportTab({node,onStatus}:{node:Node;onStatus:(s:string)=>void}) {
  const handle = useContext(CanvasHandleContext)!, [busy,setBusy] = useState(false), [dialog,setDialog] = useState(false);
  const reasonId = useId(), svgReasonId = useId();
  async function run(action:()=>Promise<void>, what:string) { setBusy(true); try {await action(); onStatus(s.upToDate);} catch(e) {notifyFailure(what, e);} finally {setBusy(false);} }
  const live = node.finished ? undefined : Array.from(document.querySelectorAll<HTMLElement>('.card')).find(el => el.dataset.id === node.id)?.querySelector<HTMLElement>('.js-plotly-plot');
  const image = (format:Format) => run(async () => saveFile(await plotImage(node, format, mm(node.width), mm(node.height), 300), node), format === 'png' ? s.failPng : format === 'svg' ? s.failSvg : s.failPdf);
  // Team mirrors the module's own download buttons that sit with the plot; a finished figure offers its snapshot only.
  const session = handle?.getSession().sessionId ?? '', instance = cardInstanceId(node), inputs = JSON.stringify(node.instance?.inputs ?? null);
  const [downloads,setDownloads] = useState<CardDownload[]|null>(null);
  // A card that draws a module placeholder cannot make the module's files: say why instead of failing on click.
  const body = useCardBody(node.id), blocked = node.finished ? null : downloadBlockedReason(body), noSvg = svgReason(node);
  useEffect(() => {
    if (!session || node.finished || node.kind !== 'plot') { setDownloads(null); return; }
    let live = true; setDownloads(null);
    cardDownloads(session, instance).then(r => { if (live) setDownloads(r.downloads); }, () => { if (live) setDownloads([]); });
    return () => { live = false; };
  }, [session, instance, inputs, !!node.finished, node.kind]);
  const [format,setFormat] = useState<Format>('png'), svgBlocked = format === 'svg' && !!noSvg;
  return <div aria-busy={busy} className="export-tab">
    <section className="inspector-section" data-section="figure"><h3>{is.exportFigure}</h3>
      <div className="export-formats" role="radiogroup" aria-label={is.exportFormat}>{FORMATS.map(([f, label]) =>
        <button key={f} type="button" role="radio" aria-checked={format === f} className="tc-chip" onClick={() => setFormat(f)}>{label}</button>)}</div>
      <p className="export-size">{is.exportSize(mm(node.width), mm(node.height))}</p>
      <button type="button" className="primary export-download" disabled={busy || svgBlocked} aria-describedby={svgBlocked ? svgReasonId : undefined} onClick={() => void image(format)}><Icon name="download"/>{is.downloadFigure}</button>
      {noSvg && format === 'svg' && <p id={svgReasonId} className="export-reason">{noSvg}</p>}
    </section>
    {downloads && downloads.length > 0 && <DataFiles downloads={downloads} busy={busy} blocked={blocked} reasonId={reasonId}
      onDownload={d => void run(async () => saveFile(await cardDownload(session, instance, d.id)), s.failDownload)}/>}
    <details className="inspector-more"><summary>{is.more}</summary>
      {live && <button type="button" onClick={() => void run(async () => {
        const gd=live as HTMLElement & {data?:unknown;layout?:unknown};
        if(!gd.data) throw new Error(s.loadLiveFirst);
        await navigator.clipboard.writeText(JSON.stringify({data:gd.data,layout:gd.layout},null,2));
      }, s.failJson)}>{s.copyJson}</button>}
      <button type="button" disabled={busy} onClick={() => setDialog(true)}>{s.exportMore}</button>
    </details>
    {dialog && <ExportDialog handle={handle} scope="plot" nodeId={node.id} onClose={() => setDialog(false)}/>}
  </div>;
}
/** The module's own downloads (CSV and the like), as a list; a placeholder card says why they are off. */
export function DataFiles({downloads,busy,blocked,reasonId,onDownload}:{downloads:CardDownload[];busy:boolean;blocked?:string|null;reasonId?:string;onDownload:(d:CardDownload)=>void}) {
  return <section className="inspector-section" data-section="data-files"><h3>{is.dataFiles}</h3>
    <ul className="export-files" role="group" aria-label={s.moreDownloads}>{downloads.map(d => <li key={d.id}><button type="button" className="link" disabled={busy || !!blocked} aria-describedby={blocked ? reasonId : undefined} onClick={() => onDownload(d)}>{d.label}</button></li>)}</ul>
    {blocked && <p id={reasonId} className="export-reason">{blocked}</p>}
  </section>;
}
