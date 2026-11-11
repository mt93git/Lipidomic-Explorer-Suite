"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { answerOrderRequest } from "@/lib/data/order-requests";
import { retireDeliverable, setDeliverableVisibility } from "@/lib/data/deliverables";
import { parseDeclineReason } from "@/lib/order-request";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

export type AnswerState = { error?: string; reason?: string };
const CODE = /^ORD\d{3,}$/;

// The lab's answer to a client request: accept (admin.accept_order, with the panel as agreed) or decline with the
// reason the client reads (admin.decline_order). The database checks the role again (any lab writer).
async function answer(form: FormData, decide: (code: string) => Promise<string>, values: AnswerState = {}): Promise<AnswerState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const code = String(form.get("code") ?? "");
  if (!CODE.test(code)) return { error: "That order code is not valid.", ...values };
  let next: string;
  try {
    next = await decide(code);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, ...values };
    throw error;
  }
  return redirectAfterAction(next);
}

export async function acceptRequestAction(_previous: AnswerState, form: FormData): Promise<AnswerState> {
  return answer(form, async code => {
    await answerOrderRequest(code, { accept: true, panelId: String(form.get("panelId") ?? "") || null });
    return `/orders/${code}?answered=accepted`;
  });
}

export async function declineRequestAction(_previous: AnswerState, form: FormData): Promise<AnswerState> {
  const parsed = parseDeclineReason(form);
  if (!parsed.ok) return { error: parsed.error, reason: String(form.get("reason") ?? "") };
  return answer(form, async code => {
    await answerOrderRequest(code, { accept: false, reason: parsed.reason });
    // Declined is archived: it leaves the pipeline, so the answer is confirmed there.
    return `/pipeline?declined=${code}`;
  }, { reason: parsed.reason });
}

// ---------------------------------------------------------------- deliverables (F4)
// Show, hide or retire a file the lab added (admin.set_deliverable_visibility / retire_deliverable; lab writers).
// Uploads go through the route next to this page (orders/[code]/deliverables), which takes files over 6 MB.
const DELIVERABLE_ID = /^[A-Za-z0-9-]{1,64}$/;
async function changeDeliverable(form: FormData, change: (id: string) => Promise<void>, done: string): Promise<AnswerState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const code = String(form.get("code") ?? "");
  const id = String(form.get("deliverableId") ?? "");
  if (!CODE.test(code) || !DELIVERABLE_ID.test(id)) return { error: "That file is not valid." };
  try {
    await change(id);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction(`/orders/${code}?deliverable=${done}#deliverables`);
}

export async function setDeliverableVisibilityAction(_previous: AnswerState, form: FormData): Promise<AnswerState> {
  const visible = form.get("visible") === "true";
  return changeDeliverable(form, id => setDeliverableVisibility(id, visible), visible ? "shown" : "hidden");
}

export async function retireDeliverableAction(_previous: AnswerState, form: FormData): Promise<AnswerState> {
  return changeDeliverable(form, id => retireDeliverable(id, String(form.get("reason") ?? "")), "retired");
}
