// New order wizard (0033): four steps (Client, Service, Sample list, Review & quote), the draft the lab can resume,
// the estimate from the lab's rate sheet and the sample list template. Pure functions; the database calls
// (save_order_draft, place_order_draft, set_panel_rate) and the demo store are in data/order-drafts.ts.
//
// The estimate never invents money: a panel without a rate on the rate sheet shows "not set". Run time follows the
// batch builder's rules (builderDefaults: blanks at start, a pooled QC every N samples, a QC at the end) at the panel's
// minutes per injection from the rate sheet, or the batch builder's default minutes when the sheet has none (said so).
import { countControls } from "./batch";
import { builderDefaults } from "./batch-builder";
import type { OrderInput } from "./new-order";
import { columns, DataError, parsePaste, validateSamples, type RowIssue, type SampleDraft } from "./samples";

export const wizardSteps = [
  { step: 1, label: "Client" },
  { step: 2, label: "Service" },
  { step: 3, label: "Sample list" },
  { step: 4, label: "Review & quote" },
] as const;
export type WizardStep = 1 | 2 | 3 | 4;
export const isWizardStep = (value: unknown): value is WizardStep => value === 1 || value === 2 || value === 3 || value === 4;
// The primary button of each step.
export const nextLabel: Record<WizardStep, string> = { 1: "Next: service", 2: "Next: sample list", 3: "Next: review & quote", 4: "Place order" };

export const matrices = ["Plasma", "Serum", "Tissue", "Cells", "Urine", "CSF"];
export const studyDesigns = ["Groups", "Groups + repeated visits", "Paired (before / after)", "Time course", "Not sure yet"];
// The client's billing methods (admin.client.billing_method, 0001), worded as the lab says them.
export const billingMethods = [
  { value: "charge_code", label: "Internal charge code" },
  { value: "po", label: "Purchase order" },
  { value: "grant", label: "Grant" },
  { value: "quote", label: "Quote first" },
] as const;
export type BillingMethod = typeof billingMethods[number]["value"];
const billingLabel = (value: string) => billingMethods.find(method => method.value === value)?.label ?? null;

// Everything the wizard holds, as typed (text), so a draft keeps exactly what was entered.
export const wizardFields = ["clientId", "title", "panelId", "matrix", "expectedSamples", "studyDesign", "billingMethod", "billingRef", "notes", "sampleList"] as const;
export type WizardField = typeof wizardFields[number];
export type WizardData = Record<WizardField, string>;
export type WizardErrors = Partial<Record<WizardField, string>>;
export const emptyWizard = (): WizardData => Object.fromEntries(wizardFields.map(field => [field, ""])) as WizardData;

// The longest text a draft keeps per field (the sample list is a pasted sheet, so it may be long).
export const DRAFT_TEXT_LIMIT = 2000;
export const SAMPLE_LIST_LIMIT = 200_000;
export const TITLE_LIMIT = 300;

// A draft that crossed the network (or came back from the database) is untrusted: known keys only, text only.
export function normalizeWizard(value: unknown): WizardData {
  const data = emptyWizard();
  if (!value || typeof value !== "object") return data;
  const record = value as Record<string, unknown>;
  for (const field of wizardFields) {
    const cell = record[field];
    const text = typeof cell === "string" ? cell : typeof cell === "number" && Number.isFinite(cell) ? String(cell) : "";
    data[field] = text.slice(0, field === "sampleList" ? SAMPLE_LIST_LIMIT : DRAFT_TEXT_LIMIT);
  }
  return data;
}

// The pasted sample list, read by the sample registry's own paste reader and checks.
export type SampleListCheck = { rows: SampleDraft[]; issues: RowIssue[]; headerDetected: boolean; ignoredHeaders: string[] };
export function checkSampleList(text: string): SampleListCheck {
  const pasted = parsePaste(text);
  return { ...pasted, issues: validateSamples(pasted.rows) };
}

const wholeNumber = (text: string): number | null => {
  const value = Number(text.trim());
  return text.trim() && Number.isInteger(value) && value >= 0 ? value : null;
};
// The number of samples the estimate uses: the field, or the pasted list's rows when the field is blank.
export function sampleCount(data: WizardData): number | null {
  const typed = wholeNumber(data.expectedSamples);
  if (typed !== null) return typed;
  const rows = data.sampleList.trim() ? checkSampleList(data.sampleList).rows.length : 0;
  return rows || null;
}

