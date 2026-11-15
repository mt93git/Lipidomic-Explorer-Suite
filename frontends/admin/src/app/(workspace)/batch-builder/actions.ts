"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { planBatch, parseBuilderForm, previewMismatch, problemText, rulesRecord, saveInjections } from "@/lib/batch-builder";
import { createBatch, DataError, listBuilderSamples } from "@/lib/data/batches";
import { getAppSession } from "@/lib/session";

export type SaveBatchState = { error?: string };

// Saves the plan as a planned batch with version 1. Nothing from the preview is trusted: the same fields are read
// again, checked against the samples that are still free, and planned again (the engine is deterministic for a
// seed); a plan that differs from the previewed one is refused (preview again), then admin.create_batch checks it a
// third time and writes everything or nothing.
export async function saveBatchAction(_previous: SaveBatchState, form: FormData): Promise<SaveBatchState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  let name: string;
  try {
    const samples = await listBuilderSamples();
    const parsed = parseBuilderForm(form, samples);
    if (!parsed.ok) return { error: `${Object.values(parsed.errors).join(". ")}. Go back to the form and preview again.` };
    const plan = planBatch(parsed.value, samples);
    if (plan.problems.length) return { error: problemText(plan) };
    const changed = previewMismatch(form, plan);
    if (changed) return { error: changed };
    ({ name } = await createBatch({ panelId: parsed.value.panelId, injections: saveInjections(plan.injections), rules: rulesRecord(parsed.value) }));
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction(`/batch-run/${encodeURIComponent(name)}?saved=1`);
}
