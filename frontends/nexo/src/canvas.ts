import { requestQueue, prefetchEnabled } from './prefetch';
import { needsStudyDesign, enlargedHeatmap } from './canvas/cardActions';
import { strings as s, phrases as p } from './ui/strings';
import { completeQueuedAdd } from './canvas/queuedAdd';
import { sanitizeSettings } from './statistics/settings';
import { align, distribute } from './canvas/align';
import {dataUrl,list as illustrationAssets} from './illustrations/assets';
import type {Visual} from './state/document';
import {setAppearance} from './state/visualCommands';
import { availability, availabilityReasons, groupCatalog, renderKindFor, newCardSize, pcaScoreCard } from './catalog';
import { clickSourceFor } from './plotlyClick';
import { place } from './place';
import { Card } from './cards';
import { autoRunStep, claimAutoRun } from './runNeeds';
import { getCatalog, createCard, confirmDesign, updateCard, updatePalette, replayActions, violinStatistics, parkCards, figureIntent, type CatalogEntry, type Node, type Session } from './api';
import { setSessionPalette, type WithPalette } from './palette/sessionPalette';
import { forgetPaletteRedraw } from './palette/paletteRedraw';
import {applyNexoStyle} from './editor/applyNexoStyle';
import {applyEditor} from './editor/applyEditor';
import {validateNexo,migrateMarkerSymbols,setNexoStyle,setNexoInputs,withSavedDesign} from './state/nexo';
import {setNexoComputed,computedResends,carryComputed,validateComputed} from './state/computed';
import {actionReplays,recordAction,recordedActions,replayFailures,replayRecorded,setReplayFailures} from './state/actions';
import {setNexoActions} from './state/nexo';
import {carryUploads,uploadsOf} from './state/layoutUpload';
import {designerActions} from './timecourse/designer';
/** A library copy has a Team instance (id, or instanceId before saving); a fixed dashboard card has none. */
const hasTeamInstance = (n: { instance?: unknown } | undefined) => { const i = n?.instance as { id?: unknown; instanceId?: unknown } | null | undefined; return !!(i?.id || i?.instanceId); };
import { createStore } from './state/store';
import { createHistory } from './state/history';
import { cardHeightFor, heightInputCommands, plotHeightOf, PLOT_HEIGHT } from './canvas/plotHeight';
import { setFinished, addNode, moveNodes, resizeNode, removeNodes, setGeometry, setNodeInputs, styleNodes } from './state/commands';
import { settle } from './canvas/settle';
import { clampSize, positionCommands, sizeCommands } from './ui/Inspector/cardSize';
import { applyToTabPlan, copyStyle as copyStyleOf, pasteEntry, readStyleClip, writeStyleClip } from './editor/style';
import { tidy as tidyLayout } from './canvas/tidy';
import { dragResult, keyboardNudge, duplicateNode, zoomShortcut, cardPress, beyondClick } from './canvas/editing';
import type { Guide } from './canvas/snap';
import { assignTiers, isThumb, type Tier } from './tiers';
import { tabsBridges, type CanvasHandle } from './canvas/handle';
import { validate as validateTabs, setActive as setActiveTab, serialize as serializeTabs } from './state/tabs';
import { fitScale, revealCamera, revealAddedCamera, type Cam } from './canvas/reveal';
import { focusCamera, FOCUS_BELOW } from './canvas/focus';
import { titleEditCommand } from './canvas/titleEdit';
import { overviewCamera, refitOnResize, ZOOM_MIN } from './canvas/overview';
import { adminSignInUrl, adminUserId } from './api/adminToken';
import { minimapVisible, remoteViewports, type RemoteViewport } from './canvas/minimap';
import { dropWorldPoint, type DropPoint } from './canvas/drop';
import { notify, notifyFailure, ui as shellUi } from './ui/model';
import { assign as assignTab } from './state/tabs';
import { tabsCommand, moveNodesToTab, visibleNodeIds } from './ui/tabsWiring';
import { isReadOnly, setRoleReadOnly } from './state/readonly';
import { collab } from './collab/mode';
import { clipboard, copyPlot, pasteTemplate } from './clipboard';
import { cardInstanceId } from './api/instance';
export type { CanvasHandle } from './canvas/handle';
/** A refused input intent restores the authoritative baseline before store subscribers reconcile the card. */
export function restoreRefusedInputs<S extends { nodes: Node[]; nexo: import('./state/nexo').Nexo }>(
  doc: import('yjs').Doc, store: { set(update: (state: S) => S): void },
  card: Pick<Card, 'node' | 'inputs' | 'fixedInputs'>,
) {
  const node = doc.getMap<import('yjs').Map<unknown>>('nodes').get(card.node.id)?.toJSON() as Node | undefined;
  if (!node) return;
  const shared = doc.getMap('nexo').toJSON() as import('./state/nexo').Nexo;
  const inputs = shared.nodes?.[node.id]?.inputs;
  if (card.node.instance) card.node.instance.inputs = structuredClone(node.instance?.inputs ?? {});
  card.fixedInputs = !node.instance && inputs ? structuredClone(inputs) : undefined;
  Object.keys(card.inputs).forEach(k => delete card.inputs[k]);
  Object.assign(card.inputs, structuredClone({ ...node.instance?.inputs, ...inputs }));
  store.set(state => ({ ...state,
    nodes: state.nodes.map(n => n.id === node.id && n.instance ? { ...n, instance: { ...n.instance, inputs: structuredClone(node.instance?.inputs ?? {}) } } : n),
    nexo: { ...state.nexo, nodes: { ...state.nexo.nodes, [node.id]: { ...state.nexo.nodes[node.id], inputs: structuredClone(inputs) } } },
  }));
}
/** A motion token (tokens.css) in milliseconds: 0 under prefers-reduced-motion, where every token is 0ms. */
function motionMs(token: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(value); return Number.isFinite(n) && n > 0 ? (value.endsWith('ms') ? n : n * 1000) : 0;
}
export function mountCanvas(root: HTMLElement, session: Session, host: { shellOwnsLibrary?: boolean; shellOwnsInspector?: boolean } = {}): CanvasHandle {
  function statisticsCommand(id:string, value:import('./state/document').Statistics|null):import('./state/commands').Command {
    const copy=structuredClone(value);
    return {kind:'setStatistics',apply(doc){return {...doc,nodes:doc.nodes.map(n=>n.id===id?{...n,statistics:structuredClone(copy)}:n)};},invert(doc){return statisticsCommand(id,(doc.nodes.find(n=>n.id===id) as Node)?.statistics??null);}};
  }
  // NEXO-P3: a saved Nexo marker symbol moves to Team's markerSymbol before validateNexo drops it.
  const canvas = structuredClone(session.canvas);
  const store = createStore({...canvas,nodes:migrateMarkerSymbols(canvas.nodes,session.nexo),nexo:validateNexo(session.nexo,canvas.nodes.map(n=>n.id))});
  const teamView=new Set<string>();
  let history: Pick<ReturnType<typeof createHistory>, 'dispatch' | 'undo' | 'redo' | 'canUndo' | 'canRedo' | 'cursor'> & { origin?: { kind: string } } = createHistory(store);
  const perf = { lastDrawMs: NaN, draws: 0 };
  if (import.meta.env.VITE_API_MOCK === '1') Object.assign(window, { __nexo: { store, perf } });
  // Collaboration on (collab/mode.ts): every edit goes through the shared document (collab/history.ts) and Ctrl+Z undoes
  // this person's own. Off, `history` stays createHistory's, `joined` is undefined and nothing collab is loaded.
  const board = collab();
  let shareView: ((activeTab: string, camera: Cam, viewport: { width: number; height: number }) => void) | undefined;
  let following: { moved(activeTab: string, camera: Cam): void } | undefined;
  let presence: { render(): void; selection(ids: string[]): void } | undefined;
  // Other people on this tab are rectangles in the minimap (prototype scene 1); `drawnTab` is the tab draw() last showed.
  let viewports: (() => RemoteViewport[]) | undefined, drawnTab = '';
  const joined = board ? import('./collab/provider').then(m => m.joinBoard(board, store, shared => { history = shared; })).then(shared => {
    shareView = shared.view;
    void Promise.all([import('./collab/provider'), import('./canvas/presence'), import('./canvas/pins'), import('./canvas/following')]).then(([provider, ui, pins, follow]) => { const awareness = provider.getAwareness(); if (awareness) {
      presence = ui.mountPresence(awareness, vp, world, camera, () => cards); pins.mountPins(awareness.doc, vp, world, camera);
      following = follow.mountFollowing(awareness, stage, { size: () => vp.getBoundingClientRect(), adopt: adoptView });
      viewports = () => remoteViewports(awareness.getStates(), awareness.clientID, drawnTab);
      awareness.on('change', () => minimap(vp.clientWidth, vp.clientHeight)); draw(); } });
    // My userId comes from Admin's token answer: the sidecar never echoes it into my own awareness state.
    // Phase 3: a card someone else changed says so and draws again at the new revision (collab/render.ts); its Data
    // form, open or cached, reloads from the engine (UX review 2: a form left behind sent the old values back).
    void Promise.all([import('./collab/provider'), import('./collab/render')]).then(([provider, render]) => { const meta = provider.getProvider()?.document.getMap('meta');
      if (meta) render.followChanges(meta, () => adminUserId() ?? provider.getAwareness()?.getLocalState()?.userId, (id, text) => { cards.find(c => c.node.id === id)?.changedBy(text); window.dispatchEvent(new CustomEvent('nexo-inputs-restored', { detail: id })); },
        // Someone else's new card may be off this person's screen: say so, Show takes the camera there.
        (id, text) => notify(text, false, () => { const c = cards.find(c => c.node.id === id); if (!c) return; selected = new Set([c]); draw(); revealAddedAfterLayout(id); flash(c); }, 'Show')); });
    if (import.meta.env.VITE_API_MOCK === '1') Object.assign((window as unknown as { __nexo: object }).__nexo, { collab: shared.history });
    return shared;
  }, error => {
    // A refused or signed-out join: one sentence, and no editing tools (edits here would never reach the board).
    setRoleReadOnly(true);
    if (String(error instanceof Error ? error.message : error).includes('AdminSignInRequired'))
      notify('Sign in to Admin to work on this board.', true, () => location.assign(adminSignInUrl(location.href)), 'Sign in to Admin');
    else notify('This project is not available to your account.', true);
    return undefined;
  }) : undefined;
  // A change another person made, or the first opener's seed, is drawn but never sent to the engine (plan 2.3).
  const quiet = () => history.origin?.kind === 'remote' || history.origin?.kind === 'init';
  const listeners = new Set<() => void>();
  root.innerHTML = `<header class="top"><strong>Nexo v0</strong><span>Read-only canvas</span>${host.shellOwnsLibrary ? '' : '<button id="library-toggle">Library</button>'}<button id="select" aria-pressed="true">Select</button><button id="hand" aria-pressed="false">Pan</button><button id="inspect">Inspector</button></header><div class="canvas-main"><section class="stage"><div id="viewport" tabindex="0" aria-label="Canvas"><div id="world"></div><div id="marquee"></div></div>${host.shellOwnsLibrary ? '' : '<nav id="library" hidden aria-label="Plot library"></nav>'}<div class="zoom"><button id="out" aria-label="Zoom out">−</button><select id="zoom" aria-label="Zoom"><option value="0.25">25%</option><option value="0.5">50%</option><option value="1" selected>100%</option><option value="2">200%</option></select><button id="in" aria-label="Zoom in">+</button><button id="fit">Fit</button></div><svg id="minimap" aria-label="Minimap" role="img" preserveAspectRatio="none"></svg><output id="hud" aria-hidden="true"></output></section><aside id="inspector" aria-label="Read-only inspector"></aside></div>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const vp = $('viewport'), world = $('world'), inspector = $('inspector'), marquee = $('marquee');
  // Under 900 px the inspector is a bottom sheet over the zoom bar: start closed.
  if (matchMedia('(max-width: 899px)').matches) inspector.hidden = true;
  const map = root.querySelector<SVGSVGElement>('#minimap')!;
  // Wave 2 library/canvas: automatic minimap, preserving Nexo v0's corner and gestures.
  let minimapPinned = false, minimapCorner = false;
  const stage = vp.parentElement!;
  stage.addEventListener('pointermove', e => {
    const r = vp.getBoundingClientRect();
    const corner = e.clientX >= r.left && e.clientX <= r.left + 190 && e.clientY >= r.bottom - 120 && e.clientY <= r.bottom;
    if (corner !== minimapCorner) { minimapCorner = corner; requestDraw(); }
  });
  stage.addEventListener('pointerleave', () => { minimapCorner = false; requestDraw(); });
  map.setAttribute('tabindex', '0'); map.setAttribute('role', 'button'); map.setAttribute('aria-label', s.minimapRecenter);
  map.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); e.stopPropagation(); const b = map.viewBox.baseVal;
    camera.x = vp.clientWidth / 2 - (b.x + b.width / 2) * camera.scale;
    camera.y = vp.clientHeight / 2 - (b.y + b.height / 2) * camera.scale; draw();
  });
  let figureMode=false; let draftCamera={x:24,y:24,scale:1};
  const figureLayer=document.createElement('div');figureLayer.id='figure-layer';figureLayer.hidden=true;world.append(figureLayer);
  const camera = { x: 24, y: 24, scale: 1 };
  let selected = new Set<Card>(), hand = false, space = false, wheelTimer = 0, wheelActive = false;
  let gesture: { kind: 'pan' | 'marquee' | 'pinch'; x: number; y: number; cx: number; cy: number; base: Set<Card>; distance?: number; scale?: number } | undefined;
  const pointers = new Map<number, { x: number; y: number }>();
  let catalog: CatalogEntry[] = [], catalogKnown = false;
  // Chart audit b05 F5: the input holding the module's own plot height (catalog heightInput), for a Team card.
  const heightInputFor = (n: { instance?: unknown } | undefined) => { const source = (n?.instance as { source?: unknown } | null | undefined)?.source; return hasTeamInstance(n) && typeof source === 'string' ? catalog.find(e => e.id === source)?.heightInput : undefined; };
  // Such a card's size change, its neighbours settled and the input written back: one undo step (with fold, part of the current one).
  function dispatchPlotHeight(id: string, input: string, size: { width: number; height: number }, key: string, fold = false) {
    const n = store.get().nodes.find(n => n.id === id), c = cards.find(c => c.node.id === id); if (!n) return;
    const inputs = (n.instance as { inputs?: Record<string, unknown> } | undefined)?.inputs ?? (c ? { ...c.inputs } : undefined);
    heightInputCommands(store.get().nodes, id, input, size, key, inputs).forEach((command, i) => history.dispatch(command, { fold: fold || i > 0 }));
  }
  const cards: Card[] = [];
  window.addEventListener('nexo-design-confirmed', () => reconcile());
  window.addEventListener('nexo-plot-exported', () => cards.forEach(c => c.updateTitle()));
  const restoringIds = new Set(session.canvas.nodes.map(n => n.id));
  // Computed controls last sent to each Team card (Nexo's member), so undo/redo re-sends only real changes.
  const sentComputed = new Map<string, string>();
  // Pilot F1: the session palette last sent to the API (the document's sessionPalette), so undo/redo re-send only real changes.
  let sentPalette: string | undefined;
  /** NEXO-P2 (Team card_status.js autoRun): Remodeling shifts and Species press their structural steps themselves once the
   *  comparison is ready, once per card and step, through the card run action (updateCard), recorded as a manual press. */
  function autoRun(c: Card, n: Node) {
    const instance = n.instance?.instanceId ?? n.instance?.id;
    if (isReadOnly() || !instance || n.finished) return;
    const step = autoRunStep(n.instance?.source ?? n.id, !needsStudyDesign(n, catalog, session.design), recordedActions(store.get().nexo.nodes[n.id]?.actions), c.inputs);
    if (!step || !claimAutoRun(`${session.sessionId}/${instance}|${step}`)) return;
    void updateCard(session.sessionId, instance, {}, [step]).then(result => {
      Object.assign(c.inputs, result.inputs); store.set(doc => recordAction(n.id, step).apply(doc)); c.reload(); autoRun(c, n);
    }, () => undefined);
  }
  function add(node: Node) {
    const c = new Card(node, session, inspect, renderKindFor(node, catalog), restoringIds.has(node.id));
    const fixedInputs = hasTeamInstance(node) ? undefined : store.get().nexo.nodes[node.id]?.inputs;
    if (fixedInputs) { c.fixedInputs = structuredClone(fixedInputs); Object.keys(c.inputs).forEach(k => delete c.inputs[k]); Object.assign(c.inputs, structuredClone(fixedInputs)); }
    c.onAction(action => {
      if (isReadOnly() && action !== 'data' && action !== 'inspect') return;
      selected = new Set([c]); draw();
      if (action === 'duplicate') void handle.duplicate(node.id).catch(error => notify(`Could not duplicate the plot: ${error instanceof Error ? error.message : String(error)}`, true));
      else if (action === 'copyplot') { if (handle.copyPlot(node.id)) notify('Copied plot settings'); }
      else if (action === 'enlarge') { const size = enlargedHeatmap(c.node), key = `enlarge:${++sequence}`; history.dispatch(resizeNode(node.id, size.width, size.height, key)); settleDrop([node.id], key); reveal(node.id); }
      else if (action === 'remove') handle.remove(node.id);
      else if (action === 'finish' && node.kind==='plot') handle.finishCard(node.id);
      else {
        if (action === 'edit' && c.node.kind==='plot' && c.node.finished) handle.editFigure(node.id);
        root.dispatchEvent(new CustomEvent('nexo-card-action', {bubbles:true, detail:{action:action==='finish'?'edit':action, nodeId:node.id}}));
      }
    });
    // Wave 2 inline title: share the inspector Label path, including illustration snapshots.
    c.onTitleEdit(label => handle.setAppearance(node.id, { label }), () => {
      selected = new Set([c]);
      if (camera.scale < FOCUS_BELOW) {
        if (!overview) setOverview(viewNow());
        flyTo(focusCamera({ width: vp.clientWidth, height: vp.clientHeight }, { ...camera, scale: FOCUS_BELOW }, c.node));
      } else draw();
    });
    // Chart audit b12: a click on a cell plot's point reaches Team's observer (plotlyClick.ts); the inputs it changes
    // (cell_class / cell_sample) are recorded as the same choice made in the Data tab: one undo step, redrawn.
    c.clickSource = clickSourceFor(node, catalog);
    c.onPlotClick(inputs => { if (isReadOnly()) return; handle.updateCardInputs(node.id, inputs); window.dispatchEvent(new CustomEvent('nexo-inputs-restored', { detail: node.id })); },
      error => notifyFailure('apply the click', error));
    cards.push(c); world.append(c.el); return c;
  }


  const guides = document.createElement('div'); Object.assign(guides.style, { pointerEvents: 'none', position: 'absolute', zIndex: '100' }); world.append(guides);
  function showGuides(lines: Guide[]) {
    guides.replaceChildren();
    for (const g of lines) {
      const line = document.createElement('div'); line.className = 'snap-guide';
      Object.assign(line.style, { position: 'absolute', background: 'var(--accent)',
        left: `${g.axis === 'x' ? g.at : g.from}px`, top: `${g.axis === 'y' ? g.at : g.from}px`,
        width: g.axis === 'x' ? '1px' : `${g.to - g.from}px`, height: g.axis === 'y' ? '1px' : `${g.to - g.from}px` });
      guides.append(line);
    }
  }
  function geometry(c: Card, n: Node) {
    Object.assign(c.el.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.width}px`, height: `${n.height}px` });
  }
  function reconcile() {
    // The size label lives only while its card is being resized (a render mid-drag reconciles too).
    cards.forEach(c => { if (editing?.card !== c || !editing.resize) delete c.el.dataset.resizeSize; });
    const doc = store.get(), { sessionPalette, ...canvasDoc } = doc as WithPalette; Object.assign(session.canvas, canvasDoc); session.nexo=doc.nexo;
    // Undo/redo of a session palette change: send the restored state; every card redraws (updatePalette invalidates them).
    if (!quiet() && sessionPalette && sentPalette !== undefined && JSON.stringify(sessionPalette) !== sentPalette) {
      sentPalette = JSON.stringify(sessionPalette);
      void updatePalette(session.sessionId, { restore: sessionPalette }).then(value => window.dispatchEvent(new CustomEvent('nexo-palette-restored', { detail: value })),
        error => notify(`Could not restore the session palette: ${error instanceof Error ? error.message : String(error)}`, true));
    }
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i];
      if (!doc.nodes.some(n => n.id === c.node.id)) { selected.delete(c); c.dispose(); c.el.remove(); cards.splice(i, 1); }
    }
    for (const n of doc.nodes) {
      let c = cards.find(c => c.node.id === n.id);
      if (!c) {
        // A card is made once the catalog is known (it gives the renderer): a joiner's shared document can come first,
        // and a card made then was drawn as plotly, so a png card asked for json and failed (FIX-JOINER-PNG).
        if (!catalogKnown) continue;
        c = add(structuredClone(n));
        const handle = document.createElement('div'); handle.className = 'resize-handle'; handle.setAttribute('aria-label', 'Resize card');
        Object.assign(handle.style, { position: 'absolute', right: '0', bottom: '0', width: '16px', height: '16px', cursor: 'nwse-resize', touchAction: 'none' });
        c.el.append(handle); c.el.querySelector('header')!.style.touchAction = 'none';
      }
      const resized = c.node.width !== n.width || c.node.height !== n.height;
      const statisticsChanged = JSON.stringify(c.node.statistics)!==JSON.stringify(n.statistics);
      const nexo=doc.nexo.nodes[n.id]?.style;
      const nexoChanged=JSON.stringify(c.nexoStyle)!==JSON.stringify(nexo)||c.teamPreview!==teamView.has(n.id);c.nexoStyle=nexo;c.teamPreview=teamView.has(n.id);
      let badge=c.el.querySelector<HTMLElement>('.nexo-style-badge');if(doc.nexo.nodes[n.id]?.style){if(!badge){badge=document.createElement('span');badge.className='nexo-style-badge';badge.textContent=s.nexoBadge;c.el.querySelector('header')?.append(badge);}badge.hidden=teamView.has(n.id);}else badge?.remove();
      const edited = JSON.stringify((c.node.visual as Visual | undefined)?.editor)!==JSON.stringify((n.visual as Visual | undefined)?.editor);
      const comparisonChanged = JSON.stringify((c.node.visual as Visual | undefined)?.groupComparison)!==JSON.stringify((n.visual as Visual | undefined)?.groupComparison);
      const snapshotChanged=JSON.stringify(c.node.finished)!==JSON.stringify(n.finished);
      // Undo/redo of a Data-tab change: the document holds inputs the server does not have yet.
      // A fixed dashboard card keeps its inputs in Nexo's member (Team's node has no instance for them).
      const fixedInputs = hasTeamInstance(n) ? undefined : doc.nexo.nodes[n.id]?.inputs;
      const target = n.instance?.inputs ?? fixedInputs, previous = c.node.instance?.inputs ?? c.fixedInputs;
      const restored = n.kind === 'plot' && !!target && JSON.stringify(previous) !== JSON.stringify(target) && JSON.stringify(c.inputs) !== JSON.stringify(target);
      c.fixedInputs = fixedInputs && structuredClone(fixedInputs);
      Object.assign(c.node, structuredClone(n));
      c.plotInput = heightInputFor(n);
      // Undo removes an appearance field the node never had (visualCommands): the card's copy drops it too.
      for (const k of ['color', 'visual'] as const) if (!(k in n)) delete (c.node as Partial<typeof c.node>)[k];
      if (restored && quiet()) { Object.assign(c.inputs, structuredClone(target)); c.reload(); }
      else if (restored) restoreInputs(c, target as Record<string, unknown>);
      // Undo/redo of a computed control (Nexo's member): send the restored values to the Team card and redraw it.
      if (hasTeamInstance(n)) { const now = validateComputed(doc.nexo.nodes[n.id]?.inputs), key = JSON.stringify(now), instance = n.instance?.instanceId ?? n.instance?.id;
        if (!quiet() && sentComputed.has(n.id) && sentComputed.get(n.id) !== key && instance && Object.keys(now).length) void updateCard(session.sessionId, instance, now, designerActions(now)).then(() => { c.reload(); window.dispatchEvent(new CustomEvent('nexo-inputs-restored', {detail:n.id})); }, error => notify(`Could not restore the plot: ${error instanceof Error ? error.message : String(error)}`, true));
        sentComputed.set(n.id, key); }
      if(snapshotChanged)c.refreshSnapshot();
      c.el.style.background = (n.visual as Visual | undefined)?.background ?? '';
      if(nexoChanged || edited || statisticsChanged || comparisonChanged) void c.refreshEditor(); geometry(c, n);
      c.setDesignRequired(needsStudyDesign(n, catalog, session.design));
      autoRun(c, n);
      c.updateTitle(); c.el.setAttribute('aria-label', n.label);
      if (resized && c.current === 'live') { c.setTier('frozen'); c.setTier('live'); }
    }
    draw();
  }
  // Journey review 4.2: a Data change can change the drawn values; ask the server whether the confirmed statistics
  // still match (as the Statistics tab does when it opens) and drop stale p-values in the same undo step.
  async function recheckStatistics(nodeId: string, mark: number) {
    const n = store.get().nodes.find(n => n.id === nodeId), st = n?.statistics;
    if (!n || !st?.result || !st.applied) return;
    const instance = cardInstanceId(n);
    try {
      const reply = await violinStatistics(session.sessionId, instance, { mode: 'check', settings: sanitizeSettings(st.applied), dataFingerprint: st.result.dataFingerprint });
      const current = reply.dataFingerprint ?? reply.result?.dataFingerprint;
      const stale = reply.status === 'blocked' || ((reply.status === 'invalidated' || reply.status === 'unchanged') && current !== st.result.dataFingerprint);
      if (!stale || JSON.stringify(store.get().nodes.find(x => x.id === nodeId)?.statistics) !== JSON.stringify(st)) return;
      history.dispatch(statisticsCommand(nodeId, { ...st, result: null }), { fold: history.cursor === mark && !history.canRedo });
      notify('Statistics cleared: the plotted data changed. Review and confirm them again in Statistics.');
    } catch { /* The Statistics tab checks again when it opens. */ }
  }
  // The latest restore sent per card: an earlier one that answers late must not overwrite it.
  const restoreTurn = new WeakMap<Card, number>();
  function restoreInputs(c: Card, inputs: Record<string, unknown>) {
    const changed = Object.fromEntries(Object.entries(inputs).filter(([k, v]) => JSON.stringify(c.inputs[k]) !== JSON.stringify(v)));
    // The card holds the values being restored from now on: a Redo that comes before this PATCH answers is compared
    // with them (chart audit b04 F1: it looked like no change, was never sent, and the server kept the undone value).
    Object.assign(c.inputs, structuredClone(changed));
    const turn = (restoreTurn.get(c) ?? 0) + 1; restoreTurn.set(c, turn);
    c.setStatus('updating');
    // The same instance id the Data tab patches: a node with no instance answers as tcinstance_v0_<output> / tcinstance_fixed_<id>.
    const instance = cardInstanceId(c.node);
    void updateCard(session.sessionId, instance, changed as import('./api').Inputs).then(result => {
      if (restoreTurn.get(c) !== turn) return;
      Object.keys(c.inputs).forEach(k => delete c.inputs[k]); Object.assign(c.inputs, result.inputs);
      c.setTier('culled'); draw(); window.dispatchEvent(new CustomEvent('nexo-inputs-restored', { detail: c.node.id }));
    }, async error => {
      if (board && restoreTurn.get(c) === turn) {
        const { getProvider } = await import('./collab/provider'), doc = getProvider()?.document;
        if (doc) {
          const nexo = doc.getMap('nexo').toJSON() as import('./state/nexo').Nexo;
          sentComputed.set(c.node.id, JSON.stringify(validateComputed(nexo.nodes?.[c.node.id]?.inputs)));
          restoreRefusedInputs(doc, store, c);
          window.dispatchEvent(new CustomEvent('nexo-inputs-restored', { detail: c.node.id }));
        }
      }
      c.setStatus('error'); notify(`Could not restore the plot settings: ${error instanceof Error ? error.message : String(error)}`, true);
    });
  }
  vp.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('application/nexo-illustration'))e.preventDefault();});
  // Keyboard: Tab onto a card brings it into view with the camera, before the browser would scroll the stage to it.
  world.addEventListener('focusin', e => { const c = cards.find(c => c.el.contains(e.target as globalThis.Node)); if (c && (e.target as Element).matches(':focus-visible')) reveal(c.node.id); });
  vp.addEventListener('drop',e=>{if(isReadOnly())return;const id=e.dataTransfer?.getData('application/nexo-illustration');if(id){e.preventDefault();handle.addIllustration(id);}});
  const selection = () => [...selected].map(c => c.node.id);
  let sequence = 0;
  function applyMoves(moves: { id: string; x: number; y: number }[], key: string, fold = false) {
    for (const m of moves) {
      const n = store.get().nodes.find(n => n.id === m.id)!;
      const c = cards.find(c => c.node.id === m.id)!;
      // Row 17: panel-speed slide from the tokens; reduced motion zeroes the token, and the element then gets no transition at all.
      const ms = motionMs('--motion-panel');
      c.el.style.transition = ms ? 'left var(--motion-panel) var(--ease), top var(--motion-panel) var(--ease)' : '';
      history.dispatch(setGeometry(m.id, { ...n, x: m.x, y: m.y }, key), { fold }); fold = true;
      window.setTimeout(() => { c.el.style.transition = ''; }, ms);
    }
  }
  function settleDrop(ids: string[], key: string) { applyMoves(settle(store.get().nodes, ids), key, true); }
  function remove(ids: string[]) {
    if (!ids.some(id => store.get().nodes.some(n => n.id === id))) return;
    // Collab mode: the sidecar parks them and takes them out of the document (api.ts parkCards).
    if (parkCards(ids)) { vp.focus({preventScroll:true}); return; }
    history.dispatch(removeNodes(ids)); notify(ids.length === 1 ? 'Card removed' : 'Cards removed', false, () => history.undo());
    vp.focus({preventScroll:true});
  }
  function removeSelection() { remove(selection()); }
  async function duplicate(ids: string[], target?: string, originals = store.get().nodes.filter(n => ids.includes(n.id)), pastedStyle?:import('./state/nexo').NexoStyle, pastedComputed?:Record<string,unknown>) {
    await catalogReady;
    if (store.get().nodes.length + originals.length > 40) throw new Error('A workspace can have up to 40 cards.');
    const copies: Node[] = [];
    for (const n of originals) {
      const copy = duplicateNode(n);
      if (n.kind === 'plot') {
        const entry = catalog.find(e => e.id === copy.instance!.source || e.output === n.id.replace(/^.*-plot_/, 'plot_'));
        if (!entry) throw new Error('Unknown source');
        // Collab mode: the sidecar writes the placed copy into the document (api.ts createCard); this page adds no node.
        const placed = board ? { ...copy, id: `${copy.instance!.instanceId}-${entry.output}` } : undefined;
        const result = await createCard(session.sessionId, entry.id, n.instance?.inputs ?? store.get().nexo.nodes[n.id]?.inputs ?? session.inputs, copy.instance!.instanceId, undefined, placed);
        if (result.error) throw new Error(String(result.error));
        copy.id = result.nodeId; copy.instance = { instanceId: result.instanceId, source: entry.id, inputs: result.inputs };
      }
      copies.push(copy);
    }
    const doc = store.get(), tabs = validateTabs(doc.tabs, doc.nodes.map(n => n.id));
    if (target && !tabs.tabs.some(t => t.id === target)) throw new Error('Unknown tab');
    copies.forEach(copy => assignTab(tabs, copy.id, target ?? tabs.active));
    // b11 F3: an uploaded configuration file (Nexo's member) goes with the copy; its effect is already in the copied instance inputs.
    const uploads = copies.map((copy,i) => hasTeamInstance(copy) && !pastedComputed ? uploadsOf(store.get().nexo.nodes[originals[i].id]?.inputs) : {});
    const carried = copies.map((copy,i) => hasTeamInstance(copy) ? validateComputed(pastedComputed ?? store.get().nexo.nodes[originals[i].id]?.inputs) : {});
    // Computed controls (Nexo's member) travel with the copy: its new Team card gets them in one PATCH.
    await Promise.all(copies.map((copy,i) => Object.keys(carried[i]).length ? updateCard(session.sessionId, copy.instance!.instanceId!, carried[i], designerActions(carried[i])) : undefined));
    // Chart audit b07 F3: the module buttons pressed on the original are pressed on the copy (after its inputs), before
    // it is drawn; the copy records them too. A failed replay leaves Team's placeholder and the Inspector says so.
    const pressed = copies.map((copy,i) => hasTeamInstance(copy) ? recordedActions(store.get().nexo.nodes[originals[i].id]?.actions) : []);
    await Promise.all(copies.map((copy,i) => pressed[i].length ? replayRecorded(copy.id, pressed[i], actions => replayActions(session.sessionId, copy.instance!.instanceId!, actions)) : undefined));
    // Collab mode: only the tab is this page's write (a new node and Nexo's member are the server's, admission.mjs).
    if (board) history.dispatch(tabsCommand(tabs, copies.filter(copy => copy.kind !== 'plot').map(addNode)));
    else history.dispatch(tabsCommand(tabs, copies.flatMap((copy,i)=>[addNode(copy),setNexoStyle(copy.id,pastedStyle??store.get().nexo.nodes[originals[i].id]?.style??{}),...(Object.keys(carried[i]).length||Object.keys(uploads[i]).length?[Object.keys(uploads[i]).length?carryUploads(copy.id,uploads[i],carried[i]):carryComputed(copy.id,carried[i])]:[]),...(pressed[i].length?[setNexoActions(copy.id,pressed[i])]:[])])));
    selected = new Set(cards.filter(c => copies.some(n => n.id === c.node.id))); draw();
    // Focus follows the new selection: a focused card stacks above a selected one (shell.css), so the original,
    // still holding focus from its Duplicate button, would cover the copy placed 24 px below it.
    requestAnimationFrame(() => cards.find(c => c.node.id === copies[0]?.id)?.el.focus({ preventScroll: true }));
  }
  const duplicateSelection = () => duplicate(selection());
  async function paste() {
    const clip = clipboard();
    if (!clip || isReadOnly()) return;
    const node = pasteTemplate(clip), spot = place(store.get().nodes, { x: node.x + 24, y: node.y + 24, width: node.width, height: node.height });
    await duplicate([], undefined, [{ ...node, x: spot.x - 24, y: spot.y - 24 }],clip.nexoStyle,clip.nexoComputed);
    const pasted = [...selected][0]; if (pasted) { reveal(pasted.node.id); flash(pasted); notify('Pasted as a new card', false, () => history.undo()); }
  }
  let editing: { pointer: number; x: number; y: number; card: Card; resize: boolean; starts: Node[]; dx: number; dy: number; armed: boolean } | undefined;
  store.subscribe(doc => doc, reconcile);

  function inspect() {
    if (host.shellOwnsInspector) return;
    inspector.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = `Inspector · ${selected.size} selected`;
    const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => { inspector.hidden = true; };
    inspector.append(heading, close);
    const card = [...selected][0];
    if (!card) { const p = document.createElement('p'); p.textContent = 'Click a card or drag on empty canvas to select. Shift-click adds to selection.'; inspector.append(p); return; }
    const values = { Label: card.node.label, Kind: card.node.kind, 'Node id': card.node.id, Tier: card.current, 'Inputs used': card.node.kind === 'plot' ? card.inputs : {}, 'Snapshot date': card.node.finished?.createdAt ?? 'None' };
    for (const [key, value] of Object.entries(values)) { const label = document.createElement('h3'); label.textContent = key; const pre = document.createElement('pre'); pre.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value); inspector.append(label, pre); }
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    for (const [label, action] of [ ['Download PNG', () => card.download()], ['Copy figure JSON', async () => { if (!card.figure) throw new Error('Load a live plot before copying.'); await navigator.clipboard.writeText(JSON.stringify(card.figure, null, 2)); }] ] as const) {
      const button = document.createElement('button'); button.textContent = label; button.disabled = card.node.kind !== 'plot'; button.onclick = async () => { try { await action(); status.textContent = `${label} complete`; } catch (e) { status.textContent = e instanceof Error ? e.message : String(e); } }; inspector.append(button);
    }
    inspector.append(status);
  }
  // Camera events (wheel, pan, pinch, drag, zoom, minimap, resize) only schedule: one draw per frame however
  // many arrive. Other callers draw at once and absorb a pending frame.
  let prefetchTimer = 0, prefetchCamera = '', prefetchIdle = false;
  const prefetching = new Set<Card>();
  function schedulePrefetch() {
    const signature=JSON.stringify(camera);
    if(signature!==prefetchCamera){prefetchCamera=signature;prefetchIdle=false;clearTimeout(prefetchTimer);prefetchTimer=0;}
    const enabled=prefetchEnabled(localStorage,isReadOnly());
    requestQueue.paused=!enabled||!!editing||!!gesture||wheelActive;
    requestQueue.refresh();
    if(!enabled||requestQueue.paused)return;
    const visible=cards.filter(c=>!c.el.hidden&&c.current!=='culled'&&c.canPrefetch);
    if(!prefetchIdle&&!visible.every(c=>c.firstRenderReady)) {
      if(!prefetchTimer)prefetchTimer=window.setTimeout(()=>{prefetchTimer=0;prefetchIdle=true;schedulePrefetch();},1500);
      return;
    }
    const distance=(c:Card)=>Math.hypot(c.node.x+c.node.width/2-(vp.clientWidth/2-camera.x)/camera.scale,c.node.y+c.node.height/2-(vp.clientHeight/2-camera.y)/camera.scale);
    for(const c of [...cards].sort((a,b)=>distance(a)-distance(b))){
      if(c.current!=='culled'||!c.canPrefetch||c.hasRender||prefetching.has(c))continue;
      const key=c.prefetchKey;
      prefetching.add(c);
      void c.prefetch({
        priority:()=>c.current==='culled'?'LOW':'HIGH',
        distance:()=>distance(c),
        valid:()=>prefetchEnabled(localStorage,isReadOnly())&&cards.includes(c)&&c.canPrefetch&&c.prefetchKey===key
      }).catch(()=>{}).finally(()=>{
        prefetching.delete(c);
        // A changed queued job was dropped; warm its replacement even if no further camera event arrives.
        if(cards.includes(c)&&c.canPrefetch&&c.prefetchKey!==key)schedulePrefetch();
      });
    }
  }
  let frame = 0;
  function requestDraw() { if (!frame) frame = requestAnimationFrame(draw); }
  function draw() {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (fitOnShow && reconciled && !figureMode && vp.clientWidth) { fitOnShow = false; if (shownCards().length) { fit(); fitted = { camera: { ...camera }, view: size() }; return; } }
    const started = performance.now();
    // Read layout first, then write: no forced reflow inside the frame.
    const rect = vp.getBoundingClientRect(); const counts = { live: 0, frozen: 0, culled: 0 };
    const gesturing = !!gesture || wheelActive;
    world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
    world.style.willChange = gesturing ? 'transform' : '';
    vp.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
    vp.style.backgroundSize = `${24 * camera.scale}px ${24 * camera.scale}px`;
    const doc = store.get(), tabs = validateTabs((doc as typeof doc & { tabs?: unknown }).tabs, doc.nodes.map(n => n.id));
    const visible = new Set(visibleNodeIds(doc, tabs, tabs.active));
    if (!figureMode) shareView?.(tabs.active, camera, rect); // the figure page is not shared (as cut: camera and tab)
    following?.moved(tabs.active, camera); drawnTab = tabs.active;
    const shown = cards.filter(c => visible.has(c.node.id)), ids = new Set(shown.map(c => c.node.id));
    const editingIds = new Set(editing?.starts.map(n => n.id));
    // Cards being dragged stay live and take their slots in the live cap.
    const tiers = assignTiers(shown.map(c => ({ id: c.node.id, renderer: c.renderKind,
      rect: { x: c.node.x * camera.scale + camera.x, y: c.node.y * camera.scale + camera.y, width: c.node.width * camera.scale, height: c.node.height * camera.scale } })),
    { x: 0, y: 0, width: rect.width, height: rect.height }, camera.scale, new Set([...selected].map(c => c.node.id).concat([...editingIds])), gesturing);
    // A Plotly card that was never live draws one off-screen snapshot (queued one at a time) at any zoom,
    // so a fitted canvas below 50 % shows images instead of empty cards (H8: phone fit, 24-card stress).
    const snapshots = !gesturing;
    for (const c of cards) {
      c.el.hidden = !ids.has(c.node.id);
      if (c.el.hidden) { selected.delete(c); c.setTier('culled'); continue; }
      c.setZoom(camera.scale);
      const current: Tier = editingIds.has(c.node.id) ? 'live' : tiers.get(c.node.id) ?? 'culled';
      c.el.classList.toggle('selected', selected.has(c)); c.el.style.outline = selected.has(c) ? '2px solid var(--accent)' : '';
      c.setTier(current, snapshots); counts[current]++;
    }
    if (presence) { presence.selection([...selected].map(c => c.node.id)); presence.render(); }
    schedulePrefetch();
    $('hud').textContent = `live ${counts.live} · frozen ${counts.frozen} · culled ${counts.culled} | ${Math.round(camera.scale * 100)}%`;
    const zoom = $<HTMLSelectElement>('zoom');
    let custom = zoom.querySelector<HTMLOptionElement>('[data-custom]');
    if (!custom) { custom = document.createElement('option'); custom.dataset.custom = ''; zoom.append(custom); }
    custom.value = String(camera.scale); custom.textContent = `${Math.round(camera.scale * 100)}%`; zoom.value = String(camera.scale);
    minimap(rect.width, rect.height); inspect();
    listeners.forEach(cb => cb());
    perf.lastDrawMs = performance.now() - started; perf.draws++;
  }
  function minimap(width: number, height: number) {
    const visible = cards.filter(c => !c.el.hidden);
    // Wave 2 library/canvas: figure sheets and queued cards count as board content too.
    const sheets = figureMode ? Array.from(figureLayer.children).map(e => { const p = e as HTMLElement; return { x: figureLayer.offsetLeft + p.offsetLeft, y: p.offsetTop, width: p.offsetWidth, height: p.offsetHeight }; }) : [];
    const remote = viewports?.() ?? [];
    // Someone else on this tab keeps the map up: where they are looking is the point of it.
    const show = minimapVisible({ width, height }, camera, [...visible.map(c => c.node), ...ghosts.map(g => g.rect), ...sheets], minimapPinned || remote.length > 0, minimapCorner);
    map.dataset.visible = String(show); map.dataset.pinned = String(minimapPinned);
    map.setAttribute('aria-hidden', String(!show)); map.setAttribute('tabindex', show ? '0' : '-1');
    const vx = -camera.x / camera.scale, vy = -camera.y / camera.scale;
    const rects = [...visible.map(c => c.node), ...remote.map(r => r.rect)];
    const x = Math.min(vx, ...rects.map(r => r.x)) - 60, y = Math.min(vy, ...rects.map(r => r.y)) - 60;
    const right = Math.max(vx + width / camera.scale, ...rects.map(r => r.x + r.width)) + 60;
    const bottom = Math.max(vy + height / camera.scale, ...rects.map(r => r.y + r.height)) + 60;
    map.setAttribute('viewBox', `${x} ${y} ${right - x} ${bottom - y}`); map.replaceChildren();
    function box(x: number, y: number, w: number, h: number, cls: string) { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, String(v)); r.setAttribute('class', cls); map.append(r); }
    if(figureMode)Array.from(figureLayer.children).forEach(e=>{const p=e as HTMLElement;box(figureLayer.offsetLeft+p.offsetLeft,p.offsetTop,p.offsetWidth,p.offsetHeight,'node');});
    visible.forEach(c => box(c.node.x, c.node.y, c.node.width, c.node.height, selected.has(c) ? 'node selected' : 'node'));
    ghosts.forEach(g => box(g.rect.x, g.rect.y, g.rect.width, g.rect.height, 'node pending'));
    box(vx, vy, width / camera.scale, height / camera.scale, 'view');
    for (const r of remote) {
      box(r.rect.x, r.rect.y, r.rect.width, r.rect.height, 'view remote-view'); const el = map.lastElementChild!, title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      el.setAttribute('style', `stroke:${r.colour};fill:${r.colour};fill-opacity:.12;cursor:pointer`); el.setAttribute('data-client', String(r.id));
      title.textContent = `${r.name}'s view · click to follow`; el.append(title);
    }
  }
  // Wheel zoom is a camera event (one draw per frame); buttons, the zoom menu and keys draw at once. A Fit below ZOOM_MIN
  // is as far out as zoom goes then (zoom out never jumps in).
  function zoom(scale: number, x = vp.clientWidth / 2, y = vp.clientHeight / 2, perFrame = false) {
    scale = Math.min(4, Math.max(Math.min(ZOOM_MIN, camera.scale), scale));
    camera.x = x - (x - camera.x) / camera.scale * scale; camera.y = y - (y - camera.y) / camera.scale * scale; camera.scale = scale; if (perFrame) requestDraw(); else draw();
  }
  function fit() {
    setOverview(undefined);
    if(figureMode){const sheets=Array.from(figureLayer.children) as HTMLElement[];if(!sheets.length)return;const x=figureLayer.offsetLeft,y=0,w=Math.max(...sheets.map(e=>e.offsetLeft+e.offsetWidth)),h=Math.max(...sheets.map(e=>e.offsetHeight));camera.scale=Math.max(.1,Math.min(1,(vp.clientWidth-60)/w,(vp.clientHeight-60)/h));camera.x=(vp.clientWidth-w*camera.scale)/2-x*camera.scale;camera.y=(vp.clientHeight-h*camera.scale)/2-y*camera.scale;draw();return;}
    const visible = shownCards();
    if (!visible.length) return;
    const x = Math.min(...visible.map(c => c.node.x)), y = Math.min(...visible.map(c => c.node.y));
    const w = Math.max(...visible.map(c => c.node.x + c.node.width)) - x, h = Math.max(...visible.map(c => c.node.y + c.node.height)) - y;
    const next = overviewCamera({ width: vp.clientWidth, height: vp.clientHeight }, { x, y, width: w, height: h });
    camera.scale = next.scale; camera.x = next.x; camera.y = next.y; draw();
  }
  // Wave 2 library/canvas: fit only the selection into the unobscured viewport.
  function fitSelection() {
    const nodes = shownCards().filter(c => selected.has(c)).map(c => c.node); if (!nodes.length || figureMode) return;
    const x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y));
    const width = Math.max(...nodes.map(n => n.x + n.width)) - x, height = Math.max(...nodes.map(n => n.y + n.height)) - y;
    const view = freeView(), next = overviewCamera({ width: view.width - view.left, height: view.height }, { x, y, width, height });
    setOverview(undefined); Object.assign(camera, { x: next.x + view.left, y: next.y, scale: next.scale }); draw();
  }
  // Wave 1: a tab is fitted the first time it is shown, once the catalog has turned its nodes into cards.
  let fitOnShow = true, reconciled = false;
  // The opening fit holds while nobody moves the camera: a window that changes size after it (resized, a phone turned, a
  // page opened wide then narrowed) fits again (FIX-JOINER-PHONE: a 390 px board kept a desktop fit's 100 %). A panel
  // opening narrows the canvas, not the window: the board stays where it is.
  let fitted: { camera: Cam; view: { width: number; height: number } } | null = null;
  const size = () => ({ width: innerWidth, height: innerHeight });
  function shownCards() {
    const doc = store.get(), tabs = validateTabs((doc as typeof doc & { tabs?: unknown }).tabs, doc.nodes.map(n => n.id));
    const visible = new Set(visibleNodeIds(doc, tabs, tabs.active));
    return cards.filter(c => visible.has(c.node.id));
  }
  $('in').onclick = () => zoom(camera.scale * 1.25); $('out').onclick = () => zoom(camera.scale / 1.25); $('fit').onclick = () => fit();
  $<HTMLSelectElement>('zoom').onchange = e => zoom(Number((e.target as HTMLSelectElement).value));
  $('inspect').onclick = () => { inspector.hidden = !inspector.hidden; draw(); };
  function setHand(on: boolean) { hand = on; $('hand').setAttribute('aria-pressed', String(on)); $('select').setAttribute('aria-pressed', String(!on)); vp.classList.toggle('hand', on); }
  $('hand').onclick = () => setHand(true); $('select').onclick = () => setHand(false);
  if (!host.shellOwnsLibrary) $('library-toggle').onclick = () => { $('library').hidden = !$('library').hidden; };
  const library = host.shellOwnsLibrary ? document.createElement('nav') : $('library');
  Object.assign(library.style, {maxHeight:'calc(100% - 24px)', overflowY:'auto', maxWidth:'calc(100% - 24px)'});
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search plots'; search.setAttribute('aria-label', 'Search plots');
  const list = document.createElement('div'), status = document.createElement('p'); status.setAttribute('role','status'); library.append(search, list, status);
  const openGroups = new Map<string, boolean>();
  function designDialog(entry: CatalogEntry) {
    const dialog = document.createElement('dialog');
    const heading = document.createElement('h2'); heading.textContent = 'Confirm study design';
    const unit = document.createElement('select'), type = document.createElement('select');
    unit.setAttribute('aria-label','Experimental unit'); type.setAttribute('aria-label','Sample relationship');
    for (const [value,label] of [['animal','Animal'],['human','Human'],['cell_line','Cell line'],['other','Other']]) unit.add(new Option(label,value));
    for (const value of ['independent','paired']) type.add(new Option(value,value));
    const confirm = document.createElement('button'); confirm.textContent = 'Confirm';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.onclick = () => dialog.close();
    const message = document.createElement('p'); message.setAttribute('role','status');
    confirm.onclick = async () => { confirm.disabled = true; try { session.design = await confirmDesign(session.sessionId, unit.value, type.value); renderLibrary(); dialog.close(); if (availability(entry,session.design) === 'add') await addEntry(entry); } catch (error) { message.textContent = String(error); } finally { confirm.disabled = false; } };
    dialog.append(heading,unit,type,confirm,cancel,message); library.append(dialog); dialog.onclose = () => dialog.remove(); dialog.showModal();
  }
  // Placeholders for plots being created, a smooth pan that brings a card into view (instant with reduced
  // motion), and a short highlight on a card that was just added or located (H8 add feedback).
  const ghosts: { el: HTMLElement; rect: { x: number; y: number; width: number; height: number } }[] = [];
  function addGhost(rect: { x: number; y: number; width: number; height: number }, label: string, reveal = true) {
    const el = document.createElement('div'); el.className = 'card-ghost'; el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const title = document.createElement('strong'); title.textContent = label; const note = document.createElement('span'); note.textContent = s.addingPlot;
    el.append(title, note); world.append(el);
    const ghost = { el, rect }; ghosts.push(ghost); if (reveal) panTo(revealCamera(freeView(), camera, rect)); requestDraw();
    return ghost;
  }
  function removeGhost(ghost: { el: HTMLElement }) { ghost.el.remove(); const i = ghosts.findIndex(g => g.el === ghost.el); if (i >= 0) ghosts.splice(i, 1); requestDraw(); }
  let panning = 0;
  // The camera state is final at once (tiers, culling and callers see the end view); only the motion from
  // the old view is drawn over the next frames, and skipped with reduced motion. Any draw() meanwhile simply
  // completes the motion.
  function panTo(target: Cam | null) {
    if (!target) return;
    cancelAnimationFrame(panning); panning = 0;
    const from = { x: camera.x, y: camera.y }; camera.x = target.x; camera.y = target.y; draw();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dx = from.x - target.x, dy = from.y - target.y, start = performance.now(), ms = 260;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms), e = 1 - (1 - t) ** 3;
      world.style.transform = `translate(${target.x + dx * (1 - e)}px,${target.y + dy * (1 - e)}px) scale(${camera.scale})`;
      vp.style.backgroundPosition = `${target.x + dx * (1 - e)}px ${target.y + dy * (1 - e)}px`;
      if (t < 1) panning = requestAnimationFrame(step); else { panning = 0; draw(); }
    };
    panning = requestAnimationFrame(step);
  }
  // Phase 6: show the followed person's tab and camera (collab/follow.ts); the tab's own camera and first fit give way.
  function adoptView(view: { activeTab: string; camera: Cam }) {
    const doc = store.get(), ids = doc.nodes.map(n => n.id), tabs = validateTabs((doc as typeof doc & { tabs?: unknown }).tabs, ids);
    if (setActiveTab(tabs, view.activeTab)) { (doc as typeof doc & { tabs?: unknown }).tabs = serializeTabs(tabs, ids); draw(); }
    fitOnShow = false; Object.assign(camera, view.camera); draw();
  }
  function reveal(id: string) {
    const doc = store.get(), node = doc.nodes.find(n => n.id === id); if (!node) return;
    const ids = doc.nodes.map(n => n.id), tabs = validateTabs(doc.tabs, ids), home = tabs.tabs.find(t => t.nodes.includes(id));
    if (home && setActiveTab(tabs, home.id)) { (doc as typeof doc & { tabs?: unknown }).tabs = serializeTabs(tabs, ids); draw(); }
    panTo(revealCamera(freeView(), camera, node));
  }
  // Wave 2 library/canvas: use the actual covered strip, including on narrow desktop canvases.
  function freeView() {
    const panel = document.querySelector<HTMLElement>('.library-panel'); let left = 0;
    if (panel && panel.getClientRects().length) {
      const r = panel.getBoundingClientRect(), v = vp.getBoundingClientRect();
      if (r.bottom > v.top && r.top < v.bottom && r.left < v.right && r.right > v.left) left = Math.max(0, Math.min(vp.clientWidth, r.right - v.left));
    }
    return { width: vp.clientWidth, height: vp.clientHeight, left };
  }
  // Wave 2 library/canvas: selection opens the inspector through React. Wait for its layout before
  // measuring, and only reveal the latest selection if several queued requests finish together.
  function revealAddedAfterLayout(id: string) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = cards.find(c => c.node.id === id);
      if (!card || !selected.has(card) || figureMode || card.el.hidden) return;
      const next = revealAddedCamera(freeView(), camera, card.node);
      if (next) { camera.scale = next.scale; panTo(next); }
    }));
  }
  // Click to focus (H9): below FOCUS_BELOW (where plots stop being live) a plain click (Enter is one: canvasDom selectOnEnter) on a card flies the camera to it so the plot can be
  // worked on; the pill (or Esc with nothing selected) flies back to the overview it came from. Like panTo the
  // end camera is final at once; scale is interpolated geometrically and the view centre linearly.
  function flyTo(target: Cam) {
    cancelAnimationFrame(panning); panning = 0;
    const from = { ...camera }, W = vp.clientWidth / 2, H = vp.clientHeight / 2;
    Object.assign(camera, target); draw();
    const ms = motionMs('--motion-camera');
    if (!ms) return;
    const c0 = { x: (W - from.x) / from.scale, y: (H - from.y) / from.scale }, c1 = { x: (W - target.x) / target.scale, y: (H - target.y) / target.scale };
    const start = performance.now();
    const step = (now: number) => {
      if (gesture || wheelActive) { panning = 0; return; }
      const t = Math.min(1, (now - start) / ms), e = 1 - (1 - t) ** 3, s = from.scale * (target.scale / from.scale) ** e;
      const x = W - (c0.x + (c1.x - c0.x) * e) * s, y = H - (c0.y + (c1.y - c0.y) * e) * s;
      world.style.transform = `translate(${x}px,${y}px) scale(${s})`;
      vp.style.backgroundPosition = `${x}px ${y}px`; vp.style.backgroundSize = `${24 * s}px ${24 * s}px`;
      if (t < 1) panning = requestAnimationFrame(step); else { panning = 0; draw(); }
    };
    panning = requestAnimationFrame(step);
  }
  // The overview is kept as its world centre and scale, so it comes back right even if a panel opened meanwhile.
  let overview: { x: number; y: number; scale: number } | undefined;
  const overviewPill = document.createElement('button'); overviewPill.type = 'button'; overviewPill.className = 'overview-pill'; overviewPill.hidden = true;
  overviewPill.innerHTML = '<span aria-hidden="true">←</span>'; overviewPill.append(s.backToOverview);
  overviewPill.onpointerdown = e => e.stopPropagation();
  overviewPill.onclick = () => backToOverview();
  vp.parentElement!.append(overviewPill);
  function setOverview(next: typeof overview) { overview = next; overviewPill.hidden = !next; }
  function backToOverview() {
    if (!overview) return; const o = overview; setOverview(undefined);
    flyTo({ scale: o.scale, x: vp.clientWidth / 2 - o.x * o.scale, y: vp.clientHeight / 2 - o.y * o.scale });
  }
  const viewNow = () => ({ x: (vp.clientWidth / 2 - camera.x) / camera.scale, y: (vp.clientHeight / 2 - camera.y) / camera.scale, scale: camera.scale });
  function focusCard(c: Card, from: NonNullable<typeof overview>) {
    if (figureMode || c.el.hidden) return;
    // Two frames: the inspector column opened by this click has taken its width by then.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!cards.includes(c) || camera.scale >= FOCUS_BELOW) return;
      if (!overview) setOverview(from);
      flyTo(focusCamera({ width: vp.clientWidth, height: vp.clientHeight }, camera, c.node));
    }));
  }
  let click: { pointer: number; x: number; y: number; card: Card; from: NonNullable<typeof overview> } | undefined;
  // Window level: the inspector column this click opens can slide under the pointer before it is released.
  window.addEventListener('pointerup', e => { if (click?.pointer !== e.pointerId) return; const k = click; click = undefined; if (!beyondClick(e.clientX - k.x, e.clientY - k.y)) focusCard(k.card, k.from); }, true);
  window.addEventListener('pointercancel', e => { if (click?.pointer === e.pointerId) click = undefined; }, true);
  function flash(c: Card) {
    c.el.classList.remove('just-added'); void c.el.offsetWidth; c.el.classList.add('just-added');
    window.setTimeout(() => c.el.classList.remove('just-added'), 1600);
  }
  const locateTurn = new Map<string, number>();
  async function addEntry(entry: CatalogEntry, signal?: AbortSignal, position?: DropPoint, start: {inputs: Record<string, unknown>; label: string} = {inputs: {}, label: entry.label}) {
      if (isReadOnly()) throw new Error('View only on this device.');
      if (signal?.aborted) return;
      const instanceId = 'tcinstance_' + Array.from(crypto.getRandomValues(new Uint8Array(6)), n => n.toString(16).padStart(2,'0')).join('');
      const {width,height} = newCardSize(entry);
      const free = freeView();
      const wanted = {x:((free.left + vp.clientWidth) / 2 - camera.x) / camera.scale - width / 2, y:(vp.clientHeight / 2 - camera.y) / camera.scale - height / 2, width,height};
      // The slot is taken at once by a placeholder (and brought into view), so the user sees where the plot
      // goes while the API creates it; queued additions do not pick the same slot.
      const slot = { ...(position ?? place([...cards.map(c => c.node), ...ghosts.map(g => g.rect)], wanted)), width, height };
      const ghost = addGhost(slot, start.label, !position);
      const clearGhost = () => removeGhost(ghost);
      signal?.addEventListener('abort', clearGhost, { once: true });
      // Collab mode: the node is placed here and sent; the sidecar writes it into the document (api.ts createCard), and
      // its update arrives before the intent's answer. Only the card's tab is this page's write.
      const plotNow = plotHeightOf(entry.heightInput, entry.defaults), tallNow = plotNow === undefined ? height : cardHeightFor(plotNow);
      const placed: Node | undefined = board ? {kind:'plot', id:`${instanceId}-${entry.output}`, label:start.label, visual:{}, finished:null,
        ...(position ?? place([...cards.map(c => c.node), ...ghosts.map(g => g.rect)], {...slot, height:tallNow})), width, height:tallNow} : undefined;
      try {
        await completeQueuedAdd(createCard(session.sessionId, entry.id, start.inputs, instanceId, signal, placed), signal, (result, dropped) => {
          if (result.error) throw new Error(String(result.error));
          clearGhost();
          if (placed) {
            const doc = store.get(), tabs = validateTabs(doc.tabs, doc.nodes.map(n => n.id));
            assignTab(tabs, placed.id, tabs.active); history.dispatch(tabsCommand(tabs));
            const c = cards.find(c => c.node.id === placed.id); if (!c) return;
            selected = new Set([c]); inspector.hidden = false; library.hidden = true;
            if (host.shellOwnsInspector) shellUi({ inspectorOpen: true });
            draw(); revealAddedAfterLayout(placed.id); flash(c); return;
          }
          // Chart audit b05 F5: a card with a module plot height is that tall plus its chrome (width stays the default).
          const plot = plotHeightOf(entry.heightInput, result.inputs, result.plotHeight), tall = plot === undefined ? height : cardHeightFor(plot);
          const spot = dropped ?? place([...cards.map(c => c.node), ...ghosts.map(g => g.rect)], {...slot, height:tall});
          const node: Node = {kind:'plot', id:result.nodeId, label:start.label, ...spot, width,height:tall, finished:null, instance:{instanceId:result.instanceId,source:entry.id,inputs:result.inputs}};
          history.dispatch(addNode(node));
          if (plot !== undefined) settleDrop([node.id], `add:${node.id}`);
          const c = cards.find(c => c.node.id === result.nodeId)!;
          selected = new Set([c]); inspector.hidden = false; library.hidden = true;
          if (host.shellOwnsInspector) shellUi({ inspectorOpen: true });
          draw(); revealAddedAfterLayout(node.id); flash(c);
        }, position);
      } finally { signal?.removeEventListener('abort', clearGhost); clearGhost(); }
  }
  function renderLibrary() {
    if (host.shellOwnsLibrary) return;
    list.replaceChildren(); const filter = search.value.trim().toLowerCase();
    for (const group of groupCatalog(catalog)) {
      const entries = group.entries.filter(e => `${e.label} ${e.description} ${e.group}`.toLowerCase().includes(filter));
      if (!entries.length) continue;
      const details = document.createElement('details'); details.open = !!filter || (openGroups.get(group.label) ?? group.label === 'Dashboard');
      details.ontoggle = () => { if (!filter) openGroups.set(group.label,details.open); };
      const summary = document.createElement('summary'); summary.textContent = `${group.label} (${entries.length})`; details.append(summary);
      for (const entry of entries) {
        const button = document.createElement('button'); button.textContent = `+ ${entry.label}`; button.dataset.source = entry.id;
        const state = availability(entry,session.design); button.title = availabilityReasons[state] || entry.description;
        // Design-gated actions remain focusable so adding can open confirmation.
        if (state !== 'add') button.setAttribute('aria-disabled','true');
        button.disabled = state === 'unavailable' || state === 'needs-time';
        button.onclick = () => { if (state === 'needs-design') designDialog(entry); else void addEntry(entry).catch(error => { status.textContent = String(error); }); };
        details.append(button);
      }
      list.append(details);
    }
  }
  search.oninput = renderLibrary;
  const catalogReady = getCatalog().then(value => { catalog = value.outputs; renderLibrary(); }).finally(() => { catalogKnown = true; });
  if (!joined) void catalogReady.catch(error => { status.textContent = String(error); }).then(() => { reconcile(); reconciled = true; requestAnimationFrame(() => draw()); resendComputed(); resendActions(); });
  // Collaboration: only the first opener (who seeded the document) runs the reopen chain; a joiner never sends it again.
  else void catalogReady.catch(error => { status.textContent = String(error); }).then(() => joined).then(shared => { reconcile(); reconciled = true; requestAnimationFrame(() => draw()); if (shared?.seeded) { resendComputed(); resendActions(); } });
  // Chart audit b07 F3, reopen: the API replays a restored card's recorded presses itself (cards.R api_card_restore);
  // this request confirms it idempotently (nothing is pressed twice), reports failures and redraws a card it pressed.
  function resendActions() {
    for (const r of actionReplays(store.get().nodes, store.get().nexo)) {
      let replayed = 0;
      void replayRecorded(r.nodeId, r.actions, async actions => { const result = await replayActions(session.sessionId, r.instanceId, actions); replayed = result.replayed.length; return result; })
        .then(failed => { if (replayed || failed.length) cards.find(c => c.node.id === r.nodeId)?.reload(); });
    }
  }
  // After a reopen, one PATCH per Team card carrying computed controls in Nexo's member: it draws as the user left it.
  function resendComputed() {
    for (const r of computedResends(store.get().nodes, store.get().nexo)) {
      sentComputed.set(r.nodeId, JSON.stringify(r.inputs));
      void updateCard(session.sessionId, r.instanceId, r.inputs, designerActions(r.inputs)).then(() => cards.find(c => c.node.id === r.nodeId)?.reload(), error => notify(`Could not restore the plot: ${error instanceof Error ? error.message : String(error)}`, true));
    }
  }
  // Wave 2 library/canvas: plot drag preview and queued drop, independent of illustration drops.
  let draggingPlot: CatalogEntry | undefined, dropGhost: ReturnType<typeof addGhost> | undefined;
  const clearDropGhost = () => { if (dropGhost) removeGhost(dropGhost); dropGhost = undefined; };
  window.addEventListener('nexo-plot-drag', event => {
    const id = (event as CustomEvent<string | null>).detail;
    draggingPlot = catalog.find(entry => entry.id === id); if (!id) clearDropGhost();
  });
  const dropPoint = (e: DragEvent) => {
    const p = dropWorldPoint({ x: e.clientX, y: e.clientY }, vp.getBoundingClientRect(), camera);
    // Team canvas coordinates are nonnegative; the preview uses the same board boundary as insertion.
    return { x: Math.max(0, Math.min(1e6, p.x)), y: Math.max(0, Math.min(1e6, p.y)) };
  };
  vp.addEventListener('dragover', e => {
    if (isReadOnly() || figureMode || !e.dataTransfer?.types.includes('application/nexo-plot')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    const point = dropPoint(e), size = draggingPlot ? newCardSize(draggingPlot) : { width: 440, height: 330 };
    if (!dropGhost) {
      dropGhost = addGhost({ ...point, ...size }, draggingPlot?.label ?? s.addPlot, false);
      dropGhost.el.classList.add('plot-drop-ghost'); dropGhost.el.querySelector('span')!.textContent = s.dropPlotHere;
    }
    Object.assign(dropGhost.rect, point); Object.assign(dropGhost.el.style, { left: `${point.x}px`, top: `${point.y}px` }); requestDraw();
  });
  vp.addEventListener('dragleave', e => {
    if (e.relatedTarget instanceof window.Node && vp.contains(e.relatedTarget)) return;
    const v = vp.getBoundingClientRect();
    if (e.clientX <= v.left || e.clientX >= v.right || e.clientY <= v.top || e.clientY >= v.bottom) clearDropGhost();
  });
  vp.addEventListener('drop', e => {
    if (isReadOnly() || figureMode) return;
    const source = e.dataTransfer?.getData('application/nexo-plot'); if (!source) return;
    e.preventDefault(); const position = dropPoint(e); clearDropGhost();
    void handle.addCard(source, undefined, position).catch(error => notifyFailure(s.failAddPlot, error));
  });
  vp.onwheel = e => {
    e.preventDefault(); wheelActive = true; clearTimeout(wheelTimer);
    const r = vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoom(camera.scale * Math.exp(-e.deltaY * .01), e.clientX - r.left, e.clientY - r.top, true);
    else { camera.x -= e.deltaX; camera.y -= e.deltaY; requestDraw(); }
    wheelTimer = window.setTimeout(() => { wheelActive = false; draw(); }, 160);
  };
  vp.onpointerdown = e => {
    if (e.button !== 0 && e.button !== 1) return;
    vp.focus({ preventScroll: true });
    const r = vp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 2) { if (editing) { editing = undefined; showGuides([]); reconcile(); } const [a, b] = [...pointers.values()]; gesture = { kind: 'pinch', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, cx: camera.x, cy: camera.y, base: new Set(selected), distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: camera.scale }; }
    else if (hand || space || e.button === 1) gesture = { kind: 'pan', x, y, cx: camera.x, cy: camera.y, base: new Set(selected) };
    else {
      const c = cards.find(c => c.el.contains(e.target as HTMLElement));
      if (c) {
        click = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && camera.scale < FOCUS_BELOW && !(e.target as HTMLElement).closest('button,input,select,textarea,a,.resize-handle,.menu')
          ? { pointer: e.pointerId, x: e.clientX, y: e.clientY, card: c, from: viewNow() } : undefined;
        if (e.shiftKey) selected.add(c); else if (!selected.has(c)) selected = new Set([c]);
        inspector.hidden = false;
        const target = e.target as HTMLElement;
        if (isReadOnly()) { pointers.delete(e.pointerId); draw(); return; }
        // Pilot F2: at the thumb tier the header is hidden, so the body moves the card once the press leaves the click threshold.
        const press = cardPress({ header: !!target.closest('header'), resize: !!target.closest('.resize-handle'), control: !!target.closest('button,input,select,textarea,a,.menu') }, isThumb(camera.scale));
        if (press) {
          editing = { pointer: e.pointerId, x: e.clientX, y: e.clientY, card: c, resize: press === 'resize', starts: store.get().nodes.filter(n => selected.has(cards.find(c => c.node.id === n.id)!)).map(n => structuredClone(n)), dx: 0, dy: 0, armed: press !== 'pending-move' };
          target.setPointerCapture(e.pointerId); e.preventDefault();
        } else pointers.delete(e.pointerId);
        draw(); return;
      }
      if (isReadOnly()) gesture = { kind: 'pan', x, y, cx: camera.x, cy: camera.y, base: new Set(selected) }; else
      gesture = { kind: 'marquee', x, y, cx: camera.x, cy: camera.y, base: e.shiftKey ? new Set(selected) : new Set() }; selected = new Set(gesture.base);
    }
    vp.setPointerCapture(e.pointerId); e.preventDefault(); draw();
  };
  vp.onpointermove = e => {
    const r = vp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
    if (editing && editing.pointer === e.pointerId) {
      const g = editing, start = g.starts.find(n => n.id === g.card.node.id)!;
      // A body press at the thumb tier stays a click (focus) until it leaves the click threshold.
      if (!g.armed) { if (!beyondClick(e.clientX - g.x, e.clientY - g.y)) return; g.armed = true; }
      const result = dragResult(start, { x: e.clientX - g.x, y: e.clientY - g.y }, camera.scale, store.get().nodes.filter(n => !g.starts.some(s => s.id === n.id)), e.altKey);
      g.dx = result.x - start.x; g.dy = result.y - start.y;
      if (g.resize) {
        g.dx = (e.clientX - g.x) / camera.scale; g.dy = (e.clientY - g.y) / camera.scale;
        g.card.el.dataset.resizeSize = p.cardSize(Math.max(240, Math.min(4000, start.width + g.dx)), Math.max(220, Math.min(4000, start.height + g.dy)));
        geometry(g.card, { ...start, width: Math.max(240, Math.min(4000, start.width + g.dx)), height: Math.max(220, Math.min(4000, start.height + g.dy)) });
      } else {
        g.dx = Math.max(g.dx, -Math.min(...g.starts.map(n => n.x))); g.dy = Math.max(g.dy, -Math.min(...g.starts.map(n => n.y)));
        for (const n of g.starts) geometry(cards.find(c => c.node.id === n.id)!, { ...n, x: n.x + g.dx, y: n.y + g.dy });
        showGuides(result.guides);
      }
      requestDraw(); return;
    }
    if (!gesture) return;
    const g = gesture;
    if (g.kind === 'pinch') { if (pointers.size !== 2) return; const [a, b] = [...pointers.values()]; const scale = Math.max(.1, Math.min(4, g.scale! * Math.hypot(a.x - b.x, a.y - b.y) / g.distance!)); camera.x = (a.x + b.x) / 2 - (g.x - g.cx) / g.scale! * scale; camera.y = (a.y + b.y) / 2 - (g.y - g.cy) / g.scale! * scale; camera.scale = scale; }
    else if (g.kind === 'pan') { camera.x = g.cx + x - g.x; camera.y = g.cy + y - g.y; }
    else {
      const left = Math.min(x, g.x), top = Math.min(y, g.y), width = Math.abs(x - g.x), height = Math.abs(y - g.y);
      Object.assign(marquee.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      selected = new Set(g.base);
      for (const c of cards.filter(c => !c.el.hidden)) { const n = c.node, cx = n.x * camera.scale + camera.x, cy = n.y * camera.scale + camera.y; if (cx < left + width && cx + n.width * camera.scale > left && cy < top + height && cy + n.height * camera.scale > top) selected.add(c); }
    }
    requestDraw();
  };
  function end(e: PointerEvent) {
    if (editing && editing.pointer === e.pointerId) {
      const g = editing; delete g.card.el.dataset.resizeSize; editing = undefined; showGuides([]);
      if (e.type === 'pointerup' && g.armed && (g.dx || g.dy)) {
        const key = `drop:${++sequence}`, ids = g.starts.map(n => n.id);
        if (g.resize) { const n = g.starts.find(n => n.id === g.card.node.id)!, input = heightInputFor(n), size = { width: Math.max(240, Math.min(4000, n.width + g.dx)), height: Math.max(220, Math.min(4000, n.height + g.dy)) };
          // Chart audit b05 F5: the plot height follows the hand resize (Team's box is resizable too).
          if (input) dispatchPlotHeight(n.id, input, size, key); else { history.dispatch(resizeNode(n.id, size.width, size.height, key)); settleDrop([n.id], key); } }
        else { history.dispatch(moveNodes(ids, g.dx, g.dy, key)); settleDrop(ids, key); }
      } else reconcile();
    }
    pointers.delete(e.pointerId); gesture = undefined; marquee.style.display = 'none'; draw(); }
  vp.onpointerup = end; vp.onpointercancel = end; vp.onlostpointercapture = end;
  map.onpointerdown = e => {
    // Another person's rectangle: follow them (canvas/following.ts listens).
    const other = (e.target as Element).closest('[data-client]'); if (other) { dispatchEvent(new CustomEvent('nexo-follow', { detail: Number(other.getAttribute('data-client')) })); return; }
    const r = map.getBoundingClientRect(), b = map.viewBox.baseVal; camera.x = vp.clientWidth / 2 - (b.x + (e.clientX - r.left) / r.width * b.width) * camera.scale; camera.y = vp.clientHeight / 2 - (b.y + (e.clientY - r.top) / r.height * b.height) * camera.scale; requestDraw(); };
  window.addEventListener('keydown', e => { if (e.defaultPrevented || (e.target as HTMLElement).closest('select,input,textarea,[contenteditable],dialog')) return;
    // Wave 2 library/canvas: M pins/unpins; unpinned visibility follows the board and corner hover.
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) { e.preventDefault(); minimapPinned = !minimapPinned; draw(); return; }
    // Wave 2 inline title shortcut; fields keep their native typing and undo behavior.
    if (e.key === 'F2' && !isReadOnly() && selected.size === 1) { e.preventDefault(); [...selected][0].editTitle(); return; }
    // Outside a field Backspace is never browser navigation (WebKit goes back); view-only also swallows Delete.
    if (e.key === 'Backspace' || (isReadOnly() && e.key === 'Delete')) { e.preventDefault(); if (isReadOnly()) return; }
    if (e.code === 'Space') { space = true; e.preventDefault(); } if (e.key === 'Escape') {
      const menu = document.querySelector<HTMLElement>('.menu-wrap .menu');
      if (menu) { menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
      if (!host.shellOwnsInspector && !inspector.hidden && !inspector.parentElement?.hidden) inspector.hidden = true;
      else if (selected.size || !overview) selected.clear(); else { backToOverview(); return; } draw();
    }
    if (!isReadOnly() && (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) { e.preventDefault(); if (e.shiftKey || e.key.toLowerCase() === 'y') history.redo(); else if (board && !history.canUndo) void import('./collab/intents').then(m => m.undoMine()); else history.undo(); return; }
    if (!host.shellOwnsLibrary && e.key === 'Delete') { e.preventDefault(); removeSelection(); }
    // F4/F5: Ctrl/⌘+Alt+C copy style, +Alt+V paste style onto the selection, +Alt+Shift+V opens Apply to tab (e.code: Alt changes e.key on macOS).
    if (!isReadOnly() && (e.ctrlKey || e.metaKey) && e.altKey && (e.code === 'KeyC' || e.code === 'KeyV')) {
      const ids = selection(), plot = ids.find(id => store.get().nodes.some(n => n.id === id && n.kind === 'plot'));
      if (e.code === 'KeyC' && !e.shiftKey && plot) { e.preventDefault(); notify(handle.copyStyle(plot) ? 'Copied style' : 'Nothing to copy but size on an image card'); return; }
      if (e.code === 'KeyV' && !e.shiftKey && ids.length) { e.preventDefault(); const n = handle.pasteStyle(ids); notify(n ? `Pasted style on ${n} ${n === 1 ? 'card' : 'cards'}` : 'Copy a style first (Ctrl/⌘ + Alt + C)', !n); return; }
      if (e.code === 'KeyV' && e.shiftKey && plot) { e.preventDefault(); window.dispatchEvent(new CustomEvent('nexo:apply-style-to-tab', { detail: plot })); return; }
    }
    if (!isReadOnly() && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
      const id = selection().find(id => store.get().nodes.some(n => n.id === id && n.kind === 'plot'));
      if (id) { e.preventDefault(); if (handle.copyPlot(id)) notify('Copied plot settings'); }
    }
    if (!isReadOnly() && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v' && clipboard()) { e.preventDefault(); void paste().catch(error => notify(`Could not paste the plot: ${error instanceof Error ? error.message : error}`, true)); }
    if (!host.shellOwnsLibrary && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); void duplicateSelection().catch(error => notify(`Could not duplicate the selection: ${error instanceof Error ? error.message : String(error)}`, true)); }
    const nudge = keyboardNudge(e.key, e.shiftKey, e.altKey);
    if (nudge && selected.size && !isReadOnly()) {
      e.preventDefault(); const ids = selection(), key = `keyboard:${ids.join(',')}:${nudge.resize}`;
      if (nudge.resize) ids.forEach((id, i) => { const n = store.get().nodes.find(n => n.id === id)!, input = heightInputFor(n);
        // A plot-height card moves one slider step per key press (a few px would round back to the same value).
        if (input) { dispatchPlotHeight(id, input, { width: Math.max(240, Math.min(4000, n.width + nudge.dx)), height: n.height + Math.sign(nudge.dy) * PLOT_HEIGHT.step }, key, i > 0); return; }
        history.dispatch(resizeNode(id, Math.max(240, Math.min(4000, n.width + nudge.dx)), Math.max(220, Math.min(4000, n.height + nudge.dy)), key), { fold: i > 0 }); });
      else { const nodes = store.get().nodes.filter(n => ids.includes(n.id)); history.dispatch(moveNodes(ids, Math.max(nudge.dx, -Math.min(...nodes.map(n => n.x))), Math.max(nudge.dy, -Math.min(...nodes.map(n => n.y))), key)); }
      settleDrop(ids, key);
    } if (e.key === '+' || e.key === '=') zoom(camera.scale * 1.25); if (e.key === '-') zoom(camera.scale / 1.25);
    const shortcut = zoomShortcut(e); if (shortcut) { e.preventDefault(); if (shortcut === 'fit') fit(); else if (shortcut === 'selection') fitSelection(); else zoom(1); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') space = false; });
  window.addEventListener('blur', () => { space = false; pointers.clear(); gesture = undefined; editing = undefined; showGuides([]); reconcile(); });
  window.addEventListener('resize', () => { if (!figureMode && refitOnResize(fitted, camera, size())) { fit(); fitted = { camera: { ...camera }, view: size() }; } });
  new ResizeObserver(requestDraw).observe(vp); draw();
  const handle: CanvasHandle = {
    get figureMode(){return figureMode;},figureLayer:()=>figureLayer,
    enterFigureMode(){draftCamera={...camera};figureMode=true;figureLayer.hidden=false;figureLayer.style.left=`${Math.max(0,...store.get().nodes.map(n=>n.x+n.width))+120}px`;draw();fit();},
    exitFigureMode(){figureMode=false;figureLayer.hidden=true;Object.assign(camera,draftCamera);draw();},
    figureOf: id => cards.find(c=>c.node.id===id)?.figure as import('./editor/applyEditor').Figure | undefined,
    setStatistics: (id,statistics) => {history.dispatch(statisticsCommand(id,statistics));},
    setNexoStyle:(id,style)=>{if(isReadOnly())return;const card=cards.find(c=>c.node.id===id);if(card?.figure){try{applyNexoStyle(applyEditor(card.figure as import('./editor/applyEditor').Figure,(card.node.visual as Visual|undefined)?.editor),style);}catch(error){notify(String(error),true);return;}}history.dispatch(setNexoStyle(id,style));},
    nexoStyle:id=>store.get().nexo.nodes[id]?.style??{},
    nexoInputs:id=>store.get().nexo.nodes[id]?.inputs,
    recordAction(id,action){if(isReadOnly())return;store.set(doc=>recordAction(id,action).apply(doc));setReplayFailures(id,replayFailures(id).filter(a=>a!==action));},
    nexoActions:id=>recordedActions(store.get().nexo.nodes[id]?.actions),
    recordUpload(id,inputId,file,inputs){if(isReadOnly())return;handle.updateCardInputs(id,inputs);
      history.dispatch(setNexoInputs(id,{...store.get().nexo.nodes[id]?.inputs,[inputId]:{name:file.name,content:file.content}}),{fold:true});},
    setComputedInputs(id,patch,baseline){if(isReadOnly())return;
      // The PATCH already reached the server: the reconcile must not re-send it (a second edit sent it twice and remounted the Data tab).
      sentComputed.delete(id);history.dispatch(setNexoComputed(id,patch,baseline));sentComputed.set(id,JSON.stringify(validateComputed(store.get().nexo.nodes[id]?.inputs)));cards.find(c=>c.node.id===id)?.reload();},
    setSessionPalette(before,after){if(isReadOnly())return;sentPalette=JSON.stringify(after);history.dispatch(setSessionPalette(after,before));},
    showAsTeam:(id,show)=>{if(show)teamView.add(id);else teamView.delete(id);reconcile();},
    isTeamView:id=>teamView.has(id),
    setVisual: (id,patch) => {
      // Steph review 4b: a card's own palette (Appearance tab) changed: what a session palette change showed of it no longer holds.
      const was=(store.get().nodes.find(n=>n.id===id)?.visual as Visual|undefined)?.editor as {palette?:unknown;greyHealthy?:unknown}|undefined,next=(patch as {editor?:{palette?:unknown;greyHealthy?:unknown}}).editor;
      if(next&&(was?.palette!==next.palette||!!was?.greyHealthy!==!!next.greyHealthy))forgetPaletteRedraw(id);
      history.dispatch(setAppearance(id,{visual:patch}));},
    saveDesign(design){if(isReadOnly())return;const now=store.get().nexo;if(JSON.stringify(now.design)===JSON.stringify(design))return;store.set(doc=>({...doc,nexo:withSavedDesign(doc.nexo,design)}));},
    savedDesign:()=>store.get().nexo.design,
    drawProbes:()=>cards.filter(c=>c.node.kind==='plot'&&!c.node.finished).map(c=>({id:c.node.id,signature:()=>c.drawingSignature(),busy:()=>c.drawing})),
    setCardSize: (id,size) => {
      const n=store.get().nodes.find(n=>n.id===id); if(isReadOnly()||!n)return; const next=clampSize(size);
      if(next.width===n.width&&next.height===n.height)return;
      const input=heightInputFor(n); if(input){dispatchPlotHeight(id,input,next,`size:${++sequence}`);return;}
      // As a drag resize: the new size, then the neighbours settled, folded into one undo step; draw re-renders the card.
      sizeCommands(store.get().nodes,id,next,`size:${++sequence}`).forEach((command,i)=>history.dispatch(command,{fold:i>0}));
    },
    styleNodes: (kind,entries) => {
      if(isReadOnly()||!entries.length)return; const key=`${kind}:${++sequence}`;
      history.dispatch(styleNodes(kind,entries));
      const resized=entries.filter(e=>e.width!==undefined||e.height!==undefined).map(e=>e.id); if(resized.length)settleDrop(resized,key);
    },
    copyStyle: id => { const n=(store.get().nodes as unknown as import('./state/document').Node[]).find(n=>n.id===id); const clip=n&&copyStyleOf(n,handle.figureOf(id),store.get().nexo.nodes[id]?.style); if(!clip)return false; writeStyleClip(clip); return true; },
    pasteStyle: ids => { const clip=readStyleClip(); if(!clip||isReadOnly())return 0; const nodes=store.get().nodes as unknown as import('./state/document').Node[];
      const entries=ids.flatMap(id=>{const n=nodes.find(n=>n.id===id);const e=n&&pasteEntry(clip,n,handle.figureOf(id));return e?[e]:[];}); handle.styleNodes('pasteStyle',entries); return entries.length; },
    applyStyleToTab: (id,commit) => { const nodes=store.get().nodes as unknown as import('./state/document').Node[],n=nodes.find(n=>n.id===id),clip=n&&copyStyleOf(n,handle.figureOf(id),store.get().nexo.nodes[id]?.style); if(!clip)return null;
      const doc=store.get(),tabs=validateTabs(doc.tabs,doc.nodes.map(n=>n.id)),home=tabs.tabs.find(t=>t.nodes.includes(id));
      const plan=applyToTabPlan(clip,id,handle.tabNodeIds(id).map(i=>nodes.find(n=>n.id===i)!).filter(Boolean),i=>handle.figureOf(i));
      if(commit)handle.styleNodes('applyStyleToTab',plan.entries); return {full:plan.full,sizeOnly:plan.sizeOnly,skipped:plan.skipped,tab:home?.name??''}; },
    tabNodeIds: id => { const doc=store.get(),ids=doc.nodes.map(n=>n.id),tabs=validateTabs(doc.tabs,ids); return tabs.tabs.find(t=>t.nodes.includes(id))?.nodes.filter(n=>ids.includes(n))??[id]; },
    setCardPosition: (id,pos) => {
      const n=store.get().nodes.find(n=>n.id===id); if(isReadOnly()||!n)return;
      const commands=positionCommands(store.get().nodes,id,pos,`position:${++sequence}`);
      commands.forEach((command,i)=>history.dispatch(command,{fold:i>0}));
    },
    setAppearance: (id,patch) => {
      const n=store.get().nodes.find(n=>n.id===id) as Node|undefined;
      if (isReadOnly() || !n) return;
      const command = Object.keys(patch).length === 1 && 'label' in patch ? titleEditCommand(n, patch.label, false) : setAppearance(id,patch);
      if (!command) return;
      history.dispatch(command);
      if(n?.kind==='illustration') {
        const current=store.get().nodes.find(n=>n.id===id) as Node;
        history.dispatch(setFinished(id,{url:dataUrl(current.assetId!,current.color,current.label),createdAt:new Date().toISOString(),stale:false}),{fold:true});
      }
    },
    addIllustration(assetId) {
      if (isReadOnly()) throw new Error('View only on this device.');
      const asset=illustrationAssets.find(a=>a.id===assetId);if(!asset)throw new Error('This illustration is not available.');
      if(store.get().nodes.length>=40)throw new Error('A canvas supports at most 40 items.');
      const color=asset.defaultColor??'#235c77',id='illustration_'+crypto.randomUUID();
      const spot=place(cards.map(c=>c.node),{x:30,y:30,width:340,height:260});
      const n:Node={kind:'illustration',id,assetId,assetVersion:'1',label:asset.title,color,visual:{background:'#ffffff'} as Node['visual'],...spot,width:340,height:260,finished:{url:dataUrl(assetId,color,asset.title),createdAt:new Date().toISOString(),stale:false}};
      const doc=store.get(),tabs=validateTabs(doc.tabs,doc.nodes.map(n=>n.id));assignTab(tabs,id,tabs.active);
      history.dispatch(tabsCommand(tabs,[addNode(n)]));selected=new Set(cards.filter(c=>c.node.id===id));draw();reveal(id);const added=cards.find(c=>c.node.id===id);if(added)flash(added);
    },
    async addCard(source, signal, position) {
      const dropped = position && { x: Math.max(0, Math.min(1e6, position.x)), y: Math.max(0, Math.min(1e6, position.y)) };
      await catalogReady;
      const entry = catalog.find(entry => entry.id === source);
      if (!entry) throw new Error('Unknown source');
      const state = availability(entry, session.design);
      if (state !== 'add') throw new Error(availabilityReasons[state]);
      await addEntry(entry, signal, dropped);
    },
    async addPcaScore(nodeId) {
      await catalogReady;
      const pca = store.get().nodes.find(n => n.id === nodeId), card = pcaScoreCard(pca?.instance?.inputs ?? store.get().nexo.nodes[nodeId]?.inputs ?? session.inputs);
      const entry = catalog.find(e => e.id === card.source);
      if ((pca?.instance?.source ?? pca?.id) !== 'results_dashboard-plot_pca' || !entry) throw new Error('Unknown source');
      await addEntry(entry, undefined, undefined, card);
    },
    undo: () => { history.undo(); }, redo: () => { history.redo(); },
    get canUndo() { return history.canUndo; }, get canRedo() { return history.canRedo; },
    arrange(kind) {
      const ids = new Set(selection()), boxes = store.get().nodes.filter(n => ids.has(n.id)).map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));
      if (boxes.length < (kind.startsWith('distribute') ? 3 : 2)) return;
      const moves = kind === 'distributeX' ? distribute(boxes, 'x') : kind === 'distributeY' ? distribute(boxes, 'y') : align(boxes, kind);
      const changed = moves.filter(m => { const b = boxes.find(b => b.id === m.id)!; return Math.abs(b.x - m.x) > .5 || Math.abs(b.y - m.y) > .5; });
      if (changed.length) applyMoves(changed, `arrange:${++sequence}`);
    },
    tidy: () => applyMoves(tidyLayout(store.get().nodes, { width: vp.clientWidth / camera.scale, height: vp.clientHeight / camera.scale }), `tidy:${++sequence}`),
    removeAll: () => remove(store.get().nodes.map(n => n.id)),
    removeSelection, duplicateSelection, selection,
    duplicate: id => duplicate([id]), remove: id => remove([id]),
    copyToTab: (id, target) => duplicate([id], target),
    copyPlot: id => { const n = store.get().nodes.find(n => n.id === id); return !!n && copyPlot(n,store.get().nexo.nodes[id]?.style,hasTeamInstance(n)?store.get().nexo.nodes[id]?.inputs:undefined); }, paste,
    moveToTab(id, target) {
      const doc = store.get(), tabs = validateTabs(doc.tabs, doc.nodes.map(n => n.id));
      if (!tabs.tabs.some(t => t.id === target)) return;
      history.dispatch(tabsCommand(moveNodesToTab(tabs, [id], target)));
    },
    setCardStatus: (id, status) => cards.find(c => c.node.id === id)?.setStatus(status),
    cardShown: id => cards.find(c => c.node.id === id)?.cardShown(),
    cardAction: (id, action) => cards.find(c => c.node.id === id)?.run(action),
    finishCard: id => {
      const c=cards.find(c=>c.node.id===id);if(!c)return;
      if(c.node.finished){handle.editFigure(id);return;}
      void c.finish().then(finished=>{if(!store.get().nodes.some(n=>n.id===id))return;const sent=figureIntent(id,finished);if(sent)return sent;history.dispatch(setFinished(id,finished));}).catch(error=>notify(error.message,true));
    },
    editFigure: id => {if((store.get().nodes.find(n=>n.id===id) as Node|undefined)?.kind!=='plot')return;const sent=figureIntent(id,null);if(sent)void sent.catch(error=>notify(error.message,true));else history.dispatch(setFinished(id,null));},
    currentNode: () => store.get().nodes.find(n => n.id === selection()[0]),
    updateCardInputs(nodeId, inputs) {
      const c = cards.find(c => c.node.id === nodeId);
      if (!c) return;
      // A card opened from a checkpoint may not carry its inputs in the document yet: record the values in use
      // (not an undo step) so undoing the first change has something to restore.
      const fixed = !hasTeamInstance(store.get().nodes.find(n => n.id === nodeId));
      if (fixed) {
        // A fixed dashboard card has no Team instance: its inputs live in Nexo's member, never in Team's node.
        if (!store.get().nexo.nodes[nodeId]?.inputs) {
          const before = structuredClone({...c.inputs}); c.fixedInputs = before;
          store.set(doc => ({...doc, nexo: setNexoInputs(nodeId, before).apply(doc).nexo}));
        }
      } else if (!(store.get().nodes.find(n => n.id === nodeId)?.instance as { inputs?: unknown } | undefined)?.inputs) {
        const before = structuredClone({...c.inputs});
        store.set(doc => ({...doc, nodes: doc.nodes.map(n => n.id === nodeId ? {...n, instance: {...n.instance, source: n.instance?.source ?? n.id, inputs: before}} : n)}));
      }
      Object.keys(c.inputs).forEach(k => delete c.inputs[k]); Object.assign(c.inputs, inputs);
      // One undo step per confirmed change; c.inputs already matches, so reconcile does not resend it.
      if (fixed) { c.fixedInputs = {...inputs}; history.dispatch(setNexoInputs(nodeId, {...inputs})); }
      else history.dispatch(setNodeInputs(nodeId, {...inputs}));
      // Chart audit b05 F5: the card follows the module's plot height (Data tab Plot Height), in the same undo step.
      const plot = fixed ? undefined : plotHeightOf(heightInputFor(store.get().nodes.find(n => n.id === nodeId)), inputs);
      if (plot !== undefined) { const n = store.get().nodes.find(n => n.id === nodeId)!, height = cardHeightFor(plot);
        if (height !== n.height) sizeCommands(store.get().nodes, nodeId, { width: n.width, height }, `size:${++sequence}`).forEach(command => history.dispatch(command, { fold: true })); }
      void recheckStatistics(nodeId, history.cursor);
      c.setTier('culled'); draw();
    },
    // A module action ran on the server (Data tab button): redraw the card, no undo step.
    refreshCard(nodeId) { cards.find(c => c.node.id === nodeId)?.reload(); },
    fit, zoomTo: scale => { if (Number.isFinite(scale)) zoom(scale); },
    focusNode(id) {
      const c = cards.find(c => c.node.id === id); if (!c) return false;
      // An explicit "show me": zoom out (never in) when the card does not fit, then bring it into view.
      const free = freeView(), scale = fitScale({ width: free.width - free.left, height: free.height }, camera.scale, c.node); // fits beside the floating library
      if (scale < camera.scale) zoom(scale);
      reveal(id); selected = new Set([c]); draw(); flash(c); return true;
    },
    locateSource(source) {
      const ids = store.get().nodes.filter(n => n.kind === 'plot' && n.instance?.source === source).map(n => n.id);
      if (!ids.length) return false;
      const turn = (locateTurn.get(source) ?? -1) + 1; locateTurn.set(source, turn);
      return handle.focusNode(ids[turn % ids.length]);
    }, resetZoom: () => zoom(1),
    getSession: () => session,
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; }
  };
  tabsBridges.set(handle, { dispatch: command => history.dispatch(command), document: store.get, camera, refresh: draw, fitWhenShown: () => { fitOnShow = true; } });
  return handle;
}
