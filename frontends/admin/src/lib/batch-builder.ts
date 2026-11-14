// Batch builder: the form's fields and their checks, the plan the engine makes from them (src/lib/batch/) and what is
// saved. Pure functions; the database calls and the demo store are in data/batches.ts. Nothing here trusts a preview:
// the save action reads the same fields again and plans again (the engine is deterministic for a given seed), and
// refuses when that plan is not the one previewed.
import { buildBatch, type Injection, type ValidationMessage } from "./batch";

// A registered sample the lab may put in a batch. Before the batch is saved the sample's id stands in for its aliquot
// (create_batch uses the sample's live aliquot or records one), so the engine keeps each sample tied to its own row.
// The engine names an Unknown injection by `code`; `fullName` (client-written) only travels along for the bench sheet.
export type BuilderSample = { id: string; code: string; fullName: string; orderCode: string; clientId: string; clientName: string };
export type PlateOrder = "column-major" | "row-major";

export type BuilderValues = {
  panelId: string; sampleIds: string[];
  blanksAtStart: number; pooledQcEvery: number; blankAfterQc: boolean; qcAtEnd: boolean; randomize: boolean; seed: string;
  minutesPerInjection: number; plateOrder: PlateOrder;
};
// Batch builder's own defaults; the active instrument profile's blank and QC rules replace blanksAtStart and
// pooledQcEvery (instrument-profiles.ts builderDefaultsFrom).
export const builderDefaults = {
  blanksAtStart: 1, pooledQcEvery: 6, blankAfterQc: false, qcAtEnd: true, randomize: true, seed: "",
  minutesPerInjection: 12, plateOrder: "column-major" as PlateOrder,
};
export const PLATE = "Plate 1";

export type BuilderField = "panelId" | "samples" | "blanksAtStart" | "pooledQcEvery" | "minutesPerInjection";
export type BuilderErrors = Partial<Record<BuilderField, string>>;
type Source = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };

const text = (source: Source, name: string) => String(source.get(name) ?? "").trim();

// "" (or a missing field) keeps the default; anything else must be a whole number, 0 or more.
function count(source: Source, name: "blanksAtStart" | "pooledQcEvery", errors: BuilderErrors, defaults: typeof builderDefaults): number {
  const raw = text(source, name);
  if (!raw) return defaults[name];
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) { errors[name] = "Enter a whole number, 0 or more"; return defaults[name]; }
  return value;
}

// Works on FormData (the save action) and URLSearchParams (the preview is a GET, so its URL holds the whole plan).
// A checkbox is true when present. The sample ids come back in the registry's order, without ids that are gone.
// defaults: what an empty count means; the page passes the active instrument profile's rules (0035).
export function parseBuilderForm(source: Source, available: readonly BuilderSample[], defaults: typeof builderDefaults = builderDefaults): { ok: true; value: BuilderValues } | { ok: false; errors: BuilderErrors } {
  const errors: BuilderErrors = {};
  const panelId = text(source, "panelId");
  if (!panelId) errors.panelId = "Choose a panel";
  const picked = new Set(source.getAll("sample").map(String));
  const sampleIds = available.filter(item => picked.has(item.id)).map(item => item.id);
  if (!picked.size) errors.samples = "Select at least one sample";
  else if (!sampleIds.length) errors.samples = "The selected samples are no longer available; choose again";
  const blanksAtStart = count(source, "blanksAtStart", errors, defaults);
  const pooledQcEvery = count(source, "pooledQcEvery", errors, defaults);
  const minutesRaw = text(source, "minutesPerInjection");
  const minutesPerInjection = minutesRaw ? Number(minutesRaw) : builderDefaults.minutesPerInjection;
  if (!Number.isFinite(minutesPerInjection) || minutesPerInjection <= 0) errors.minutesPerInjection = "Enter minutes greater than 0";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      panelId, sampleIds, blanksAtStart, pooledQcEvery, minutesPerInjection,
      blankAfterQc: source.get("blankAfterQc") !== null, qcAtEnd: source.get("qcAtEnd") !== null, randomize: source.get("randomize") !== null,
      seed: String(source.get("seed") ?? ""), plateOrder: text(source, "plateOrder") === "row-major" ? "row-major" : "column-major",
    },
  };
}

