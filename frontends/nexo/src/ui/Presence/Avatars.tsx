import { useEffect, useState, useSyncExternalStore } from 'react';
import { boardReadOnly, getAwareness, summon } from '../../collab/provider';
import { inkOn, org, type Person } from '../../collab/awareness';
import { currentRole, subscribeRole } from '../../collab/roles';
import { adminToken, adminUserId, knownAdminView } from '../../api/adminToken';
import { isReadOnly } from '../../state/readonly';
import './avatars.css';

type Entry = { id: number; ids?: number[]; person: Person; me?: boolean };
const roles: Record<string, string> = { owner: 'Owner', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer' };
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const follow = (id: number) => dispatchEvent(new CustomEvent('nexo-follow', { detail: id }));
/** One entry per person: me first (with my other tabs, by my Admin userId), then everyone else grouped by userId. */
export function byPerson(states: [number, Person][], mine: number | undefined, myUserId: string | null): Entry[] {
  const local = states.find(([id]) => id === mine), people = new Map<string, Entry>();
  for (const [id, person] of states) {
    if (id === mine || (myUserId && person.userId === myUserId)) continue;
    const key = person.userId ?? `#${id}`, known = people.get(key);
    if (known) known.ids!.push(id); else people.set(key, { id, ids: [id], person });
  }
  return [...(local ? [{ id: local[0], person: local[1], me: true }] : []), ...people.values()];
}

/** Me as the others see me. The sidecar stamps identity on what it relays but never sends my own state back, so the
 *  name is my Admin token's displayName claim (the one it stamps, same fallback), kind Admin's view, role its push. */
export function me(local: Person, token: string | null, view: string | null, role: string | null): Person {
  let name: unknown = '';
  try { name = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))).displayName; } catch { /* not a JWT */ }
  return { ...local, displayName: typeof name === 'string' && name.trim() ? name : view === 'staff' ? 'Lab staff' : 'Member', kind: view ?? undefined, role: role ?? undefined };
}

/** Prototype scene 1: everyone on the board, me first; initials in their colour, Lab/Client and phone marks, a card. */
export function Stack({ people, following, max = 4 }: { people: Entry[]; following?: number | null; max?: number }) {
  const more = people.slice(max);
  return <div className="presence-stack" aria-label="People on this board">
    {people.slice(0, max).map(({ id, ids, person, me: mine }) => {
      const name = person.displayName || 'Collaborator', kind = org(person), role = roles[person.role ?? ''] ?? '', phone = person.device === 'phone';
      const facts = [name, kind, role].filter(Boolean).join(', ') + (phone ? ', on a phone' : '');
      return <span className="presence-person" key={id}>
        <button type="button" className={mine ? 'presence-avatar me' : 'presence-avatar'} style={person.colour ? { backgroundColor: person.colour, color: inkOn(person.colour) } : undefined} aria-pressed={mine ? undefined : (ids ?? [id]).includes(following ?? NaN)} aria-label={mine ? `You, ${facts}` : `Follow ${facts}`} aria-describedby={`presence-card-${id}`} onClick={mine ? undefined : () => follow(id)}>
          {initials(name)}
          {kind && <span className="presence-org" aria-hidden="true">{kind === 'Lab' ? 'L' : 'C'}</span>}
          {phone && <span className="presence-device" aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="6" y="2" width="8" height="16" rx="2"/></svg></span>}
        </button>
        <span className="presence-card" role="tooltip" id={`presence-card-${id}`}>
          <b>{name}{mine && ' · You'}</b><span>{[kind, role].filter(Boolean).join(' · ')}</span><span>{phone ? 'On a phone' : 'On a computer'}</span>
          {!mine && <button type="button" onClick={() => follow(id)}>Follow</button>}
        </span>
      </span>;
    })}
    {more.length > 0 && <span className="presence-more" tabIndex={0} aria-label={`${more.length} more: ${more.map(e => e.person.displayName || 'Collaborator').join(', ')}`}>+{more.length}</span>}
  </div>;
}

// A phone's top bar (390 px) has room for two avatars: there the others come first (one to follow, then +N), not me.
const narrowQuery = () => matchMedia('(max-width: 600px)');
const isNarrow = () => narrowQuery().matches;
const onNarrow = (change: () => void) => { const query = narrowQuery(); query.addEventListener('change', change); return () => query.removeEventListener('change', change); };
// Phase 6: clicking a person follows them (canvas/following.ts); an Editor brings everyone to their own view.
export function Avatars() {
  const [states, setStates] = useState<[number, Person][]>([]), [token, setToken] = useState<string | null>(null);
  const role = useSyncExternalStore(subscribeRole, currentRole, currentRole)?.role ?? null;
  useEffect(() => { adminToken().then(setToken, () => {}); }, []);
  useEffect(() => {
    let cleanup = () => {};
    const connect = () => { cleanup(); const awareness = getAwareness(); if (!awareness) return; const update = () => setStates([...awareness.getStates()] as [number, Person][]); awareness.on('change', update); update(); cleanup = () => awareness.off('change', update); };
    window.addEventListener('nexo-awareness', connect); connect();
    return () => { window.removeEventListener('nexo-awareness', connect); cleanup(); };
  }, []);
  const narrow = useSyncExternalStore(onNarrow, isNarrow, isNarrow);
  const mine = getAwareness()?.clientID, local = states.find(([id]) => id === mine)?.[1];
  const people = byPerson(states, mine, adminUserId()).map(entry => entry.me ? { ...entry, person: me(entry.person, token, knownAdminView(), role) } : entry);
  return <><Stack people={narrow ? people.filter(entry => !entry.me) : people} following={local?.following} max={narrow ? 1 : 4}/>
    {people.some(entry => !entry.me) && !isReadOnly() && !boardReadOnly() && <button type="button" className="summon" onClick={() => summon()}>Bring everyone here</button>}</>;
}
