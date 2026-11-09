import { networkData, type VisWidget } from './visData';
// Loaded on first use, like Plotly: Team's vis-network (scripts/vendor-visnetwork.sh).
interface VisNetwork { once(event: string, cb: () => void): void; destroy(): void; fit(): void; stabilize(iterations?: number): void }
interface Vis { Network: new (el: HTMLElement, data: unknown, options: unknown) => VisNetwork; DataSet: new (rows: unknown[]) => unknown }
declare global { interface Window { vis?: Vis } }
let loading: Promise<Vis> | undefined;
export function visReady(): Promise<Vis> {
  if (window.vis?.Network) return Promise.resolve(window.vis);
  return loading ??= new Promise<Vis>((resolve, reject) => {
    const base = import.meta.env.BASE_URL, css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = `${base}vendor/vis-network.min.css`; document.head.append(css);
    const script = document.createElement('script');
    script.src = `${base}vendor/vis-network.min.js`; script.async = true;
    script.onload = () => window.vis?.Network ? resolve(window.vis) : script.onerror?.(new Event('error'));
    script.onerror = () => { loading = undefined; script.remove(); css.remove(); reject(new Error('Network viewer unavailable. Run scripts/vendor-visnetwork.sh, then reload.')); };
    document.head.append(script);
  });
}
// Team's tooltips are HTML written by the pathway module. Keep their lines and bold labels, never their markup.
function tooltip(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html'), el = document.createElement('div');
  el.className = 'network-tooltip';
  const blocks = doc.body.querySelectorAll('div'), lines = blocks.length ? [...blocks].filter(d => !d.querySelector('div')) : [doc.body];
  for (const block of lines) {
    const line = document.createElement('div');
    block.childNodes.forEach(n => { const part = document.createElement(n.nodeName === 'STRONG' || n.nodeName === 'B' ? 'strong' : 'span'); part.textContent = n.textContent; line.append(part); });
    el.append(line);
  }
  return el;
}
/** Draws Team's network into `el` and resolves once it has settled, with a PNG of what is drawn. */
export async function drawNetwork(el: HTMLElement, widget: VisWidget): Promise<{ network: VisNetwork; png: string }> {
  const vis = await visReady();
  const { nodes, edges, options } = networkData(widget);
  for (const n of nodes) if (typeof n.title === 'string') n.title = tooltip(n.title);
  const network = new vis.Network(el, { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) }, options);
  await new Promise<void>(resolve => { let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
    network.once('stabilizationIterationsDone', finish); network.once('afterDrawing', () => setTimeout(finish, 1500)); setTimeout(finish, 6000); });
  await new Promise(r => requestAnimationFrame(() => r(null)));
  const canvas = el.querySelector('canvas');
  return { network, png: canvas ? canvas.toDataURL('image/png') : '' };
}
