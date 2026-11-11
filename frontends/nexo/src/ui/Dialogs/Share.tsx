import { useEffect, useId, useRef, useState } from 'react';
import { adminHeaders, adminUserId } from '../../api/adminToken';
import { notify } from '../model';
import type { Collab } from '../../collab/mode';
import type { Role } from '../../collab/roles';
import { phrases, strings as s } from '../strings';
type Person = { userId: string; displayName: string; kind: string | null };
type Members = { members: (Person & { role: Role })[]; people: Person[] };
const roles = ['editor', 'commenter', 'viewer'] as const;
const label = (role: string) => role[0].toUpperCase() + role.slice(1);
// No badge for a kind Admin did not give (never "Client" by default).
const badge = (kind: string | null) => kind === 'staff' ? <small>Lab</small> : kind === 'client' ? <small>Client</small> : null;
export function Share({ board, projectName, onClose }: { board: Collab; projectName: string; onClose(): void }) {
  const [data, setData] = useState<Members | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const endpoint = new URL(board.url, location.href);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : endpoint.protocol === 'ws:' ? 'http:' : endpoint.protocol;
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/projects/${encodeURIComponent(board.project)}/members`;
  async function request(method = 'GET', userId?: string, role?: string, signal?: AbortSignal) {
    const response = await fetch(endpoint.href + (userId ? `/${encodeURIComponent(userId)}` : ''), {
      method, signal, headers: { ...await adminHeaders(signal, true), ...(role && { 'Content-Type': 'application/json' }) },
      ...(role && { body: JSON.stringify({ role }) }),
    });
    if (!response.ok) throw new Error(`Could not ${method === 'GET' ? 'load' : 'update'} sharing (${response.status}).`);
    if (method === 'GET') setData(await response.json());
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement, controller = new AbortController();
    ref.current?.showModal();
    void request('GET', undefined, undefined, controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); ref.current?.close(); previous?.focus(); };
  }, [board.url, board.project]);
  async function change(method: 'PUT' | 'DELETE', userId: string, role?: string) {
    setBusy(true); setError('');
    try { await request(method, userId, role); await request(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const options = roles.map(role => <option key={role} value={role}>{label(role)}</option>), me = adminUserId();
  // Copy link comes first: the dialog opens with focus on it.
  const copy = () => navigator.clipboard.writeText(location.href).then(() => notify(s.linkCopied), () => notify(s.linkNotCopied, true));
  return <dialog ref={ref} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id={id}>{phrases.shareTitle(projectName)}</h2>
    <p>{s.shareWho}</p>
    <p><button onClick={copy}>{s.copyLink}</button></p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p>Loading people…</p>}
    {data && <><h3>Members</h3><ul>{data.members.map(person => <li key={person.userId}>
      <span>{person.displayName}{person.userId === me && ` ${s.shareYou}`}</span> {badge(person.kind)}{' '}
      {person.role === 'owner' || person.userId === me ? <span>{label(person.role)}</span> : <><select aria-label={`Role for ${person.displayName}`} value={person.role} disabled={busy} onChange={e => change('PUT', person.userId, e.target.value)}>{options}</select>
        <button disabled={busy} aria-label={`Remove ${person.displayName}`} onClick={() => change('DELETE', person.userId)}>Remove</button></>}
    </li>)}</ul><h3>People</h3><p>{s.shareNotListed}</p><ul>{data.people.filter(person => !data.members.some(member => member.userId === person.userId)).map(person => <li key={person.userId}>
      <span>{person.displayName}</span> {badge(person.kind)}{' '}
      <select aria-label={`Add ${person.displayName} as`} value="" disabled={busy} onChange={e => change('PUT', person.userId, e.target.value)}><option value="" disabled>Add as…</option>{options}</select>
    </li>)}</ul></>}
    <footer><button onClick={onClose}>{s.done}</button></footer>
  </dialog>;
}
