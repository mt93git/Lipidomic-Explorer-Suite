"use server";

import { revalidatePath } from "next/cache";
import { redirectAfterAction } from "@/lib/action-redirect";
import {
  archiveInstrument, archivePanel, createInstrument, createPanel, DataError, parseKits, setPanelRate, updateInstrument, updatePanel,
} from "@/lib/data/instruments-panels";
import { getAppSession } from "@/lib/session";

// Each action re-checks the session, calls the seam (which checks Owner or Admin; the database functions check again)
// and returns to the screen with a confirmation. A refusal comes back as the form's message.
export type CatalogActionState = { error?: string };
const PATH = "/instruments-panels";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const actor = (form: FormData) => value(form, "actor") || undefined;
async function authorize() {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
}
async function run(work: () => Promise<unknown>, done: string): Promise<CatalogActionState> {
  await authorize();
  try { await work(); }
  catch (error) { if (error instanceof DataError) return { error: error.message }; throw error; }
  revalidatePath(PATH);
  revalidatePath("/new-order");
  revalidatePath("/batch-builder");
  return redirectAfterAction(`${PATH}?done=${done}`);
}
const instrument = (form: FormData) => ({ name: value(form, "name"), model: value(form, "model") || null, serialNumber: value(form, "serialNumber") || null, actorId: actor(form) });
const panel = (form: FormData) => ({
  name: value(form, "name"), instrumentId: value(form, "instrumentId") || null, lcMethod: value(form, "lcMethod") || null,
  istdKits: parseKits(value(form, "istdKits")), datasetType: value(form, "datasetType"), actorId: actor(form),
});

export async function createInstrumentAction(_previous: CatalogActionState, form: FormData) {
  return run(() => createInstrument(instrument(form)), "instrument-created");
}
export async function updateInstrumentAction(_previous: CatalogActionState, form: FormData) {
  return run(() => updateInstrument({ ...instrument(form), id: value(form, "id") }), "instrument-saved");
}
export async function archiveInstrumentAction(_previous: CatalogActionState, form: FormData) {
  return run(() => archiveInstrument({ id: value(form, "id"), reason: value(form, "reason"), actorId: actor(form) }), "instrument-archived");
}
export async function createPanelAction(_previous: CatalogActionState, form: FormData) {
  return run(() => createPanel(panel(form)), "panel-created");
}
export async function updatePanelAction(_previous: CatalogActionState, form: FormData) {
  return run(() => updatePanel({ ...panel(form), id: value(form, "id") }), "panel-saved");
}
export async function archivePanelAction(_previous: CatalogActionState, form: FormData) {
  return run(() => archivePanel({ id: value(form, "id"), reason: value(form, "reason"), actorId: actor(form) }), "panel-archived");
}

// The rate sheet (0033): blank clears a part; anything else must be a number ("12,5" reads as 12.5).
function amount(form: FormData, key: string, label: string): number | null {
  const text = value(form, key).trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new DataError(`${label} must be a number.`);
  return parsed;
}
export async function setRateAction(_previous: CatalogActionState, form: FormData) {
  return run(async () => setPanelRate({
    panelId: value(form, "panelId"), ratePerSample: amount(form, "ratePerSample", "Rate per sample"), currency: value(form, "currency") || null,
    minutesPerInjection: amount(form, "minutesPerInjection", "Minutes per injection"), actorId: actor(form),
  }), "rate-saved");
}
