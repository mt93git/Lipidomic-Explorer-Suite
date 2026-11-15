import type { AppSession, Client, Gate, Order } from "./models";

// Entirely synthetic UI examples. No measurements or real identities belong here.
export const demoClients: Client[] = [
  { id: "example-atlas", name: "Example Atlas", color: "atlas", role: "Client admin" },
  { id: "example-cedar", name: "Example Cedar", color: "cedar", role: "Requester" },
  { id: "example-meridian", name: "Example Meridian", color: "meridian", role: "Viewer" },
  { id: "example-harbor", name: "Example Harbor", color: "harbor", role: "Requester" },
  { id: "example-juniper", name: "Example Juniper", color: "juniper", role: "Viewer" },
];

export const demoPanels = ["Panel A · broad lipidome", "Panel B · sphingolipids", "Panel C · sterols & CE", "Custom MRM list"];
export const demoOwners = ["Demo Operator", "Demo Analyst", "Demo Reviewer A"];

// Lab staff land on the all-clients overview; only client users with several memberships choose one.
export const demoSession: AppSession = {
  userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true,
  clients: demoClients, selectedClient: null,
};

// The example client user: a Requester at Example Cedar and a Viewer at Example Harbor, so the portal shows both a
// client choice and a client's orders. Live client members show their email (client_member stores no name).
export const demoClientSession: AppSession = {
  userId: "example-client", displayName: "rowan@cedar.example.test", role: "Requester", view: "client", mock: true,
  clients: [demoClients[1], { ...demoClients[3], role: "Viewer" }], selectedClient: null,
};

const ready: Gate[] = [
  { label: "Order information reviewed", status: "ok" },
  { label: "Sample identifiers verified", status: "ok" },
  { label: "Operator check complete", status: "ok" },
];
const waiting: Gate[] = [
  { label: "Order information reviewed", status: "ok" },
  { label: "Sample manifest review", status: "pending" },
  { label: "Operator check", status: "pending" },
];
const blockedIds: Gate[] = [
  { label: "Arrival and manifest recorded", status: "ok" },
  { label: "Two example sample identifiers need review", status: "fail" },
  { label: "Operator approval of the sample registry", status: "pending" },
];
const blockedCondition: Gate[] = [
  { label: "Shipment logged", status: "ok" },
  { label: "Example tubes arrived thawed · condition review", status: "fail" },
  { label: "Requester informed", status: "pending" },
];
const blockedInjection: Gate[] = [
  { label: "Example results file accepted", status: "ok" },
  { label: "Unmatched example injection name", status: "fail" },
  { label: "Exclusion review", status: "pending" },
];
const blockedQc: Gate[] = [
  { label: "Pooled QC CV computed", status: "ok" },
  { label: "Example QC drift above the panel limit", status: "fail" },
  { label: "Reviewer decision", status: "pending" },
];
const awaitingSecondSignature: Gate[] = [
  { label: "Frozen example Excel version built", status: "ok" },
  { label: "First signature · Demo Reviewer A", status: "ok" },
  { label: "Second signature by a different reviewer", status: "pending" },
];
const signed: Gate[] = [
  { label: "Frozen example Excel version built", status: "ok" },
  { label: "First signature · Demo Reviewer A", status: "ok" },
  { label: "Second signature · Demo Reviewer B", status: "ok" },
];

