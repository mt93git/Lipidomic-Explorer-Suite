// The demo's record of datasets, signatures, releases and the release policy, laid over the example orders.
// Pure functions over an immutable state slice (kept in DemoState, one record set per browser); the server
// side is in data/release.ts. Refusals carry the same wording as the database functions they stand in for.
import { stages, type Gate, type HistoryEvent, type Order, type Retirement } from "./models";
import {
  datasetPaths, datasetStatusLabels, isEligibleSigner, policyProblem, releaseProgress, signerRoleLabels,
  type DatasetStatus, type HeaderMode, type LabPerson, type ReleasePolicy, type SignerRole,
} from "./release";
import { DataError } from "./samples";

// Synthetic lab people. The session user (Demo Operator) builds; the two reviewers are the default signers.
export const demoLabStaff: LabPerson[] = [
  { userId: "example-owner", name: "Demo Lab Owner", role: "owner" },
  { userId: "example-reviewer-a", name: "Demo Reviewer A", role: "admin" },
  { userId: "example-reviewer-b", name: "Demo Reviewer B", role: "admin" },
  { userId: "example-staff", name: "Demo Operator", role: "operator" },
];
export const demoDefaultPolicy: ReleasePolicy = { eligibleSigners: ["example-reviewer-a", "example-reviewer-b"], requiredSignatures: 2, setBy: "example-owner", setAt: "2026-11-01T14:00:00Z" };

export type DemoFile = { sha256: string; sizeBytes: number; sheets: string[] };
export type DemoSignature = { id: string; userId: string; name: string; role: SignerRole; note: string | null; signedAt: string };
export type DemoDataset = {
  id: string; orderCode: string; clientId: string; version: number; status: DatasetStatus;
  builtAt: string; builtBy: string; sourceSha256: string; sciexOsVersion: string | null; processingMethod: string | null;
  storagePath: string; full: DemoFile; analysis: DemoFile; companion: DemoFile;
  headerMode: HeaderMode; matched: number; samples: number; lipids: number;
  signatures: DemoSignature[];
  releasedAt: string | null; releasedBy: string | null; projectId: string | null; projectName: string | null;
  archivedAt: string | null; archivedReason: string | null;
};
// The slice of DemoState this module reads and writes.
export type DemoReleaseState = { datasets: DemoDataset[]; releasePolicy?: ReleasePolicy };

const PROCESSED = 7;
const EXCEL_BUILT = 9;

export const demoPolicy = (state: DemoReleaseState): ReleasePolicy => state.releasePolicy ?? demoDefaultPolicy;
const datasets = (state: DemoReleaseState) => state.datasets ?? [];

function find(state: DemoReleaseState, id: string): DemoDataset {
  const dataset = datasets(state).find(item => item.id === id);
  if (!dataset) throw new DataError(`Dataset ${id} not found.`);
  return dataset;
}
function requireSigner(state: DemoReleaseState, actor: LabPerson) {
  if (!isEligibleSigner(demoPolicy(state), actor)) throw new DataError("You are not an eligible release signer under the current policy.");
}
function replace<S extends DemoReleaseState>(state: S, dataset: DemoDataset): S {
  return { ...state, datasets: datasets(state).map(item => item.id === dataset.id ? dataset : item) };
}

export type BuildRecord = {
  order: Pick<Order, "code" | "clientId" | "stage" | "description">; actor: LabPerson; now: Date; id: string;
  files: { full: DemoFile; analysis: DemoFile; companion: DemoFile }; sourceSha256: string;
  headerMode: HeaderMode; matched: number; samples: number; lipids: number; sciexOsVersion: string | null; processingMethod: string | null;
};

