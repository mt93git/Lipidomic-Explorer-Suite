import type * as Y from 'yjs';
import { comments, voteCount } from '../collab/comments';
import './pins.css';

// Phase 6 as cut: comment pins in canvas coordinates, in their own layer of the world (above the presence layer).
// Comment mode (the toolbar's Comment, event 'nexo-comment-mode') lasts one click: the click drops a draft where it
// lands, on the card under it if any, and the panel (ui/Comments/CommentsPanel.tsx) asks for the text. The thread open
// in the panel (event 'nexo-comment-open') selects its pin.
// UX review 2, scene 3: comment mode says so (event 'nexo-comment-armed' presses the toolbar's Comment, and a hint);
// a pin on a card keeps (x, y) from the card's top left so it moves with the card; pins sit above every card, in their
// author's colour, with a tooltip, at one size on screen at any zoom (26 px, a touch target on a phone too).
type Thread = ReturnType<ReturnType<typeof comments>['list']>[number];
export const pinLabel = (c: Thread) => {
  const n = c.replies.length, v = voteCount(c);
  return `Comment by ${c.displayName || 'you'}: ${c.text} (${[c.resolved && 'resolved', `${n} ${n === 1 ? 'reply' : 'replies'}`, v && `${v} ${v === 1 ? 'vote' : 'votes'}`].filter(Boolean).join(', ')})`;
};
/** The pin's face: its message count, and its 👍 count when it has votes (UX-A4). */
export const pinText = (c: Thread) => `${c.replies.length + 1}${voteCount(c) ? ` · 👍 ${voteCount(c)}` : ''}`;

/** The author's presence colour, derived as the sidecar does (frontends/nexo-collab/src/admission.mjs identity). */
export async function pinColour(userId: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId)));
  return `hsl(${((d[0] << 24 | d[1] << 16 | d[2] << 8 | d[3]) >>> 0) % 360} 65% 45%)`;
}

const cardOf = (nodeId?: string) => nodeId ? document.querySelector<HTMLElement>(`#world .card[data-id="${CSS.escape(nodeId)}"]`) : null;
const px = (value: string) => parseFloat(value) || 0;
/** A pin's canvas point: on a card, its (x, y) counts from the card's top left. */
export function pinPoint(c: { nodeId?: string; x: number; y: number }) {
  const card = cardOf(c.nodeId);
  return card ? { x: px(card.style.left) + c.x, y: px(card.style.top) + c.y } : { x: c.x, y: c.y };
}

/** The camera that puts canvas point `p` in the middle of `view` (the visible part of the viewport, screen px). */
export const pinCamera = (view: { width: number; height: number }, scale: number, p: { x: number; y: number }) =>
  ({ x: view.width / 2 - p.x * scale, y: view.height / 2 - p.y * scale, scale });

type Bridge = { camera: { x: number; y: number; scale: number }; refresh(): void } | undefined;
/** Canvas point `p` to the middle of the canvas left of the Comments panel. */
function centre(bridge: Bridge, p: { x: number; y: number }) {
  const vp = document.getElementById('viewport'), side = document.querySelector('.comments-panel');
  if (!bridge || !vp) return;
  const r = vp.getBoundingClientRect(), right = Math.min(r.right, side?.getBoundingClientRect().left ?? r.right);
  Object.assign(bridge.camera, pinCamera({ width: right - r.left, height: r.height }, bridge.camera.scale, p)); bridge.refresh();
}

/** A thread chosen in the Comments panel: its pin to the middle of the canvas left of the panel, then selected. */
export function showPin(bridge: Bridge, c: { id: string; nodeId?: string; x: number; y: number }) {
  centre(bridge, pinPoint(c));
  dispatchEvent(new CustomEvent('nexo-comment-open', { detail: c.id }));
}

/** "Jump to card": the card to the middle of the canvas left of the panel, and focus on it. */
export function showCard(bridge: Bridge, nodeId: string) {
  const card = cardOf(nodeId); if (!card) return;
  centre(bridge, { x: px(card.style.left) + px(card.style.width) / 2, y: px(card.style.top) + px(card.style.height) / 2 });
  card.focus({ preventScroll: true });
}

