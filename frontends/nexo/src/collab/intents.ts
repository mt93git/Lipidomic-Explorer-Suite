import type * as Y from 'yjs';
import { getProvider } from './provider';
import { cardInstanceId } from '../api/instance';
import { notify } from '../ui/model';
import { refusalText } from './refused';

// Phase 3 intent contract (docs/integration/nexo-collab-plan.md, "Phases 3–7 as cut"): a science change is a stateless
// {type: 'intent', intentId, kind, target: {nodeId?}, payload, baseRevision} to the sidecar, which answers this client
// {type: 'intent-result', intentId, revision} or {type: 'refused', intentId, reason}. The settled values reach the
// document from the sidecar (origin server), never from this page.
export type IntentKind = 'inputs' | 'action' | 'createCard' | 'parkCard' | 'design' | 'analysis' | 'cohort' | 'palette'
  | 'applyViolin' | 'confirmBaseline' | 'finish' | 'editFigure' | 'save' | 'restore';
export interface IntentResult { intentId: string; revision: number }
interface Channel {
  document: Y.Doc;
  sendStateless(payload: string): void;
  on(event: 'stateless', fn: (data: { payload: string }) => void): unknown;
}

type Inputs = Record<string, unknown>;
// A card's input as the board holds it: Team's in the node's instance, computed controls in Nexo's member (commits.mjs settle).
function boardValue(doc: Y.Doc, nodeId: string, field: string) {
  const team = ((doc.getMap('nodes').get(nodeId) as Y.Map<unknown> | undefined)?.get('instance') as Y.Map<unknown> | undefined)?.get('inputs') as Y.Map<unknown> | undefined;
  if (team?.has(field)) return team.get(field);
  return (((doc.getMap('nexo').get('nodes') as Y.Map<unknown> | undefined)?.get(nodeId) as Y.Map<unknown> | undefined)?.get('inputs') as Inputs | undefined)?.[field];
}
const values = (doc: Y.Doc, nodeId: string, fields: string[]) => Object.fromEntries(fields.map(field => [field, boardValue(doc, nodeId, field)]));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Sends intents on `provider` and settles each on the sidecar's answer that names it. `undo()` takes back this page's
 *  last settled inputs intent ("Undo mine", Gerardo 2026-11-10); `changed` is told whether there is one to take back. */
