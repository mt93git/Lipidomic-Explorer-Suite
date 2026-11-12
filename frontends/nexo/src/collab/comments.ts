import * as Y from 'yjs';
import { adminHeaders } from '../api/adminToken';
import type { Collab } from './mode';

// Phase 6 as cut (docs/integration/nexo-collab-plan.md): comments live in the shared document's 'comments' map, one
// Y.Map per thread with its replies in a Y.Array, and never in the Team or Nexo export. The sidecar stamps author and
// displayName and kind from the connection (frontends/nexo-collab/src/admission.mjs); until then they are empty here.
export type Kind = 'staff' | 'client';
// UX-A4: a comment or reply keeps the userIds it @mentions; a thread's votes (👍) are a Y.Map userId → true, each person
// setting or deleting only their own key (the sidecar refuses anything else).
export type Reply = { author: string; displayName: string; kind?: Kind; text: string; createdAt: string; mentions?: string[] };
export type Comment = { id: string; nodeId?: string; x: number; y: number; author: string; displayName: string; kind?: Kind; text: string;
  createdAt: string; resolved: boolean; replies: Reply[]; mentions?: string[]; votes?: Record<string, true> };
export type Person = { userId: string; displayName: string; kind: string };
/** Lab staff say Lab, client members Client (nothing before the sidecar's stamp). */
export const org = (kind?: string) => (kind === 'staff' ? 'Lab' : kind === 'client' ? 'Client' : '');
/** Open threads, then resolved ones; each keeps the list's order. */
export const byState = (list: Comment[]) => ({ open: list.filter(c => !c.resolved), resolved: list.filter(c => c.resolved) });
const origin = { kind: 'comment' };

export function comments(doc: Y.Doc, { readOnly }: { readOnly: boolean }) {
  const map = doc.getMap<Y.Map<unknown>>('comments'), now = () => new Date().toISOString();
  const thread = (id: string) => (readOnly ? undefined : map.get(id));
  return {
    /** A pin at canvas point (x, y), on a card when nodeId is given. Returns its id, null for a Viewer. */
    add({ nodeId, x, y, text, mentions = [] }: { nodeId?: string; x: number; y: number; text: string; mentions?: string[] }): string | null {
      if (readOnly) return null;
      const id = crypto.randomUUID(), entry = new Y.Map<unknown>();
      doc.transact(() => {
        map.set(id, entry);
        for (const [key, value] of Object.entries({ ...(nodeId ? { nodeId } : {}), x, y, author: '', displayName: '', text, ...(mentions.length ? { mentions } : {}), createdAt: now(), resolved: false })) entry.set(key, value);
        entry.set('replies', new Y.Array<Reply>()); entry.set('votes', new Y.Map<true>());
      }, origin);
      return id;
    },
    reply(id: string, text: string, mentions: string[] = []): boolean {
      const entry = thread(id); if (!entry) return false;
      doc.transact(() => (entry.get('replies') as Y.Array<Reply>).push([{ author: '', displayName: '', text, ...(mentions.length ? { mentions } : {}), createdAt: now() }]), origin);
      return true;
    },
    /** Toggles `me`'s 👍 on the thread (a thread from before votes gets its map here). */
    vote(id: string, me: string): boolean {
      const entry = thread(id); if (!entry) return false;
      doc.transact(() => {
        let votes = entry.get('votes'); if (!(votes instanceof Y.Map)) entry.set('votes', votes = new Y.Map<true>());
        const mine = votes as Y.Map<true>; if (mine.get(me)) mine.delete(me); else mine.set(me, true);
      }, origin);
      return true;
    },
    resolve(id: string): boolean {
      const entry = thread(id); if (!entry) return false;
      doc.transact(() => entry.set('resolved', true), origin);
      return true;
    },
    reopen(id: string): boolean {
      const entry = thread(id); if (!entry) return false;
      doc.transact(() => entry.set('resolved', false), origin);
      return true;
    },
    /** Every well-formed thread, oldest first. */
    list(): Comment[] {
      return [...map.entries()].filter(([, entry]) => entry instanceof Y.Map && typeof entry.get('text') === 'string')
        .map(([id, entry]) => ({ id, ...entry.toJSON() }) as Comment).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}

export const voteCount = (c: Comment) => Object.keys(c.votes ?? {}).length;
/** Whether the thread or one of its replies mentions `me`. */
export const mentionsMe = (c: Comment, me: string | undefined) => !!me && [c, ...c.replies].some(m => m.mentions?.includes(me));

// The mention picker of the Composer (ui/Comments/Composer.tsx): the "@word" typed before the caret, the people it
// matches, the text with "@Name " in its place, and on send the picked people still named in the text.
/** The "@" (at the start or after a space) the caret is in, and what follows it; null outside one. */
export function findMention(text: string, caret: number): { start: number; query: string } | null {
  const m = /(?:^|\s)@([^@\n]{0,40})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[1].length - 1, query: m[1] } : null;
}
export const matching = (people: Person[], query: string) => people.filter(p => p.displayName.toLowerCase().includes(query.toLowerCase()));
export function insertMention(text: string, at: { start: number; query: string }, person: Person) {
  const name = `@${person.displayName} `;
  return { text: text.slice(0, at.start) + name + text.slice(at.start + 1 + at.query.length), caret: at.start + name.length };
}
export const mentioned = (text: string, picked: Person[]) =>
  [...new Set(picked.filter(p => text.includes(`@${p.displayName}`)).map(p => p.userId))];
/** The text cut into plain runs and "@Name" runs, one for each of `names`. */
export function segments(text: string, names: string[]) {
  const escaped = names.filter(Boolean).map(n => `@${n}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return [{ text, mention: false }];
  return text.split(new RegExp(`(${escaped.join('|')})`)).filter(Boolean).map(part => ({ text: part, mention: escaped.some(e => new RegExp(`^${e}$`).test(part)) }));
}

/** Who can see the project, for the picker: the members route the Share dialog reads (members and people, merged once
 *  each, named ones only); [] when it cannot be loaded (e.g. Admin 0012 missing on the host). */
export async function loadPeople(board: Collab, fetcher: typeof fetch = fetch): Promise<Person[]> {
  const endpoint = new URL(board.url, globalThis.location?.href);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : endpoint.protocol === 'ws:' ? 'http:' : endpoint.protocol;
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/projects/${encodeURIComponent(board.project)}/members`;
  try {
    const response = await fetcher(endpoint.href, { headers: await adminHeaders() });
    if (!response.ok) return [];
    const { members = [], people = [] } = await response.json() as { members?: Person[]; people?: Person[] };
    const all = new Map<string, Person>();
    for (const { userId, displayName, kind } of [...members, ...people]) if (displayName && !all.has(userId)) all.set(userId, { userId, displayName, kind });
    return [...all.values()];
  } catch { return []; }
}