// `released` is the signing instant, ISO 8601 with the lab's offset (America/New_York).
type Extra = { panel?: number; owner?: number; batch?: string; released?: string; received?: string; due?: string };
function example(code: string, client: number, stage: number, description: string, sampleCount: number, gates: Gate[], extra: Extra = {}): Order {
  const released = Boolean(extra.released);
  return {
    code, clientId: demoClients[client].id, description, stage, sampleCount,
    completedSamples: released ? sampleCount : Math.min(sampleCount, Math.round(sampleCount * (stage + 1) / 10)),
    sampleType: "Synthetic plasma", panel: demoPanels[extra.panel ?? 0], due: extra.due ?? "2026-11-18", received: extra.received ?? "2026-11-02",
    owner: demoOwners[extra.owner ?? 0], batch: extra.batch, gates, released, releasedAt: extra.released,
    // A released example has a current (synthetic) dataset, so Open in Nexo and deliverables can refer to it.
    ...(released ? { currentDatasetId: `example-dataset-${code.toLowerCase()}-v1` } : {}),
    history: [
      { date: "2026-11-06T14:35:00Z", title: gates.some(g => g.status === "fail") ? "Gate flagged for review" : "Current stage checks reviewed", actor: demoOwners[extra.owner ?? 0] },
      { date: "2026-11-04T10:15:00Z", title: "Example sample manifest registered", actor: "Demo Operator" },
      { date: "2026-11-02T09:00:00Z", title: "Example order created", actor: "Demo Requester" },
    ],
  };
}

// 0 Request · 1 Received · 2 Registered · 3 Extracted · 4 In batch · 5 Sequence exported · 6 Acquired · 7 Processed · 8 QC reviewed · 9 Excel built
export const demoOrders: Order[] = [
  example("ORD041", 0, 2, "Synthetic plasma pilot · cohort A", 24, blockedIds),
  example("ORD042", 1, 0, "Example lipid panel · feasibility", 12, waiting, { panel: 1 }),
  example("ORD043", 2, 1, "Synthetic serum · arrival review", 18, ready),
  example("ORD044", 1, 3, "Example extraction series", 32, ready, { owner: 1 }),
  example("ORD045", 0, 4, "Synthetic reference pool", 16, waiting, { batch: "B2026-032" }),
  example("ORD046", 2, 5, "Example sequence · panel A", 20, ready, { batch: "B2026-031" }),
  example("ORD047", 1, 5, "Synthetic acquisition series", 28, ready, { panel: 1, batch: "B2026-031" }),
  example("ORD048", 0, 7, "Example processing review", 40, blockedInjection, { owner: 1, batch: "B2026-029" }),
  example("ORD049", 2, 8, "Synthetic QC comparison", 24, ready, { owner: 2 }),
  example("ORD050", 0, 9, "Example dataset · release review", 30, awaitingSecondSignature, { owner: 2 }),
  example("ORD051", 3, 1, "Example shipment · thawed tubes", 36, blockedCondition, { panel: 2 }),
  example("ORD052", 3, 0, "Synthetic sterol screen · request", 8, waiting, { panel: 2, owner: 1 }),
  example("ORD053", 3, 7, "Example processing · shared run", 22, ready, { panel: 2, batch: "B2026-029", owner: 1 }),
  example("ORD054", 4, 2, "Custom MRM pilot · registry", 10, ready, { panel: 3 }),
  example("ORD055", 4, 6, "Synthetic acquisition · custom list", 14, waiting, { panel: 3, batch: "B2026-030" }),
  example("ORD056", 4, 8, "Example QC review · drift", 26, blockedQc, { panel: 3, owner: 2 }),
  example("ORD057", 1, 4, "Synthetic sphingolipid batch", 18, ready, { panel: 1, batch: "B2026-032", owner: 1 }),
  example("ORD058", 2, 3, "Example extraction · cohort B", 30, waiting, { owner: 1 }),
  example("ORD040", 1, 9, "Released example dataset", 12, signed, { released: "2026-11-05T16:20:00-05:00", received: "2026-10-12", due: "2026-11-06" }),
  example("ORD039", 3, 9, "Released sterol example", 16, signed, { panel: 2, released: "2026-11-06T11:05:00-05:00", received: "2026-10-05", due: "2026-11-07" }),
  example("ORD038", 0, 9, "Released example · earlier cohort", 20, signed, { released: "2026-10-21T15:40:00-04:00", received: "2026-09-20", due: "2026-10-24" }),
];