export function mountPins(doc: Y.Doc, viewport: HTMLElement, world: HTMLElement, camera: { x: number; y: number; scale: number }) {
  const layer = document.createElement('div'), map = doc.getMap('comments'), colours = new Map<string, string>();
  const hint = document.createElement('div');
  let active: string | undefined, shown: [HTMLElement, Thread][] = [], frame = 0;
  layer.className = 'comment-layer'; world.append(layer);
  hint.className = 'comment-hint'; hint.setAttribute('role', 'status'); hint.textContent = 'Click where the comment goes · Esc to cancel'; hint.hidden = true;
  viewport.parentElement!.append(hint);
  const scale = () => Number(/scale\(([-\d.e]+)\)/.exec(world.style.transform)?.[1]) || camera.scale;
  // On its card, at one size on screen.
  function place() {
    frame = 0;
    const s = scale();
    for (const [pin, c] of shown) { const p = pinPoint(c); Object.assign(pin.style, { left: `${p.x}px`, top: `${p.y}px`, transform: `translate(-50%,-100%) scale(${1 / s})` }); }
  }
  function render() {
    shown = comments(doc, { readOnly: true }).list().map(c => {
      const pin = document.createElement('button'), label = pinLabel(c);
      pin.type = 'button'; pin.className = 'comment-pin'; pin.dataset.comment = c.id; pin.dataset.resolved = String(c.resolved); pin.textContent = pinText(c);
      pin.setAttribute('aria-label', label); pin.title = label; if (c.id === active) pin.setAttribute('aria-current', 'true');
      if (c.author && !colours.has(c.author) && crypto.subtle) { colours.set(c.author, '#7256b5'); void pinColour(c.author).then(hsl => { colours.set(c.author, hsl); render(); }); }
      pin.style.background = colours.get(c.author) ?? '#7256b5';
      pin.addEventListener('pointerdown', e => e.stopPropagation());
      pin.addEventListener('click', e => { e.stopPropagation(); dispatchEvent(new CustomEvent('nexo-comment-open', { detail: c.id })); });
      return [pin, c] as [HTMLElement, Thread];
    });
    layer.replaceChildren(...shown.map(([pin]) => pin));
    place();
  }
  // The camera (the world's transform) or a card moved: place the pins again in the next frame.
  new MutationObserver(records => {
    if (!frame && records.some(r => r.target === world || (r.target as Element).classList?.contains('card'))) frame = requestAnimationFrame(place);
  }).observe(world, { attributes: true, attributeFilter: ['style'], subtree: true });
  let armed = false;
  const arm = (on: boolean) => { armed = on; viewport.style.cursor = on ? 'crosshair' : ''; hint.hidden = !on; dispatchEvent(new CustomEvent('nexo-comment-armed', { detail: on })); };
  addEventListener('nexo-comment-mode', () => arm(!armed));
  addEventListener('nexo-comment-open', e => { active = (e as CustomEvent<string>).detail; render(); });
  addEventListener('keydown', e => { if (armed && e.key === 'Escape') arm(false); });
  viewport.parentElement!.addEventListener('pointerdown', e => {
    if (!armed || !viewport.contains(e.target as Node)) return;
    e.preventDefault(); e.stopPropagation(); arm(false);
    const r = viewport.getBoundingClientRect(), card = (e.target as HTMLElement).closest<HTMLElement>('.card'), nodeId = card?.dataset.id;
    const x = (e.clientX - r.left - camera.x) / camera.scale, y = (e.clientY - r.top - camera.y) / camera.scale;
    dispatchEvent(new CustomEvent('nexo-comment-draft', { detail: nodeId ? { x: x - px(card!.style.left), y: y - px(card!.style.top), nodeId } : { x, y } }));
  }, true);
  map.observeDeep(render);
  render();
}