// build_dataset: Operator+ builds a version for an order whose results file was accepted (Processed or later);
// versions are numbered per order; the order reads Excel built.
export function recordBuild<S extends DemoReleaseState>(state: S, { order, actor, now, id, files, ...build }: BuildRecord): { state: S; dataset: DemoDataset } {
  if (order.stage < PROCESSED) throw new DataError(`${order.code} is ${stages[order.stage]}; accept its results file before building a dataset.`);
  const version = datasets(state).filter(item => item.orderCode === order.code).reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const dataset: DemoDataset = {
    id, orderCode: order.code, clientId: order.clientId, version, status: "built", builtAt: now.toISOString(), builtBy: actor.name,
    sourceSha256: build.sourceSha256, sciexOsVersion: build.sciexOsVersion, processingMethod: build.processingMethod,
    storagePath: datasetPaths(order.clientId, order.code, { full: files.full.sha256, analysis: files.analysis.sha256, companion: files.companion.sha256 }).full, full: files.full, analysis: files.analysis, companion: files.companion,
    headerMode: build.headerMode, matched: build.matched, samples: build.samples, lipids: build.lipids,
    signatures: [], releasedAt: null, releasedBy: null, projectId: null, projectName: null, archivedAt: null, archivedReason: null,
  };
  return { state: { ...state, datasets: [...datasets(state), dataset] }, dataset };
}

// sign_dataset: an eligible person signs a built dataset once.
export function recordSignature<S extends DemoReleaseState>(state: S, { datasetId, actor, role, note, now, id }: { datasetId: string; actor: LabPerson; role: SignerRole; note: string | null; now: Date; id: string }): S {
  requireSigner(state, actor);
  const dataset = find(state, datasetId);
  if (dataset.status !== "built") throw new DataError(`Dataset v${dataset.version} is ${dataset.status}; it can no longer be signed.`);
  if (dataset.signatures.some(signature => signature.userId === actor.userId)) throw new DataError(`You have already signed dataset v${dataset.version}; a second signature must come from someone else.`);
  const signature: DemoSignature = { id, userId: actor.userId, name: actor.name, role, note: note?.trim() || null, signedAt: now.toISOString() };
  return replace(state, { ...dataset, signatures: [...dataset.signatures, signature] });
}

// release_dataset: the policy's count of distinct eligible signers, then the Team project (named like the
// database names it: order code + title).
export function recordRelease<S extends DemoReleaseState>(state: S, { datasetId, actor, now, projectId, projectName }: { datasetId: string; actor: LabPerson; now: Date; projectId: string; projectName: string }): S {
  requireSigner(state, actor);
  const dataset = find(state, datasetId);
  if (dataset.status !== "built") throw new DataError(`Dataset v${dataset.version} is already ${dataset.status}.`);
  const progress = releaseProgress(demoPolicy(state), dataset.signatures, demoLabStaff);
  if (!progress.met) throw new DataError(`Release of dataset v${dataset.version} needs ${progress.required} signatures by different eligible people (has ${progress.counted}).`);
  return replace(state, { ...dataset, status: "released", releasedAt: now.toISOString(), releasedBy: actor.name, projectId, projectName });
}

// withdraw_dataset: a released dataset is retired with a reason; the Team project stays.
export function recordWithdrawal<S extends DemoReleaseState>(state: S, { datasetId, actor, reason, now }: { datasetId: string; actor: LabPerson; reason: string; now: Date }): S {
  requireSigner(state, actor);
  if (!reason.trim()) throw new DataError("Withdrawing a dataset needs a reason.");
  const dataset = find(state, datasetId);
  if (dataset.status !== "released") throw new DataError(`Dataset v${dataset.version} is ${dataset.status}; only a released dataset can be withdrawn.`);
  return replace(state, { ...dataset, status: "withdrawn", archivedAt: now.toISOString(), archivedReason: reason.trim(), releasedBy: dataset.releasedBy, signatures: dataset.signatures, ...{ withdrawnBy: actor.name } });
}

// supersede_dataset: a released version gives way to a newer released version of the same order.
export function recordSupersede<S extends DemoReleaseState>(state: S, { datasetId, newDatasetId, actor, now }: { datasetId: string; newDatasetId: string; actor: LabPerson; now: Date }): S {
  requireSigner(state, actor);
  if (datasetId === newDatasetId) throw new DataError("A dataset cannot supersede itself.");
  const dataset = find(state, datasetId);
  const newer = find(state, newDatasetId);
  if (dataset.status !== "released") throw new DataError(`Dataset v${dataset.version} is ${dataset.status}; only a released dataset can be superseded.`);
  if (newer.orderCode !== dataset.orderCode) throw new DataError(`Dataset ${newer.id} belongs to another order.`);
  if (newer.status !== "released") throw new DataError(`Dataset ${newer.id} (version ${newer.version}) is ${newer.status}; a dataset is superseded only by a released version of the same order.`);
  if (newer.version <= dataset.version) throw new DataError(`Dataset ${newer.id} (version ${newer.version}) is not newer than version ${dataset.version}.`);
  return replace(state, { ...dataset, status: "superseded", archivedAt: now.toISOString(), archivedReason: `superseded by version ${newer.version} (${newer.id})`, ...{ supersededBy: actor.name } });
}

