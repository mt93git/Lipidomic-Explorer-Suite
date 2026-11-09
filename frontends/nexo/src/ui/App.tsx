import { AnalysisSettings } from './AnalysisSettings';
import { SessionPalettePanel } from './SessionPalette';
import { CohortEntry } from './Cohort/CohortEntry';
import { DesignDialog } from './Dialogs/DesignDialog';
import {FigurePage} from './FigurePage/FigurePage';
import { PanelBoundary } from './PanelBoundary';
import { createAutosave } from '../state/autosave';
import { CheckpointsDialog } from './Dialogs/CheckpointsDialog';
import { ShortcutsDialog } from './Dialogs/ShortcutsDialog';
import { checkpointHandle } from '../canvas/handle';
import { validateCanvas, saveCheckpoint, checkpointDownload, listCheckpoints, setSessionRecovery, reopenLostSession } from '../api';
import { reopenSession } from './sessionRecovery';
import { checkpointLabel } from './topBarLabel';
import { datasetSummary } from './datasetPrepare';
import { Inspector } from './Inspector/Inspector';
import { useEffect, useRef, useState } from 'react';
import { createCard, getCatalog, type Session } from '../api';
import { mountCanvas } from '../canvas';
import { CanvasHandleContext, tabsBridges, type Camera, type CanvasHandle } from '../canvas/handle';
import { Library } from './Library/Library';
import * as tabs from '../state/tabs';
import { store, ui, useShell, proxy, notify, notifyFailure, openLibrary } from './model';
import { TopBar } from './TopBar';
import { Rail } from './Rail';
import { TabsBar } from './TabsBar';
import { Toolbar } from './Toolbar';
import { StatusBand } from './StatusBand';
import { ZoomPill } from './ZoomPill';
import { Toast } from './Toast';
import { addNode, removeNodes } from '../state/commands';
import {setNexoStyle} from '../state/nexo';
import { duplicateNode } from '../canvas/editing';
import { tabsCommand, moveNodesToTab, deleteTabPlan } from './tabsWiring';
import { isReadOnly, readOnlyReason } from '../state/readonly';
import { selectOnEnter, watchCanvasDom } from './canvasDom';
import { strings as s, phrases as p } from './strings';
function ReadOnlyBanner() {
  // Journey review 9.2: compact on phones (CSS) and, once dismissed, gone for the rest of this browser session.
  const key = 'nexo-view-only-dismissed', [open, setOpen] = useState(() => { try { return sessionStorage.getItem(key) !== '1'; } catch { return true; } });
  const dismiss = () => { setOpen(false); try { sessionStorage.setItem(key, '1'); } catch { /* private mode: dismiss for this page only */ } };
  return open && <div className="readonly-banner" role="note"><p>{readOnlyReason() === 'link' ? s.viewOnlyLink : s.viewOnlyDevice}</p><button aria-label={s.dismissViewOnly} data-tip={s.dismissViewOnly} onClick={dismiss}>{s.close}</button></div>;
}
// Centred hint over an empty tab; only the button takes pointer events, so drops still reach the canvas.
function EmptyCanvas({ handle }: { handle: CanvasHandle | null }) {
  const readOnly = isReadOnly();
  // Wave 2 library/canvas: suggestions use the same queued add and selection path as the library.
  const [pending, setPending] = useState(false);
  const suggestions = [
    { source: 'results_dashboard-plot_pca', label: s.suggestPrincipal, icon: 'nx-scatter' },
    { source: 'results_dashboard-plot_violin', label: s.suggestDistributions, icon: 'nx-violin' },
    { source: 'results_dashboard-plot_heat', label: s.suggestHeatmap, icon: 'nx-heatmap' }
  ];
  const add = async (source: string) => {
    if (!handle || pending) return;
    setPending(true);
    try { await handle.addCard(source); ui({ inspectorOpen: true }); document.getElementById('viewport')?.focus({ preventScroll: true }); }
    catch (error) { notifyFailure(s.failAddPlot, error); }
    finally { setPending(false); }
  };
  return <div className="canvas-empty"><div className="canvas-empty-box">
    <svg className="canvas-empty-icon" viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><use href="#nx-scatter"/></svg>
    <p>{readOnly ? s.canvasEmptyViewOnly : s.canvasEmpty}</p>
    {!readOnly && <><div className="canvas-empty-actions"><button className="primary" onClick={() => openLibrary('plots')}>{s.addPlot}</button><button onClick={() => openLibrary('plots')}>{s.openLibraryShortcut}</button></div>
      <div className="canvas-suggestions" role="group" aria-label={s.suggestedPlots}>{suggestions.map(plot => <button key={plot.source} disabled={!handle || pending} onClick={() => void add(plot.source)}><svg width="18" height="18" aria-hidden="true"><use href={`#${plot.icon}`}/></svg>{plot.label}</button>)}</div>
    </>}
  </div></div>;
}
export function App({ session, title }: { session: Session; title?: string }) {
  const host = useRef<HTMLDivElement>(null), mounted = useRef(false), [ready, setReady] = useState(false);
  const state = useShell(), readOnly = isReadOnly();
  const cameras = useRef<Record<string, Camera>>({});
  const activeCameraTab = useRef('');
  const [analysisOpen,setAnalysisOpen]=useState(false);
  const [designOpen,setDesignOpen]=useState(false),[checkpointsOpen,setCheckpointsOpen]=useState(false),[shortcutsOpen,setShortcutsOpen]=useState(false);
  // ? outside a field opens the shortcuts list (view only too).
  useEffect(()=>{
    const help=(e:KeyboardEvent)=>{if(e.key!=='?'||e.defaultPrevented||e.ctrlKey||e.metaKey||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog'))return;e.preventDefault();setShortcutsOpen(true);};
    window.addEventListener('keydown',help);return()=>window.removeEventListener('keydown',help);
  },[]);
  const [saveText,setSaveText]=useState<string>(readOnly ? s.viewOnly : s.ready),[saveStatus,setSaveStatus]=useState(readOnly ? 'readonly' : 'idle');
  const [nearLimit, setNearLimit] = useState(session.near_limit === true);
  const [saveFailure,setSaveFailure]=useState(''),[saveLost,setSaveLost]=useState(false);
  const [sessionLost,setSessionLost]=useState(false),lostRef=useRef(false);
  const saver=useRef<ReturnType<typeof createAutosave> | null>(null);
  // The top bar names the checkpoint this page opened (or last saved by name), or the dataset it was prepared from; autosave keeps it.
  const [projectName,setProjectName]=useState<string>(title ?? s.project);
  useEffect(()=>{const id=new URL(location.href).searchParams.get('checkpoint');if(!id)return;let live=true;void listCheckpoints().then(list=>{if(live)setProjectName(name=>name===s.project?checkpointLabel(list,id,s.project):name);}).catch(()=>{});return()=>{live=false;};},[]);
  const saveNamed=async (label:string,token=`checkpoint-${crypto.randomUUID()}`)=>{
    if(!handle?.snapshotState)throw Error(s.canvasNotReady);
    const state=handle.snapshotState(),nexo=structuredClone(session.nexo??undefined);
    const ack=await validateCanvas(session.sessionId,token,state);if(!ack.ok)throw Error(ack.message ?? s.validationFailed);
    const record=await saveCheckpoint(session.sessionId,label,{token,state:ack.state},nexo);
    setNearLimit(record.near_limit === true);
    const url=new URL(location.href);url.searchParams.set('checkpoint',record.id);history.replaceState(null,'',url);if(label!=='autosave')setProjectName(checkpointLabel([record],record.id,s.project));return record;
  };
  const [figureMode,setFigureMode]=useState(false);
  const [handle, setHandle] = useState<CanvasHandle | null>(null);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    store.set(v => ({ ...v, tabs: tabs.validate((session.canvas as Session['canvas'] & { tabs?: unknown }).tabs, session.canvas.nodes.map(n => n.id)) }));
    // Wave 1: the canvas opens with the plots in front, both panels closed; an empty canvas opens the library
    // (on a desktop that can edit), since adding a plot is the only thing to do there.
    ui({ design: session.design, libraryOpen: !readOnly && !matchMedia('(max-width: 600px)').matches && !session.canvas.nodes.length });
    Object.assign(session.canvas, { tabs: tabs.serialize(store.get().tabs, session.canvas.nodes.map(n => n.id)) });
    const canvasHandle = checkpointHandle(mountCanvas(host.current!, session, { shellOwnsLibrary: true, shellOwnsInspector: true }));
    setHandle(canvasHandle);
    canvasHandle.onChange(()=>setFigureMode(canvasHandle.figureMode));
    // The figure page arrives with the canvas (fromCanvasV1 keeps state.document); the store starts from it.
    const inspector = host.current!.querySelector<HTMLElement>('#inspector')!;
    inspector.removeAttribute('id'); inspector.hidden = true; inspector.style.display = 'none';
    const selection = () => {
      const next = canvasHandle.selection().join();
      if (next !== previous) {
        previous = next;
        if (next && !closed) ui({ inspectorOpen: true });
        if (!next) closed = false;
      }
    };
    let previous = '', closed = false;
    const off = canvasHandle.onChange(selection);
    const shellSubscription = store.subscribe(v => v.ui.inspectorOpen, isOpen => { if (!isOpen && previous) closed = true; if (isOpen) closed = false; });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || (event.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog,[role=dialog]')) return;
      if (document.querySelector('.menu-wrap .menu,.card-menu:not([hidden])')) return;
      if (store.get().ui.inspectorOpen) { event.stopImmediatePropagation(); event.preventDefault(); ui({inspectorOpen:false}); }
      else if (store.get().ui.libraryOpen) { event.stopImmediatePropagation(); event.preventDefault(); ui({libraryOpen:false}); viewport?.focus({preventScroll:true}); }
    };
    window.addEventListener('keydown', escape, true);
    const root = host.current!, unwatch = watchCanvasDom(root, readOnly); root.addEventListener('keydown', selectOnEnter);
    setReady(true);
    // Shortcuts work from the start, but the ring is drawn only once the keyboard is used (the canvas opens unframed).
    const viewport = root.querySelector<HTMLElement>('#viewport');
    if (viewport) { viewport.classList.add('quiet-focus'); const loud = () => viewport.classList.remove('quiet-focus');
      viewport.addEventListener('keydown', loud, { once: true }); viewport.addEventListener('blur', loud, { once: true }); viewport.focus({ preventScroll: true }); }
    // The library floats over the canvas like a picker: working on the canvas puts it away (adding plots does not).
    viewport?.addEventListener('pointerdown', () => { if (store.get().ui.libraryOpen) ui({ libraryOpen: false }); }, true);
    return () => { off(); shellSubscription(); unwatch(); root.removeEventListener('keydown', selectOnEnter); window.removeEventListener('keydown', escape, true); };
    // mountCanvas has no teardown API; this app deliberately mounts one session
    // per page load, without StrictMode effect replay.
  }, [session]);
  useEffect(() => {
    if (!handle || readOnly) return;
    const shortcut = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') || e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['m', 'c'].includes(e.key.toLowerCase())) { e.preventDefault(); pickerNode.current = null; setPicker(e.key.toLowerCase() === 'm' ? 'move' : 'copy'); }
      if (e.key === 'Delete') { e.preventDefault(); handle.removeSelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); void handle.duplicateSelection().catch(error => notifyFailure(s.failDuplicate, error)); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [handle]);
  useEffect(() => { if (ready) proxy(state.ui.mode === 'move' ? 'hand' : 'select'); }, [ready, state.ui.mode]);
  useEffect(() => {
    if (!handle) return;
    const bridge = tabsBridges.get(handle)!;
    const sync = () => {
      const doc = bridge.document();
      const next = tabs.validate(doc.tabs, doc.nodes.map(n => n.id));
      // New library cards join the current tab; validation of loaded orphans remains first-tab.
      const raw = doc.tabs as tabs.TabState | null | undefined;
      const known = new Set(raw?.tabs.flatMap(t => t.nodes) ?? doc.nodes.map(n => n.id));
      const added = doc.nodes.filter(n => !known.has(n.id)).map(n => n.id);
      added.forEach(id => tabs.moveNode(next, id, next.active));
      if (added.length) { doc.tabs = tabs.clone(next); bridge.refresh(); }
      Object.assign(handle.getSession().canvas, { tabs: tabs.serialize(next, doc.nodes.map(n => n.id)) });
      if (activeCameraTab.current !== next.active) {
        if (activeCameraTab.current) cameras.current[activeCameraTab.current] = { ...bridge.camera };
        activeCameraTab.current = next.active;
        // A tab seen for the first time opens fitted (every card in view, at most 100 %); later it keeps its camera.
        const seen = cameras.current[next.active];
        if (seen) Object.assign(bridge.camera, seen); else { Object.assign(bridge.camera, { x: 24, y: 24, scale: 1 }); bridge.fitWhenShown(); }
        bridge.refresh();
      }
      cameras.current[next.active] = { ...bridge.camera };
      store.set(v => JSON.stringify(v.tabs) === JSON.stringify(next) && 'cameraByTab' in v.ui ? v : { ...v, tabs: next,
        ui: { ...v.ui, cameraByTab: cameras.current } });
    };
    const off = handle.onChange(sync); sync();
    return off;
  }, [handle]);
  useEffect(() => {
    const cardAction = (event: Event) => {
      const {action,nodeId} = (event as CustomEvent<{action:string;nodeId:string}>).detail;
      if (action === 'design') { setDesignOpen(true); return; }
      if (action === 'copy' || action === 'move') {
        pickerNode.current = nodeId; setPicker(action);
        requestAnimationFrame(() => document.querySelector<HTMLElement>('.canvas-header [role=dialog] button')?.focus());
      }
      else {
        ui({inspectorOpen:true});
        const source = handle?.getSession().canvas.nodes.find(n => n.id === nodeId)?.instance?.source ?? nodeId;
        window.dispatchEvent(new CustomEvent('nexo-inspector-tab', {detail:action === 'data' ? (source.includes('group_comparison') ? 'Statistics' : 'Data') : null}));
        requestAnimationFrame(() => document.querySelector<HTMLElement>('#inspector [role=tab][aria-selected=true]')?.focus());
      }
    };
    const el = host.current!; el.addEventListener('nexo-card-action', cardAction);
    return () => el.removeEventListener('nexo-card-action', cardAction);
  }, []);
  useEffect(()=>{
    if(!handle)return;
    if(import.meta.env.VITE_API_MOCK==='1')Object.assign((window as unknown as {__nexo:object}).__nexo,{handle});
    if(readOnly)return; // View only: no autosave and no checkpoint requests.
    const a=createAutosave({save:token=>saveNamed('autosave',token)});saver.current=a;
    let failed=false;
    const offStatus=a.subscribe(()=>{const st=a.state();setSaveText(st.text);setSaveStatus(st.status);setSaveFailure(st.failure);setSaveLost(st.lost);
      // Journey review 8.1: say once why saving fails and what keeps the work safe; the pill offers Retry now.
      if(st.status==='error'&&st.failure&&!failed&&!lostRef.current)notify(p.autosaveFailed(st.failure),true);failed=st.status==='error'||(failed&&st.status==='saving');});
    let previous=JSON.stringify(tabsBridges.get(handle)!.document());
    // Steph review row 12: the document as opened is the clean one; a change undone back to it leaves nothing unsaved.
    a.baseline(previous);
    const off=handle.onChange(()=>{const next=JSON.stringify(tabsBridges.get(handle)!.document());if(next!==previous){previous=next;a.markDirty(next);}});
    // Steph review rows 2/12: saved with a confirmed design that this session does not hold (production's restore
    // re-applies the archived design inputs, so this is the case where they did not come back, and the mock):
    // ask at once, prefilled, one click. Never confirmed by itself.
    if(handle.savedDesign?.()&&!session.design?.confirmed)setDesignOpen(true);
    const visibility=()=>{if(document.visibilityState==='hidden')void a.flush();};
    const leaving=(event:BeforeUnloadEvent)=>{const state=a.state();if(state.revision!==state.savedRevision){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',leaving);
    document.addEventListener('visibilitychange',visibility);
    if(import.meta.env.VITE_API_MOCK==='1')Object.assign((window as unknown as {__nexo:object}).__nexo,{autosave:a,handle});
    return()=>{off();offStatus();a.dispose();window.removeEventListener('beforeunload',leaving);document.removeEventListener('visibilitychange',visibility);};
  },[handle]);
  // A lost API session (evicted, closed, restarted): api.ts waits for this once per loss, then retries the request.
  // Autosave pauses meanwhile; the cards are put back on the reopened session and drawn again through the normal path.
  useEffect(()=>{
    if(!handle)return;
    setSessionRecovery(async lost=>{
      const a=saver.current;a?.pause();notify(s.reconnecting);
      const nodes=tabsBridges.get(handle)!.document().nodes as import('../api').Node[];
      try{
        const next=await reopenSession(lost,{checkpoint:new URL(location.href).searchParams.get('checkpoint'),design:session.design,nodes,nexoInputs:id=>handle.nexoInputs(id),nexoActions:id=>handle.nexoActions?.(id)??[]});
        if(!readOnly)a?.resume();notify(s.reconnected);
        // Redraw once the alias points at the reopened session (api.ts sets it when this resolves).
        setTimeout(()=>nodes.forEach(n=>handle.refreshCard(n.id)),0);
        return next;
      }catch(error){
        lostRef.current=true;setSessionLost(true);
        if(!readOnly&&a){a.resume();a.markLost(s.sessionLost);}
        throw error;
      }
    });
    return()=>setSessionRecovery(null);
  },[handle]);
  // Small fixes item 4: Reopen from the save pill (or the lost-session note) runs the same recovery again; on success
  // autosave saves the kept edits at once and the pill returns to normal.
  const reopenNow=async()=>{try{await reopenLostSession(session.sessionId);lostRef.current=false;setSessionLost(false);saver.current?.reopened();}catch{/* The recovery said why (session-lost note); Reopen stays offered. */}};
  const download=async()=>{try{const record=await saveNamed(s.downloadCheckpoint);const link=document.createElement('a');link.href=await checkpointDownload(record.id);link.download=`${record.name}.zip`;link.click();if(link.href.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(link.href),1000);}catch(error){notifyFailure(s.failZip,error);}};
  const edit = (change: (next: tabs.TabState) => void) => {
    if (!handle) return;
    const next = tabs.clone(store.get().tabs); change(next);
    tabsBridges.get(handle)!.dispatch(tabsCommand(next));
  };
  const copy = async (ids: string[], target: string, next = tabs.clone(store.get().tabs)) => {
    if (!handle) return;
    const originals = handle.getSession().canvas.nodes.filter(n => ids.includes(n.id));
    if (handle.getSession().canvas.nodes.length + originals.length > 40) { notify(s.cardLimit, true); return; }
    const catalog = (await getCatalog()).outputs;
    const copies = [];
    for (const node of originals) {
      const duplicate = duplicateNode(node);
      if (node.kind === 'plot') {
        const entry = catalog.find(e => e.id === node.instance?.source || e.output === node.id.replace(/^.*-plot_/, 'plot_'));
        if (!entry) throw new Error(s.unknownSource);
        const result = await createCard(session.sessionId, entry.id, node.instance?.inputs ?? handle.nexoInputs(node.id) ?? session.inputs, duplicate.instance!.instanceId);
        if (result.error) throw new Error(String(result.error));
        duplicate.id = result.nodeId;
        duplicate.instance = { instanceId: result.instanceId, source: entry.id, inputs: result.inputs };
      }
      copies.push(duplicate);
    }
    copies.forEach(n => tabs.assign(next, n.id, target));
    tabsBridges.get(handle)!.dispatch(tabsCommand(next, copies.flatMap((copy,i)=>[addNode(copy),setNexoStyle(copy.id,handle.nexoStyle(originals[i].id))])));
  };
  const pickerNode = useRef<string | null>(null);
  const [picker, setPicker] = useState<'move' | 'copy' | null>(null);
  const move = (target: string) => {
    if (!handle) return;
    if (pickerNode.current) {
      if (picker === 'copy') void handle.copyToTab(pickerNode.current, target).catch(error => notifyFailure(s.failCopy, error));
      else { handle.moveToTab(pickerNode.current, target); notify(p.movedToTab(store.get().tabs.tabs.find(t => t.id === target)?.name ?? target, 1), false, () => handle.undo()); }
      pickerNode.current = null; setPicker(null); return;
    }
    if (picker === 'copy') void copy(handle.selection(), target).catch(error => notifyFailure(s.failCopy, error));
    else { const count = handle.selection().length; tabsBridges.get(handle)!.dispatch(tabsCommand(moveNodesToTab(store.get().tabs, handle.selection(), target)));
      notify(p.movedToTab(store.get().tabs.tabs.find(t => t.id === target)?.name ?? target, count), false, () => handle.undo()); }
    setPicker(null);
  };

  return <CanvasHandleContext.Provider value={handle}><TopBar nearLimit={nearLimit} projectName={projectName} onCheckpoints={()=>setCheckpointsOpen(true)} saveText={saveText} saveStatus={saveStatus} saveFailure={saveFailure} onRetrySave={()=>void saver.current?.flush()} onReopen={saveLost?()=>void reopenNow():undefined}/><div className={`shell ${state.ui.libraryOpen && !readOnly ? '' : 'library-closed'} ${state.ui.inspectorOpen || figureMode ? 'inspector-open' : ''}`}>
    <Rail/>{!readOnly && <Library/>}<main className="canvas-column" aria-label={s.canvasArea}><div className="canvas-header"><TabsBar editTabs={edit} activate={id => {
        if (!handle) return;
        const next = tabs.clone(store.get().tabs); if (!tabs.setActive(next, id)) return;
        const bridge = tabsBridges.get(handle)!;
        bridge.document().tabs = tabs.serialize(next, bridge.document().nodes.map(n => n.id)); bridge.refresh();
      }}
      duplicate={id => { const next = tabs.clone(store.get().tabs); const result = tabs.duplicateTab(next, id); if (result.ok && result.id) void copy(result.sources!, result.id, next).catch(error => notifyFailure(s.failDuplicateTab, error)); }}
      remove={(id, target) => { if (!handle) return; const next = tabs.clone(store.get().tabs);
        const plan = deleteTabPlan(next, id, target ? 'move' : 'remove', target ?? undefined);
        const result = tabs.deleteTab(next, id, target);
        if (result.ok) tabsBridges.get(handle)!.dispatch(tabsCommand(next, plan.removals.length ? [removeNodes(plan.removals)] : []));
      }}/>
      {picker && <div role="dialog" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPicker(null); } }} aria-label={picker === 'move' ? s.moveToTab : s.copyToTab}><button onClick={() => setPicker(picker === 'move' ? 'copy' : 'move')}>{picker === 'move' ? s.copyToTabMenu : s.moveToTabMenu}</button><p className="picker-heading">{picker === 'move' ? s.moveToTab : s.copyToTab}</p>{state.tabs.tabs.filter(t => picker === 'copy' || t.id !== state.tabs.active).map(t => <button key={t.id} onClick={() => move(t.id)}>{t.id === state.tabs.active ? p.currentTab(t.name) : t.name}</button>)}<button onClick={() => setPicker(null)}>{s.cancel}</button></div>}<CohortEntry sessionId={session.sessionId} onChanged={()=>saver.current?.markDirty()}/><Toolbar onAnalysis={()=>setAnalysisOpen(true)} onSave={()=>setCheckpointsOpen(true)} onDownload={()=>void download()} onShortcuts={()=>setShortcutsOpen(true)}/></div><StatusBand figureMode={figureMode} summary={datasetSummary(session)}/>{sessionLost && <div className="session-lost" role="alert">{s.sessionLost}<button type="button" onClick={()=>void reopenNow()}>{s.reopenSession}</button><button type="button" onClick={()=>location.reload()}>{s.reloadPage}</button></div>}{readOnly && <ReadOnlyBanner/>}<div className="canvas-body"><div id="canvas-host" role="tabpanel" aria-labelledby={state.tabs.active} ref={host}/>{ready && <ZoomPill/>}{ready && !figureMode && !(state.tabs.tabs.find(t => t.id === state.tabs.active)?.nodes.length) && <EmptyCanvas handle={handle}/>}</div>{!analysisOpen && <Toast/>}</main>
    <aside className="inspector-column"><PanelBoundary resetKey={figureMode}>{handle && (figureMode ? <FigurePage handle={handle}/> : <Inspector handle={handle}/>)}</PanelBoundary></aside>
  </div>{analysisOpen && <AnalysisSettings session={session} onClose={()=>setAnalysisOpen(false)} onApplied={()=>saver.current?.markDirty()}/>}{designOpen && <DesignDialog sessionId={session.sessionId} saved={handle?.savedDesign?.()} onClose={() => setDesignOpen(false)} onConfirmed={design => { session.design = design; tabsBridges.get(handle!)?.refresh(); }}/>}{shortcutsOpen && <ShortcutsDialog onClose={()=>setShortcutsOpen(false)}/>}{state.ui.paletteOpen && !readOnly && <SessionPalettePanel session={session} onClose={()=>ui({paletteOpen:false})} onApplied={()=>saver.current?.markDirty()}/>}{checkpointsOpen && <CheckpointsDialog onClose={()=>setCheckpointsOpen(false)} save={label=>saveNamed(label)}/>}</CanvasHandleContext.Provider>;
}
