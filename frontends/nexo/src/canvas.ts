import { place } from './place';
import { Card } from './cards';
import { type Node, type Session } from './api';
import { tier } from './tiers';
export function mountCanvas(root: HTMLElement, session: Session) {
  root.innerHTML = `<header class="top"><strong>Nexo v0</strong><span>Read-only canvas</span><button id="library-toggle">Library</button><button id="select" aria-pressed="true">Select</button><button id="hand" aria-pressed="false">Pan</button><button id="inspect">Inspector</button></header><main><section class="stage"><div id="viewport" tabindex="0" aria-label="Canvas"><div id="world"></div><div id="marquee"></div></div><nav id="library" hidden aria-label="Plot library"></nav><div class="zoom"><button id="out" aria-label="Zoom out">−</button><select id="zoom" aria-label="Zoom"><option value="0.25">25%</option><option value="0.5">50%</option><option value="1" selected>100%</option><option value="2">200%</option></select><button id="in" aria-label="Zoom in">+</button><button id="fit">Fit</button></div><svg id="minimap" aria-label="Minimap" role="img" preserveAspectRatio="none"></svg><output id="hud"></output></section><aside id="inspector" aria-label="Read-only inspector"></aside></main>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const vp = $('viewport'), world = $('world'), inspector = $('inspector'), marquee = $('marquee');
  const map = root.querySelector<SVGSVGElement>('#minimap')!;
  const camera = { x: 24, y: 24, scale: 1 };
  let selected = new Set<Card>(), hand = false, space = false, wheelTimer = 0, wheelActive = false;
  let gesture: { kind: 'pan' | 'marquee' | 'pinch'; x: number; y: number; cx: number; cy: number; base: Set<Card>; distance?: number; scale?: number } | undefined;
  const pointers = new Map<number, { x: number; y: number }>();
  const cards: Card[] = [];
  function add(node: Node) { const c = new Card(node, session, inspect); cards.push(c); world.append(c.el); return c; }
  session.canvas.nodes.forEach(add);
  function inspect() {
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
  function draw() {
    world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
    vp.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
    vp.style.backgroundSize = `${24 * camera.scale}px ${24 * camera.scale}px`;
    const rect = vp.getBoundingClientRect(); const counts = { live: 0, frozen: 0, culled: 0 };
    for (const c of cards) {
      const n = c.node;
      const current = tier({ x: n.x * camera.scale + camera.x, y: n.y * camera.scale + camera.y, width: n.width * camera.scale, height: n.height * camera.scale }, { x: 0, y: 0, width: rect.width, height: rect.height }, camera.scale, selected.has(c), !!gesture || wheelActive);
      c.el.classList.toggle('selected', selected.has(c)); c.setTier(current); counts[current]++;
    }
    $('hud').textContent = `live ${counts.live} · frozen ${counts.frozen} · culled ${counts.culled} | ${Math.round(camera.scale * 100)}%`;
    const zoom = $<HTMLSelectElement>('zoom');
    let custom = zoom.querySelector<HTMLOptionElement>('[data-custom]');
    if (!custom) { custom = document.createElement('option'); custom.dataset.custom = ''; zoom.append(custom); }
    custom.value = String(camera.scale); custom.textContent = `${Math.round(camera.scale * 100)}%`; zoom.value = String(camera.scale);
    minimap(rect.width, rect.height); inspect();
  }
  function minimap(width: number, height: number) {
    const vx = -camera.x / camera.scale, vy = -camera.y / camera.scale;
    const x = Math.min(vx, ...cards.map(c => c.node.x)) - 60, y = Math.min(vy, ...cards.map(c => c.node.y)) - 60;
    const right = Math.max(vx + width / camera.scale, ...cards.map(c => c.node.x + c.node.width)) + 60;
    const bottom = Math.max(vy + height / camera.scale, ...cards.map(c => c.node.y + c.node.height)) + 60;
    map.setAttribute('viewBox', `${x} ${y} ${right - x} ${bottom - y}`); map.replaceChildren();
    function box(x: number, y: number, w: number, h: number, cls: string) { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, String(v)); r.setAttribute('class', cls); map.append(r); }
    cards.forEach(c => box(c.node.x, c.node.y, c.node.width, c.node.height, 'node'));
    box(vx, vy, width / camera.scale, height / camera.scale, 'view');
  }
  function zoom(scale: number, x = vp.clientWidth / 2, y = vp.clientHeight / 2) {
    scale = Math.min(4, Math.max(.1, scale));
    camera.x = x - (x - camera.x) / camera.scale * scale; camera.y = y - (y - camera.y) / camera.scale * scale; camera.scale = scale; draw();
  }
  function fit() {
    if (!cards.length) return;
    const x = Math.min(...cards.map(c => c.node.x)), y = Math.min(...cards.map(c => c.node.y));
    const w = Math.max(...cards.map(c => c.node.x + c.node.width)) - x, h = Math.max(...cards.map(c => c.node.y + c.node.height)) - y;
    camera.scale = Math.max(.1, Math.min(1, (vp.clientWidth - 60) / w, (vp.clientHeight - 60) / h));
    camera.x = (vp.clientWidth - w * camera.scale) / 2 - x * camera.scale; camera.y = (vp.clientHeight - h * camera.scale) / 2 - y * camera.scale; draw();
  }
  $('in').onclick = () => zoom(camera.scale * 1.25); $('out').onclick = () => zoom(camera.scale / 1.25); $('fit').onclick = fit;
  $<HTMLSelectElement>('zoom').onchange = e => zoom(Number((e.target as HTMLSelectElement).value));
  $('inspect').onclick = () => { inspector.hidden = !inspector.hidden; draw(); };
  function setHand(on: boolean) { hand = on; $('hand').setAttribute('aria-pressed', String(on)); $('select').setAttribute('aria-pressed', String(!on)); vp.classList.toggle('hand', on); }
  $('hand').onclick = () => setHand(true); $('select').onclick = () => setHand(false);
  $('library-toggle').onclick = () => { $('library').hidden = !$('library').hidden; };
  for (const id of ['pca', 'violin', 'dist', 'comp', 'heat']) {
    const button = document.createElement('button'); button.textContent = `+ ${id.toUpperCase()}`;
    button.onclick = () => {
      zoom(Math.max(.5, camera.scale));
      const wanted = { x: (vp.clientWidth / 2 - camera.x) / camera.scale - 220, y: (vp.clientHeight / 2 - camera.y) / camera.scale - 165, width: 440, height: 330 };
      const spot = place(cards.map(c => c.node), wanted);
      const c = add({ kind: 'plot', id: `results_dashboard-plot_${id}-${crypto.randomUUID()}`, label: id.toUpperCase(), ...spot, width: 440, height: 330, finished: null });
      camera.x = vp.clientWidth / 2 - (spot.x + 220) * camera.scale; camera.y = vp.clientHeight / 2 - (spot.y + 165) * camera.scale;
      selected = new Set([c]); inspector.hidden = false; $('library').hidden = true; draw();
    };
    $('library').append(button);
  }
  vp.onwheel = e => {
    e.preventDefault(); wheelActive = true; clearTimeout(wheelTimer);
    const r = vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoom(camera.scale * Math.exp(-e.deltaY * .01), e.clientX - r.left, e.clientY - r.top);
    else { camera.x -= e.deltaX; camera.y -= e.deltaY; draw(); }
    wheelTimer = window.setTimeout(() => { wheelActive = false; draw(); }, 160);
  };
  vp.onpointerdown = e => {
    if (e.button !== 0 && e.button !== 1) return;
    vp.focus({ preventScroll: true });
    const r = vp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; gesture = { kind: 'pinch', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, cx: camera.x, cy: camera.y, base: new Set(selected), distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: camera.scale }; }
    else if (hand || space || e.button === 1) gesture = { kind: 'pan', x, y, cx: camera.x, cy: camera.y, base: new Set(selected) };
    else {
      const c = cards.find(c => c.el.contains(e.target as HTMLElement));
      if (c) { if (e.shiftKey) { if (selected.has(c)) selected.delete(c); else selected.add(c); } else selected = new Set([c]); inspector.hidden = false; draw(); return; }
      gesture = { kind: 'marquee', x, y, cx: camera.x, cy: camera.y, base: e.shiftKey ? new Set(selected) : new Set() }; selected = new Set(gesture.base);
    }
    vp.setPointerCapture(e.pointerId); e.preventDefault(); draw();
  };
  vp.onpointermove = e => {
    const r = vp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
    if (!gesture) return;
    const g = gesture;
    if (g.kind === 'pinch') { if (pointers.size !== 2) return; const [a, b] = [...pointers.values()]; const scale = Math.max(.1, Math.min(4, g.scale! * Math.hypot(a.x - b.x, a.y - b.y) / g.distance!)); camera.x = (a.x + b.x) / 2 - (g.x - g.cx) / g.scale! * scale; camera.y = (a.y + b.y) / 2 - (g.y - g.cy) / g.scale! * scale; camera.scale = scale; }
    else if (g.kind === 'pan') { camera.x = g.cx + x - g.x; camera.y = g.cy + y - g.y; }
    else {
      const left = Math.min(x, g.x), top = Math.min(y, g.y), width = Math.abs(x - g.x), height = Math.abs(y - g.y);
      Object.assign(marquee.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      selected = new Set(g.base);
      for (const c of cards) { const n = c.node, cx = n.x * camera.scale + camera.x, cy = n.y * camera.scale + camera.y; if (cx < left + width && cx + n.width * camera.scale > left && cy < top + height && cy + n.height * camera.scale > top) selected.add(c); }
    }
    draw();
  };
  function end(e: PointerEvent) { pointers.delete(e.pointerId); gesture = undefined; marquee.style.display = 'none'; draw(); }
  vp.onpointerup = end; vp.onpointercancel = end; vp.onlostpointercapture = end;
  map.onpointerdown = e => { const r = map.getBoundingClientRect(), b = map.viewBox.baseVal; camera.x = vp.clientWidth / 2 - (b.x + (e.clientX - r.left) / r.width * b.width) * camera.scale; camera.y = vp.clientHeight / 2 - (b.y + (e.clientY - r.top) / r.height * b.height) * camera.scale; draw(); };
  window.addEventListener('keydown', e => { if ((e.target as HTMLElement).closest('button,select,input,textarea')) return; if (e.code === 'Space') { space = true; e.preventDefault(); } if (e.key === 'Escape') { selected.clear(); draw(); } if (e.key === '+' || e.key === '=') zoom(camera.scale * 1.25); if (e.key === '-') zoom(camera.scale / 1.25); });
  window.addEventListener('keyup', e => { if (e.code === 'Space') space = false; });
  window.addEventListener('blur', () => { space = false; pointers.clear(); gesture = undefined; draw(); });
  new ResizeObserver(draw).observe(vp); draw();
}
