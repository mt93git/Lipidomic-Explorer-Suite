"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { BATCH_NAME } from "@/lib/batch-run";
import { DataError, markBatchAcquired, markBatchExported } from "@/lib/data/batches";
import { getAppSession } from "@/lib/session";

export type BatchActionState = { error?: string };

// Mark exported / Mark acquired: the batch name comes from the page's hidden field and is checked again; the data
// seam reads the saved sequence itself (the hash is never taken from the browser) and the database enforces the order.
async function run(form: FormData, work: (name: string) => Promise<void>, done: string): Promise<BatchActionState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const name = String(form.get("name") ?? "");
  if (!BATCH_NAME.test(name)) return { error: "Choose a batch first." };
  try {
    await work(name);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction(`/batch-run/${name}?${done}=1`);
}

export async function markExportedAction(_previous: BatchActionState, form: FormData): Promise<BatchActionState> {
  return run(form, markBatchExported, "exported");
}
export async function markAcquiredAction(_previous: BatchActionState, form: FormData): Promise<BatchActionState> {
  return run(form, markBatchAcquired, "acquired");
}
