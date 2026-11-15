import { collab } from './mode';
import { setRoleComments, setRoleReadOnly } from '../state/readonly';
import { notify } from '../ui/model';
import { phrases } from '../ui/strings';
export type Role = 'owner' | 'editor' | 'commenter' | 'viewer';
let current: { role: Role; canShare: boolean } | null = null;
// A role change that switches editing reloads the page: its sentence is kept here and said on the first role after it.
const key = 'nexo-collab-role';
const store = { take() { try { const text = sessionStorage.getItem(key); sessionStorage.removeItem(key); return text; } catch { return null; } },
  keep(text: string) { try { sessionStorage.setItem(key, text); } catch { /* private mode: no sentence after the reload */ } } };
const listeners = new Set<() => void>();
export const currentRole = () => current;
export const subscribeRole = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function onRole(payload: string) {
  if (!collab()) return;
  let message;
  try { message = JSON.parse(payload); } catch { return; }
  if (message?.type !== 'role' || !['owner', 'editor', 'commenter', 'viewer'].includes(message.role) || typeof message.canShare !== 'boolean') return;
  const readOnly = (role: Role) => role === 'viewer' || role === 'commenter';
  const changed = current && readOnly(current.role) !== readOnly(message.role);
  const text = !current ? store.take() : current.role !== message.role ? phrases.roleNow(message.role[0].toUpperCase() + message.role.slice(1)) : null;
  current = { role: message.role, canShare: message.canShare };
  setRoleReadOnly(readOnly(current.role));
  setRoleComments(current.role !== 'viewer');
  listeners.forEach(listener => listener());
  if (changed && text) { store.keep(text); location.reload(); } else if (text) notify(text);
}
