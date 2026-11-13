// What the golden journey's seed, setup, teardown and spec share (docs/admin/admin-golden-journey.md): the run id, the
// names every run derives from it, the one synthetic shipping text and where the evidence goes. Pure: no network.
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

// <UTC yyyymmdd-hhmm>-<4 hex>, e.g. 20261110-2244-3fa9. The retry marker in the credential file.
export const RUN_ID = /^\d{8}-\d{4}-[0-9a-f]{4}$/;
export function newRunId(now = new Date()) {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return `${stamp}-${randomBytes(2).toString("hex")}`;
}

// Everything synthetic: reserved test domain, "(simulated)" and "(synthetic)" in every name, never a real person.
export function runNames(runId) {
  return {
    clientName: `Northwind Lipid Lab (synthetic) ${runId}`,
    orderTitle: `Northwind lipid screen (synthetic) ${runId}`,
    // Made by the spec on Instruments & panels and Storage, archived/removed by the teardown (names carry the run id).
    instrumentName: `Journey LC-MS (synthetic) ${runId}`,
    panelName: `Journey panel (synthetic) ${runId}`,
    boxName: `JNY-${runId}`,
    dana: { name: "Dana Reyes (simulated)", email: `dana.sim+${runId}@admin-staging.test` },
    lee: { name: "Lee Park (simulated)", email: `lee.sim+${runId}@admin-staging.test` },
  };
}

export const REASON = "E2E golden journey finished";
// Written by Paula on Shipping instructions only when the lab has none; the teardown clears it again only if it is
// still this exact text.
export const SHIPPING_TEXT = "Synthetic shipping instructions (golden journey): ship on dry ice, Monday to Thursday, with the order code on every box.";

// Screenshots (desktop/, mobile/), steps.json and the batch files of the last run; git-ignored. Playwright's own
// videos go to journey-evidence/videos (playwright.config.ts). Relative to the directory the run starts in (frontends/admin,
// as for every command in the docs) unless ADMIN_JOURNEY_EVIDENCE names another. No import.meta: Playwright loads this
// file from the spec as CommonJS.
export const evidenceDir = resolve(process.env.ADMIN_JOURNEY_EVIDENCE || "e2e/live/journey-evidence");
