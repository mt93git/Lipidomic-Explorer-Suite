import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import { boardReadOnly, getAwareness } from '../../collab/provider';
import { byState, comments, loadPeople, mentionsMe, org, segments, voteCount, type Comment, type Person, type Reply } from '../../collab/comments';
import { collab } from '../../collab/mode';
import { adminUserId } from '../../api/adminToken';
import { canComment } from '../../state/readonly';
import { CanvasHandleContext, tabsBridges } from '../../canvas/handle';
import { showCard, showPin } from '../../canvas/pins';
import { Composer } from './Composer';
import './comments.css';
// Phase 6 as cut, scene 3 of the prototype: the rail's Comments button (with the count of open threads) opens this panel.
// It lists every thread, open first and resolved below (collapsed); choosing one selects its pin, pans to it and shows
// the thread with Reply and Resolve for anyone who may comment. A pin click (event 'nexo-comment-open') opens its
// thread; a pin just dropped in comment mode (event 'nexo-comment-draft') asks for the text. UX-A4: the list's
// "Mentions (N)" shows the threads that @mention me; a thread's 👍 toggles my vote, its count on the row and the pin.
// UX review 2, scene 3: Mentions (N) counts open threads; a thread on a card says "Pinned to <card>" with Jump to card;
// a resolved thread has Reopen; opening a thread puts focus in it, Esc or × closes and focus goes back to its pin.
type Draft = { x: number; y: number; nodeId?: string };
type View = { list: true; mentions?: boolean } | { id: string } | { draft: Draft };
let view: View | null = null;
const listeners = new Set<() => void>();
export function showComments(next: View | null) { view = next; listeners.forEach(l => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, shown = () => view;
// The shared document once joined, drawn again whenever a comment changes.
function useComments() {
  const [doc, setDoc] = useState<Y.Doc | undefined>(() => getAwareness()?.doc), [, refresh] = useState(0);
  useEffect(() => { const connect = () => setDoc(getAwareness()?.doc); addEventListener('nexo-awareness', connect); connect(); return () => removeEventListener('nexo-awareness', connect); }, []);
  useEffect(() => { if (!doc) return; const map = doc.getMap('comments'), changed = () => refresh(n => n + 1); map.observeDeep(changed); return () => map.unobserveDeep(changed); }, [doc]);
  return doc;
}
export function CommentsButton() {
  const doc = useComments(), open = useSyncExternalStore(subscribe, shown, shown);
  const n = doc ? byState(comments(doc, { readOnly: true }).list()).open.length : 0;
  return <button type="button" data-tip="Comments" aria-label={`Comments (${n} open)`} aria-pressed={!!open} style={{ position: 'relative' }} onClick={() => showComments(open ? null : { list: true })}>
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 3h14v9H7l-4 3v-3H2z"/></svg>
    {n > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 1, right: 1, minWidth: 15, height: 15, borderRadius: 8, background: '#7256b5', color: '#fff', font: '600 10px/15px system-ui' }}>{n}</span>}
  </button>;
}
const when = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function Byline({ c }: { c: Comment | Reply }) {
  return <span><strong>{c.displayName || 'You'}</strong>{org(c.kind) && <> <small>{org(c.kind)}</small></>} <small>{when(c.createdAt)}</small></span>;
}
const muted = { color: 'var(--muted)' };
const mark = { color: 'var(--accent)', fontWeight: 600, background: 'var(--tint)', padding: '0 4px', borderRadius: 4 };
/** A comment's text with each "@Name" it mentions highlighted (names from the people list; plain text without it). */
function Text({ m, people }: { m: Comment | Reply; people: Person[] }) {
  const names = people.filter(p => m.mentions?.includes(p.userId)).map(p => p.displayName);
  return <p style={{ margin: '4px 0 0' }}>{segments(m.text, names).map((part, i) => part.mention ? <span key={i} className="mention" style={mark}>{part.text}</span> : part.text)}</p>;
}
export function CommentsPanel() {
  const doc = useComments(), at = useSyncExternalStore(subscribe, shown, shown), handle = useContext(CanvasHandleContext);
  const [people, setPeople] = useState<Person[]>([]), me = adminUserId() ?? undefined, showing = !!at;
  useEffect(() => { const board = collab(); if (showing && board) void loadPeople(board).then(setPeople); }, [showing]);
  useEffect(() => {
    const draft = (e: Event) => showComments({ draft: (e as CustomEvent<Draft>).detail });
    const thread = (e: Event) => showComments({ id: (e as CustomEvent<string>).detail });
    addEventListener('nexo-comment-draft', draft); addEventListener('nexo-comment-open', thread);
    return () => { removeEventListener('nexo-comment-draft', draft); removeEventListener('nexo-comment-open', thread); };
  }, []);
  const thread = useRef<HTMLElement>(null), threadId = at && 'id' in at ? at.id : undefined;
  useEffect(() => { thread.current?.focus(); }, [at]); // every opening, the same thread's pin again too
  if (!doc || !at) return null;
  const close = () => { showComments(null); (threadId ? document.querySelector<HTMLElement>(`.comment-pin[data-comment="${CSS.escape(threadId)}"]`) : document.querySelector<HTMLElement>('[aria-label^="Comments ("]'))?.focus(); };
  const readOnly = !canComment() || boardReadOnly(), board = comments(doc, { readOnly }), list = board.list(), { open, resolved } = byState(list);
  const c = 'id' in at ? list.find(t => t.id === at.id) : undefined, mine = list.filter(t => mentionsMe(t, me) && !t.resolved);
  const onlyMine = 'list' in at && !!at.mentions, listed = byState(onlyMine ? mine : list);
  const others = people.filter(p => p.userId !== me), votes = (t: Comment) => voteCount(t) ? ` · 👍 ${voteCount(t)}` : '';
  const row = (t: Comment) => <button key={t.id} type="button" style={{ display: 'grid', gap: 2, width: '100%', textAlign: 'left', padding: 8, border: 0, borderBottom: '1px solid var(--line)', background: 'none', color: 'inherit', height: 'auto' }}
    onClick={() => showPin(handle ? tabsBridges.get(handle) : undefined, t)}>
    <Byline c={t}/><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</span>
    <small style={muted}>{`${t.replies.length} ${t.replies.length === 1 ? 'reply' : 'replies'}${votes(t)}`}</small>
  </button>;
  const card = c?.nodeId ? (doc.getMap<Y.Map<unknown>>('nodes').get(c.nodeId)?.get('label') as Y.Text | undefined)?.toString() : undefined;
  return <aside aria-label="Comments" className="comments-panel" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }} style={{ position: 'fixed', top: 'calc(var(--bar-top) + var(--bar-tabs))', right: 0, bottom: 0, width: 'min(320px, 100vw)', zIndex: 30, overflow: 'auto', padding: 12, background: 'var(--paper)', color: 'var(--ink)', borderLeft: '1px solid var(--line)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h2 style={{ margin: 0, fontSize: 15 }}>Comments</h2>
      <small style={{ ...muted, marginLeft: 'auto' }}>{`${open.length} open · ${resolved.length} resolved`}</small>
      <button type="button" aria-label="Close comments" onClick={close}>×</button></header>
    {'draft' in at ? !readOnly && <Composer label="New comment" action="Post" autoFocus people={others} onSend={(text, mentions) => {
      const id = board.add({ ...at.draft, text, mentions }); if (id) dispatchEvent(new CustomEvent('nexo-comment-open', { detail: id })); }}/>
    : c ? <>
      <div><button type="button" onClick={() => showComments({ list: true })}>← All comments</button></div>
      <article ref={thread} tabIndex={-1} aria-label={`Comment by ${c.displayName || 'you'}`}><Byline c={c}/>{c.resolved && <small style={muted}> · Resolved</small>}<Text m={c} people={people}/>
        {card && <small style={{ ...muted, display: 'block', marginTop: 4 }}>{`Pinned to ${card}`}</small>}</article>
      {c.replies.map((r, i) => <article key={i} style={{ paddingLeft: 12, borderLeft: '2px solid var(--line)' }}><Byline c={r}/><Text m={r} people={people}/></article>)}
      {!readOnly && <Composer key={c.id} label="Reply" action="Reply" people={others} onSend={(text, mentions) => board.reply(c.id, text, mentions)}/>}
      <div className="actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {!readOnly && me ? <button type="button" title="Vote" aria-pressed={!!c.votes?.[me]} onClick={() => board.vote(c.id, me)}>{`👍 ${voteCount(c)}`}</button>
          : voteCount(c) > 0 && <small style={muted}>{`👍 ${voteCount(c)}`}</small>}
        {!readOnly && (c.resolved ? <button type="button" onClick={() => board.reopen(c.id)}>Reopen</button> : <button type="button" onClick={() => board.resolve(c.id)}>Resolve</button>)}
        {card && <button type="button" onClick={() => showCard(handle ? tabsBridges.get(handle) : undefined, c.nodeId!)}>Jump to card</button>}</div>
    </> : <>
      <div role="group" aria-label="Show" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <button type="button" aria-pressed={!onlyMine} onClick={() => showComments({ list: true })}>This board</button>
        <button type="button" aria-pressed={onlyMine} onClick={() => showComments({ list: true, mentions: true })}>{`Mentions (${mine.length})`}</button></div>
      <details open><summary>{`Open (${listed.open.length})`}</summary>{listed.open.map(row)}</details>
      <details><summary>{`Resolved (${listed.resolved.length})`}</summary>{listed.resolved.map(row)}</details>
    </>}
  </aside>;
}