// What must be right before leaving a step (Save draft never checks: a draft may be half filled).
export function stepErrors(data: WizardData, step: WizardStep): WizardErrors {
  const errors: WizardErrors = {};
  if (step === 1 || step === 4) {
    if (!data.clientId.trim()) errors.clientId = "Choose a client";
    if (!data.title.trim()) errors.title = "Enter a title";
    // order_draft.title keeps at most 300 characters (0033): a longer title would make place_order_draft roll back.
    else if (data.title.trim().length > TITLE_LIMIT) errors.title = `Keep the title under ${TITLE_LIMIT} characters`;
  }
  if (step === 2 || step === 4) {
    if (!data.clientId.trim()) errors.clientId = "Choose a client";
    if (!data.panelId.trim()) errors.panelId = "Choose a panel";
    if (data.expectedSamples.trim() && wholeNumber(data.expectedSamples) === null) errors.expectedSamples = "Enter a whole number, 0 or more";
  }
  if ((step === 3 || step === 4) && data.sampleList.trim()) {
    const check = checkSampleList(data.sampleList);
    const issue = check.issues[0];
    if (!check.rows.length) errors.sampleList = "No sample rows were found in the pasted list";
    else if (issue) errors.sampleList = `Row ${issue.row + 1}: ${issue.message}`;
  }
  return errors;
}

// What create_order receives. The order has no study design or billing method column: the study design opens the
// notes and the billing method leads the billing reference, so the lab reads both on the order.
export function toOrderInput(data: WizardData): OrderInput {
  const design = data.studyDesign.trim();
  const notes = [design ? `Study design: ${design}.` : "", data.notes.trim()].filter(Boolean).join("\n");
  const method = billingLabel(data.billingMethod);
  const ref = data.billingRef.trim();
  return {
    clientId: data.clientId.trim(), panelId: data.panelId.trim(), title: data.title.trim(), matrix: data.matrix.trim() || null,
    expectedSamples: sampleCount(data), billingRef: method && ref ? `${method} · ${ref}` : method ?? (ref || null), notes: notes || null,
  };
}

// ---------------------------------------------------------------- estimate

// One panel's line on the lab's rate sheet (admin.panel_rate, 0033). Null: not set.
export type PanelRate = { panelId: string; ratePerSample: number | null; currency: string | null; minutesPerInjection: number | null };
// A panel as the wizard offers it: its instrument names the run time line.
export type WizardPanel = { id: string; name: string; instrumentName: string | null; rate: PanelRate | null };

export type InjectionRules = Pick<typeof builderDefaults, "blanksAtStart" | "pooledQcEvery" | "blanksBetween" | "blanksBetweenEvery" | "blankAfterQc" | "qcAtEnd">;
export type InjectionCount = { injections: number; blanks: number; blanksAtStart: number; blanksBetween: number; blanksAfterQc: number; qcs: number };

// The batch engine's own count (countControls, src/lib/batch/): blanks at the start, blanks between samples, pooled QC
// and a blank after every QC when asked. Not capped at one plate: an order may need more than one batch.
export function countInjections(samples: number, rules: InjectionRules = builderDefaults): InjectionCount {
  if (!Number.isInteger(samples) || samples <= 0) return { injections: 0, blanks: 0, blanksAtStart: 0, blanksBetween: 0, blanksAfterQc: 0, qcs: 0 };
  const { injections, blanksAtStart, blanksBetween, blanksAfterQc, qcs } = countControls(samples, rules);
  return { injections, blanks: blanksAtStart + blanksBetween + blanksAfterQc, blanksAtStart, blanksBetween, blanksAfterQc, qcs };
}

// The grey line under "Blanks and QC": "1 blank at start, 30 between samples and 12 pooled QCs, by the active profile's rules".
export function controlsText(count: Pick<InjectionCount, "blanksAtStart" | "blanksBetween" | "blanksAfterQc" | "qcs">, fromProfile: boolean): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [`${plural(count.blanksAtStart, "blank")} at start`];
  if (count.blanksBetween) parts.push(`${count.blanksBetween} between samples`);
  if (count.blanksAfterQc) parts.push(`${count.blanksAfterQc} after QC`);
  return `${parts.join(", ")} and ${plural(count.qcs, "pooled QC")}, by the ${fromProfile ? "active profile's" : "batch builder's"} rules`;
}

export const PLATE_WELLS = 96;
export type Estimate = InjectionCount & {
  samples: number | null;
  amount: number | null; currency: string | null; ratePerSample: number | null;
  plates: number;
  minutes: number | null; minutesPerInjection: number; minutesFromRateSheet: boolean;
};

