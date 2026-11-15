"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { moveAliquot, placeAliquot, removeAliquot } from "@/lib/data/storage";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";
import { ALIQUOT_CODE, ALIQUOT_ID, parseReason, parseSlot } from "@/lib/storage";

// The typed values come back with a refusal, so the form keeps them (React resets a form after its action).
export type StorageActionState = { error?: string; box?: string; position?: string; reason?: string };

// Place, move or remove one aliquot (admin.place_aliquot / move_aliquot / remove_aliquot; lab writers, checked again by
// the database). Nothing from the browser is trusted: the ids are checked here and the slot is trimmed. On success the
// screen reopens on the box the aliquot is now in (or left) with a confirmation.
async function run(form: FormData, values: StorageActionState, work: (aliquotId: string) => Promise<{ done: string; box: string }>): Promise<StorageActionState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const aliquotId = String(form.get("aliquotId") ?? "");
  const code = String(form.get("code") ?? "");
  if (!ALIQUOT_ID.test(aliquotId) || !ALIQUOT_CODE.test(code)) return { error: "That aliquot is not valid. Reload the page.", ...values };
  let next: { done: string; box: string };
  try {
    next = await work(aliquotId);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, ...values };
    throw error;
  }
  const query = new URLSearchParams({ box: next.box, done: next.done, aliquot: code });
  return redirectAfterAction(`/storage?${query}`);
}

const typed = (form: FormData, ...names: ("box" | "position" | "reason")[]): StorageActionState =>
  Object.fromEntries(names.map(name => [name, String(form.get(name) ?? "").slice(0, 600)]));

export async function placeAliquotAction(_previous: StorageActionState, form: FormData): Promise<StorageActionState> {
  const slot = parseSlot(form);
  if (!slot.ok) return { error: slot.error, ...typed(form, "box", "position") };
  return run(form, typed(form, "box", "position"), async id => { await placeAliquot(id, slot.box, slot.position); return { done: "placed", box: slot.box }; });
}

export async function moveAliquotAction(_previous: StorageActionState, form: FormData): Promise<StorageActionState> {
  const slot = parseSlot(form);
  if (!slot.ok) return { error: slot.error, ...typed(form, "box", "position") };
  return run(form, typed(form, "box", "position"), async id => { await moveAliquot(id, slot.box, slot.position); return { done: "moved", box: slot.box }; });
}

export async function removeAliquotAction(_previous: StorageActionState, form: FormData): Promise<StorageActionState> {
  const reason = parseReason(form);
  if (!reason.ok) return { error: reason.error, ...typed(form, "reason") };
  const from = String(form.get("from") ?? "").trim();
  return run(form, typed(form, "reason"), async id => { await removeAliquot(id, reason.reason); return { done: "removed", box: from }; });
}
