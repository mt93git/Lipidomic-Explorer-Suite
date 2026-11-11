import { LAB_TIME_ZONE } from "./lab-time";
import type { dbStages } from "./samples";

// The client portal (docs/admin/client-zone-proposal/proposal.html, section 6): the eleven internal stages of an
// order, told to a client user as six steps. Nothing here names a batch, an instrument, a gate check or a person.
export type DbStage = typeof dbStages[number];
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;
// admin.order.review (0019): pending until the lab answers a client's request; an order the lab opens is accepted from
// the start; declined is archived with the lab's reason.
export type Review = "pending" | "accepted" | "declined";

export const clientStepLabels = ["Requested", "Accepted", "Samples received", "In analysis", "Quality review", "Released"] as const;

const stepOfStage: Record<DbStage, StepNumber> = {
  request: 2,
  received: 3, registered: 3,
  extracted: 4, in_batch: 4, sequence_exported: 4, acquired: 4,
  processed: 5, qc_checked: 5, excel_built: 5,
  released: 6,
};

// request with its review pending → 1 · Requested; request, accepted → 2 · Accepted; the rest by stage. A declined
// request has no step (it is closed): callers check `declined` first; it stays at 1 here.
export function clientStep(stage: DbStage, review: Review = "accepted"): StepNumber {
  if (stage === "request" && review !== "accepted") return 1;
  const step = stepOfStage[stage];
  if (!step) throw new Error(`Unknown order stage: ${String(stage)}`);
  return step;
}

// Only facts a client member already reads through RLS: the order row, its received shipments, its registered
// samples and its released (or retired) dataset versions.
export type ClientOrder = {
  code: string;
  clientId: string;
  title: string;
  stage: DbStage;
  review: Review;
  // When the lab accepted the request (or, for an order the lab opened, when it was opened); null until then.
  acceptedAt: string | null;
  // The lab's reason, shown to the client, when it declined the request.
  declineReason: string | null;
  panel: string | null;
  matrix: string | null;
  billingRef: string | null;
  // A client request (0019): who of the client asked and the notes they wrote. Absent or null for an order the lab
  // opened (its notes are the lab's, never shown to the client).
  requestedBy?: string | null;
  notes?: string | null;
  expectedSamples: number | null;
  registeredSamples: number;
  // ISO instants (or a YYYY-MM-DD lab day in demo mode).
  requestedAt: string;
  receivedAt: string | null;
  // The released version, or the last one if it was withdrawn or superseded and no version is current.
  release: {
    version: number;
    releasedAt: string | null;
    // admin.dataset.id of the current released version (what Open in Nexo opens); null when none is current.
    datasetId: string | null;
    retired?: { status: "withdrawn" | "superseded"; reason: string; at: string };
  } | null;
};

export type StepState = "done" | "current" | "upcoming";
export type ClientStepView = { number: StepNumber; label: string; state: StepState; date: string | null };

// The dates come only from those facts. Between Samples received and Released there are none, on purpose.
// Accepted: when the lab answered; an order the lab opened is accepted when it is opened (acceptedAt = requestedAt).
export const stepOf = (order: Pick<ClientOrder, "stage" | "review">): StepNumber => clientStep(order.stage, order.review);
export const declined = (order: Pick<ClientOrder, "review">) => order.review === "declined";
export function clientSteps(order: ClientOrder): ClientStepView[] {
  const current = stepOf(order);
  const dates: (string | null)[] = [order.requestedAt, order.acceptedAt, order.receivedAt, null, null, order.release?.releasedAt ?? null];
  return clientStepLabels.map((label, index) => {
    const number = (index + 1) as StepNumber;
    // Released is the end: nothing is left to do, so it shows as done rather than current.
    const state: StepState = number < current || current === 6 ? "done" : number === current ? "current" : "upcoming";
    return { number, label, state, date: state === "upcoming" ? null : dates[index] };
  });
}

// What a row on Client home says the order reached, and when: the newest dated step at or before the current one.
const reachedWord = ["requested", "accepted", "received", "received", "received", "released"] as const;
export function reachedOn(order: ClientOrder): { word: string; date: string } | null {
  if (declined(order)) return order.requestedAt ? { word: "requested", date: order.requestedAt } : null;
  const step = stepOf(order);
  const date = clientSteps(order)[step === 4 || step === 5 ? 2 : step - 1].date;
  return date ? { word: reachedWord[step - 1], date } : null;
}

// The phrase beside the step on Client home.
export function stepPhrase(step: StepNumber): string {
  if (step === 1) return "waiting for the lab's review";
  if (step === 2) return "send your samples";
  if (step === 6) return "dataset released";
  return `step ${step} of 6`;
}

// The four tiles on Client home. A declined request is closed and counts in none.
export function homeCounts(orders: ClientOrder[]) {
  const steps = orders.filter(order => !declined(order)).map(stepOf);
  return {
    waitingForLab: steps.filter(step => step === 1).length,
    waitingForSamples: steps.filter(step => step === 2).length,
    withLab: steps.filter(step => step >= 3 && step <= 5).length,
    released: steps.filter(step => step === 6).length,
  };
}

// "Nov 5" or "Nov 5, 2026", in the lab's zone. A plain YYYY-MM-DD is already a lab day and is shown as written.
const shortDay = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: LAB_TIME_ZONE });
const longDay = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: LAB_TIME_ZONE });
const shortPlain = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });
const longPlain = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export function clientDay(value: string | null | undefined, withYear = false): string {
  if (!value) return "";
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const instant = new Date(plain ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(instant.getTime())) return "";
  return (plain ? (withYear ? longPlain : shortPlain) : (withYear ? longDay : shortDay)).format(instant);
}

export const samplePhrase = (order: ClientOrder): string => {
  const count = (n: number) => `${n} sample${n === 1 ? "" : "s"}`;
  if (order.registeredSamples > 0) return count(order.registeredSamples);
  return order.expectedSamples ? `${count(order.expectedSamples)} expected` : "Samples not yet registered";
};
