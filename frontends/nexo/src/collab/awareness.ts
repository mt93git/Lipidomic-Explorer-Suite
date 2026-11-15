import type { Awareness } from 'y-protocols/awareness';
import { decideMode } from '../state/readonly';

export type Person = { userId?: string; displayName?: string; kind?: string; role?: string; colour?: string; cursor?: { x: number; y: number } | null; selection?: string[]; editing?: { nodeId: string; field: string } | null; activeTab?: string; camera?: unknown; device?: Device; following?: number | null };
export type Device = 'phone' | 'desktop';
/** The phone rule of state/readonly.ts (narrow and touch), whatever ?mode= says: a phone editing is still a phone. */
export const deviceOf = (width: number, coarse: boolean): Device => decideMode({ search: '', width, coarse }).reason === 'device' ? 'phone' : 'desktop';
/** Lab staff or a client member, from the `kind` the sidecar stamps. */
export const org = (person: Person) => person.kind === 'staff' ? 'Lab' : person.kind === 'client' ? 'Client' : '';
/** A cursor's tag: "Tomás · Lab". */
export const nameTag = (person: Person) => [person.displayName || 'Collaborator', org(person)].filter(Boolean).join(' · ');
/** Black or white, whichever reads better on `colour` (an hsl() or #rrggbb): at least 4.58:1 on any colour. */
export function inkOn(colour: string) {
  const hsl = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(colour), hex = /^#([\da-f]{6})$/i.exec(colour);
  let rgb = [0, 0, 0];
  if (hsl) { const [h, sat, l] = [+hsl[1], +hsl[2] / 100, +hsl[3] / 100], a = sat * Math.min(l, 1 - l); rgb = [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }); }
  else if (hex) rgb = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#000000' : '#ffffff';
}
/** The editing chip: "Tomás is editing · Lipid", the field named from its control id (after any module prefix). */
export function editingTag(person: Person) {
  const field = (person.editing?.field ?? '').split('-').pop()!.replace(/_/g, ' ');
  return `${person.displayName || 'Collaborator'} is editing${field ? ` · ${field[0].toUpperCase()}${field.slice(1)}` : ''}`;
}
export function others(awareness: Awareness): Person[] {
  return [...awareness.getStates()].filter(([id]) => id !== awareness.clientID).map(([, state]) => state as Person);
}
export function createPresence(awareness: Awareness, device?: Device) {
  if (device) awareness.setLocalStateField('device', device);
  let timer: ReturnType<typeof setTimeout> | undefined, pending: { x: number; y: number } | null | undefined;
  return {
    selection(ids: string[]) { if (JSON.stringify(awareness.getLocalState()?.selection) !== JSON.stringify(ids)) awareness.setLocalStateField('selection', ids); },
    editing(value: Person['editing']) { awareness.setLocalStateField('editing', value); },
    cursor(value: { x: number; y: number } | null) {
      if (timer) { pending = value; return; }
      awareness.setLocalStateField('cursor', value);
      timer = setTimeout(() => { timer = undefined; if (pending !== undefined) { awareness.setLocalStateField('cursor', pending); pending = undefined; } }, 50);
    },
    destroy() { clearTimeout(timer); },
  };
}
