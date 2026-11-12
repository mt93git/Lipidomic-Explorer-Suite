import { CanvasHandleContext, tabsBridges } from '../canvas/handle';
import { exportPage } from '../figure/exportPage';
import { initialDocument, syncDocument } from '../figure/model';
import type { Document } from '../state/document';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { overflowGroups } from './toolbarOverflow';
import { notify, notifyFailure, openLibrary, useShell } from './model';
import { HelpDialog } from './Dialogs/HelpDialog';
import { Menu } from './Menu';
import { Confirm } from './Dialogs/Confirm';
import { ExportDialog, type ExportScope } from './Dialogs/ExportDialog';
import { strings as s, phrases as p } from './strings';
const MIN_STRIP = 200;
const arrangeLabels = { left: s.alignLeft, right: s.alignRight, top: s.alignTop, bottom: s.alignBottom, distributeX: s.distributeX, distributeY: s.distributeY } as const;
import { canComment, isReadOnly } from '../state/readonly';
import { collab } from '../collab/mode';
import { clipboard, onClipboard } from '../clipboard';
export function Toolbar({onSave,onDownload,onShortcuts,onAnalysis}:{onAnalysis:()=>void;onSave:()=>void;onDownload:()=>void;onShortcuts:()=>void}) {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0), handle = useContext(CanvasHandleContext), [helpOpen, setHelpOpen] = useState(false), [removing, setRemoving] = useState(false), [exporting, setExporting] = useState<ExportScope | null>(null);
  useEffect(() => { const el = ref.current!.parentElement!; const observer = new ResizeObserver(() => setWidth(el.clientWidth)); observer.observe(el); return () => observer.disconnect(); }, []);
  // Opening or closing a side panel resizes the header in this same commit: measure before paint,
  // so the toolbar never overlaps the inspector for a frame while the observer catches up.
  const { inspectorOpen, libraryOpen } = useShell().ui;
  useLayoutEffect(() => { setWidth(ref.current!.parentElement!.clientWidth); }, [inspectorOpen, libraryOpen]);
  const [, refresh] = useState(0);
  useEffect(() => handle?.onChange(() => refresh(n => n + 1)), [handle]);
  useEffect(() => onClipboard(() => refresh(n => n + 1)), []);
  // H9: Team's levels first; while tabs are cut and their strip is under MIN_STRIP px, fold one more level.
  const [more, setMore] = useState(0), tabCount = useShell().tabs.tabs.length;
  useLayoutEffect(() => setMore(0), [width, tabCount]);
  // The strip also shrinks when its own "All tabs" button appears: watch it so the check above runs again.
  const [, recheck] = useState(0);
  useEffect(() => { const strip = ref.current!.parentElement!.querySelector('.tablist'); if (!strip) return; const o = new ResizeObserver(() => recheck(n => n + 1)); o.observe(strip); return () => o.disconnect(); }, []);
  useLayoutEffect(() => {
    const strip = ref.current!.parentElement!.querySelector<HTMLElement>('.tablist');
    if (strip && strip.scrollWidth > strip.clientWidth + 1 && strip.clientWidth < MIN_STRIP && overflowGroups(width, more).length < 6) setMore(m => m + 1);
  });
  const collapsed = overflowGroups(width, more), readOnly = isReadOnly();
  // Journey review 6.2: how many plots still need finishing before the figure page is complete.
  const pending = readOnly || !handle ? 0 : handle.getSession().canvas.nodes.filter(n => n.kind === 'plot' && !n.finished).length;
  // Figure page export from the one Export menu: the saved page, or the default page built from the canvas (as the Figure page does).
  const pageExport = async (kind:'svg'|'pdf'|'print') => {
    if (!handle) return;
    const nodes = handle.getSession().canvas.nodes, saved = (tabsBridges.get(handle)?.document() as {document?:Document|null}|undefined)?.document;
    try { await exportPage(kind, saved ?? syncDocument(initialDocument(), nodes), nodes); } catch (error) { notifyFailure(s.failPage, error); }
  };
  // View only keeps viewing, exporting and help; every editing or saving item is left out.
  const add = !readOnly && <button onClick={() => openLibrary('plots')}>{s.add}</button>;
  // Phase 6: comment mode drops a pin at the next canvas click (canvas/pins.ts); shared projects only. Pressed while on.
  const [commenting, setCommenting] = useState(false);
  useEffect(() => { const armed = (e: Event) => setCommenting((e as CustomEvent<boolean>).detail); addEventListener('nexo-comment-armed', armed); return () => removeEventListener('nexo-comment-armed', armed); }, []);
  const comment = collab() && canComment() && <button aria-pressed={commenting} onClick={() => dispatchEvent(new Event('nexo-comment-mode'))}>Comment</button>;
  const tidy = !readOnly && <button disabled={!handle} onClick={() => handle?.tidy()}>{s.tidy}</button>;
  // "Undo mine" (Gerardo, 2026-11-10): with nothing on the geometry stack, Undo takes back my last settled science change (collab/intents.ts).
  const [mine, setMine] = useState(false);
  useEffect(() => { const told = (e: Event) => setMine((e as CustomEvent<boolean>).detail); addEventListener('nexo-undo-mine', told); return () => removeEventListener('nexo-undo-mine', told); }, []);
  const history = !readOnly && <><button disabled={!handle?.canUndo && !mine} onClick={() => { if (handle?.canUndo) handle.undo(); else void import('../collab/intents').then(m => m.undoMine()); }}>{s.undoTool}</button><button disabled={!handle?.canRedo} onClick={() => handle?.redo()}>{s.redoTool}</button></>;
  const exports = <><button disabled={!handle} onClick={() => setExporting('publication')}>{s.publicationExport}</button><button disabled={!handle} onClick={() => setExporting('plot')}>{s.exportSelected}</button>{!readOnly && <><button onClick={onSave}>{s.saveCheckpoint}</button><button onClick={onDownload}>{s.downloadZip}</button></>}{(['svg','pdf','print'] as const).map(kind => <button key={kind} disabled={!handle} onClick={() => void pageExport(kind)}>{kind==='svg'?s.pageSvg:kind==='pdf'?s.pagePdf:s.pagePrint}</button>)}</>;
  const analysis = !readOnly && <button data-analysis-trigger disabled={!handle} onClick={onAnalysis}>{s.analysisSettings}</button>;
  const figure = <button disabled={!handle} onClick={() => { if(handle?.figureMode)handle.exitFigureMode();else handle?.enterFigureMode(); }}>{handle?.figureMode ? s.backToDraft : s.figure}</button>;
  return <div ref={ref} className="toolbar" role="toolbar" aria-label={s.tools}>
    {!collapsed.includes('analysis') && analysis}
    {!collapsed.includes('add') && add}{comment}{!collapsed.includes('arrange') && tidy}{!collapsed.includes('history') && history}
    {!collapsed.includes('add') && <span className="draft">{handle?.figureMode ? s.figurePage : pending ? p.draftPending(pending) : s.draft}</span>}{!collapsed.includes('figure') && figure}
    {!collapsed.includes('export') && <Menu label={s.export}>{exports}</Menu>}
    <Menu label={s.more} name={s.tools}>{collapsed.includes('figure') && figure}{collapsed.includes('analysis') && analysis}{collapsed.includes('add') && add}{collapsed.includes('arrange') && tidy}{collapsed.includes('history') && history}{collapsed.includes('export') && exports}
      {!readOnly && <><button disabled={!handle || !clipboard()} title={clipboard() ? undefined : s.pasteEmpty} onClick={() => void handle?.paste().catch(error => notifyFailure(s.failPaste, error))}>{s.paste}</button><button onClick={() => setRemoving(true)}>{s.removeAll}</button>
        {/* Journey review 5.4: align and distribute the selected cards (Shift-click or drag a frame to select). */}
        <div role="group" aria-label={s.arrangeSelected} className="menu-group">{(['left','right','top','bottom','distributeX','distributeY'] as const).map(kind => { const need = kind.startsWith('distribute') ? 3 : 2, count = handle?.selection().length ?? 0;
          return <button key={kind} disabled={!handle || count < need} title={count < need ? p.selectAtLeast(need) : undefined} onClick={() => handle?.arrange(kind)}>{arrangeLabels[kind]}</button>; })}</div></>}<button onClick={() => setHelpOpen(true)}>{s.help}</button><button onClick={onShortcuts}>{s.keyboardShortcuts}</button>
    </Menu>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)}/>}
    {removing && <Confirm destructive title={s.removeAll} onCancel={() => setRemoving(false)} onConfirm={() => { handle?.removeAll(); setRemoving(false); }}><p>{s.local}</p></Confirm>}
    {exporting && handle && <ExportDialog handle={handle} scope={exporting} onClose={() => setExporting(null)}/>}
  </div>;
}
