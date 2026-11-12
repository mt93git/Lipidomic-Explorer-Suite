// Phase 2 (W2): the sidecar refuses a whole update with a stateless {type: 'refused', reason, paths} and applies nothing
// (frontends/nexo-collab/src/admission.mjs). The refused change is already in this page's Y.Doc and cannot be taken out
// of it, so the page resyncs once: a reload drops the local document and rejoins the server's. The toast is kept in
// sessionStorage and shown after the reload (App.tsx).
const key = 'nexo-collab-refused';

// UX review 2, group 5: what a person reads for each refusal reason they can meet (sidecar admission.mjs and commits.mjs);
// any other reason gets the general sentence, never the code.
const sentences: Record<string, string> = {
  viewer: 'You can only view this board.',
  commenter: 'You can only comment on this board.',
  lab_only: 'Only lab staff can finish a plot, edit a figure or confirm a baseline.',
  owner_only: 'Only the project owner can restore a version.',
  stale: 'The board changed before your change arrived. Check the values and try again.',
  requires_confirmation: 'Confirm the reference group, then try again.',
  token_expired: 'Your Admin sign-in expired. Reload the page to sign in again.',
  engine_unavailable: 'The analysis engine is not available. Try again in a moment.',
};
export const refusalText = (reason: string | undefined) =>
  reason && Object.hasOwn(sentences, reason) ? sentences[reason] : 'This change was not applied. Try again.';

export function refusedHandler({ toast, resync }: { toast(text: string): void; resync(): void }) {
  let done = false;
  return (payload: string) => {
    let message: { type?: string; reason?: string; intentId?: string } | null;
    try { message = JSON.parse(payload); } catch { return; }
    // A refused intent (Phase 3) changed nothing here: intents.ts answers it.
    if (message?.type !== 'refused' || message.intentId || done) return;
    done = true; toast(refusalText(message.reason)); resync();
  };
}

let reloading = false;
/** provider.ts hook (onStateless). */
export const onRefused = refusedHandler({
  toast: text => { try { sessionStorage.setItem(key, text); } catch { /* private mode: no toast after the reload */ } },
  resync: () => { reloading = true; location.reload(); },
});
/** The leave guard (App.tsx) stays quiet for the resync reload: the unsent update is the refused one. */
export const resyncing = () => reloading;

/** The refusal toast from before the resync reload, once. */
export function takeRefusal(): string | null {
  try { const text = sessionStorage.getItem(key); sessionStorage.removeItem(key); return text; } catch { return null; }
}
