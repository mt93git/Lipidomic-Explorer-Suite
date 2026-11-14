"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { BATCH_NAME } from "@/lib/batch-run";
import { DataError, getBatch, markBatchAcquired, markBatchExported, recordInjectionStatuses } from "@/lib/data/batches";
import { injectionStatuses, parseStatusPaste, type InjectionStatus } from "@/lib/visual-map";
import { getAppSession } from "@/lib/session";

export type BatchActionState = { error?: string };

// Mark exported / Mark acquired: the batch name comes from the page's hidden field and is checked again; the data
// seam reads the saved sequence itself (the hash is never taken from the browser) and the database enforces the order.
async function run(form: FormData, work: (name: string) => Promise<void>, done: string | (() => string)): Promise<BatchActionState> {
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
  return redirectAfterAction(`/batch-run/${name}?${typeof done === "string" ? `${done}=1` : done()}`);
}

export async function markExportedAction(_previous: BatchActionState, form: FormData): Promise<BatchActionState> {
  return run(form, markBatchExported, "exported");
}
export async function markAcquiredAction(_previous: BatchActionState, form: FormData): Promise<BatchActionState> {
  return run(form, markBatchAcquired, "acquired");
}

// Run monitor. Paste: the SCIEX OS batch status, matched by injection name (lines that match nothing are reported, not
// guessed). One: a single injection picked from the list. Both go through admin.record_injection_status.
export async function pasteStatusAction(_previous: BatchActionState, form: FormData): Promise<BatchActionState> {
  let changed = 0, unmatched = 0;
  return run(form, async name => {
    const batch = await getBatch(name);
    if (!batch) throw new DataError(`Batch ${name} was not found.`);
    const parsed = parseStatusPaste(String(form.get("paste") ?? ""), batch.injections.map(row => row.sample_name));
    if (!parsed.rows.length) throw new DataError("No line matched an injection of this batch. Paste rows with the injection name and its status (Acquired, Failed, Skipped, Waiting).");
    unmatched = parsed.unmatched.length;
    changed = await recordInjectionStatuses(name, parsed.rows);
  }, () => `status=${changed}&unmatched=${unmatched}#monitor`);
}
export async function setInjectionStatusAction(_previous: BatchActionState, form: FormData): Promise<BatchActionState> {
  let changed = 0;
  return run(form, async name => {
    const sampleName = String(form.get("injection") ?? "");
    const status = String(form.get("status") ?? "") as InjectionStatus;
    if (!sampleName) throw new DataError("Choose an injection.");
    if (!injectionStatuses.includes(status)) throw new DataError("Choose a status.");
    changed = await recordInjectionStatuses(name, [{ sample_name: sampleName, status }]);
  }, () => `status=${changed}#monitor`);
}
