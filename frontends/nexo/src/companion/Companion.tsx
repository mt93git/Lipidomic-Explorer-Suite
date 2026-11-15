import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as KeyEvent } from 'react';
import { createPortal } from 'react-dom';
import { askCompanion } from '../api';
import { adminAnswered, adminUserId } from '../api/adminToken';
import { asleep, clamp, controlsOnScreen, dragger, firstSpot, fitPlace, keyStep, modalOpen, newNudges, nudgeDue, overDock, placeBubble, readPlace, tabFrom,
  recordNudge, settle, sizeFor, SIZE, TIMING, typing, writePlace, type Box, type Place, type Rect } from '../../../shared/companion/core';
import { Art } from './Art';
import { formatAnswer } from './markdown';
import { autoTip, next, placeKey, readFlags, readTipped, startPhase, writeFlag, writeTipped, type Phase, type Screen } from './model';
import { tips, welcome } from './tips';
import './companion.css';
/** The neutrophil companion, docked in the top bar left of the account menu, with Team's floating behaviour
 *  (frontends/shared/companion/core.ts): a click, Enter/Space or a drag takes it out of the bar; out, it can be dragged
 *  anywhere or moved with the arrow keys and stays there (this tab) until Dock, a double-click or a drop on the bar puts
 *  it back. It gives the screen's tip once by itself, rare idle nudges, and the chat panel. First visit: the entrance. */
type Message = { q?: string; text?: string; label?: string };
type Tip = { screen: Screen; kind: 'auto' | 'manual' | 'nudge' };
// Survives the top bar's remount between the entry screens and the canvas (the entrance docks on arrival) and keeps the
// chat's last 10 messages and the idle nudges' count for the page's life only.
const shared = { entering: false, played: false, big: null as Box | null, messages: [] as Message[], nudges: newNudges(Date.now()) };
const CHAT = 'nexo-companion-chat';
export const openCompanionChat = () => window.dispatchEvent(new Event(CHAT));
const t = {
  dock: 'Neutrophil guide: take it out of the bar', out: 'Neutrophil guide: Enter shows a tip with Dock, the arrow keys move it',
  chat: 'Chat', chatLabel: 'Chat with the neutrophil guide', fewer: 'Fewer tips', home: 'Dock', homeLabel: 'Put the guide back in the top bar',
  smaller: 'Make the guide smaller', larger: 'Make the guide larger', closeTip: 'Close the tip',
  kicker: 'NEUTROPHIL · KNOWLEDGE BASE', heading: 'How can I help?', ask: 'Ask about this step…', askLabel: 'Question for the guide', send: 'Send',
  close: 'Close the guide chat', thinking: 'Looking it up…', failed: 'The guide could not answer just now. Try again in a moment.',
};
const storage = () => { try { return globalThis.localStorage; } catch { return undefined; } };
const session = () => { try { return globalThis.sessionStorage; } catch { return undefined; } };
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const boxOf = (el: Element | null): Box => { const r = el?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, s: r.width || 38 } : { x: 0, y: 0, s: 38 }; };
/** The entrance's spot: under the dock, toward the page (150 px). */
function bigBox(dock: Box): Box {
  const s = 150; return { s, ...clamp(dock.x + dock.s - s, dock.y + dock.s + 16, s, innerWidth, innerHeight, 64) };
}
/** The screen the tip and the question are about: the canvas's Inspector on its Statistics tab counts as its own screen. */
function context(screen: Screen): { screen: Screen; card: string | null } {
  const inspector = document.querySelector('#inspector[data-open="true"]');
  const tab = inspector?.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
  return { screen: screen === 'canvas' && tab === 'Statistics' ? 'inspector' : screen, card: inspector?.querySelector('.inspector-head h2')?.textContent ?? null };
}
// The prototype's keyframes: the arc between two boxes, the entrance's appearance and the docking flight.
const flyFrames = (from: Box, to: Box): Keyframe[] => { const dx = from.x - to.x, dy = from.y - to.y, k = from.s / to.s; return [
  { transform: `translate(${dx}px,${dy}px) scale(${k})` },
  { transform: `translate(${dx * .5 - 40}px,${dy * .5 + 60}px) scale(${(k + 1) / 2}) rotate(6deg)`, filter: 'brightness(1.2) drop-shadow(0 0 12px #9fd0ff)', offset: .5 },
  { transform: 'translate(0,0) scale(1.06)', offset: .85 }, { transform: 'none' }]; };
