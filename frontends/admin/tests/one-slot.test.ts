// @vitest-environment node
// One slot, one holder (0041): a box position held by a checked-in tube (Receive shipment) cannot take an aliquot in
// Storage, and the other way round. The demo's rules and both demo seams. Synthetic data only.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { writeDemoState } from "@/lib/data/demo-store";
import { checkInTube, getShipmentCheckin } from "@/lib/data/shipment-checkin";
import { placeAliquot } from "@/lib/data/storage";
import { emptyDemoState } from "@/lib/samples-demo";
import { demoCheckIn, withDemoTubes, type CheckinView, type DemoTube } from "@/lib/shipment-checkin";
import { demoAliquots, demoMove, demoPlace, initialDemoPlacements } from "@/lib/storage";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/session", () => ({
  getAppSession: vi.fn(async () => staff),
  requireWorkspace: vi.fn(async () => staff),
}));
const staff = { userId: "example-staff", role: "Operator", view: "staff", displayName: "Demo Operator", mock: true, clients: [], selectedClient: null };
const jar = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks(); jar.clear();
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});

const now = new Date("2026-11-14T15:00:00Z");
const tube = (box: string, position: string, sampleCode = "ORD051-S001", archivedReason?: string): DemoTube => ({
  id: `t-${sampleCode}`, shipmentId: "ship-1", orderCode: sampleCode.slice(0, 6), sampleCode, condition: "intact", note: null, box, position,
  checkedInAt: now.toISOString(), checkedInBy: "Demo Operator", ...(archivedReason ? { archivedReason } : {}),
});
const waiting = demoAliquots.find(item => item.code === "ORD044-S004-A1")!; // in no box at first
const placed = demoAliquots.find(item => item.code === "ORD046-S001-A1")!; // F1-R1-B01 A1 at first

describe("Storage refuses a position a checked-in tube holds", () => {
  test("place and move, in any case; an archived check-in no longer holds it", () => {
    const tubes = [tube("RCV-7", "C4")];
    const message = "Box rcv-7 position c4 holds tube ORD051-S001 (checked in at Receive shipment); choose another position.";
    expect(() => demoPlace({ placements: initialDemoPlacements(), aliquotId: waiting.id, box: "rcv-7", position: "c4", now, id: "p1", tubes })).toThrow(message);
    expect(() => demoMove({ placements: initialDemoPlacements(), aliquotId: placed.id, box: "RCV-7", position: "C4", now, id: "p2", tubes })).toThrow(/holds tube ORD051-S001/);
    const freed = [tube("RCV-7", "C4", "ORD051-S001", "checked in again")];
    expect(demoPlace({ placements: initialDemoPlacements(), aliquotId: waiting.id, box: "RCV-7", position: "C4", now, id: "p3", tubes: freed }).at(-1)).toMatchObject({ box: "RCV-7", position: "C4" });
  });

  test("the demo seam reads this browser's check-ins", async () => {
    await writeDemoState({ ...emptyDemoState(), tubes: [tube("RCV-7", "C4")] });
    await expect(placeAliquot(waiting.id, "RCV-7", "C4")).rejects.toThrow("Box RCV-7 position C4 holds tube ORD051-S001 (checked in at Receive shipment); choose another position.");
    await placeAliquot(waiting.id, "RCV-7", "C5");
  });
});

describe("Receive shipment refuses a position an aliquot holds in Storage", () => {
  const view: CheckinView = {
    orderId: "ORD051", orderCode: "ORD051", clientName: "Example Harbor",
    shipment: { id: "ship-1", receivedAt: now.toISOString(), carrier: "Example courier", boxCount: 1, number: 1, of: 1, receipt: null },
    tubes: withDemoTubes([{ sampleCode: "ORD051-S001", clientSampleId: null }], "ship-1", {}),
  };
  const input = (box: string, position: string) => ({ label: "ORD051-S001", condition: "intact" as const, box, position, note: "" });

  test("the demo rule, in any case", () => {
    const stored = [{ box: "F1-R1-B01", position: "A1", code: "ORD046-S001-A1" }];
    expect(() => demoCheckIn({}, input("f1-r1-b01", "a1"), { view, actor: "Demo Operator", now, id: "t1", stored }))
      .toThrow("Box f1-r1-b01 position A1 already holds aliquot ORD046-S001-A1 in Storage; choose another position.");
    expect(demoCheckIn({}, input("F1-R1-B01", "A9"), { view, actor: "Demo Operator", now, id: "t1", stored }).tube).toMatchObject({ box: "F1-R1-B01", position: "A9" });
  });

  test("the demo seam reads this browser's placements", async () => {
    const checkin = await getShipmentCheckin("ORD051");
    expect(checkin).not.toBeNull();
    const label = checkin!.tubes[0].sampleCode;
    await expect(checkInTube("ORD051", checkin!.shipment.id, { ...input("F1-R1-B01", "A1"), label }))
      .rejects.toThrow("Box F1-R1-B01 position A1 already holds aliquot ORD046-S001-A1 in Storage; choose another position.");
    await checkInTube("ORD051", checkin!.shipment.id, { ...input("F1-R1-B01", "A9"), label });
  });
});
