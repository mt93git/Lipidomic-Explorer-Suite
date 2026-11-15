import { describe, expect, it } from "vitest";
import { demoClients, demoOrders, demoSession } from "@/lib/demo";
import { gateStatus, stages } from "@/lib/models";
import { isMixedBatch, releasedWithin } from "@/lib/pipeline-filters";

describe("example data for the global overview", () => {
  it("covers several clients, every stage, mixed batches, blocked gates and recent releases", () => {
    expect(demoClients.length).toBeGreaterThanOrEqual(5);
    expect(new Set(demoClients.map(c => c.color)).size).toBe(demoClients.length);
    expect(demoOrders.length).toBeGreaterThanOrEqual(18);
    for (let stage = 0; stage < stages.length; stage++) expect(demoOrders.some(o => o.stage === stage && !o.released), stages[stage]).toBe(true);
    for (const client of demoClients) expect(demoOrders.some(o => o.clientId === client.id), client.name).toBe(true);
    const mixed = new Set(demoOrders.filter(o => isMixedBatch(o, demoOrders)).map(o => o.batch));
    expect(mixed.size).toBeGreaterThanOrEqual(2);
    expect(demoOrders.filter(o => !o.released && gateStatus(o.gates) === "fail").length).toBeGreaterThanOrEqual(3);
    expect(demoOrders.filter(o => releasedWithin(o, new Date("2026-11-07T12:00:00Z"))).length).toBeGreaterThanOrEqual(1);
    expect(new Set(demoOrders.map(o => o.code)).size).toBe(demoOrders.length);
  });
  it("stamps every release with an ISO instant that carries its offset", () => {
    const released = demoOrders.filter(o => o.released);
    expect(released.length).toBeGreaterThanOrEqual(3);
    for (const o of released) expect(o.releasedAt, o.code).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/);
  });
  it("never pre-selects a client for lab staff", () => {
    expect(demoSession.view).toBe("staff");
    expect(demoSession.selectedClient).toBeNull();
  });
});
