import { strings as s, phrases as p, inspectorStrings as is, keys, tip } from '../strings';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { CardAction } from '../../cards';
import type { CanvasHandle } from '../../canvas/handle';
import { DataTab } from './DataTab';
import { ExportTab } from './ExportTab';
import { AppearanceTab, visualPatchFor } from './AppearanceTab';
import { StatisticsTab } from './StatisticsTab';
import { ui, useShell } from '../model';
import { isStale } from '../../export/finalize';
import { isReadOnly } from '../../state/readonly';
import { inspectorStatus } from '../../inspectorStatus';
import { collab } from '../../collab/mode';
import { retryLazy } from '../retryLazy';
import { normaliseTab, pillState, statsSource, tabsFor } from './inspectorTabs';
// Collab only (lazy: flag off loads no yjs): who else is editing this card (prototype scene 2).
const EditingBanner = retryLazy(() => import('./EditingBanner').then(m => ({ default: m.EditingBanner })));
type CardNode = NonNullable<ReturnType<CanvasHandle['getSession']>['canvas']['nodes'][number]>;
/** The plot's actions, moved off the card (it carries no action bar): the main two, then a menu. */
function InspectorActions({handle,node}:{handle:CanvasHandle;node:CardNode}) {
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
/** The card's name in the header: click to rename in place (Enter or leaving the field keeps it, Esc cancels).
 *  It replaces the Style tab's Label field and the Figure details block. */
function CardName({node,handle,editable}:{node:CardNode;handle:CanvasHandle;editable:boolean}) {
  const [draft,setDraft]=useState<string|null>(null), cancelled=useRef(false);
  useEffect(()=>{ setDraft(null); },[node.id]);
  if(draft===null||!editable) return <h2 className="inspector-name"><button type="button" className="inspector-name-button" disabled={!editable} aria-label={is.renameCard(node.label)} data-tip={`${node.label} · ${is.renameHint}`} onClick={()=>{ cancelled.current=false; setDraft(node.label); }}>{node.label}</button></h2>;
  const commit=()=>{ const value=draft.trim(); setDraft(null); if(!cancelled.current&&value&&value!==node.label) handle.setAppearance(node.id, visualPatchFor(node.kind,'label',value)); };
  return <h2 className="inspector-name"><input className="inspector-name-input" aria-label={is.cardName} value={draft} maxLength={512} autoFocus
    onChange={e=>setDraft(e.target.value)} onBlur={commit} onFocus={e=>e.currentTarget.select()}
    onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); cancelled.current=true; e.currentTarget.blur(); } }}/></h2>;
}
export function Inspector({handle}:{handle:CanvasHandle}) {
  const [,refresh]=useState(0);
  const [ids,setIds]=useState(handle.selection()), [tab,setTab]=useState<string>('Data'), [status,setStatus]=useState('Up to date');
  const open=useShell().ui.inspectorOpen, openedAt=useRef(0);
  useEffect(()=>{ if(open) openedAt.current=performance.now(); },[open]);
  // The first click on a card opens this panel; when it opens under the pointer, the second click
  // of that double click must not select a word in it.
  const guard=(e:React.MouseEvent)=>{ if(e.detail>1&&performance.now()-openedAt.current<700&&!(e.target as HTMLElement).closest('input,textarea,select')) e.preventDefault(); };
  useEffect(() => handle.onChange(() => {refresh(v=>v+1);const next=handle.selection();setIds(old=>old.join()===next.join()?old:next);}),[handle]);
  // Links and card actions name a tab; the old names (Appearance, Statistics) select Style and Stats.
  useEffect(() => {
    const choose = (event: Event) => { const tab = (event as CustomEvent<string | null>).detail; if (tab) setTab(normaliseTab(tab)); };
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
  const choices:string[]=node?tabsFor(node):[];
  const active=choices.includes(tab)?tab:choices[0], readOnly=isReadOnly();
  // A finished plot reports its snapshot, as its card badge does; export errors still show.
  const finished=node?.kind==='plot'&&node.finished ? (isStale(node,(handle.getSession().preparation as {revision?:number})?.revision??0) ? 'Finished · out of date' : 'Finished') : null;
  // Group comparison keeps its settings and confirm prompt on Stats (journey review 2.4): open there.
  const firstTab=node&&statsSource(node)?.includes('group_comparison')?'Stats':'Data';
  useEffect(()=>{setTab(firstTab);setStatus('Up to date');},[ids.join()]);
  const shown=node&&open?handle.cardShown?.(node.id):undefined;
  const statusText=finished && status==='Up to date' ? finished : finished || !node ? status : inspectorStatus(handle.cardShown?.(node.id), status);
  const single=!!node&&open&&ids.length===1;
  return <section id="inspector" onMouseDown={guard} data-open={open} aria-label={s.inspectorLabel}>
    <div className="inspector-sticky">
      <header className="inspector-head">{single ? <CardName node={node!} handle={handle} editable={!readOnly}/> : <h2>{ids.length>1 ? p.selectedCount(ids.length) : node?.label ?? s.inspectorLabel}</h2>}<button className="inspector-close" aria-label={s.closeInspector} aria-keyshortcuts="Escape" data-tip={tip(s.closeInspector, keys.closeInspector)} onClick={()=>ui({inspectorOpen:false})}>×</button>
        {node && open && <div className="inspector-head-row"><p role="status" className="status-pill" data-state={pillState(statusText, !!shown?.need && statusText===shown.need)}>{statusText}</p>
          {single && !readOnly && <InspectorActions handle={handle} node={node}/>}</div>}</header>
      {single && collab() && <Suspense fallback={null}><EditingBanner nodeId={node!.id}/></Suspense>}
      {single && <div role="tablist" aria-label={s.inspectorTabs} className="inspector-tabs">{choices.map(t=><button key={t} role="tab" aria-selected={active===t} onClick={()=>setTab(t)}>{t}</button>)}</div>}
    </div>
    {!node || !open ? <p>{s.selectToInspect}</p> : single && <>
      {/* View only: the settings stay readable, every control inside is disabled; Export keeps working. */}
      <div role="tabpanel"><fieldset className="inspector-fields" disabled={readOnly && active!=='Export'}>{active==='Data'?<DataTab key={node.id} node={node} handle={handle} onStatus={reportStatus}/>:active==='Style'?<AppearanceTab key={node.id} node={node} handle={handle}/>:active==='Stats'?<StatisticsTab key={node.id} node={node} handle={handle}/>:<ExportTab node={node} onStatus={reportStatus}/>}</fieldset></div>
    </>}
  </section>;
}
