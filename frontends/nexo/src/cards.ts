import { FOCUS_BELOW } from './canvas/focus';
import { isReadOnly } from './state/readonly';
// Card chrome above the plot: the 36 px header (bottom border included) and the card's 1 px top and bottom
// borders (shell.css). There is no footer, so the figure is drawn at the full body height.
export const CARD_CHROME = 38;
import type { RequestOptions } from './prefetch';
import { analysisCacheKey, onAnalysisChange } from './analysisGeneration';
import { exportReceipts } from './export/changedNotice';
import { strings as s, phrases as p, keys, tip } from './ui/strings';
import {isStale,messages,provenance,snapshotFits} from './export/finalize';
import {applyNexoStatistics as applyStatisticsToFigure} from './editor/applyNexoStatistics';
import type {Visual} from './state/document';
import {applyNexoStyle} from './editor/applyNexoStyle';
import {applyEditor} from './editor/applyEditor';
import {figure as gcFigure,stateFrom as gcState,type GcMessage} from './groupComparison/model';
import { renderCard, updateCard, sendCardEvent, getPlot, inputsFor, confirmGroupComparison, type Figure, type Node, type PlotId, type PlotResult, type Session } from './api';
import type { RenderKind } from './api/types';
import { fixedInstanceId } from './api/instance';
import { unpackFigure } from './api/plotPayload';
import { bindPlotClick, type ClickTarget } from './plotlyClick';
import { bodyStatus } from './cardStatus';
import type { CardShown } from './inspectorStatus';
import { runNeedFor, runNeedKey, runNeedWaiting, markRunNeed, UNAVAILABLE_INPUTS } from './runNeeds';
import { cardView, statusLabels, type CardStatus } from './cardView';
import { jsonImage } from './mock/png';
import { isThumb, type Tier } from './tiers';
import { imageCache, imageKey } from './imageCache';
import { renderDpr } from './retina';
import { imageReady } from './imageReady';
import { drawNetwork } from './network/vis';
import { hashText, imageSignature, rememberImage } from './drawingSignature';
import { hasGl3d, purgePlot } from './gl';
import type { VisWidget } from './network/visData';
interface Plotly {
  newPlot(el: HTMLElement, data: unknown[], layout: Record<string, unknown>, config: Record<string, unknown>): Promise<unknown>;
  react: Plotly["newPlot"];
  purge(el: HTMLElement): void;
  toImage(el: HTMLElement | { data: unknown[]; layout: Record<string, unknown> }, options: Record<string, unknown>): Promise<string>;
  downloadImage(el: HTMLElement, options: Record<string, unknown>): Promise<unknown>;
}
declare global { interface Window { Plotly?: Plotly } }
let plotlyLoading: Promise<Plotly> | undefined;
/** Plotly is loaded on demand at the first live plot, Finish or export; one shared promise. */
export function plotlyReady(): Promise<Plotly> {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  return plotlyLoading ??= new Promise<Plotly>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}vendor/plotly.min.js`; script.async = true;
    script.onload = () => window.Plotly ? resolve(window.Plotly) : script.onerror?.(new Event('error'));
    script.onerror = () => { plotlyLoading = undefined; script.remove(); reject(new Error('Plotly unavailable. Run scripts/vendor-plotly.sh, then reload.')); };
    document.head.append(script);
  });
}
// Off-screen snapshots of Plotly cards frozen by the live cap render one at a time.
let snapshotQueue: Promise<unknown> = Promise.resolve();
/** `groupComparison`: the html Group comparison card, drawn live from its JSON message (src/groupComparison/model.ts). */
/** `network`: Team's visNetwork, drawn live with Team's vis-network; frozen, it is the image of what was drawn. */
export interface Renderer { kind: 'plotly' | 'image'; groupComparison?: true; network?: true }
const renderers: Record<RenderKind, Renderer> = {plotly:{kind:'plotly'}, png:{kind:'image'}, visnetwork:{kind:'image', network:true}, html:{kind:'plotly', groupComparison:true}};
/** The comparison is held back until its reference group is confirmed on the card. */
class NeedsConfirmation extends Error { constructor(readonly token: string | undefined) { super('Confirm the reference group to compute the comparison.'); } }
type ScreenBox = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>;
/** Screen-space menu bounds; choose below only when above cannot fit and below has more room. */
export function cardMenuPlacement(anchor: ScreenBox, view: ScreenBox, height: number, prefer: 'above' | 'below' = 'above') {
  const above = anchor.top - view.top, belowRoom = view.bottom - anchor.bottom;
  const below = prefer === 'below' ? !(belowRoom < height + 4 && above > belowRoom) : above < height + 4 && belowRoom > above;
  return {below, maxHeight:Math.max(32, (below ? belowRoom : above) - 4),
    shiftX:Math.max(view.left - anchor.left, Math.min(0, view.right - anchor.right))};
}
export type { CardStatus };
export type CardAction = 'edit' | 'inspect' | 'duplicate' | 'finish' | 'data' | 'copy' | 'copyplot' | 'move' | 'remove' | 'design' | 'enlarge';
export class Card {
  teamPreview=false;
  nexoStyle?:import('./state/nexo').NexoStyle;
  /** Inputs of a fixed dashboard card as last read from Nexo's member (undo detection). */
  fixedInputs?:Record<string,unknown>;
  readonly el = document.createElement('article');
  readonly body = document.createElement('div');
  readonly badge = document.createElement('span');
  readonly title = document.createElement('strong');
  readonly thumbTitle = document.createElement('span');
  readonly stats = document.createElement('span');
  readonly status = document.createElement('span');
  readonly exportNotice = document.createElement('p');
  private designRequired = false;
  private statusTimer = 0;
  private chromeObserver: MutationObserver;
  /** Chart audit b05 F5: the card is sized from its module's plot height; the image is drawn at the body height. */
  plotBody = false;
  private renderHeight() { return Math.round(this.node.height) - (this.plotBody ? CARD_CHROME : 0); }
  private capturing = false;
  private rendering = 0;
  private pendingStatus?: CardStatus;
  private action: (action: CardAction) => void = () => {};
  private rename: (title: string) => void = () => {};
  private prepareTitleEdit: () => void = () => {};
  private titleInput?: HTMLInputElement;
  private cancelTitleEdit?: () => void;
  private zoom?: number;
  readonly inputs: Record<string, unknown>;
  current?: Tier;
  figure?: Figure;
  private cache = new Map<string, Promise<PlotResult>>();
  private png?: string;
  /** The Plotly card's key() when its snapshot was taken: a frozen card whose inputs or size changed takes a new one. */
  private pngFor?: string;
  private plot?: HTMLDivElement;
  /** A 3D plot off the live tier, kept detached with its WebGL context and redrawn with Plotly.react when live again (gl.ts). */
  private parked?: HTMLDivElement;
  private network?: { destroy(): void };
  private revision = 0;
  private offAnalysis: () => void;
  /** Module actions run on this card (Data tab buttons): the server's figure changed with the same inputs. */
  private actionRuns = 0;
  private imageKey?: string;
  private disposed = false;
  private observer: MutationObserver;
  private resizeTimer = 0;
  private renderer: Renderer;
  private gcMessage?: GcMessage;
  constructor(readonly node: Node, private session: Session, private changed: () => void, kind: RenderKind = 'plotly', private restoring = false) {
    this.offAnalysis = onAnalysisChange(session.sessionId, () => {
      if (this.node.finished || this.node.kind !== 'plot' || this.disposed) return;
      this.cache.clear(); this.pngFor = undefined;
      const tier = this.current; this.current = undefined;
      if (tier) this.setTier(tier, true);
    });
    this.inputs = node.instance?.inputs ?? inputsFor(session);
    this.renderer = renderers[kind];
    this.observer = new MutationObserver(() => { if (!this.el.isConnected) this.dispose(); });
    this.observer.observe(document.documentElement, {childList:true, subtree:true});
    this.el.className = 'card'; this.el.dataset.id = node.id; this.el.tabIndex = 0;
    this.el.setAttribute('aria-label', node.label);
    Object.assign(this.el.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px`, height: `${node.height}px` });
    this.el.style.setProperty('--card-header-height', `${CARD_CHROME - 2}px`);
    const head = document.createElement('header');
    this.thumbTitle.className = 'card-thumb-title'; this.thumbTitle.setAttribute('aria-hidden', 'true');
    this.title.className = 'card-title'; this.updateTitle();
    if (!isReadOnly()) {
      this.title.tabIndex = 0; this.title.setAttribute('role', 'button');
      this.title.setAttribute('aria-keyshortcuts', 'Enter F2');
      this.title.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); this.editTitle(); });
      this.title.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); e.stopPropagation(); this.editTitle();
      });
    }
    this.status.className = 'card-status'; this.status.setAttribute('role', 'status');
    this.stats.className = 'card-stats'; this.stats.hidden = true;
    head.append(this.status, this.title, this.stats);
    this.body.className = 'body'; this.badge.className = 'tier'; this.badge.setAttribute('aria-hidden', 'true');
    const button = (label: string, action: CardAction) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.onclick = () => this.action(action); return b;
    };
    const wrap = document.createElement('div'); wrap.className = 'card-more';
    const actions = document.createElement('div'); actions.className = 'card-actions';
    // Row 16: the tooltip supplements the name and prints the key; a native title would double it.
    const iconButton = (label: string, action: CardAction, path: string, key?: string, shortcuts?: string) => {
      const b = button(label, action); b.setAttribute('aria-label', label); b.dataset.tip = tip(label, key); if (shortcuts) b.setAttribute('aria-keyshortcuts', shortcuts);
      b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
      return b;
    };
    // Edit opens the inspector even for a finished figure; changing that figure remains an explicit action.
    actions.append(iconButton(s.cardEdit, 'inspect', 'M14 5l5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z'),
      iconButton(s.actionDuplicate, 'duplicate', 'M9 9h11v11H9zM15 9V4H4v11h5', keys.duplicate, 'Control+D Meta+D'));
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '⋯';
    toggle.setAttribute('aria-label', s.moreCardActions); toggle.dataset.tip = s.moreCardActions; toggle.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div'); menu.className = 'card-menu'; menu.hidden = true;
    menu.id = `card-menu-${node.id}`; menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', s.moreCardActions);
    toggle.setAttribute('aria-controls', menu.id);
    const close = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); this.el.classList.remove('menu-open'); };
    toggle.onclick = () => {
      if (!menu.hidden) { close(); return; }
      document.querySelectorAll<HTMLButtonElement>('.card-more > button[aria-expanded=true]').forEach(b => b.click());
      menu.hidden = false; menu.classList.remove('below'); this.el.classList.add('menu-open'); toggle.setAttribute('aria-expanded', 'true');
      const viewport = this.el.closest('#viewport')!.getBoundingClientRect();
      menu.style.maxHeight = ''; menu.style.translate = '';
      const rect = menu.getBoundingClientRect(), bar = head.getBoundingClientRect();
      const scale = rect.width / menu.offsetWidth;
      const placement = cardMenuPlacement({top:bar.top,bottom:bar.bottom,left:rect.left,right:rect.right}, viewport, rect.height, 'below');
      menu.classList.toggle('below', placement.below);
      menu.style.maxHeight = `${placement.maxHeight / scale}px`;
      menu.style.translate = `${placement.shiftX / scale}px 0`;
      menu.querySelector('button')?.focus();
    };
    for (const [label, action] of [['Finish plot','finish'],['Duplicate','duplicate'],['Data & settings','data'],['Copy settings','copyplot'],['Copy to tab…','copy'],['Move to tab…','move'],['Remove','remove']] as const) if (action !== 'copyplot' || node.kind === 'plot') menu.append(button(label, action));
    if (node.id.endsWith('-plot_heat') || node.instance?.source === 'results_dashboard-plot_heat') menu.append(button(s.enlargePlot, 'enlarge'));
    menu.addEventListener('click', () => { close(); if (this.el.isConnected && menu.contains(document.activeElement)) toggle.focus(); });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); e.stopPropagation(); close(); toggle.focus(); } });
    wrap.addEventListener('focusout', e => { const to = e.relatedTarget as HTMLElement | null; if (to && !wrap.contains(to) && !to.contains(wrap)) close(); });
    // Header actions keep focus and never start a canvas gesture.
    actions.addEventListener('pointerdown', e => e.stopPropagation());
    actions.addEventListener('dblclick', e => e.stopPropagation());
    // A double click anywhere else on the card opens the inspector.
    this.el.addEventListener('dblclick', e => { if ((e.target as HTMLElement).closest('button,input,select,textarea,a')) return; window.getSelection()?.removeAllRanges(); this.action('inspect'); });
    this.status.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) e.stopPropagation(); });
    wrap.append(toggle, menu); actions.append(wrap); head.append(actions);
    this.exportNotice.className = 'card-export-notice'; this.exportNotice.setAttribute('role', 'status'); this.exportNotice.textContent = s.plotChangedExport; this.exportNotice.hidden = true;
    this.el.append(head, this.body, this.thumbTitle, this.exportNotice, this.badge);
    // Observe render output for presentation only; renderers and tier decisions stay unchanged.
    this.chromeObserver = new MutationObserver(() => this.syncStatus());
    this.chromeObserver.observe(this.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class']});
    this.refreshSnapshot();
  }
  onAction(action: (action: CardAction) => void) { this.action = action; }
  onTitleEdit(commit: (title: string) => void, prepare: () => void) { this.rename = commit; this.prepareTitleEdit = prepare; }
  /** Chart audit b12: the catalog's Plotly click source of this card (plotlyClick.ts); set by the canvas. */
  clickSource?: string;
  private clicked: (inputs: Record<string, unknown>) => void = () => {};
  private clickFailed: (error: unknown) => void = () => {};
  /** The module changed this card's inputs after a forwarded Plotly click (the canvas records them as an edit). */
  onPlotClick(changed: (inputs: Record<string, unknown>) => void, failed: (error: unknown) => void) { this.clicked = changed; this.clickFailed = failed; }
  private bindClicks(el: HTMLDivElement, figure: unknown) {
    if (isReadOnly() || !this.clickSource) return;
    const instance = this.instanceId();
    bindPlotClick(el as unknown as ClickTarget, {instanceId: instance, clickSource: this.clickSource, figureSource: (figure as {source?: unknown} | undefined)?.source,
      send: body => sendCardEvent(this.session.sessionId, instance!, body),
      onChanged: inputs => { if (!this.disposed) this.clicked(inputs); },
      onError: error => { if (!this.disposed) this.clickFailed(error); }});
  }
  editTitle() {
    if (isReadOnly() || this.disposed) return;
    if (this.titleInput) { this.titleInput.focus(); return; }
    this.prepareTitleEdit();
    const input = document.createElement('input'); this.titleInput = input;
    input.type = 'text'; input.className = 'card-title-input'; input.value = this.node.label;
    input.maxLength = 512; input.setAttribute('aria-label', s.cardTitle);
    const finish = (commit: boolean, focus: boolean) => {
      if (this.titleInput !== input) return;
      this.titleInput = undefined; this.cancelTitleEdit = undefined; input.remove(); this.title.hidden = false;
      if (commit && !isReadOnly()) this.rename(input.value);
      this.updateTitle();
      if (focus) this.title.focus({ preventScroll: true });
    };
    input.addEventListener('pointerdown', e => e.stopPropagation());
    input.addEventListener('dblclick', e => e.stopPropagation());
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.isComposing) return;
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(e.key === 'Enter', true); }
    });
    input.addEventListener('blur', () => finish(true, false));
    this.cancelTitleEdit = () => finish(false, false);
    this.title.hidden = true; this.title.after(input); input.focus({ preventScroll: true }); input.select();
  }
  run(action: CardAction) { this.action(action); }
  updateTitle() {
    this.title.textContent = this.node.label; this.title.title = this.node.label;
    this.title.setAttribute('aria-label', this.node.label || s.cardTitle);
    // The tooltip is anchored to the title text (this.title, and the thumbnail title): a card-level title followed the
    // pointer over the header's status badge and covered it.
    this.thumbTitle.textContent = this.node.label; this.thumbTitle.title = this.node.label;
    this.el.setAttribute('aria-label', this.node.label);
    this.body.querySelectorAll('img').forEach(img => { img.alt = this.node.label; });
    this.updateStatistics(); this.exportNotice.hidden = !exportReceipts.changed(this.node);
  }
  /** Journey review 4.1: a plot that carries confirmed statistics says so on its header; stale ones say they need review. */
  private updateStatistics() {
    const st = this.node.statistics, current = !!st?.result, stale = !!st?.applied && !st?.result;
    this.stats.hidden = !current && !stale; this.stats.dataset.state = current ? 'current' : 'stale';
    this.stats.textContent = current ? 'Statistics' : stale ? 'Statistics out of date' : '';
    this.stats.title = current ? 'Confirmed p-values are drawn on this plot (Statistics tab).' : stale ? 'The data changed after the statistics were confirmed. Review and confirm them again in the Statistics tab.' : '';
  }
  setDesignRequired(required: boolean) { if (required === this.designRequired) return; const wasRequired = this.designRequired; this.designRequired = required; this.pendingStatus = undefined; if (wasRequired && !required) this.retryRender(); this.syncStatus(); }
  setStatus(state: CardStatus, immediate = false) {
    if (this.pendingStatus === state && (!immediate || this.status.dataset.state === state)) return;
    this.pendingStatus = state; clearTimeout(this.statusTimer);
    const paint = () => {
      // Row 11: label, tone and offered action come from the one mapping (cardView.ts); the card carries state and tone for its body styling.
      const view = cardView(state, { designRequired: this.designRequired });
      this.el.dataset.state = state; this.el.dataset.tone = view.tone;
      this.status.dataset.state = state; this.status.setAttribute('aria-label', view.label); this.status.title = view.label;
      const dot = document.createElement('i'); dot.setAttribute('aria-hidden','true');
      const label = document.createElement('span'); label.className = 'card-status-text'; label.textContent = view.label;
      this.status.replaceChildren(dot, label);
      this.announceShown();
      if (view.action) {
        const { label: text, action } = view.action;
        const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
        b.onclick = () => { if (action === 'review') location.href = '/team/'; else this.action(action); };
        this.status.append(b);
      }
    };
    if (state === 'updating' && !immediate) this.statusTimer = window.setTimeout(paint, 2000); else paint();
  }
  private syncStatus() {
    if(this.capturing)return;
    if (this.designRequired && !this.node.finished) { this.setStatus('waiting'); return; }
    if (this.node.kind==='illustration') {this.setStatus('current');return;}
    if (this.node.kind === 'plot' && this.node.finished) { this.setStatus(isStale(this.node,(this.session.preparation as {revision?:number})?.revision??0) ? 'finished-stale' : 'finished'); return; }
    const state = bodyStatus({rendering:this.rendering, text:this.body.textContent?.trim() ?? '', drawn:!!this.body.querySelector('img,.js-plotly-plot,.network canvas'),
      confirming:!!this.body.querySelector('.gc-confirm,.run-need'), restoringText:this.restoring ? p.restoringPlot(this.node.label) : ''});
    if (state) this.setStatus(state, state === 'updating' && this.rendering > 0);
    this.announceShown();
  }
  /** Small fixes item 1: what this card shows (its painted badge state, the message in its body, its run need), read by the
   *  Inspector status line; no second state machine. */
  cardShown(): CardShown | undefined {
    const state = this.status.dataset.state as CardStatus | undefined; if (!state) return undefined;
    const message = this.body.classList.contains('message') ? this.body.querySelector('p')?.textContent?.trim() ?? '' : '';
    const need = runNeedFor(this.node.id, UNAVAILABLE_INPUTS)?.status;
    return { state, message, ...(need && message.startsWith(need) ? { need } : {}) };
  }
  private shownKey = '';
  private announceShown() {
    const key = JSON.stringify(this.cardShown() ?? null); if (key === this.shownKey) return; this.shownKey = key;
    window.dispatchEvent(new CustomEvent('nexo-card-status', { detail: { id: this.node.id } }));
  }
  async finish() {
    if(this.node.finished)return this.node.finished;
    const statisticsBusy=()=>!!document.querySelector('#inspector [data-statistics-status]')?.textContent?.includes('Checking or computing statistics');
    if(this.capturing)throw new Error(messages.updating);
    if(statisticsBusy())throw new Error(messages.statistics);
    // Right after a plot draws its render may still be in flight: wait for it (up to 10 s) instead of refusing.
    const busy=()=>!this.disposed && (this.rendering>0 || this.body.textContent==='Loading figure…' || this.pendingStatus==='updating' || (this.current===undefined && !this.el.hidden));
    for(const end=Date.now()+10000;busy() && Date.now()<end;)await new Promise(resolve=>setTimeout(resolve,50));
    if(this.capturing)throw new Error(messages.updating);
    if(this.rendering || this.body.textContent==='Loading figure…')throw new Error(messages.updating);
    if(this.node.width<160 || this.node.height-CARD_CHROME<120)throw new Error(messages.tooSmall);
    if(this.pendingStatus && this.pendingStatus!=='current')throw new Error(messages.updating);
    const revision=(this.session.preparation as {revision?:number})?.revision ?? 0;
    const generation=this.revision, key=this.key();
    const statistics=JSON.stringify(this.node.statistics),nexoStyle=JSON.stringify(this.nexoStyle);
    this.capturing=true;this.setStatus('finishing');
    let temporary:HTMLDivElement|undefined;
    try {
      let url:string;
      if(this.renderer.kind==='plotly') {
        const Plotly=await plotlyReady().catch(()=>{throw new Error(messages.notReady);});
        let gd=this.plot;
        if(!gd || this.teamPreview) {
          if(!this.figure)this.figure=(await this.fetchFigure().catch(()=>{throw new Error(messages.notReady);})).figure;
          temporary=document.createElement('div');
          Object.assign(temporary.style,{position:'fixed',left:'-10000px',top:'0',width:`${this.node.width}px`,height:`${this.node.height-CARD_CHROME}px`});
          document.body.append(temporary);gd=temporary;
          const edited=applyStatisticsToFigure(this.styled(applyEditor(this.figure as import('./editor/applyEditor').Figure,(this.node.visual as Visual|undefined)?.editor),true),this.node.statistics);
          await Plotly.newPlot(gd,structuredClone(edited.data),{...structuredClone(edited.layout),width:this.node.width,height:this.node.height-CARD_CHROME},{displayModeBar:false});
        }
        url=await Plotly.toImage(gd,{format:'svg',width:Math.round(this.node.width),height:Math.round(this.node.height-CARD_CHROME)});
      } else if (this.body.querySelector('.network canvas')) {
        url=(this.body.querySelector('.network canvas') as HTMLCanvasElement).toDataURL('image/png');
      } else {
        const img=this.body.querySelector('img');
        // A render that just answered (the 2x image after a focus) may still be decoding: wait for it, bounded.
        if(!img || !(await imageReady(img)))throw new Error(messages.notReady);
        const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error(messages.notReady);
        ctx.drawImage(img,0,0);url=canvas.toDataURL('image/png');
      }
      if(this.disposed || this.key()!==key || generation!==this.revision || revision!==((this.session.preparation as {revision?:number})?.revision??0))throw new Error(messages.changed);
      if(nexoStyle!==JSON.stringify(this.nexoStyle))throw new Error(messages.changed);
      if(statisticsBusy() || statistics!==JSON.stringify(this.node.statistics))throw new Error(messages.statisticsChanged);
      if(!snapshotFits(url))throw new Error(messages.tooLarge);
      const st=this.node.statistics, result=st?.result;
      return {url,createdAt:new Date().toISOString(),stale:false,provenance:provenance({preparationRevision:revision,statistics:st?{
        statisticsStatus:result?'current':'none',statisticsFingerprint:result?.fingerprint??null,
        statisticsShown:!!(result&&st.presentation.show),statisticsMethod:result?.provenance.method.slice(0,1000)??null
      }:undefined})};
    } finally {if(temporary){purgePlot(window.Plotly,temporary);temporary.remove();}this.capturing=false;this.setStatus('current');}
  }
  refreshSnapshot() {
    const current=this.current;this.current=undefined;
    if(!this.node.finished)this.setStatus('current');
    this.el.classList.toggle('card-finished',!!this.node.finished);
    const finish=this.el.querySelector<HTMLButtonElement>('.card-menu button');
    if(finish)finish.textContent=this.node.kind==='illustration'?'Edit illustration':this.node.finished?'Edit figure':'Finish plot';
    this.syncStatus();if(current)this.setTier(current);
  }
  setZoom(scale: number) {
    if (this.zoom === scale) return;
    this.zoom = scale;
    const thumb = isThumb(scale);
    this.el.classList.toggle('card-thumb', thumb);
    this.el.querySelector('header')!.inert = thumb;
    if (thumb) {
      this.cancelTitleEdit?.();
      this.el.style.setProperty('--card-thumb-scale', String(scale));
    }
    // Zoomed out, the header menu keeps a readable size (it scales against the camera).
    this.el.classList.toggle('zoomed-out', scale < .9);
    this.el.classList.toggle('zoomed-far', scale < FOCUS_BELOW);
  }
  /** Image cards and finished or illustration cards are images either way; they do not count against the live cap. */
  get renderKind(): 'plotly' | 'image' { return this.renderer.kind === 'plotly' && !this.node.finished && this.node.kind !== 'illustration' ? 'plotly' : 'image'; }
  /** `snapshot`: a frozen Plotly card without a snapshot image renders one off screen (live cap at ≥ 50 %). */
  setTier(next: Tier, snapshot = false) {
    if (this.disposed) return;
    if (next === this.current) {
      if (snapshot && next === 'frozen' && !this.freshPng() && !this.node.finished && this.renderKind === 'plotly' && !this.rendering) void this.offscreenSnapshot(this.revision);
      if(this.node.finished)this.syncStatus();
      if (!this.node.finished && next === 'live' && this.renderer.kind === 'image' && this.imageKey !== this.pngKey()) {
        clearTimeout(this.resizeTimer); this.resizeTimer = window.setTimeout(() => { if (this.current === 'live') void this.liveImage(); }, 160);
      }
      return;
    }
    this.current = next; this.el.dataset.tier = next; this.badge.textContent = next;
    const revision = ++this.revision;
    if (this.plot) { if (hasGl3d(this.plot) && !this.parked) this.parked = this.plot; else purgePlot(window.Plotly, this.plot); this.plot = undefined; }
    this.destroyNetwork();
    this.body.replaceChildren(); this.body.classList.remove('message'); // a new render starts clean: the failure padding (.body.message) must not shrink the plot
    if (next === 'culled') return;
    if (this.node.finished) { this.snapshot(this.node.finished.url); if(this.node.kind==='plot'){const caption=document.createElement('p');caption.className='snapshot-caption';caption.textContent='Frozen figure. Source data remain available in Edit.';this.body.append(caption);} this.syncStatus(); return; }
    if (this.node.kind === 'illustration') { this.snapshot(); return; }
    // An image card frozen before it ever rendered (added below 50 %) still loads its image once.
    // A frozen image card whose inputs or size changed shows the last image while it fetches the current one.
    if (this.renderer.kind === 'image') { const cached = this.cachedPng(); this.snapshot(cached); if (next === 'live' || !cached || this.imageKey !== this.pngKey()) void this.liveImage(); return; }
    if (next === 'frozen') { if (this.freshPng() || !snapshot) this.snapshot(this.png); else { if (this.png) this.snapshot(this.png); void this.offscreenSnapshot(revision); } return; }
    void this.live(revision);
  }
  /** Fetch only data off screen; mounting and snapshots remain owned by setTier. */
  prefetch(options: RequestOptions): Promise<unknown> {
    if (this.renderer.kind === 'image' && !this.renderer.network) return this.loadImage(options, 1);
    return this.fetchMessage(options);
  }
  get firstRenderReady() { return this.hasRender && this.rendering === 0; }
  get prefetchKey() { return this.key(); }
  get hasRender() { return this.renderer.kind === 'image' && !this.renderer.network ? !!imageCache.get(this.pngKey()) : this.cache.has(this.key()); }
  get canPrefetch() { return !this.disposed && !this.node.finished && this.node.kind === 'plot' && !this.designRequired && !this.awaitingRun(); }
  /** b10 check 11: the card already says it needs its module button; no render request until it is pressed. */
  private awaitingRun() { const instance = this.instanceId(); return !!instance && runNeedWaiting(runNeedKey(this.session.sessionId, instance)); }
  private loadImage(options?: RequestOptions, dpr = this.renderDpr()) {
    const key=this.pngKey(dpr), width=Math.round(this.node.width),height=this.renderHeight(),instance=this.instanceId();
    if(!instance)return Promise.reject(new Error('Missing card instance'));
    if(this.awaitingRun())return Promise.reject(new Error(UNAVAILABLE_INPUTS));
    return imageCache.load(key,()=>renderCard(this.session.sessionId,instance,width,height,'png',options,dpr).then(async result=>{
      const blob='blob' in result?result.blob:await jsonImage(this.node.label,width,height,result.figure);
      const url=URL.createObjectURL(blob);await rememberImage(url,blob);
      return {url,bytes:blob.size};
    }));
  }
  /** Steph review 4b: what the card shows now (palette/paletteRedraw.ts), undefined when it shows no plot drawing. */
  drawingSignature(): string | undefined {
    if (this.disposed || this.node.finished || this.node.kind !== 'plot') return undefined;
    if (this.renderer.kind === 'plotly') { if (!this.figure) return undefined; try { return hashText(JSON.stringify(this.edited().data)); } catch { return undefined; } }
    return imageSignature(this.png);
  }
  /** A render of this card is under way. */
  get drawing() { return this.rendering > 0; }
  private freshPng() { return !!this.png && this.pngFor === this.key(); }
  private key() { return analysisCacheKey(this.session.sessionId, [this.node.id, this.inputs, Math.round(this.node.width), Math.round(this.node.height), ...(this.actionRuns ? [this.actionRuns] : [])]); }
  private pngKey(dpr: number = this.renderDpr()) { return imageKey({id:this.instanceId() ?? this.node.id, inputs:this.inputs, width:this.node.width, height:this.renderHeight(), revision:analysisCacheKey(this.session.sessionId, `${(this.session.preparation as {revision?:number})?.revision ?? 0}${this.actionRuns ? '+a' + this.actionRuns : ''}`), dpr}); }
  /** Retina (retina.ts): a live PNG card at >= 100 % asks for min(2, devicePixelRatio); networks are drawn in the browser. */
  private renderDpr() { return this.renderer.network ? 1 : renderDpr({tier:this.current, zoom:this.zoom, devicePixelRatio:window.devicePixelRatio ?? 1}); }
  /** The image card's render from the shared cache (the last one shown if this size was evicted or not rendered yet). */
  private cachedPng() { const url = imageCache.get(this.pngKey()) ?? (this.png && this.imageKey ? imageCache.get(this.imageKey) : undefined); if (!url) this.png = undefined; return url; }
  // Legacy dashboard nodes draw through the v0 dashboard route (getPlot), not an instance.
  private instanceId() { return this.node.instance?.instanceId ?? this.node.instance?.id ?? this.node.id.match(/^(tcinstance_[0-9a-f]{12})-/)?.[1] ?? (/^results_dashboard-plot_/.test(this.node.id) ? undefined : fixedInstanceId(this.node.id)); }
  async setInputs(inputs: Record<string, unknown>) {
    const instance = this.instanceId();
    const settled = instance ? (await updateCard(this.session.sessionId, instance, inputs)).inputs : inputs;
    Object.keys(this.inputs).forEach(key => delete this.inputs[key]); Object.assign(this.inputs, settled);
    if (this.current === 'live' && this.renderer.kind === 'image') await this.liveImage();
  }
  dispose() {
    if (this.disposed) return;
    this.cancelTitleEdit?.();
    this.offAnalysis(); this.disposed = true; this.revision++; clearTimeout(this.resizeTimer); this.observer.disconnect(); this.chromeObserver.disconnect(); clearTimeout(this.statusTimer);
    if (this.plot) purgePlot(window.Plotly, this.plot);
    if (this.parked) purgePlot(window.Plotly, this.parked);
    this.parked = undefined;
    this.destroyNetwork();
  }
  private destroyNetwork() { this.network?.destroy(); this.network = undefined; }
  private async liveImage() {
    if (this.renderer.network) return this.liveNetwork();
    this.rendering++;
    const key = this.pngKey(); this.imageKey = key;
    if (!imageCache.get(key) && !this.png) this.showLoading();
    try {
      const instance = this.instanceId(); if (!instance) throw new Error('Missing card instance');
      // Shared LRU (48 MB, 64 entries): returning to a card or resizing back does not refetch.
      const url = await this.loadImage();
      if (this.disposed || this.node.finished || this.imageKey !== key || this.pngKey() !== key) return;
      const shown = this.body.querySelector('img')?.getAttribute('src');
      this.png = url; this.restoring = false;
      if (this.current !== 'culled' && shown !== url) { this.body.replaceChildren(); this.snapshot(url); this.changed(); }
    } catch (error) {
      if (this.disposed || this.imageKey !== key) return;
      if (!this.png && this.current !== 'culled') this.renderFailed(error);
    } finally {this.rendering--;this.syncStatus();}
  }
  /** Team's network: live in the card when live; otherwise drawn off screen once for its image (cached). */
  private async liveNetwork() {
    this.rendering++;
    const key = this.pngKey(); this.imageKey = key;
    const width = Math.round(this.node.width), height = Math.round(this.node.height);
    if (!imageCache.get(key) && !this.png) this.showLoading();
    let host: HTMLDivElement | undefined, drawn: { network: { destroy(): void }; png: string } | undefined;
    try {
      const instance = this.instanceId(); if (!instance) throw new Error('Missing card instance');
      const result = await this.fetchMessage();
      if (!('figure' in result)) throw new Error('Expected the network data');
      if (this.disposed || this.node.finished || this.imageKey !== key || this.current === 'culled') return;
      const live = this.current === 'live';
      host = document.createElement('div'); host.className = 'network';
      if (live) { this.destroyNetwork(); this.body.replaceChildren(host); }
      else { Object.assign(host.style, {position:'fixed', left:'-10000px', top:'0', width:`${width}px`, height:`${height - CARD_CHROME}px`}); document.body.append(host); }
      drawn = await drawNetwork(host, result.figure as VisWidget);
      if (this.disposed || this.imageKey !== key || !host.isConnected) { drawn.network.destroy(); host.remove(); return; }
      const url = drawn.png ? await imageCache.load(key, async () => ({url:drawn!.png, bytes:drawn!.png.length})) : undefined;
      if (url) this.png = url; this.restoring = false;
      if (live) this.network = drawn.network;
      else { drawn.network.destroy(); host.remove(); if ((this.current as Tier | undefined) !== 'culled') { this.body.replaceChildren(); this.snapshot(url); } }
      this.changed();
    } catch (error) {
      if (host && !this.network) host.remove();
      if (this.disposed || this.imageKey !== key) return;
      if (this.current !== 'culled') { this.body.replaceChildren(); this.renderFailed(error); }
    } finally {this.rendering--;this.syncStatus();}
  }
  private retryRender() {
    if (this.disposed) return;
    this.body.classList.remove('message');
    const tier = this.current; this.cache.clear(); this.current = undefined;
    if (tier) this.setTier(tier, true);
  }
  /** Row 11: while a figure is on its way the body is a neutral skeleton (shell.css), with the loading text the status machine reads. */
  private showLoading() {
    const box = document.createElement('div'); box.className = 'card-skeleton'; box.setAttribute('aria-busy', 'true');
    const text = document.createElement('span'); text.textContent = this.restoring ? p.restoringPlot(this.node.label) : 'Loading figure…';
    box.append(text); this.body.classList.remove('message'); this.body.replaceChildren(box);
  }
  private renderFailed(error: unknown) {
    this.body.replaceChildren(); this.body.classList.add('message');
    const message = document.createElement('p');
    const text = error instanceof Error ? error.message : String(error);
    // A view Team builds only on request (Generate Analysis): name the step and offer the module button, as Team Canvas does.
    const need = this.restoring ? undefined : runNeedFor(this.node.id, text);
    const needInstance = this.instanceId(); if (need && needInstance) markRunNeed(runNeedKey(this.session.sessionId, needInstance));
    message.textContent = this.restoring ? p.restorePlotFailed(this.node.label) : need ? `${need.status}. ${need.reason}` : text;
    this.body.append(message);
    if (need && !isReadOnly()) {
      const run = document.createElement('button'); run.type = 'button'; run.className = 'run-need'; run.textContent = need.action;
      run.addEventListener('pointerdown', e => e.stopPropagation());
      run.onclick = async () => {
        const instance = this.instanceId(); if (!instance) return;
        run.disabled = true;
        try { await updateCard(this.session.sessionId, instance, {}, [need.button]); this.retryRender(); }
        catch (e) { run.disabled = false; message.textContent = e instanceof Error ? e.message : String(e); }
      };
      this.body.append(run);
    }
    if (this.restoring) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = s.tryAgain;
      retry.addEventListener('pointerdown', e => e.stopPropagation()); retry.onclick = () => this.retryRender();
      this.body.append(retry);
    }
  }
  private snapshot(url?: string) {
    if (url) { const img = document.createElement('img'); img.src = url; img.alt = this.node.label; this.body.append(img); }
    else this.body.textContent = this.restoring ? p.restoringPlot(this.node.label) : 'Snapshot unavailable';
  }
  private fetchFigure(): Promise<PlotResult> {
    if (this.renderer.groupComparison) return this.fetchMessage().then(result => {
      const message = result.figure as GcMessage;
      if (message.requiresConfirmation) throw new NeedsConfirmation(message.confirmationToken);
      this.gcMessage = message; return {figure:this.gcFigure(), provenance:result.provenance};
    });
    return this.fetchMessage();
  }
  private gcFigure(): Figure { return gcFigure(gcState(this.gcMessage!, (this.node.visual as Visual | undefined)?.groupComparison), Math.round(this.node.width)) as unknown as Figure; }
  private fetchMessage(options?: RequestOptions): Promise<PlotResult> {
    const plot = this.node.id.match(/results_dashboard-plot_(pca|violin|dist|comp|heat)/)?.[1] as PlotId | undefined;
    const instance = this.instanceId();
    if (!plot && !instance) return Promise.reject(new Error('Missing card instance'));
    if (this.awaitingRun()) return Promise.reject(new Error(UNAVAILABLE_INPUTS));
    const width = Math.round(this.node.width), key = this.key();
    let pending = this.cache.get(key);
    if (!pending) {
      pending = instance ? renderCard(this.session.sessionId, instance, width, Math.round(this.node.height), 'json', options).then(result => { if (!('figure' in result)) throw new Error(this.renderer.groupComparison ? 'Expected the group comparison message' : 'Expected Plotly JSON'); return {figure:result.figure as Figure, provenance:result.provenance}; }) : getPlot(this.session.sessionId, plot!, this.inputs, width, options);
      pending = pending.then(result => ({...result, figure: unpackFigure(result.figure)}));
      this.cache.set(key, pending); pending.catch(() => { if (this.cache.get(key) === pending) this.cache.delete(key); });
    }
    return pending;
  }
  private styled(figure:import('./editor/applyEditor').Figure,includeNexo=!this.teamPreview) {
    if(!includeNexo){this.el.querySelector('.nexo-style-error')?.remove();return figure;}
    try { const styled=applyNexoStyle(figure,this.nexoStyle);this.el.querySelector('.nexo-style-error')?.remove();return styled; }
    catch(error){let reason=this.el.querySelector<HTMLElement>('.nexo-style-error');if(!reason){reason=document.createElement('p');reason.className='nexo-style-error';reason.setAttribute('role','alert');this.el.append(reason);}reason.textContent=error instanceof Error?error.message:String(error);return figure;}
  }
  private edited() { return applyStatisticsToFigure(this.styled(applyEditor(this.figure as import('./editor/applyEditor').Figure, (this.node.visual as Visual | undefined)?.editor)),this.node.statistics); }
  private async live(revision: number) {
    this.rendering++;
    this.showLoading();
    try {
      const width = Math.round(this.node.width);
      // "Loading figure…" stays until both the figure and Plotly are ready.
      const [result, Plotly] = await Promise.all([this.fetchFigure(), plotlyReady()]);
      if (revision !== this.revision) return;
      this.figure = result.figure;
      const edited = this.edited(), parked = this.parked; this.parked = undefined;
      // A parked 3D plot draws again in its own WebGL context: react takes the figure as newPlot would (camera included).
      const reuse = parked && hasGl3d(edited);
      if (parked && !reuse) purgePlot(Plotly, parked);
      // Plotly.react only updates a div that keeps its js-plotly-plot class; resetting className would make it newPlot again.
      const el = reuse ? parked : document.createElement('div'); el.classList.add('plot'); this.body.replaceChildren(el); this.plot = el;
      await Plotly[reuse ? 'react' : 'newPlot'](el, structuredClone(edited.data), { ...structuredClone(edited.layout), width, height: this.node.height - CARD_CHROME }, { displayModeBar: false, responsive: true });
      if (revision !== this.revision) { if (this.parked !== el) purgePlot(Plotly, el); return; }
      if (!reuse) this.bindClicks(el, result.figure);
      this.restoring = false; this.changed();
      void Plotly.toImage(el, { format: 'png', width, height: this.node.height - CARD_CHROME }).then(png => {if(revision===this.revision){this.png=png;this.pngFor=this.key();}}).catch(() => { /* A missing preview does not prevent live rendering. */ });
    } catch (error) {
      if (revision !== this.revision) return;
      if (this.plot) purgePlot(window.Plotly, this.plot);
      this.plot = undefined;
      if (error instanceof NeedsConfirmation) this.confirmPrompt(error.token);
      else { this.renderFailed(error); this.body.classList.add('message'); }
      this.changed();
    } finally {this.rendering--;this.syncStatus();}
  }
  /** A Plotly card frozen by the live cap that was never live: draw it once off screen and show the image. */
  private offscreenSnapshot(revision: number) {
    this.rendering++;
    if (!this.body.childElementCount) this.showLoading();
    // Ask for the figure now: only Plotly's off-screen drawing is one at a time. Fetching inside the chain queued
    // each card's request after the previous snapshot, and off-screen prefetch filled the gaps (cold open).
    const figure = this.fetchFigure(); figure.catch(() => { /* Reported by the job below. */ });
    const job = snapshotQueue.then(async () => {
      if (revision !== this.revision || this.disposed) return;
      const [result, Plotly] = await Promise.all([figure, plotlyReady()]);
      if (revision !== this.revision || this.disposed) return;
      this.figure = result.figure;
      const width = Math.round(this.node.width), height = this.node.height - CARD_CHROME, edited = this.edited();
      // toImage on the figure draws into Plotly's own hidden clone and removes it.
      const png = await Plotly.toImage({ data: structuredClone(edited.data), layout: { ...structuredClone(edited.layout), width, height } }, { format: 'png', width, height });
      if (revision !== this.revision || this.disposed) return;
      this.restoring = false; this.png = png; this.pngFor = this.key(); this.body.replaceChildren(); this.snapshot(png); this.changed();
    }).catch(error => { if (revision === this.revision && !this.disposed && !this.png) { this.body.replaceChildren(); if (error instanceof NeedsConfirmation) this.confirmPrompt(error.token); else { this.renderFailed(error); this.body.classList.add('message'); } } })
      .finally(() => { this.rendering--; this.syncStatus(); });
    snapshotQueue = job;
  }
  /** The Group comparison card before its reference group is confirmed: confirm here, then draw. */
  private confirmPrompt(token: string | undefined) {
    const box = document.createElement('div'); box.className = 'gc-confirm';
    const text = document.createElement('p'); text.textContent = 'Confirm the reference group to compute the comparison.';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Confirm reference group'; b.disabled = !token;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.onclick = async () => {
      const instance = this.instanceId(); if (!instance || !token) return;
      b.disabled = true; text.textContent = 'Computing the comparison…';
      try { await confirmGroupComparison(this.session.sessionId, instance, token); }
      catch (error) { text.textContent = error instanceof Error ? error.message : String(error); b.disabled = false; return; }
      window.dispatchEvent(new CustomEvent('nexo-group-comparison-confirmed', {detail:this.node.id}));
      this.cache.clear(); const tier = this.current; if (tier && !this.disposed) { this.current = undefined; this.setTier(tier); }
    };
    box.append(text, b); this.body.replaceChildren(box);
  }
  /** A module action ran on the server (Data tab button): drop this card's cached renders and draw it again. */
  reload() {
    this.actionRuns++; this.cache.clear(); this.png = undefined; this.pngFor = undefined;
    const tier = this.current; if (tier && !this.disposed) { this.current = undefined; this.setTier(tier); }
  }
  async refreshEditor() {
    if(this.renderer.groupComparison && this.gcMessage && !this.node.finished)this.figure=this.gcFigure();
    if(!this.figure || this.disposed || this.node.finished)return;
    this.rendering++;
    const Plotly=await plotlyReady().catch(()=>undefined);
    if(!Plotly || this.disposed){this.rendering--;this.syncStatus();return;}
    const figure=applyStatisticsToFigure(this.styled(applyEditor(this.figure as import('./editor/applyEditor').Figure,(this.node.visual as Visual | undefined)?.editor)),this.node.statistics);
    const el=this.plot??document.createElement('div');
    const temporary=!this.plot;
    if(temporary)this.body.append(el);
    try {
      await Plotly.react(el,figure.data,{...figure.layout,width:this.node.width,height:this.node.height-CARD_CHROME},{displayModeBar:false});
      this.png=await Plotly.toImage(el,{format:'png',width:this.node.width,height:this.node.height-CARD_CHROME}); this.pngFor=this.key();
      if(temporary&&this.current==='frozen'){this.body.replaceChildren();this.snapshot(this.png);}
    } catch { /* Keep the last successful snapshot if Plotly cannot export. */ } finally {this.rendering--;if(temporary){purgePlot(Plotly,el);el.remove();}this.syncStatus();}
  }
  async download() {
    if (this.renderer.kind === 'image' && this.png) { const link = document.createElement('a'); link.href = this.png; link.download = `${this.node.id}.png`; link.click(); return; }
    if (!this.plot) throw new Error('Select a live plot at 50% zoom or higher to download.');
    await (await plotlyReady()).downloadImage(this.plot, { format: 'png', filename: this.node.id });
  }
}
