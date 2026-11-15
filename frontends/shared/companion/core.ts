/** The roaming neutrophil companion shared by Admin (frontends/admin/src/components/companion) and Nexo
 *  (frontends/nexo/src/companion): Team's floating behaviour (www/team/js/context_help.js) without React or any import,
 *  so both apps import this file by path. The person takes it out of the top bar, drags it anywhere (or moves it with the
 *  arrow keys), and it stays there until they put it back; it speaks by itself on a new screen and, rarely, when they sit
 *  idle. Each app keeps its own component, tips, styles and chat. */

export type Box = { x: number; y: number; s: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Where the companion rests: out of the bar or docked, and its last spot out (kept while docked for the next time). */
export type Place = { out: boolean; x: number; y: number; mini: boolean };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Out of the bar it is 96 px, 56 px in mini mode (chosen, on a narrow window, or while a modal dialog is open). */
export const SIZE = { out: 96, mini: 56 } as const;
/** A press that moves less than this is a click (Team's 6 px); arrows move 16 px, 64 px with Shift. */
export const DRAG_THRESHOLD = 6;
export const STEP = 16, BIG_STEP = 64;
/** Under this width there is no free spot: a drop snaps to the nearer bottom corner so it never fights page scrolling. */
export const NARROW = 600;
/** Kept clear of the window's edges; `top` also keeps it below the app's top bar. */
export const EDGE = 8, TOP = 56;
/** Team's timings: a tip closes after 9 s (paused while hovered or focused); an idle nudge comes no sooner than 60 s
 *  after the page opened, only after 45 s without a click or key, 180 s apart, at most 4 a page and 1 a screen; it falls
 *  asleep after 90 s without activity. */
export const TIMING = { tipMs: 9_000, firstNudgeMs: 60_000, idleMs: 45_000, betweenMs: 180_000, maxNudges: 4, sleepMs: 90_000 } as const;

/** Its size out of the bar: mini when chosen or on a narrow window (NARROW). */
export const sizeFor = (mini: boolean, vw: number) => (mini || vw < NARROW ? SIZE.mini : SIZE.out);

export function clamp(x: number, y: number, s: number, vw: number, vh: number, top = TOP): { x: number; y: number } {
  return { x: Math.round(Math.max(EDGE, Math.min(vw - s - EDGE, x))), y: Math.round(Math.max(top, Math.min(vh - s - EDGE, y))) };
}

/** The nearer bottom corner (phones): the top ones sit on the app's top bar and its tabs, whose height varies. */
export function snapCorner(x: number, _y: number, s: number, vw: number, vh: number, top = TOP): { x: number; y: number } {
  return clamp(x + s / 2 < vw / 2 ? 0 : vw, vh, s, vw, vh, top);
}

/** Where to drop after a drag: the spot itself, or the nearest corner on a narrow window. */
export function settle(x: number, y: number, s: number, vw: number, vh: number, top = TOP): { x: number; y: number } {
  return vw < NARROW ? snapCorner(x, y, s, vw, vh, top) : clamp(x, y, s, vw, vh, top);
}

/** The first spot out of the bar: just under the dock, toward the page, never over the middle of the content. */
export function firstSpot(dock: Box, s: number, vw: number, vh: number, top = TOP): { x: number; y: number } {
  return settle(dock.x + dock.s - s - 24, dock.y + dock.s + 24, s, vw, vh, top);
}

/** True when a drop lands on the dock: it goes back to the bar. */
export function overDock(x: number, y: number, s: number, dock: Box): boolean {
  return Math.hypot(x + s / 2 - (dock.x + dock.s / 2), y + s / 2 - (dock.y + dock.s / 2)) < Math.max(48, dock.s);
}

/** Arrow keys: the step to move, or null for any other key. */
export function keyStep(key: string, shift: boolean): [number, number] | null {
  const d = shift ? BIG_STEP : STEP;
  return key === 'ArrowLeft' ? [-d, 0] : key === 'ArrowRight' ? [d, 0] : key === 'ArrowUp' ? [0, -d] : key === 'ArrowDown' ? [0, d] : null;
}

/** The place for this tab (sessionStorage, as Team): storage that throws or holds anything else reads as none. */
export function readPlace(store: Store | undefined, key: string): Place | null {
  try {
    const p = JSON.parse(store?.getItem(key) ?? 'null') as Partial<Place> | null;
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? { out: !!p.out, x: p.x, y: p.y, mini: !!p.mini } : null;
  } catch { return null; }
}
/** A stored place fitted to this window: one saved on a wider window would otherwise open off screen. */
export function fitPlace(p: Place | null, vw: number, vh: number, top = TOP): Place | null {
  return p && { ...p, ...settle(p.x, p.y, sizeFor(p.mini, vw), vw, vh, top) };
}
export function writePlace(store: Store | undefined, key: string, place: Place) {
  try { store?.setItem(key, JSON.stringify(place)); } catch { /* this page only */ }
}

export type Side = 'left' | 'right' | 'below' | 'above';
const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/** The bubble's spot next to the companion: twelve candidates (three along each side, Team's scoring) and the one that
 *  stays on screen and covers the least of the page's buttons, links and fields wins; ties keep the order left, right,
 *  below, above. `offset` is where the tail points along the bubble's edge, in px from its start. */
export function placeBubble(anchor: Box, w: number, h: number, vw: number, vh: number, obstacles: Rect[], top = TOP):
  { left: number; top: number; side: Side; offset: number } {
  const gap = 14, a = anchor, cands: { side: Side; left: number; top: number }[] = [];
  for (const k of [0.15, 0.5, 0.85]) {
    cands.push({ side: 'left', left: a.x - w - gap, top: a.y + a.s / 2 - h * k });
    cands.push({ side: 'right', left: a.x + a.s + gap, top: a.y + a.s / 2 - h * k });
    cands.push({ side: 'below', left: a.x + a.s / 2 - w * k, top: a.y + a.s + gap });
    cands.push({ side: 'above', left: a.x + a.s / 2 - w * k, top: a.y - h - gap });
  }
  let best = cands[0], bestScore = Infinity;
  cands.forEach((c, i) => {
    const off = Math.max(0, EDGE - c.left) + Math.max(0, c.left + w - (vw - EDGE)) + Math.max(0, top - c.top) + Math.max(0, c.top + h - (vh - EDGE));
    const box = { x: c.left, y: c.top, w, h }, covered = obstacles.reduce((sum, o) => sum + area(box, o), 0);
    const score = off * 1000 + covered + i * 0.01;
    if (score < bestScore) { best = c; bestScore = score; }
  });
  const left = Math.round(Math.max(EDGE, Math.min(vw - w - EDGE, best.left))), topPx = Math.round(Math.max(top, Math.min(vh - h - EDGE, best.top)));
  const along = best.side === 'left' || best.side === 'right' ? a.y + a.s / 2 - topPx : a.x + a.s / 2 - left;
  const offset = Math.round(Math.max(14, Math.min((best.side === 'left' || best.side === 'right' ? h : w) - 14, along)));
  return { left, top: topPx, side: best.side, offset };
}

const CONTROLS = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [contenteditable="true"], h1, h2';
/** The page's visible controls and headings, for placeBubble; the companion's own views are left out. */
export function controlsOnScreen(doc: Document, skip: (el: Element) => boolean): Rect[] {
  const out: Rect[] = [];
  doc.querySelectorAll(CONTROLS).forEach(el => {
    if (skip(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  });
  return out;
}

/** A modal dialog is open: the companion shrinks and holds its nudges. */
export function modalOpen(doc: Document): boolean {
  return !!doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"]');
}
/** The person is typing: no nudge over a field they are filling. */
export function typing(doc: Document): boolean {
  const el = doc.activeElement as HTMLElement | null;
  return !!el && (el.matches?.('input, textarea, select') || el.isContentEditable === true);
}

export type Nudges = { start: number; lastActivity: number; lastNudge: number; count: number; screens: string[] };
export const newNudges = (now: number): Nudges => ({ start: now, lastActivity: now, lastNudge: -Infinity, count: 0, screens: [] });
/** An idle nudge is due on this screen now (Team's rules, TIMING). */
export function nudgeDue(n: Nudges, now: number, screen: string, fewer: boolean, busy: boolean): boolean {
  return !fewer && !busy && now - n.start >= TIMING.firstNudgeMs && now - n.lastActivity >= TIMING.idleMs
    && now - n.lastNudge >= TIMING.betweenMs && n.count < TIMING.maxNudges && !n.screens.includes(screen);
}
export const recordNudge = (n: Nudges, now: number, screen: string): Nudges =>
  ({ ...n, lastNudge: now, lastActivity: now, count: n.count + 1, screens: [...n.screens, screen] });
export const asleep = (n: Nudges, now: number) => now - n.lastActivity >= TIMING.sleepMs;

/** A pointer-down handler that drags: `start` gives the spot the drag starts from, `move` receives each new spot once the
 *  press has moved past DRAG_THRESHOLD, and `end` says whether it moved (false: a click). The pointer is captured, so the
 *  drag keeps going outside the element. */
export function dragger(o: { start: () => { x: number; y: number }; move: (x: number, y: number) => void; end: (moved: boolean) => void }) {
  return (e: { pointerId: number; clientX: number; clientY: number; button?: number; currentTarget: EventTarget | null; preventDefault?: () => void }) => {
    const el = e.currentTarget as HTMLElement | null;
    if (!el || (e.button ?? 0) !== 0) return;
    const sx = e.clientX, sy = e.clientY, from = o.start(); let moved = false;
    try { el.setPointerCapture?.(e.pointerId); } catch { /* not capturable: the element still gets its own events */ }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true; ev.preventDefault(); o.move(from.x + dx, from.y + dy);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
      o.end(moved);
    };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
  };
}
