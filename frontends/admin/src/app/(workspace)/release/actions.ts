"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { DataError, buildDataset, releaseDataset, signDataset, supersedeDataset, withdrawDataset } from "@/lib/data/release";
import { signerRoles, type SignerRole } from "@/lib/release";
import { getAppSession } from "@/lib/session";

export type ActionState = { error?: string };
const ID = /^[A-Za-z0-9-]{1,64}$/;

// Every action re-checks the session, calls the seam and reopens the dataset page with a banner. A DataError
// (a refusal written for the operator, from the demo rules or the database functions) comes back as a message;
// anything else is a real failure.
async function guard() {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  return session;
}
const text = (form: FormData, name: string, max = 2000) => String(form.get(name) ?? "").trim().slice(0, max);
// The demo "acting as" choice; ignored in live mode, where the signed-in person acts.
const actor = (form: FormData) => { const value = text(form, "actor", 64); return value && ID.test(value) ? value : undefined; };

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

export async function buildDatasetAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const orderId = text(form, "orderId", 64);
  if (!orderId || !ID.test(orderId)) return { error: "Choose an order to build." };
  return run(async () => {
    const { datasetId } = await buildDataset({ orderId, actorId: actor(form) });
    return `/release/${datasetId}?built=1`;
  });
}

export async function signDatasetAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const datasetId = text(form, "datasetId", 64);
  const role = text(form, "role", 20) as SignerRole;
  if (!datasetId || !ID.test(datasetId)) return { error: "The dataset is missing. Reload the page." };
  if (!signerRoles.includes(role)) return { error: "Choose the role you sign as." };
  return run(async () => {
    await signDataset({ datasetId, role, note: text(form, "note") || null, actorId: actor(form) });
    return `/release/${datasetId}?signed=1`;
  });
}

export async function releaseDatasetAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const datasetId = text(form, "datasetId", 64);
  if (!datasetId || !ID.test(datasetId)) return { error: "The dataset is missing. Reload the page." };
  return run(async () => {
    await releaseDataset({ datasetId, actorId: actor(form) });
    return `/release/${datasetId}?released=1`;
  });
}

export async function withdrawDatasetAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const datasetId = text(form, "datasetId", 64);
  const reason = text(form, "reason");
  if (!datasetId || !ID.test(datasetId)) return { error: "The dataset is missing. Reload the page." };
  if (!reason) return { error: "Give the reason for withdrawing this dataset." };
  return run(async () => {
    await withdrawDataset({ datasetId, reason, actorId: actor(form) });
    return `/release/${datasetId}?withdrawn=1`;
  });
}

export async function supersedeDatasetAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  await guard();
  const datasetId = text(form, "datasetId", 64);
  const newDatasetId = text(form, "newDatasetId", 64);
  if (!datasetId || !ID.test(datasetId) || !newDatasetId || !ID.test(newDatasetId)) return { error: "Choose the released version that replaces this one." };
  return run(async () => {
    await supersedeDataset({ datasetId, newDatasetId, actorId: actor(form) });
    return `/release/${datasetId}?superseded=1`;
  });
}