export function intentChannel(provider: Channel, toast: (text: string) => void, changed: (canUndo: boolean) => void = () => {}) {
  const pending = new Map<string, { resolve(result: IntentResult): void; reject(error: Error): void; form?: string }>();
  const doc = provider.document, meta = doc.getMap('meta');
  // My last settled inputs intent: the card, my fields before and after, and who changed one of them since.
  let mine: { nodeId: string; before: Inputs; after: Inputs; by: Record<string, string> } | null = null;
  const remember = (value: typeof mine) => { mine = value; changed(!!value); };
  meta.observe(event => {
    const change = meta.get('lastChange') as { nodeId?: string; displayName?: string } | undefined;
    if (!mine || !event.keysChanged.has('lastChange') || change?.nodeId !== mine.nodeId) return;
    for (const field of Object.keys(mine.after)) if (!same(boardValue(doc, mine.nodeId, field), mine.after[field])) mine.by[field] ??= change.displayName || 'Someone';
  });
  provider.on('stateless', ({ payload }) => {
    let message: { type?: string; intentId?: string; revision?: number; reason?: string } | null;
    try { message = JSON.parse(payload); } catch { return; }
    const waiting = message?.intentId ? pending.get(message.intentId) : undefined;
    if (!waiting) return;
    if (message!.type === 'intent-result') { pending.delete(message!.intentId!); waiting.resolve({ intentId: message!.intentId!, revision: message!.revision! }); }
    if (message!.type === 'refused') {
      pending.delete(message!.intentId!);
      const text = refusalText(message!.reason); toast(text); waiting.reject(new Error(text));
      // A form that showed the refused value (Data tab) reloads the board's values (ui/Inspector/DataTab.tsx).
      if (waiting.form) window.dispatchEvent(new CustomEvent('nexo-inputs-restored', { detail: waiting.form }));
    }
  });
  const post = (kind: IntentKind, target: { nodeId?: string }, payload: unknown) => new Promise<IntentResult>((resolve, reject) => {
    const intentId = crypto.randomUUID(), baseRevision = meta.get('engineRevision');
    pending.set(intentId, { resolve, reject, form: kind === 'inputs' || kind === 'action' ? target.nodeId : undefined });
    provider.sendStateless(JSON.stringify({ type: 'intent', intentId, kind, target, payload, baseRevision }));
  });
  const send = (kind: IntentKind, target: { nodeId?: string }, payload: unknown) => {
    const nodeId = target.nodeId, fields = Object.keys((payload as { inputs?: Inputs })?.inputs ?? {});
    if (kind !== 'inputs' || !nodeId || !fields.length) return post(kind, target, payload);
    const before = values(doc, nodeId, fields);
    return post(kind, target, payload).then(result => {
      void reached(result.revision).then(() => remember({ nodeId, before, after: values(doc, nodeId, fields), by: {} }));
      return result;
    });
  };
  // The settled values come in the sidecar's transaction, which can arrive after its intent-result.
  const reached = (revision: number) => new Promise<void>(resolve => {
    const check = () => { if (((meta.get('engineRevision') as number | undefined) ?? -Infinity) >= revision) { meta.unobserve(check); resolve(); } };
    meta.observe(check); check();
  });
  /** Sends my previous values back, unless someone changed one of those fields after me (then says who). No redo. */
  async function undo() {
    const last = mine;
    if (!last) return;
    remember(null);
    const field = Object.keys(last.after).find(f => !same(boardValue(doc, last.nodeId, f), last.after[f]));
    if (field) { toast(`${last.by[field] ?? 'Someone'} changed ${field.split('-').pop()!.replace(/_/g, ' ')} after you; nothing was undone.`); return; }
    await post('inputs', { nodeId: last.nodeId }, { inputs: last.before });
    // My own commit is not announced to me (collab/render.ts): my open Data form reloads here.
    window.dispatchEvent(new CustomEvent('nexo-inputs-restored', { detail: last.nodeId }));
  }
  return Object.assign(send, { undo });
}

let bound: Channel | undefined, send: ReturnType<typeof intentChannel> | undefined;
/** One intent on the page's board (provider.ts); a refusal is also an error toast. */
export function sendIntent(kind: IntentKind, target: { nodeId?: string }, payload: unknown): Promise<IntentResult> {
  const provider = getProvider();
  if (!provider) return Promise.reject(new Error('The shared board is not connected.'));
  if (bound !== provider) { bound = provider; send = intentChannel(provider, text => notify(text, true), canUndo => window.dispatchEvent(new CustomEvent('nexo-undo-mine', { detail: canUndo }))); }
  return send!(kind, target, payload);
}
/** Undo of my last settled science change on this board (toolbar Undo and Ctrl/Cmd+Z once the geometry stack is empty);
 *  a refusal is the intent's own toast. Whether there is one: the window event 'nexo-undo-mine' (detail: boolean). */
export const undoMine = () => send?.undo().catch(() => { /* refused: toasted */ });

/** The board's node for a server instance id (api/instance.ts cardInstanceId), when the document has it. */
export function nodeFor(instance: string): string | undefined {
  const nodes = getProvider()?.document.getMap<Y.Map<unknown>>('nodes');
  for (const [id, map] of nodes ?? []) {
    const own = (map.get('instance') as Y.Map<unknown> | null | undefined)?.get('id') as string | undefined;
    if (cardInstanceId({ id, instance: own ? { id: own, source: '' } : undefined }) === instance) return id;
  }
  return undefined;
}
