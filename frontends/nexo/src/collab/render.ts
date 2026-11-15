import type * as Y from 'yjs';
import { getProvider } from './provider';

// Phase 3 as cut, renders by revision: R answers every render with X-Nexo-Engine-Revision (api.ts: engineRevision) and
// the sidecar writes meta.engineRevision and meta.lastChange {nodeId, actor, displayName, kind, revision} after each intent.
const engineRevision = () => getProvider()?.document.getMap('meta').get('engineRevision') as number | undefined;

/** Recheck every response against the document, with at most three requests. */
export async function currentRender<T extends { engineRevision?: number }>(ask: () => Promise<T>, revision = engineRevision): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await ask(), now = revision();
    if (answer.engineRevision === undefined || now === undefined || answer.engineRevision >= now) return answer;
  }
  throw new Error('The plot is still behind the shared board. Please retry.');
}

type LastChange = { nodeId?: string | null; actor?: string; kind?: string; displayName?: string; revision?: number };
/** Calls `changed(nodeId, 'Updated by <displayName>')` for each new meta.lastChange made by someone other than `me`;
 *  a card someone else added goes to `added(nodeId, '<displayName> added <title>')` instead (it may be off screen here). */
export function followChanges(meta: Y.Map<unknown>, me: () => string | undefined, changed: (nodeId: string, text: string) => void,
  added: (nodeId: string, text: string) => void = () => {}) {
  let seen = JSON.stringify(meta.get('lastChange') ?? null);
  const check = () => {
    const change = meta.get('lastChange') as LastChange | undefined, key = JSON.stringify(change ?? null);
    if (key === seen) return;
    seen = key;
    if (change && change.actor !== me() && change.kind === 'createCard' && change.nodeId) {
      const label = (meta.doc!.getMap<Y.Map<unknown>>('nodes').get(change.nodeId)?.get('label') as Y.Text | undefined)?.toString();
      added(change.nodeId, `${change.displayName ?? 'Someone'} added ${label || 'a card'}`);
    } else if (change && change.actor !== me() && change.kind !== 'save') { // a save writes no science
      const ids = change.nodeId ? [change.nodeId] : [...meta.doc!.getMap('nodes').keys()];
      for (const id of ids) changed(id, `Updated by ${change.displayName ?? 'someone else'}`);
    }
  };
  meta.observe(check);
  return () => meta.unobserve(check);
}
