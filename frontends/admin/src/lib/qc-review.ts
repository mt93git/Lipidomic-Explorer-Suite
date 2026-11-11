// QC review (0027): the lab's recorded decisions on a processed order, sample exclusions and the optional "QC reviewed"
// step. Scientific QC lives in Nexo/R; Admin only records decisions, and building a dataset never drops or alters data
// because of an exclusion: the decisions are listed beside the dataset's provenance. Pure: no React, no server imports.
// The demo's records (a slice of DemoState) and their rules use the wording of admin.add_exclusion,
// admin.withdraw_exclusion and admin.mark_qc_checked.
import { stages, type Order } from "./models";
import { DataError } from "./samples";

export const PROCESSED = 7;
export const QC_REVIEWED = 8;
// Exclusions change only while an order is Processed or QC reviewed; only a Processed order is marked QC reviewed.
export const qcOpen = (stage: number) => stage === PROCESSED || stage === QC_REVIEWED;

// One exclusion as recorded (withdrawn ones keep their record: archived_at / archived_reason).
export type Exclusion = {
  id: string; sampleId: string; sampleCode: string; reason: string; decidedBy: string | null; decidedAt: string;
  withdrawnAt: string | null; withdrawnReason: string | null;
};
// What a dataset's processing record lists: the exclusions live when the version was built.
export type RecordedExclusion = { sampleCode: string; reason: string; decidedBy: string | null; decidedAt: string };

export type QcOrder = {
  id: string; code: string; clientId: string; clientName: string; title: string; stage: number;
  resultFile: { sha256: string; acceptedAt: string | null } | null; sampleCount: number; exclusionCount: number;
};
export type QcSample = { id: string; code: string; fullName: string; exclusion: Exclusion | null };
export type QcDetail = { order: QcOrder; samples: QcSample[]; reviewed: { at: string; by: string | null } | null };

export const reasonProblem = (reason: string, what: string) => reason.trim() ? null : `Give the reason for ${what}.`;
export const exclusionsClosedProblem = (code: string, stage: number) =>
  qcOpen(stage) ? null : `${code} is ${stages[stage] ?? "Released"}; exclusions are recorded only while an order is Processed or QC reviewed.`;
export const markProblem = (code: string, stage: number) =>
  stage === PROCESSED ? null : `${code} is ${stages[stage] ?? "Released"}; only a Processed order can be marked QC reviewed.`;

// The exclusions in force at an instant (a version's build): decided by then and not withdrawn by then, by sample code.
export function exclusionsAt(exclusions: Exclusion[], at: string): RecordedExclusion[] {
  const instant = Date.parse(at);
  return exclusions
    .filter(item => Date.parse(item.decidedAt) <= instant && (!item.withdrawnAt || Date.parse(item.withdrawnAt) > instant))
    .sort((a, b) => a.sampleCode.localeCompare(b.sampleCode))
    .map(item => ({ sampleCode: item.sampleCode, reason: item.reason, decidedBy: item.decidedBy, decidedAt: item.decidedAt }));
}

// ---------------------------------------------------------------- demo records

export type DemoExclusion = Exclusion & { orderCode: string };
export type DemoQcReview = { orderCode: string; at: string; by: string };
export type DemoQcState = { exclusions?: DemoExclusion[]; qcReviews?: DemoQcReview[] };

type Target = Pick<Order, "code" | "stage">;
const live = (state: DemoQcState) => (state.exclusions ?? []).filter(item => !item.withdrawnAt);

export function recordExclusion<S extends DemoQcState>(state: S, { order, sample, reason, actor, now, id }:
  { order: Target; sample: { id: string; code: string }; reason: string; actor: string; now: Date; id: string }): S {
  const problem = reasonProblem(reason, "excluding this sample") ?? exclusionsClosedProblem(order.code, order.stage);
  if (problem) throw new DataError(problem);
  if (live(state).some(item => item.sampleId === sample.id)) throw new DataError(`${sample.code} is already excluded; withdraw that exclusion first.`);
  const record: DemoExclusion = { id, orderCode: order.code, sampleId: sample.id, sampleCode: sample.code, reason: reason.trim(), decidedBy: actor, decidedAt: now.toISOString(), withdrawnAt: null, withdrawnReason: null };
  return { ...state, exclusions: [...(state.exclusions ?? []), record] };
}

export function recordExclusionWithdrawal<S extends DemoQcState>(state: S, { order, exclusionId, reason, now }:
  { order: Target; exclusionId: string; reason: string; now: Date }): S {
  const problem = reasonProblem(reason, "withdrawing this exclusion") ?? exclusionsClosedProblem(order.code, order.stage);
  if (problem) throw new DataError(problem);
  const found = (state.exclusions ?? []).find(item => item.id === exclusionId && item.orderCode === order.code);
  if (!found) throw new DataError("That exclusion was not found. Reload the page.");
  if (found.withdrawnAt) throw new DataError(`The exclusion of ${found.sampleCode} was already withdrawn.`);
  return { ...state, exclusions: (state.exclusions ?? []).map(item => item.id === exclusionId ? { ...item, withdrawnAt: now.toISOString(), withdrawnReason: reason.trim() } : item) };
}

export function recordQcReviewed<S extends DemoQcState>(state: S, { order, actor, now }: { order: Target; actor: string; now: Date }): S {
  const problem = markProblem(order.code, order.stage);
  if (problem) throw new DataError(problem);
  return { ...state, qcReviews: [...(state.qcReviews ?? []), { orderCode: order.code, at: now.toISOString(), by: actor }] };
}

// The example orders with the demo's QC marks applied: a marked order reads QC reviewed (or later), its QC gate is met.
export function applyQcState(orders: Order[], state: DemoQcState): Order[] {
  const reviews = state.qcReviews ?? [];
  if (!reviews.length) return orders;
  return orders.map(order => {
    const review = reviews.find(item => item.orderCode === order.code);
    if (!review) return order;
    return {
      ...order, stage: Math.max(order.stage, QC_REVIEWED),
      gates: order.gates.map(gate => gate.label === "QC review" ? { ...gate, status: "ok" as const } : gate),
      history: [{ date: review.at, title: "QC reviewed", actor: review.by }, ...order.history].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    };
  });
}
