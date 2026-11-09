export type View = "staff" | "client";
export type GateStatus = "ok" | "fail" | "pending";
export type Client = { id: string; name: string; color: string; role?: string };
export type AppSession = {
  userId: string;
  displayName: string;
  role: string;
  view: View;
  mock: boolean;
  clients: Client[];
  // Client users with several memberships pick one; lab staff work across all clients and never select one.
  selectedClient: Client | null;
};
export type Gate = { label: string; status: GateStatus };
export type HistoryEvent = { date: string; title: string; actor: string };
export type Order = {
  code: string;
  clientId: string;
  description: string;
  stage: number;
  sampleCount: number;
  completedSamples: number;
  sampleType: string;
  panel: string;
  due: string;
  received: string;
  owner: string;
  // Batch code (B2026-031). Orders from different clients sharing a batch form a mixed batch.
  batch?: string;
  gates: Gate[];
  history: HistoryEvent[];
  // The order reached Released (a stage never moves back). Whether a version is still available: `retired`.
  released?: boolean;
  // Instant of the second signature as an ISO 8601 timestamp with offset (2026-11-05T16:20:00-05:00); only
  // while a released version is current.
  releasedAt?: string;
  // Released, but no version is current any more: the last released version was withdrawn (or superseded).
  retired?: Retirement;
  // admin.dataset.id of the released, current version (what Open in Nexo opens); absent when none is current.
  currentDatasetId?: string;
};
export type Retirement = { version: number; status: "withdrawn" | "superseded"; reason: string; at: string };

// Ten working states; Released is the terminal outcome of the tenth gate.
export const stages = ["Request", "Received", "Registered", "Extracted", "In batch", "Sequence exported", "Acquired", "Processed", "QC checked", "Excel built"] as const;

export function gateStatus(gates: Gate[]): GateStatus {
  if (gates.some(gate => gate.status === "fail")) return "fail";
  if (!gates.length || gates.some(gate => gate.status === "pending")) return "pending";
  return "ok";
}