const dockFrames = (from: Box, to: Box): Keyframe[] => { const dx = from.x - to.x, dy = from.y - to.y, k = from.s / to.s; return [
  { transform: `translate(${dx}px,${dy}px) scale(${k})`, filter: 'brightness(1)' },
  { transform: `translate(${dx}px,${dy}px) scale(${k * 1.08})`, filter: 'brightness(1.25) drop-shadow(0 0 14px #9fd0ff)', offset: .18 },
  { transform: `translate(${dx * .45 - 60}px,${dy * .55 - 90}px) scale(${k * .6}) rotate(-8deg)`, filter: 'brightness(1.1)', offset: .55 },
  { transform: 'translate(0,0) scale(1.08)', offset: .88 }, { transform: 'translate(0,0) scale(1)', filter: 'brightness(1)' }]; };
const appearFrames: Keyframe[] = [{ opacity: 0, transform: 'translateY(40px) scale(.3)' }, { opacity: 1, transform: 'translateY(-6px) scale(1.06)', offset: .75 }, { opacity: 1, transform: 'none' }];
const ours = (el: Element) => !!el.closest('[data-companion]');

export function Companion({ screen }: { screen: Screen }) {
  // The entry bar mounts it on the loading screen, before Admin says who is signed in: the flags are that person's once known.
  const known = adminAnswered(), user = adminUserId() ?? 'local';
  const [flags, setFlags] = useState(() => readFlags(storage(), user)), [flagsOf, setFlagsOf] = useState(user);
  const [place, setPlace] = useState<Place | null>(() => fitPlace(readPlace(session(), placeKey(user)), globalThis.innerWidth ?? Infinity, globalThis.innerHeight ?? Infinity));
  const [phase, setPhase] = useState<Phase>(() => (place?.out ? 'out' : 'docked'));
  if (flagsOf !== user) {
    const stored = fitPlace(readPlace(session(), placeKey(user)), globalThis.innerWidth ?? Infinity, globalThis.innerHeight ?? Infinity);
    setFlagsOf(user); setFlags(readFlags(storage(), user)); setPlace(stored); setPhase(p => (p === 'entrance' ? p : stored?.out ? 'out' : 'docked'));
  }
  const [flying, setFlying] = useState<Box | null>(null), [tip, setTip] = useState<Tip | null>(null), [tipH, setTipH] = useState(120);
  const [bubble, setBubble] = useState(false), [hello, setHello] = useState(false), [chat, setChat] = useState(false), [move, setMove] = useState(0);
  const [said, setSaid] = useState(''), [dragging, setDragging] = useState(false), [sleeping, setSleeping] = useState(false), [modal, setModal] = useState(false);
  const [messages, setMessages] = useState(shared.messages), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false);
  const dockRef = useRef<HTMLButtonElement>(null), stand = useRef<HTMLSpanElement>(null), flyRef = useRef<HTMLButtonElement>(null), ring = useRef<HTMLSpanElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const flight = useRef<(() => void) | null>(null), timers = useRef<number[]>([]), refocus = useRef(false), dragged = useRef(false), hold = useRef(false);
  const obstacles = useRef<Rect[]>([]), placeNow = useRef(place); placeNow.current = place;
  const motion = !reduced(), size = modal ? SIZE.mini : sizeFor(!!place?.mini, globalThis.innerWidth ?? Infinity); // no window while Next renders on the server
  const rest: Box | null = phase === 'out' && place ? { x: place.x, y: place.y, s: size } : null, view = flying ?? rest;
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const save = (p: Place) => { setPlace(p); writePlace(session(), placeKey(user), p); };
  // A flight runs once the boxes it starts from and lands on are rendered.
  const go = (f: () => void) => { flight.current = f; setMove(n => n + 1); };
  useLayoutEffect(() => { const f = flight.current; flight.current = null; f?.(); }, [move]);
  const animate = (frames: Keyframe[], ms: number, easing = 'cubic-bezier(.45,0,.2,1)') => { if (motion) flyRef.current?.animate?.(frames, { duration: ms, easing }); };
  const wave = () => { setHello(false); requestAnimationFrame(() => setHello(true)); later(1400, () => setHello(false)); };
  function pulse() {
    const el = ring.current, b = boxOf(dockRef.current); if (!el || !motion || !el.animate) return; const c = b.s + 40;
    Object.assign(el.style, { left: `${b.x + b.s / 2 - c / 2}px`, top: `${b.y + b.s / 2 - c / 2}px`, width: `${c}px`, height: `${c}px` });
    el.animate([{ opacity: .9, transform: 'scale(.45)' }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 520, easing: 'ease-out' });
  }
  function land(from: Box, frames: (f: Box, t: Box) => Keyframe[], ms: number, pulseAt: number) {
    const to = boxOf(dockRef.current); setFlying(to);
    go(() => { animate(frames(from, to), ms); later(motion ? ms : 0, () => { setFlying(null); if (refocus.current) { refocus.current = false; requestAnimationFrame(() => dockRef.current?.focus()); } }); later(motion ? pulseAt : 0, pulse); });
  }
  function enter() {
    shared.entering = shared.played = true; const big = bigBox(boxOf(dockRef.current)); shared.big = big;
    writeTipped(storage(), user, [...new Set([...readTipped(storage(), user), 'start'])]);
    setPhase('entrance'); setFlying(big);
    go(() => { animate(appearFrames, 700, 'cubic-bezier(.3,1.4,.5,1)'); later(motion ? 650 : 0, wave); later(motion ? 900 : 0, () => setBubble(true)); later(6000, dock); });
  }
  function dock() {
    clear(); setBubble(false); setPhase(p => next(p, 'dock')); shared.entering = false;
    writeFlag(storage(), user, 'seen', true); setFlags(f => ({ ...f, seen: true }));
    land(shared.big ?? bigBox(boxOf(dockRef.current)), dockFrames, 1300, 1150);
  }
  /** Out of the bar, to its last spot this tab (or just under the dock), with the screen's tip. */
  function invoke(keyboard: boolean) {
    clear(); setTip(null); setChat(false);
    const home = boxOf(dockRef.current), s = sizeFor(!!place?.mini, innerWidth);
    const spot = place ? settle(place.x, place.y, s, innerWidth, innerHeight) : firstSpot(home, s, innerWidth, innerHeight);
    save({ out: true, mini: !!place?.mini, ...spot }); setPhase(p => next(p, 'invoke'));
    go(() => { animate(flyFrames(home, { ...spot, s }), 900); later(motion ? 850 : 0, wave);
      later(motion ? 1000 : 0, () => { setTip({ screen: context(screen).screen, kind: 'manual' }); if (keyboard) requestAnimationFrame(() => flyRef.current?.focus()); }); });
  }
  function dockBack() {
    if (!rest || !place) return;
    clear(); setTip(null); setHello(false); setPhase(p => next(p, 'dock'));
    if (flyRef.current?.contains(document.activeElement) || tipRef.current?.contains(document.activeElement)) refocus.current = true;
    save({ ...place, out: false }); land(rest, flyFrames, 900, 800);
  }
  /** Closes the tip; focus inside it goes back to the companion, never to the page's start. */
  const closeTip = () => { if (tipRef.current?.contains(document.activeElement)) (rest ? flyRef : dockRef).current?.focus(); setTip(null); };
  const toggleTip = () => setTip(now => (now ? null : { screen: context(screen).screen, kind: 'manual' }));
  const onDrag = (x: number, y: number) => { const p = placeNow.current; if (p) { setDragging(true); setPlace({ ...p, ...clamp(x, y, size, innerWidth, innerHeight) }); } };
  const onDrop = () => {
    setDragging(false); const p = placeNow.current; if (!p) return;
    if (overDock(p.x, p.y, size, boxOf(dockRef.current))) { save({ ...p, out: false }); clear(); setTip(null); setPhase(f => next(f, 'dock')); land({ x: p.x, y: p.y, s: size }, flyFrames, 500, 450); return; }
    save({ ...p, ...settle(p.x, p.y, size, innerWidth, innerHeight) });
  };
  // Out: a press drags it, a press that does not move shows or hides the tip.
  const dragOut = dragger({ start: () => ({ x: placeNow.current?.x ?? 0, y: placeNow.current?.y ?? 0 }), move: onDrag, end: moved => (moved ? onDrop() : toggleTip()) });
  // Docked: dragging the button pulls it out under the pointer; a plain click is the button's own click (invoke).
  const dragDock = dragger({
    start: () => { dragged.current = false; const d = boxOf(dockRef.current); const s = sizeFor(!!placeNow.current?.mini, innerWidth); return { x: d.x + d.s / 2 - s / 2, y: d.y + d.s / 2 - s / 2 }; },
    move: (x, y) => {
      if (!dragged.current) { dragged.current = true; clear(); setTip(null); setChat(false); setPhase(p => next(p, 'invoke')); }
      const mini = !!placeNow.current?.mini, p = { out: true, mini, ...clamp(x, y, sizeFor(mini, innerWidth), innerWidth, innerHeight) }; placeNow.current = p; setDragging(true); setPlace(p);
    },
    end: moved => { if (moved) onDrop(); },
  });
  function keys(e: KeyEvent<HTMLButtonElement>) {
    const step = keyStep(e.key, e.shiftKey);
    if (step && place) { e.preventDefault(); save({ ...place, ...clamp(place.x + step[0], place.y + step[1], size, innerWidth, innerHeight) }); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTip(); }
    else if (e.key === 'Escape') closeTip();
    // Out of the bar it still sits in the Tab order where the bar has it: Tab goes on from there (into its tip when one
    // is open), Shift+Tab goes back to the control before the bar's slot.
    else if (e.key === 'Tab' && (e.shiftKey || !tip) && stand.current) { const to = tabFrom(document, stand.current, e.shiftKey, ours); if (to) { e.preventDefault(); to.focus(); } }
  }
  // The chat's question takes the focus; the companion stays where it is.
  function openChat() { setTip(null); setChat(true); }
  function toggleFewer(value: boolean) { writeFlag(storage(), user, 'fewer', value); setFlags(f => ({ ...f, fewer: value })); }
  // The entrance: Start, first visit only, once Admin answered. A remount after it began (the canvas opened) docks it from where it stood.
  useLayoutEffect(() => { if (shared.entering) dock(); return clear; }, []);
  useLayoutEffect(() => { if (known && !shared.entering && !shared.played && phase === 'docked' && startPhase(flags, screen) === 'entrance') enter(); }, [screen, known]);
  // A tip closes after 9 s, paused while hovered or focused; Esc or a click elsewhere closes it at once.
  useEffect(() => {
    if (!tip) return;
    obstacles.current = controlsOnScreen(document, ours); hold.current = false;
    let left: number = TIMING.tipMs, last = Date.now();
    const id = window.setInterval(() => { const now = Date.now(); if (!hold.current) left -= now - last; last = now; if (left <= 0) closeTip(); }, 250);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTip(); };
    const down = (e: PointerEvent) => { const target = e.target as Element | null; if (!target?.closest?.('[data-companion]')) setTip(null); };
    addEventListener('keydown', key); addEventListener('pointerdown', down, true);
    return () => { clearInterval(id); removeEventListener('keydown', key); removeEventListener('pointerdown', down, true); };
  }, [tip]);
  // Screen readers hear each tip (and the welcome) through one live region that is always there.
  useEffect(() => { const s = tip && tips[tip.screen]; if (s) setSaid(`${s.title}. ${s.text}`); }, [tip]);
  useEffect(() => { if (bubble) setSaid(`${welcome.title}. ${welcome.text}`); }, [bubble]);
  useLayoutEffect(() => { const h = tipRef.current?.offsetHeight; if (h && h !== tipH) setTipH(h); });
  // A new screen closes the last one's tip.
  useEffect(() => () => setTip(null), [screen]);
  // A screen's own tip, once, by itself (after the entrance); Fewer tips stops it.
  useEffect(() => {
    if (phase === 'entrance' || flying || shared.entering) return;
    const tipped = readTipped(storage(), user); if (!autoTip(flags, screen, tipped)) return;
    writeTipped(storage(), user, [...tipped, screen]); setTip({ screen, kind: 'auto' });
  }, [screen, phase, flying === null, flags.seen, flags.fewer]);
  // Idle nudges (Team's rules) and sleep: a click or a key is activity; a modal dialog shrinks it and holds the nudges.
  useEffect(() => {
    const wake = () => { shared.nudges = { ...shared.nudges, lastActivity: Date.now() }; setSleeping(false); };
    addEventListener('pointerdown', wake, true); addEventListener('keydown', wake, true); addEventListener('wheel', wake, { capture: true, passive: true });
    const id = window.setInterval(() => {
      const now = Date.now(), open = modalOpen(document), here = context(screen).screen;
      setModal(open); setSleeping(asleep(shared.nudges, now));
      if (known && flags.seen && phase !== 'entrance' && !tip && nudgeDue(shared.nudges, now, here, flags.fewer, open || chat || typing(document))) {
        shared.nudges = recordNudge(shared.nudges, now, here); setSleeping(false); setTip({ screen: here, kind: 'nudge' });
      }
    }, 1000);
    return () => { clearInterval(id); removeEventListener('pointerdown', wake, true); removeEventListener('keydown', wake, true); removeEventListener('wheel', wake, true); };
  }, [screen, phase, tip === null, chat, known, flags.seen, flags.fewer]);
  // A resized window keeps it on screen.
  useEffect(() => {
    const fit = () => setPlace(p => (p?.out ? { ...p, ...settle(p.x, p.y, sizeFor(p.mini, innerWidth), innerWidth, innerHeight) } : p));
    addEventListener('resize', fit); return () => removeEventListener('resize', fit);
  }, []);
  useEffect(() => { const open = () => openChat(); addEventListener(CHAT, open); return () => removeEventListener(CHAT, open); });
  function add(message: Message) { shared.messages = [...shared.messages, message].slice(-10); setMessages(shared.messages); }
  async function send(e: FormEvent) {
    e.preventDefault(); const q = question.trim(); if (!q || busy) return;
    setQuestion(''); add({ q }); setBusy(true); const c = context(screen);
    try { const answer = await askCompanion(q, c.screen, c.card); add({ text: answer.text, label: answer.label }); }
    catch { add({ text: t.failed, label: '' }); }
    finally { setBusy(false); }
  }
  const dockBox = () => boxOf(dockRef.current), shown = tip && tips[tip.screen];
  const tipPlace = () => {
    if (rest && !flying) return placeBubble(rest, 300, tipH, innerWidth, innerHeight, obstacles.current);
    return placeBubble(dockBox(), 300, tipH, innerWidth, innerHeight, obstacles.current);
  };
  const placed = shown ? tipPlace() : null, panelTop = chat ? dockBox().y + dockBox().s + 13 : 0, panelRight = chat ? Math.max(12, innerWidth - (dockBox().x + dockBox().s) - 40) : 0;
  // The welcome bubble beside the entrance, on the side that covers no control or heading.
  const welcomeAt = (b: Box) => { const p = placeBubble(b, 260, 110, innerWidth, innerHeight, controlsOnScreen(document, ours)); return { left: p.left, top: p.top }; };
  const mood = `${hello ? ' hello' : ''}${sleeping ? ' asleep' : ''}`;
  return <span className="companion-slot" data-companion="">
    <span className="companion-said" aria-live="polite">{said}</span>
    <button ref={dockRef} type="button" className={`companion-dock${!view ? mood : ''}`} aria-label={t.dock} data-phase={phase}
      style={view ? { visibility: 'hidden' } : undefined} onPointerDown={dragDock}
      onKeyDown={e => { if (keyStep(e.key, e.shiftKey)) { e.preventDefault(); invoke(true); } }}
      onClick={e => { if (dragged.current) { dragged.current = false; return; } invoke(e.detail === 0); }}><Art/></button>
    {/* Out of the bar, its place in the Tab order stays here: focus that lands on this stand-in moves to the companion. */}
    {rest && !flying && <span ref={stand} tabIndex={0} className="companion-said" onFocus={() => flyRef.current?.focus()}/>}
    {typeof document !== 'undefined' && createPortal(<>
      <span ref={ring} className="companion-ring" aria-hidden="true"/>
      {view && <button ref={flyRef} type="button" className={`companion-fly${mood}${dragging ? ' dragging' : ''}`} data-phase={flying ? 'flying' : phase} data-companion=""
        tabIndex={rest && !flying ? 0 : -1} aria-hidden={rest && !flying ? undefined : true} aria-label={rest && !flying ? t.out : undefined}
        style={{ left: view.x, top: view.y, width: view.s, height: view.s }}
        onPointerDown={rest && !flying ? dragOut : undefined} onKeyDown={rest && !flying ? keys : undefined} onDoubleClick={dockBack}><Art/></button>}
      {bubble && flying && <div className="companion-pop companion-bubble" aria-hidden="true" style={welcomeAt(flying)}>
        <b>{welcome.title}</b>{welcome.text}</div>}
      {shown && placed && <div ref={tipRef} className="companion-pop companion-tip" data-side={placed.side} data-kind={tip.kind} data-companion="" role="group" aria-label={shown.title}
        style={{ left: placed.left, top: placed.top, ['--tail' as string]: `${placed.offset}px` }}
        onPointerEnter={() => { hold.current = true; }} onPointerLeave={() => { hold.current = !!tipRef.current?.contains(document.activeElement); }} onFocus={() => { hold.current = true; }} onBlur={() => { hold.current = false; }}>
        <b>{shown.title}</b>{shown.text}
        <div className="companion-tip-actions"><label><input type="checkbox" checked={flags.fewer} onChange={e => toggleFewer(e.currentTarget.checked)}/> {t.fewer}</label>
          <span className="companion-tip-buttons">
            {rest && sizeFor(false, innerWidth) === SIZE.out && <button type="button" className="companion-ghost" aria-label={place?.mini ? t.larger : t.smaller} onClick={() => place && save({ ...place, mini: !place.mini })}>{place?.mini ? '+' : '–'}</button>}
            {rest && <button type="button" className="companion-ghost" aria-label={t.homeLabel} onClick={dockBack}>{t.home}</button>}
            <button type="button" aria-label={t.chatLabel} onClick={openChat}>{t.chat}</button></span></div>
        <button type="button" className="companion-tip-x" aria-label={t.closeTip} onClick={closeTip}>×</button>
      </div>}
      {chat && <section className="companion-pop companion-panel" data-companion="" aria-label={t.chatLabel} style={{ top: panelTop, right: panelRight }} onKeyDown={e => { if (e.key === 'Escape') { setChat(false); (rest ? flyRef : dockRef).current?.focus(); } }}>
        <header className="companion-head"><span className="companion-mini"><Art/></span><div><div className="companion-kicker">{t.kicker}</div><h2>{t.heading}</h2></div>
          <button type="button" className="companion-close" aria-label={t.close} onClick={() => { setChat(false); (rest ? flyRef : dockRef).current?.focus(); }}>×</button></header>
        <div className="companion-body" aria-live="polite">{messages.map((m, i) => m.q !== undefined ? <p key={i} className="companion-q">{m.q}</p>
          : <div key={i} className="companion-a"><div className="companion-text" dangerouslySetInnerHTML={{ __html: formatAnswer(m.text ?? '') }}/>{m.label && <p className="companion-label">{m.label}</p>}</div>)}
          {busy && <p className="companion-label">{t.thinking}</p>}</div>
        <form className="companion-foot" onSubmit={e => void send(e)}><input autoFocus value={question} placeholder={t.ask} aria-label={t.askLabel} onChange={e => setQuestion(e.currentTarget.value)}/>
          <button type="submit" disabled={busy || !question.trim()}>{t.send}</button></form>
      </section>}
    </>, document.body)}
  </span>;
}
