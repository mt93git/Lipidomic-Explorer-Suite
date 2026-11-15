import { strings as s, phrases as p, keys, tip } from '../strings';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { CardAction } from '../../cards';
import type { CanvasHandle } from '../../canvas/handle';
import { DataTab } from './DataTab';
import { ExportTab } from './ExportTab';
import { AppearanceTab } from './AppearanceTab';
import { StatisticsTab } from './StatisticsTab';
import { ui, useShell } from '../model';
import { isStale } from '../../export/finalize';
import { isReadOnly } from '../../state/readonly';
import { inspectorStatus } from '../../inspectorStatus';
import { collab } from '../../collab/mode';
import { retryLazy } from '../retryLazy';
// Collab only (lazy: flag off loads no yjs): who else is editing this card (prototype scene 2).
const EditingBanner = retryLazy(() => import('./EditingBanner').then(m => ({ default: m.EditingBanner })));
/** The plot's actions, moved off the card (it carries no action bar): the main two, then a menu. */
function InspectorActions({handle,node}:{handle:CanvasHandle;node:NonNullable<ReturnType<CanvasHandle['getSession']>['canvas']['nodes'][number]>}) {
  const [open,setOpen]=useState(false), wrap=useRef<HTMLDivElement>(null);
  useEffect(()=>{ if(!open) return; const away=(e:PointerEvent)=>{ if(!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown',away); return ()=>document.removeEventListener('pointerdown',away); },[open]);
  const run=(action:CardAction)=>{ setOpen(false); handle.cardAction(node.id,action); };
  const plot=node.kind==='plot', heat=node.id.endsWith('-plot_heat')||node.instance?.source==='results_dashboard-plot_heat';
  const more:[string,CardAction][]=[...(plot?[[s.actionCopyPlot,'copyplot']] as [string,CardAction][]:[]),[s.actionCopyToTab,'copy'],[s.actionMoveToTab,'move'],...(heat?[[s.enlargePlot,'enlarge']] as [string,CardAction][]:[]),[s.remove,'remove']];
  return <div className="inspector-actions">
    <button type="button" onClick={()=>run('duplicate')}>{s.actionDuplicate}</button>
    {plot && <button type="button" onClick={()=>run('finish')}>{node.finished ? s.editFigure : s.finishPlot}</button>}
    <div className="menu-wrap" ref={wrap} onKeyDown={e=>{ if(e.key==='Escape'&&open){ e.preventDefault(); e.stopPropagation(); setOpen(false); wrap.current?.querySelector<HTMLButtonElement>('button')?.focus(); } }}>
      <button type="button" aria-label={s.morePlotActions} data-tip={s.morePlotActions} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>⋯</button>
      {open && <div className="menu" role="group" aria-label={s.morePlotActions}>{more.map(([label,action])=><button type="button" key={action} onClick={()=>run(action)}>{label}</button>)}</div>}
    </div>
  </div>;
}
export function Inspector({handle}:{handle:CanvasHandle}) {
  const [,refresh]=useState(0);
  const [ids,setIds]=useState(handle.selection()), [tab,setTab]=useState('Data'), [status,setStatus]=useState('Up to date');
  const open=useShell().ui.inspectorOpen, openedAt=useRef(0);
  useEffect(()=>{ if(open) openedAt.current=performance.now(); },[open]);
  // The first click on a card opens this panel; when it opens under the pointer, the second click
  // of that double click must not select a word in it.
  const guard=(e:React.MouseEvent)=>{ if(e.detail>1&&performance.now()-openedAt.current<700&&!(e.target as HTMLElement).closest('input,textarea,select')) e.preventDefault(); };
  useEffect(() => handle.onChange(() => {refresh(v=>v+1);const next=handle.selection();setIds(old=>old.join()===next.join()?old:next);}),[handle]);
  useEffect(() => {
    const choose = (event: Event) => { const tab = (event as CustomEvent<string | null>).detail; if (tab) setTab(tab); };
    window.addEventListener('nexo-inspector-tab', choose);
    return () => window.removeEventListener('nexo-inspector-tab', choose);
  }, []);
  // Small fixes item 1: the status line follows the selected card (cards.ts announces what it shows).
  useEffect(() => {
    const shown = (event: Event) => { if ((event as CustomEvent<{id:string}>).detail?.id === ids[0]) refresh(v=>v+1); };
    window.addEventListener('nexo-card-status', shown);
    return () => window.removeEventListener('nexo-card-status', shown);
  }, [ids]);
  const node=handle.getSession().canvas.nodes.find(n=>n.id===ids[0]);
  const reportStatus = useCallback((message: string) => {
    setStatus(message);
    if (!ids[0] || message === 'Up to date') return; // Render completion owns the current badge.
    const state = message === 'Updating…' ? 'updating' : message === 'Changes pending' ? 'pending' : message === 'Needs data' ? 'needs-data' : message === 'Needs settings' ? 'waiting' : 'error';
    handle.setCardStatus(ids[0], state);
  }, [handle, ids]);
  const choices=node?.kind==='illustration'?['Appearance','Export']:node?.finished?['Export']:['Data','Appearance','Statistics','Export'];
  const active=choices.includes(tab)?tab:choices[0], readOnly=isReadOnly();
  // A finished plot reports its snapshot, as its card badge does; export errors still show.
  const finished=node?.kind==='plot'&&node.finished ? (isStale(node,(handle.getSession().preparation as {revision?:number})?.revision??0) ? 'Finished · out of date' : 'Finished') : null;
  // Group comparison keeps its settings and confirm prompt on Statistics (journey review 2.4): open there.
  const firstTab=(node?.instance?.source??node?.id??'').includes('group_comparison')?'Statistics':'Data';
  useEffect(()=>{setTab(firstTab);setStatus('Up to date');},[ids.join()]);
  return <section id="inspector" onMouseDown={guard} data-open={open} aria-label={s.inspectorLabel} style={{fontSize:13}}>
    <header className="inspector-head"><h2>{ids.length>1 ? p.selectedCount(ids.length) : node?.label ?? s.inspectorLabel}</h2><button aria-label={s.closeInspector} aria-keyshortcuts="Escape" data-tip={tip(s.closeInspector, keys.closeInspector)} onClick={()=>ui({inspectorOpen:false})}>×</button>
      {node && open && ids.length===1 && !readOnly && <InspectorActions handle={handle} node={node}/>}</header>
    {node && open && <p role="status">{finished && status==='Up to date' ? finished : finished ? status : inspectorStatus(handle.cardShown?.(node.id), status)}</p>}
    {!node || !open ? <p>{s.selectToInspect}</p> : ids.length===1 && <>
      {collab() && <Suspense fallback={null}><EditingBanner nodeId={node.id}/></Suspense>}
      <div role="tablist" aria-label={s.inspectorTabs} style={{display:'flex'}}>{choices.map(t=><button key={t} role="tab" aria-selected={active===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
      {node.finished && node.kind!=='illustration' && <p>{s.finishedFigure}</p>}
      {(!node.finished || node.kind==='illustration') && <details><summary>{s.figureDetails}</summary><h3>{s.labelHeading}</h3><p>{node.label}</p><h3>{s.tierHeading}</h3><p>{Array.from(document.querySelectorAll<HTMLElement>('.card')).find(el=>el.dataset.id===node.id)?.dataset.tier ?? 'live'}</p></details>}
      {/* View only: the settings stay readable, every control inside is disabled; Export keeps working. */}
      <div role="tabpanel"><fieldset className="inspector-fields" disabled={readOnly && active!=='Export'}>{active==='Data'?<DataTab key={node.id} node={node} handle={handle} onStatus={reportStatus}/>:active==='Appearance'?<AppearanceTab key={node.id} node={node} handle={handle}/>:active==='Statistics'?<StatisticsTab key={node.id} node={node} handle={handle}/>:<ExportTab node={node} onStatus={reportStatus}/>}</fieldset></div>
    </>}
  </section>;
}