// set_release_policy: the demo Owner only, with the database's checks.
export function setDemoPolicy<S extends DemoReleaseState>(state: S, { eligibleSigners, requiredSignatures, actor, now }: { eligibleSigners: string[]; requiredSignatures: number; actor: LabPerson; now: Date }): S {
  if (actor.role !== "owner") throw new DataError("Only a lab owner may set the release policy.");
  const signers = Array.from(new Set(eligibleSigners.filter(Boolean)));
  const problem = policyProblem(signers, requiredSignatures, demoLabStaff);
  if (problem) throw new DataError(problem);
  return { ...state, releasePolicy: { eligibleSigners: signers, requiredSignatures, setBy: actor.userId, setAt: now.toISOString() } };
}

// ---------------------------------------------------------------- what the order shows

type Actor = { withdrawnBy?: string; supersededBy?: string };
function events(dataset: DemoDataset): HistoryEvent[] {
  const extra = dataset as DemoDataset & Actor;
  const out: HistoryEvent[] = [{ date: dataset.builtAt, title: `Dataset v${dataset.version} built · 3 files recorded`, actor: dataset.builtBy }];
  for (const signature of dataset.signatures) {
    out.push({ date: signature.signedAt, title: `Dataset v${dataset.version} signed · ${signerRoleLabels[signature.role]}${signature.note ? ` · ${signature.note}` : ""}`, actor: signature.name });
  }
  if (dataset.releasedAt) out.push({ date: dataset.releasedAt, title: `Dataset v${dataset.version} released · Team project ${dataset.projectId}`, actor: dataset.releasedBy ?? "" });
  if (dataset.status === "withdrawn" && dataset.archivedAt) out.push({ date: dataset.archivedAt, title: `Dataset v${dataset.version} withdrawn · ${dataset.archivedReason}`, actor: extra.withdrawnBy ?? "" });
  if (dataset.status === "superseded" && dataset.archivedAt) out.push({ date: dataset.archivedAt, title: `Dataset v${dataset.version} superseded by version ${/version (\d+)/.exec(dataset.archivedReason ?? "")?.[1] ?? "?"}`, actor: extra.supersededBy ?? "" });
  return out;
}

function gates(dataset: DemoDataset, policy: ReleasePolicy): Gate[] {
  const list: Gate[] = [{ label: `Frozen dataset v${dataset.version} built`, status: "ok" }];
  for (const signature of dataset.signatures) list.push({ label: `Signature · ${signature.name} (${signerRoleLabels[signature.role]})`, status: "ok" });
  if (dataset.status === "withdrawn" || dataset.status === "superseded") list.push({ label: `Dataset v${dataset.version} ${dataset.status} · ${dataset.archivedReason ?? ""}`, status: "fail" });
  else if (dataset.releasedAt) list.push({ label: `Released · ${datasetStatusLabels[dataset.status]}`, status: "ok" });
  else {
    const progress = releaseProgress(policy, dataset.signatures, demoLabStaff);
    if (progress.missing) list.push({ label: `${progress.missing} more signature${progress.missing === 1 ? "" : "s"} by a different eligible person`, status: "pending" });
  }
  return list;
}

