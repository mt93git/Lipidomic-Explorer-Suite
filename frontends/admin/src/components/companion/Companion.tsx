// Copied from Nexo frontends/nexo/src/companion at 2ec1f69d; keep in step by hand.
// Admin: a Next client component for the client zone only (never lab staff). user: the signed-in client member's id
// (per-user flags; the chat needs it); null on the signed-out pages, where it docks top-right with tips only and no
// chat. apiBase: NEXO_API_BASE from the server layout. The screen comes from the path, or from the page
// (CompanionScreen); no Nexo api imports (ask.ts); CSS module.
"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Art } from './Art';
import { askCompanion, forgetCompanionToken, MAX_QUESTION } from './ask';
import { formatAnswer } from './markdown';
import { autoTip, next, readFlags, readTipped, startPhase, writeFlag, writeTipped, type Phase, type Screen } from './model';
import { useScreenOverride } from './screen';
import { tips, welcome } from './tips';
import css from './companion.module.css';
/** Team's neutrophil companion docked in the top bar, left of the account menu (docs/integration/nexo-companion/prototype.html):
 *  the first-visit entrance on Start, a click (or Enter/Space) brings it out with the screen's tip, and the chat panel. */
type Box = { x: number; y: number; s: number };
type Message = { q?: string; text?: string; label?: string };
// Survives a remount of the top bar (the entrance docks on arrival) and keeps the chat's last 10 messages for the page's
// life only.
// Admin: `user` is whose they are; another person signing in on the same tab starts with no messages, a new token and
// their own first-visit entrance.
const shared = { entering: false, played: false, big: null as Box | null, messages: [] as Message[], user: null as string | null };
const t = {
  dock: 'Neutrophil guide: show a tip for this screen', chat: 'Chat', chatLabel: 'Chat with the neutrophil guide', fewer: 'Fewer tips',
  kicker: 'NEUTROPHIL · KNOWLEDGE BASE', heading: 'How can I help?', ask: 'Ask about this step…', askLabel: 'Question for the guide', send: 'Send',
  close: 'Close the guide chat', thinking: 'Looking it up…', failed: 'The guide could not answer just now. Try again in a moment.',
};
const noop = () => () => {};
const storage = () => { try { return globalThis.localStorage; } catch { return undefined; } };
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const boxOf = (el: Element | null): Box => { const r = el?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, s: r.width || 38 } : { x: 0, y: 0, s: 38 }; };
function bigBox(kind: 'entrance' | 'out'): Box {
  const s = 150, x = Math.round(innerWidth * (kind === 'entrance' ? 0.64 : 0.59)), y = Math.round(innerHeight * (kind === 'entrance' ? 0.3 : 0.24));
  return { x: Math.max(16, Math.min(innerWidth - s - 16, x)), y: Math.max(72, y), s };
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

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/refs, react-hooks/immutability, react-hooks/set-state-in-effect --
   Nexo's component as it is (keep in step by hand): each effect runs on exactly the values it lists, the floating views
   are placed from the dock's box while rendering, and `shared` keeps the entrance and the chat across a remount. */
export function Companion({ screen: pathScreen, user: signedIn = null, apiBase = '/api' }: { screen: Screen; user?: string | null; apiBase?: string }) {
  const user = signedIn ?? 'signed-out';
  const screen = useScreenOverride() ?? pathScreen;
  // Admin: the portal (and so every floating view) only once hydrated.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [flags, setFlags] = useState(() => readFlags(storage(), user));
  const [phase, setPhase] = useState<Phase>('docked'), [floating, setFloating] = useState<Box | null>(null);
  const [tip, setTip] = useState<{ screen: Screen; auto: boolean } | null>(null);
  const [bubble, setBubble] = useState(false), [hello, setHello] = useState(false), [chat, setChat] = useState(false), [move, setMove] = useState(0);
  const [messages, setMessages] = useState(() => { if (shared.user !== user) { shared.user = user; shared.messages = []; shared.played = false; forgetCompanionToken(); } return shared.messages; }), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false);
  const dockRef = useRef<HTMLButtonElement>(null), flyRef = useRef<HTMLButtonElement>(null), ring = useRef<HTMLSpanElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const flight = useRef<(() => void) | null>(null), timers = useRef<number[]>([]), bigNow = useRef<Box | null>(null), refocus = useRef(false), started = useRef(false);
  const motion = !reduced();
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
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
    const to = boxOf(dockRef.current); setFloating(to);
    go(() => { animate(frames(from, to), ms); later(motion ? ms : 0, () => { setFloating(null); if (refocus.current) { refocus.current = false; requestAnimationFrame(() => dockRef.current?.focus()); } }); later(motion ? pulseAt : 0, pulse); });
  }
  function enter() {
    shared.entering = shared.played = started.current = true; const big = bigBox('entrance'); shared.big = big;
    writeTipped(storage(), user, [...new Set([...readTipped(storage(), user), screen])]);
    setPhase('entrance'); setFloating(big);
    go(() => { animate(appearFrames, 700, 'cubic-bezier(.3,1.4,.5,1)'); later(motion ? 650 : 0, wave); later(motion ? 900 : 0, () => setBubble(true)); later(6000, dock); });
  }
  function dock() {
    clear(); setBubble(false); setPhase(p => next(p, 'dock')); shared.entering = false;
    writeFlag(storage(), user, 'seen', true); setFlags(f => ({ ...f, seen: true }));
    land(shared.big ?? bigBox('entrance'), dockFrames, 1300, 1150);
  }
  function invoke(keyboard: boolean) {
    clear(); setTip(null); setChat(false); refocus.current = keyboard;
    const home = boxOf(dockRef.current), big = bigBox('out'); bigNow.current = big;
    setPhase(p => next(p, 'invoke')); setFloating(big);
    go(() => { animate(flyFrames(home, big), 900); later(motion ? 850 : 0, wave);
      later(motion ? 1000 : 0, () => { setTip({ screen, auto: false }); if (keyboard) requestAnimationFrame(() => tipRef.current?.focus()); });
      later(5200, () => back('timeout')); });
  }
  function back(event: 'timeout' | 'dismiss') {
    clear(); setTip(null); setHello(false); setPhase(p => next(p, event));
    if (tipRef.current?.contains(document.activeElement)) refocus.current = true;
    land(bigNow.current ?? bigBox('out'), flyFrames, 900, 800);
  }
  function openChat() { if (phase === 'out') back('dismiss'); setTip(null); setChat(true); }
  function toggleFewer(value: boolean) { writeFlag(storage(), user, 'fewer', value); setFlags(f => ({ ...f, fewer: value })); }
  // The entrance: the first signed-in screen, first visit only. A remount after it began docks it from where it stood.
  // Admin: not this instance's own entrance (started), which React's StrictMode re-runs these effects over in dev.
  useLayoutEffect(() => { if (shared.entering && !started.current) dock(); return clear; }, []);
  useLayoutEffect(() => { if (signedIn && !shared.entering && !shared.played && phase === 'docked' && startPhase(flags, screen) === 'entrance') enter(); }, [screen]);
  // Out: Esc or a click anywhere else sends it back to the dock.
  useEffect(() => {
    if (phase !== 'out') return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') back('dismiss'); };
    const down = (e: PointerEvent) => { const target = e.target as Node; if (!tipRef.current?.contains(target) && !flyRef.current?.contains(target)) back('dismiss'); };
    addEventListener('keydown', key); addEventListener('pointerdown', down, true);
    return () => { removeEventListener('keydown', key); removeEventListener('pointerdown', down, true); };
  }, [phase]);
  // A screen's own tip, once, next to the dock (Team's step tips close by themselves after 15 s); Fewer tips stops it.
  useEffect(() => {
    if (phase !== 'docked' || floating || shared.entering) return;
    const tipped = readTipped(storage(), user); if (!autoTip(flags, screen, tipped)) return;
    writeTipped(storage(), user, [...tipped, screen]); setTip({ screen, auto: true });
    const timer = window.setTimeout(() => setTip(now => now?.auto ? null : now), 15000);
    return () => { clearTimeout(timer); setTip(now => now?.auto ? null : now); };
  }, [screen, phase, floating === null, flags.seen, flags.fewer]);
  function add(message: Message) { shared.messages = [...shared.messages, message].slice(-10); setMessages(shared.messages); }
  async function send(e: FormEvent) {
    e.preventDefault(); const q = question.trim(); if (!q || busy) return;
    setQuestion(''); add({ q }); setBusy(true);
    try { const answer = await askCompanion(q, apiBase); add({ text: answer.text, label: answer.label }); }
    catch { add({ text: t.failed, label: '' }); }
    finally { setBusy(false); }
  }
  const dockBox = () => boxOf(dockRef.current), shown = tip && tips[tip.screen];
  const tipStyle = () => {
    if (tip?.auto || !floating) { const d = dockBox(); return { arrow: 'upr', left: Math.max(8, d.x + d.s / 2 + 28 - 300), top: d.y + d.s + 12 }; }
    return floating.x - 320 >= 8 ? { arrow: 'right', left: floating.x - 320, top: floating.y + 30 } : { arrow: 'upr', left: Math.max(8, floating.x + floating.s - 300), top: floating.y + floating.s + 12 };
  };
  const placed = shown ? tipStyle() : null, panelTop = chat ? dockBox().y + dockBox().s + 13 : 0, panelRight = chat ? Math.max(12, innerWidth - (dockBox().x + dockBox().s) - 40) : 0;
  return <span className={`${css.slot}${signedIn ? '' : ` ${css.corner}`}`}>
    <button ref={dockRef} type="button" className={`${css.dock}${hello && !floating ? ` ${css.hello}` : ''}`} aria-label={t.dock} data-phase={phase}
      style={floating ? { visibility: 'hidden' } : undefined} onClick={e => invoke(e.detail === 0)}><Art/></button>
    {mounted && createPortal(<>
      <span ref={ring} className={css.ring} aria-hidden="true"/>
      {floating && <button ref={flyRef} type="button" className={`${css.fly}${hello ? ` ${css.hello}` : ''}`} data-phase={phase} tabIndex={-1} aria-hidden="true"
        style={{ left: floating.x, top: floating.y, width: floating.s, height: floating.s }} onClick={() => phase === 'out' && back('dismiss')}><Art/></button>}
      {bubble && floating && <div className={`${css.pop} ${css.bubble}`} role="status" style={floating.x - 280 >= 8 ? { left: floating.x - 280, top: floating.y + 20 } : { left: 8, top: floating.y + floating.s + 12 }}>
        <b>{welcome.title}</b>{welcome.text}</div>}
      {shown && placed && <div ref={tipRef} className={`${css.pop} ${css.tip}`} data-arrow={placed.arrow} data-auto={tip.auto || undefined} role={tip.auto ? 'status' : 'dialog'} aria-label={shown.title} tabIndex={-1}
        style={{ left: placed.left, top: placed.top }} onPointerEnter={() => !tip.auto && clear()} onFocus={() => !tip.auto && clear()}>
        <b>{shown.title}</b>{shown.text}
        {!tip.auto && <div className={css.tipActions}><label><input type="checkbox" checked={flags.fewer} onChange={e => toggleFewer(e.currentTarget.checked)}/> {t.fewer}</label>
          {signedIn && <button type="button" aria-label={t.chatLabel} onClick={openChat}>{t.chat}</button>}</div>}
      </div>}
      {chat && signedIn && <section className={`${css.pop} ${css.panel}`} aria-label={t.chatLabel} style={{ top: panelTop, right: panelRight }} onKeyDown={e => { if (e.key === 'Escape') { setChat(false); dockRef.current?.focus(); } }}>
        <header className={css.head}><span className={css.mini}><Art/></span><div><div className={css.kicker}>{t.kicker}</div><h2>{t.heading}</h2></div>
          <button type="button" className={css.close} aria-label={t.close} onClick={() => { setChat(false); dockRef.current?.focus(); }}>×</button></header>
        <div className={css.body} aria-live="polite">{messages.map((m, i) => m.q !== undefined ? <p key={i} className={css.q}>{m.q}</p>
          : <div key={i} className={css.a}><div className={css.text} dangerouslySetInnerHTML={{ __html: formatAnswer(m.text ?? '') }}/>{m.label && <p className={css.label}>{m.label}</p>}</div>)}
          {busy && <p className={css.label}>{t.thinking}</p>}</div>
        <form className={css.foot} onSubmit={e => void send(e)}><input autoFocus value={question} maxLength={MAX_QUESTION} placeholder={t.ask} aria-label={t.askLabel} onChange={e => setQuestion(e.currentTarget.value)}/>
          <button type="submit" disabled={busy || !question.trim()}>{t.send}</button></form>
      </section>}
    </>, document.body)}
  </span>;
}
