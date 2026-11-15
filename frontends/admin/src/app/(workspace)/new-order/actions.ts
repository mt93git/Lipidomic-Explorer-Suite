"use server";

import { revalidatePath } from "next/cache";
import { redirectAfterAction } from "@/lib/action-redirect";
import { discardOrderDraft, placeOrder, saveOrderDraft } from "@/lib/data/order-drafts";
import { isWizardStep, normalizeWizard, stepErrors, type WizardErrors } from "@/lib/order-wizard";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

// New order wizard: Save draft (save_order_draft), Place order (place_order_draft, or create_order without a draft)
// and Discard on the drafts list. Each re-checks the session; the database checks the lab writer again.
async function staffOnly() {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
}
const draftId = (value: unknown) => typeof value === "string" && value ? value : null;

export type SaveDraftResult = { ok: true; id: string; savedAt: string } | { ok: false; error: string };
// A draft may be half filled: nothing is checked but the step and the size the database keeps.
export async function saveDraftAction(input: { id: string | null; step: number; data: unknown }): Promise<SaveDraftResult> {
  await staffOnly();
  if (!isWizardStep(input.step)) return { ok: false, error: "That step does not exist." };
  try {
    // No revalidatePath: the page is dynamic, and a refresh here would remount the wizard under ?draft= and drop the
    // confirmation. The drafts list is read fresh on the next visit.
    const id = await saveOrderDraft({ id: draftId(input.id), step: input.step, data: normalizeWizard(input.data) });
    return { ok: true, id, savedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof DataError) return { ok: false, error: error.message };
    throw error;
  }
}

export type PlaceOrderResult = { error?: string; errors?: WizardErrors; draftId?: string };
// Every step is checked again; the order is placed, then the page shows its code with the next steps. A pasted sample
// list has no column on the order: it is kept on the draft the order is placed from (a draft is saved first when there
// is none), so the order and its list stay linked. A refusal after that save returns the draft, to place it again.
export async function placeOrderAction(input: { draftId: string | null; data: unknown }): Promise<PlaceOrderResult> {
  await staffOnly();
  const data = normalizeWizard(input.data);
  const errors = stepErrors(data, 4);
  if (Object.keys(errors).length) return { errors };
  let code: string;
  let id = draftId(input.draftId);
  try {
    if (!id && data.sampleList.trim()) id = await saveOrderDraft({ id: null, step: 4, data });
    code = await placeOrder({ draftId: id, data });
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, ...(id ? { draftId: id } : {}) };
    throw error;
  }
  revalidatePath("/pipeline");
  return redirectAfterAction(`/new-order?created=${encodeURIComponent(code)}`);
}

export type DiscardState = { error?: string };
export async function discardDraftAction(_previous: DiscardState, form: FormData): Promise<DiscardState> {
  await staffOnly();
  try {
    await discardOrderDraft(String(form.get("id") ?? ""));
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  revalidatePath("/new-order");
  return redirectAfterAction("/new-order?discarded=1");
}
