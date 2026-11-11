"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { DataError, addExclusion, markQcReviewed, withdrawExclusion } from "@/lib/data/qc-review";
import { getAppSession } from "@/lib/session";

export type ActionState = { error?: string };
const ID = /^[A-Za-z0-9-]{1,64}$/;
const CODE = /^ORD\d{3,}$/;

// Each action re-checks the session, calls the seam and reopens the order's QC review with a banner. A DataError (a
// refusal written for the operator, from the demo rules or the database functions) comes back as a message.
async function guard() {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  return session;
}
const text = (form: FormData, name: string, max = 500) => String(form.get(name) ?? "").trim().slice(0, max);

async function run(work: () => Promise<string>): Promise<ActionState> {
  let next: string;
  try {
    next = await work();
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction(next);
}

export async function addExclusionAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const orderCode = text(form, "orderCode", 20);
  const sampleId = text(form, "sampleId", 64);
  const reason = text(form, "reason");
  if (!CODE.test(orderCode) || !ID.test(sampleId)) return { error: "The sample is missing. Reload the page." };
  if (!reason) return { error: "Give the reason for excluding this sample." };
  return run(async () => {
    await addExclusion({ orderCode, sampleId, reason });
    return `/qc-review?order=${orderCode}&excluded=1`;
  });
}

export async function withdrawExclusionAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const orderCode = text(form, "orderCode", 20);
  const exclusionId = text(form, "exclusionId", 64);
  const reason = text(form, "reason");
  if (!CODE.test(orderCode) || !ID.test(exclusionId)) return { error: "The exclusion is missing. Reload the page." };
  if (!reason) return { error: "Give the reason for withdrawing this exclusion." };
  return run(async () => {
    await withdrawExclusion({ orderCode, exclusionId, reason });
    return `/qc-review?order=${orderCode}&withdrawn=1`;
  });
}

export async function markQcReviewedAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const orderCode = text(form, "orderCode", 20);
  const orderId = text(form, "orderId", 64);
  if (!CODE.test(orderCode) || !ID.test(orderId)) return { error: "The order is missing. Reload the page." };
  return run(async () => {
    await markQcReviewed({ orderCode, orderId });
    return `/qc-review?order=${orderCode}&reviewed=1`;
  });
}