// The example order with its datasets applied: Excel built once a version exists, Released once one was released
// (withdrawing or superseding never moves an order back, like the database), gates and history from the records.
export function applyReleaseState(order: Order, own: DemoDataset[], policy: ReleasePolicy): Order {
  if (!own.length) return order;
  const sorted = [...own].sort((a, b) => a.version - b.version);
  const latest = sorted[sorted.length - 1];
  const live = sorted.filter(dataset => dataset.status === "released").at(-1);
  const history = sorted.flatMap(events).sort((a, b) => b.date.localeCompare(a.date));
  const base = { ...order, stage: Math.max(order.stage, EXCEL_BUILT), history: [...history, ...order.history] };
  if (live) return { ...base, released: true, releasedAt: live.releasedAt ?? undefined, currentDatasetId: live.id, completedSamples: order.sampleCount, gates: gates(live, policy) };
  // Released once, then withdrawn: the order stays Released, but no version is current (the newest build's gates show).
  const last = sorted.filter(dataset => dataset.status === "withdrawn" || dataset.status === "superseded").sort((a, b) => (a.archivedAt ?? "").localeCompare(b.archivedAt ?? "")).at(-1);
  if (!last) return { ...base, released: false, releasedAt: undefined, gates: gates(latest, policy) };
  const retired: Retirement = { version: last.version, status: last.status as Retirement["status"], reason: last.archivedReason ?? "", at: last.archivedAt ?? "" };
  const pending = sorted.filter(dataset => dataset.status === "built" && dataset.version > last.version).at(-1);
  return { ...base, released: true, releasedAt: undefined, retired, completedSamples: order.sampleCount, gates: gates(pending ?? last, policy) };
}

// ---------------------------------------------------------------- a synthetic SCIEX OS export

const LIPIDS = [
  "PC(14:0_16:0)+AcO", "PC(16:0_18:1)+AcO", "PC(18:0_20:4)+AcO", "PE(16:0_18:1)-H", "PE(18:0_20:4)-H", "PS(18:0_18:1)-H", "PI(18:0_20:4)-H",
  "LPC 16:0 +AcO", "LPC 18:0 +AcO", "LPE 18:1 -H", "SM(d18:1/16:0)+H", "SM(d18:1/24:1)+H", "Cer(d18:1/16:0)+H", "Cer(d18:1/24:0)+H", "Cer(d19:1/20:0)+ H",
  "HexCer(d18:1/16:0)+H", "CE 16:0 +NH4", "CE 18:2 +NH4", "CE 24:4 +NH4", "TAG(16:0_18:1_18:1)+NH4", "TAG(18:0_18:1_18:2)+NH4", "DAG(16:0_18:1)+NH4",
  "DAG(20:0_20:4)+NH4", "DAG(20:0_20:4)+NH4 b", "FA 18:1 -H", "FA 20:4 -H", "PG(16:0_18:1)-H", "CL(72:8)-2H", "PA(16:0_18:1)-H", "LPI 18:0 -H",
];
const STANDARDS = [
  "PC(15:0_18:1)_SPLASH.IS", "PE(15:0_18:1)_SPLASH.IS", "TAG(17:0_17:1_17:0)_Ultimate_SPLASH_ONE.IS", "SM(d18:1/12:0)_SphingoSPLASH_ONE.IS",
  "LPC 17:0_Sigma.IS", "Cer(d18:1/17:0) (IS)",
];
// A small deterministic generator (xorshift) so one order always builds the same synthetic export.
function random(seed: string) {
  let x = 2166136261;
  for (const char of seed) x = Math.imul(x ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
export function demoSourceText(orderCode: string, sampleNames: string[]): string {
  const next = random(orderCode);
  const columns = [...sampleNames, `${orderCode}_PooledQC_1`, `${orderCode}_Blank_1`];
  const types = [...sampleNames.map(() => "Unknown"), "Quality Control", "Blank"];
  const lines = [`Sample Name\t${columns.join("\t")}`, `Sample Type\t${types.join("\t")}`];
  const area = () => (1400 + Math.floor(next() * 3.7e8)).toString();
  const cell = (type: string, standard: boolean) => {
    const r = next();
    if (type === "Blank") return standard || r < 0.15 ? area() : "N/A";
    if (standard) return area();
    return r < 0.3 ? "N/A" : r < 0.32 ? "0" : area();
  };
  for (const name of [...LIPIDS, ...STANDARDS]) {
    const standard = STANDARDS.includes(name);
    lines.push(`${name}\t${types.map(type => cell(type, standard)).join("\t")}`);
  }
  return `${lines.join("\n")}\n`;
}
