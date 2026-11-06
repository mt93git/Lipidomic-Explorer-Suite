import { getPlot, inputsFor, type Figure, type Node, type PlotId, type PlotResult, type Session } from './api';
import type { Tier } from './tiers';
interface Plotly {
  newPlot(el: HTMLElement, data: unknown[], layout: Record<string, unknown>, config: Record<string, unknown>): Promise<unknown>;
  purge(el: HTMLElement): void;
  toImage(el: HTMLElement, options: Record<string, unknown>): Promise<string>;
  downloadImage(el: HTMLElement, options: Record<string, unknown>): Promise<unknown>;
}
declare global { interface Window { Plotly?: Plotly } }
export class Card {
  readonly el = document.createElement('article');
  readonly body = document.createElement('div');
  readonly badge = document.createElement('span');
  readonly inputs: Record<string, unknown>;
  current?: Tier;
  figure?: Figure;
  private cache = new Map<string, Promise<PlotResult>>();
  private png?: string;
  private plot?: HTMLDivElement;
  private revision = 0;
  constructor(readonly node: Node, private session: Session, private changed: () => void) {
    this.inputs = inputsFor(session);
    this.el.className = 'card'; this.el.dataset.id = node.id; this.el.tabIndex = 0;
    this.el.setAttribute('aria-label', node.label);
    Object.assign(this.el.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px`, height: `${node.height}px` });
    const head = document.createElement('header'); head.textContent = node.label;
    this.body.className = 'body'; this.badge.className = 'tier';
    this.el.append(head, this.body, this.badge);
  }
  setTier(next: Tier) {
    if (next === this.current) return;
    this.current = next; this.el.dataset.tier = next; this.badge.textContent = next;
    const revision = ++this.revision;
    if (this.plot) { window.Plotly?.purge(this.plot); this.plot = undefined; }
    this.body.replaceChildren();
    if (next === 'culled') return;
    if (this.node.kind === 'illustration') { this.snapshot(this.node.finished?.url); return; }
    if (next === 'frozen') { this.snapshot(this.node.finished?.url || this.png); return; }
    void this.live(revision);
  }
  private snapshot(url?: string) {
    if (url) { const img = document.createElement('img'); img.src = url; img.alt = this.node.label; this.body.append(img); }
    else this.body.textContent = 'Snapshot unavailable';
  }
  private async live(revision: number) {
    this.body.textContent = 'Loading figure…';
    try {
      const plot = this.node.id.match(/results_dashboard-plot_(pca|violin|dist|comp|heat)/)?.[1] as PlotId | undefined;
      if (!plot) throw new Error('Unsupported dashboard plot');
      const width = Math.round(this.node.width);
      const key = JSON.stringify([this.node.id, this.inputs, width]);
      let pending = this.cache.get(key);
      if (!pending) { pending = getPlot(this.session.sessionId, plot, this.inputs, width); this.cache.set(key, pending); }
      const result = await pending;
      if (revision !== this.revision) return;
      this.figure = result.figure;
      if (!window.Plotly) throw new Error('Plotly unavailable. Run scripts/vendor-plotly.sh, then reload.');
      const el = document.createElement('div'); el.className = 'plot'; this.body.replaceChildren(el); this.plot = el;
      await window.Plotly.newPlot(el, structuredClone(this.figure.data), { ...structuredClone(this.figure.layout), width, height: this.node.height - 35 }, { displayModeBar: false, responsive: true });
      if (revision !== this.revision) { window.Plotly.purge(el); return; }
      this.changed();
      try { const png = await window.Plotly.toImage(el, { format: 'png', width, height: this.node.height - 35 }); if (revision === this.revision) this.png = png; } catch { /* A missing snapshot does not prevent live rendering. */ }
    } catch (error) {
      if (revision !== this.revision) return;
      if (this.plot) window.Plotly?.purge(this.plot);
      this.plot = undefined; this.body.textContent = error instanceof Error ? error.message : String(error);
      this.body.classList.add('message'); this.changed();
    }
  }
  async download() {
    if (!this.plot || !window.Plotly) throw new Error('Select a live plot at 50% zoom or higher to download.');
    await window.Plotly.downloadImage(this.plot, { format: 'png', filename: this.node.id });
  }
}
