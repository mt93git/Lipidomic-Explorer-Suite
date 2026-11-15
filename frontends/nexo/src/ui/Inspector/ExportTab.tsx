import { notifyFailure } from '../model';
import { useContext, useEffect, useId, useState } from 'react';
import { cardDownload, cardDownloads, type Node } from '../../api';
import type { CardDownload } from '../../api/types';
import { CanvasHandleContext } from '../../canvas/handle';
import { ExportDialog, cardInstanceId, plotImage, saveFile, svgReason } from '../Dialogs/ExportDialog';
import { downloadBlockedReason } from '../../export/honest';
import type { BodyStatus } from '../../cardStatus';
import { strings as s } from '../strings';
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
  const image = (format:'png'|'svg'|'pdf') => run(async () => saveFile(await plotImage(node, format, mm(node.width), mm(node.height), 300), node), format === 'png' ? s.failPng : format === 'svg' ? s.failSvg : s.failPdf);
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
  return <div aria-busy={busy}>
    {downloads && downloads.length > 0 && <div className="export-mirrors" role="group" aria-label={s.moreDownloads}>
      <p className="export-mirrors-label" aria-hidden="true">{s.moreDownloads}</p>
      {downloads.map(d => <button key={d.id} disabled={busy || !!blocked} aria-describedby={blocked ? reasonId : undefined} onClick={() => void run(async () => saveFile(await cardDownload(session, instance, d.id)), s.failDownload)}>{d.label}</button>)}
      {blocked && <p id={reasonId} className="export-reason">{blocked}</p>}
    </div>}
    <button disabled={busy} onClick={() => void image('png')}>{s.exportPng}</button>
    <button disabled={busy || !!noSvg} aria-describedby={noSvg ? svgReasonId : undefined} onClick={() => void image('svg')}>{s.exportSvg}</button>
    {noSvg && <p id={svgReasonId} className="export-reason">{noSvg}</p>}
    <button disabled={busy} onClick={() => void image('pdf')}>{s.exportPdf}</button>
    {live && <button onClick={() => void run(async () => {
      const gd=live as HTMLElement & {data?:unknown;layout?:unknown};
      if(!gd.data) throw new Error(s.loadLiveFirst);
      await navigator.clipboard.writeText(JSON.stringify({data:gd.data,layout:gd.layout},null,2));
    }, s.failJson)}>{s.copyJson}</button>}
    <button disabled={busy} onClick={() => setDialog(true)}>{s.exportMore}</button>
    {dialog && <ExportDialog handle={handle} scope="plot" nodeId={node.id} onClose={() => setDialog(false)}/>}
  </div>;
}