// rules: the active instrument profile's (activeBuilderDefaults), as Batch builder starts from them.
export function estimateOrder(samples: number | null, rate: PanelRate | null, rules: InjectionRules = builderDefaults): Estimate {
  const count = samples ?? 0;
  const counted = countInjections(count, rules);
  const { injections } = counted;
  const fromSheet = rate?.minutesPerInjection != null && rate.minutesPerInjection > 0;
  const minutesPerInjection = fromSheet ? rate!.minutesPerInjection! : builderDefaults.minutesPerInjection;
  const priced = rate?.ratePerSample != null && !!rate.currency && samples !== null;
  return {
    samples,
    amount: priced ? Math.round(rate!.ratePerSample! * count * 100) / 100 : null,
    currency: rate?.ratePerSample != null ? rate.currency : null, ratePerSample: rate?.ratePerSample ?? null,
    ...counted, plates: Math.ceil(injections / PLATE_WELLS),
    minutes: samples ? injections * minutesPerInjection : null, minutesPerInjection, minutesFromRateSheet: fromSheet,
  };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(amount).replace(/ /g, " ");
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// "≈ 16 h" from an hour up (rounded to the half hour), "≈ 45 min" below.
export function approxRunTime(minutes: number): string {
  if (minutes < 60) return `≈ ${Math.round(minutes)} min`;
  const hours = Math.round(minutes / 30) / 2;
  return `≈ ${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

// ---------------------------------------------------------------- sample list template

// The template the client fills: the registry's columns in its order (the six metadata columns first), as CSV.
export const templateFileName = "sample-list-template.csv";
export function sampleTemplateCsv(): string {
  return `${columns.map(column => column.label).join(",")}\r\n`;
}
export const metadataColumns = columns.slice(0, 6).map(column => column.label);
// A link that downloads the template without a request (staff and client screens alike).
export const templateHref = () => `data:text/csv;charset=utf-8,${encodeURIComponent(sampleTemplateCsv())}`;

// ---------------------------------------------------------------- drafts

// An open draft as the New order page lists it.
export type OrderDraftSummary = { id: string; step: WizardStep; clientId: string | null; title: string | null; updatedAt: string; updatedBy: string };
export type OrderDraft = { id: string; step: WizardStep; data: WizardData };

// The demo's draft (live: admin.order_draft). Closed when placed (orderCode) or discarded; a closed draft never changes.
export type DemoOrderDraft = OrderDraft & { createdAt: string; createdBy: string; updatedAt: string; updatedBy: string; orderCode: string | null; discardedAt: string | null };
type DraftArgs = { id: string | null; step: WizardStep; data: WizardData; actor: string; now: Date; newId: () => string };

const openDraft = (drafts: DemoOrderDraft[], id: string): DemoOrderDraft => {
  const found = drafts.find(draft => draft.id === id);
  if (!found) throw new DataError("Draft not found.");
  if (found.orderCode) throw new DataError(`This draft was already placed as order ${found.orderCode}.`);
  if (found.discardedAt) throw new DataError("This draft was discarded.");
  return found;
};

// save_order_draft in the demo: a new draft when id is null, else the same open one.
export function saveDemoDraft(drafts: DemoOrderDraft[], { id, step, data, actor, now, newId }: DraftArgs): { drafts: DemoOrderDraft[]; id: string } {
  const at = now.toISOString();
  if (!id) {
    const created: DemoOrderDraft = { id: newId(), step, data, createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor, orderCode: null, discardedAt: null };
    return { drafts: [...drafts, created], id: created.id };
  }
  openDraft(drafts, id);
  return { drafts: drafts.map(draft => draft.id === id ? { ...draft, step, data, updatedAt: at, updatedBy: actor } : draft), id };
}

export function closeDemoDraft(drafts: DemoOrderDraft[], id: string, close: { orderCode: string; data: WizardData } | { discard: true }, actor: string, now: Date): DemoOrderDraft[] {
  openDraft(drafts, id);
  const at = now.toISOString();
  return drafts.map(draft => draft.id !== id ? draft : "discard" in close
    ? { ...draft, discardedAt: at, updatedAt: at, updatedBy: actor }
    : { ...draft, step: 4, data: close.data, orderCode: close.orderCode, updatedAt: at, updatedBy: actor });
}

// The sample list pasted in the wizard, on the draft placed as this order (the Sample registry offers it), or null.
export function placedSampleList(drafts: readonly DemoOrderDraft[], orderCode: string): string | null {
  const draft = drafts.find(item => item.orderCode === orderCode);
  return draft?.data.sampleList?.trim() || null;
}

export const demoDraftSummaries = (drafts: DemoOrderDraft[]): OrderDraftSummary[] => drafts
  .filter(draft => !draft.orderCode && !draft.discardedAt)
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  .map(draft => ({ id: draft.id, step: draft.step, clientId: draft.data.clientId || null, title: draft.data.title.trim() || null, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy }));