// problems are the engine's validation messages with their codes; an invalid plan has no injections and zero minutes.
export type Plan = { injections: Injection[]; minutes: number; problems: ValidationMessage[] };
export const problemText = (plan: Pick<Plan, "problems">) => plan.problems.map(problem => problem.message).join(" ");

export function planBatch(values: BuilderValues, available: readonly BuilderSample[]): Plan {
  const chosen = new Set(values.sampleIds);
  const result = buildBatch({
    samples: available.filter(item => chosen.has(item.id)).map(item => ({ code: item.code, FullName: item.fullName, client_id: item.clientId, aliquot_id: item.id })),
    rules: {
      blanksAtStart: values.blanksAtStart, pooledQcEvery: values.pooledQcEvery, blankAfterQc: values.blankAfterQc,
      qcAtEnd: values.qcAtEnd, randomize: values.randomize, seed: values.seed,
    },
    plateLayout: { plate: PLATE, order: values.plateOrder },
    minutesPerInjection: values.minutesPerInjection,
  });
  return { injections: result.injections, minutes: result.estimatedRunTimeMinutes, problems: result.validationMessages };
}

export type PlateCell = { vial: string; seq: number | null; type: Injection["sample_type"] | null; name: string | null };
const ROWS = "ABCDEFGH";

// The 96-well plate as the bench sees it: rows A–H, columns 1–12.
export function plateMap(injections: readonly Injection[]): PlateCell[][] {
  const byVial = new Map(injections.map(row => [row.vial, row]));
  return [...ROWS].map(letter => Array.from({ length: 12 }, (_, column) => {
    const vial = `${letter}${column + 1}`;
    const row = byVial.get(vial);
    return { vial, seq: row?.seq ?? null, type: row?.sample_type ?? null, name: row?.sample_name ?? null };
  }));
}

export function formatRunTime(minutes: number): string {
  const total = Math.round(minutes);
  const [hours, rest] = [Math.floor(total / 60), total % 60];
  return [hours ? `${hours} h` : "", rest || !hours ? `${rest} min` : ""].filter(Boolean).join(" ");
}

// admin.create_batch p_injections: Unknown rows carry the sample id (the planning put it in the aliquot slot) and are
// named by the sample code; FullName is not sent, the bench sheet reads it from the registry.
export type SaveInjection = { seq: number; sample_type: Injection["sample_type"]; sample_name: string; sample_id: string | null; plate: string; vial: string };
export function saveInjections(injections: readonly Injection[]): SaveInjection[] {
  return injections.map(row => ({
    seq: row.seq, sample_type: row.sample_type, sample_name: row.sample_name,
    sample_id: row.sample_type === "Unknown" ? row.aliquot_id : null, plate: row.plate, vial: row.vial,
  }));
}

// The previewed plan travels with the save form as exactly what would be saved. The save plans again from the samples
// still free; if a previewed sample was taken by another batch meanwhile, parseBuilderForm drops it and every later
// well shifts, so the new plan differs and the save refuses rather than store a plate nobody saw.
export const planKey = (injections: readonly Injection[]) => JSON.stringify(saveInjections(injections));
export const PLAN_CHANGED = "The samples available changed since the preview (one may be in another batch now). Preview the sequence again, then save.";
export function previewMismatch(source: Source, plan: Pick<Plan, "injections">): string | null {
  return String(source.get("plan") ?? "") === planKey(plan.injections) ? null : PLAN_CHANGED;
}

// admin.create_batch p_rules, stored on batch_version.rules: everything needed to explain or repeat the plan.
export type StoredRules = {
  rules: { blanksAtStart: number; pooledQcEvery: number; blankAfterQc: boolean; qcAtEnd: boolean; randomize: boolean; seed: string };
  plateLayout: { plate: string; order: PlateOrder }; minutesPerInjection: number;
};
export function rulesRecord(values: BuilderValues): StoredRules {
  return {
    rules: {
      blanksAtStart: values.blanksAtStart, pooledQcEvery: values.pooledQcEvery, blankAfterQc: values.blankAfterQc,
      qcAtEnd: values.qcAtEnd, randomize: values.randomize, seed: values.seed,
    },
    plateLayout: { plate: PLATE, order: values.plateOrder }, minutesPerInjection: values.minutesPerInjection,
  };
}

export function storedMinutes(record: unknown): number | null {
  const minutes = (record as { minutesPerInjection?: unknown } | null)?.minutesPerInjection;
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}
