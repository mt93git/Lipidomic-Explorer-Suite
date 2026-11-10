// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrder, listClients, listOrders } from "@/lib/data/orders";
import { DataError } from "@/lib/samples";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));

type Row = Record<string, unknown>;
const live = { mock: false, url: "https://example.supabase.co", anonKey: "public-example" };

// Rows as PostgREST returns them for the user's token: RLS has already decided which orders exist, and the
// embedded children (shipments, samples, results files, datasets with their signatures) come with each order.
const base = { client_id: "client-cedar", archived_at: null, panel: null, matrix: null, expected_samples: null, requested_by: null, sample: [], shipment: [], result_file: [], dataset: [] };
const order = (fields: Row): Row => ({ ...base, ...fields });
const arrival = (fields: Row = {}): Row => ({ received_at: "2026-11-07T15:00:00Z", received_by: "user-operator", carrier: "FedEx", tracking_number: "7489", box_count: 1, condition: "ok", archived_at: null, ...fields });
const sampleRow = (created_at: string, archived_at: string | null = null): Row => ({ sample_code: "x", created_at, archived_at });

let tables: Record<string, Row[]>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue({ get: () => undefined, set: () => undefined } as never);
  vi.mocked(getEnvironment).mockReturnValue(live);
  tables = {
    client: [
      { id: "client-cedar", name: "Cedar Lab", archived_at: null },
      { id: "client-atlas", name: "Atlas Group", archived_at: null },
    ],
    lab_staff: [{ user_id: "user-operator", display_name: "Op One", archived_at: null }, { user_id: "user-owner", display_name: "Owner One", archived_at: null }],
    order: [
      order({ id: "o-41", code: "ORD041", order_number: 41, title: "Plasma pilot", stage: "request", created_at: "2026-11-01T14:00:00Z", expected_samples: 12 }),
      order({
        id: "o-42", code: "ORD042", order_number: 42, title: "Liver panel", stage: "registered", created_at: "2026-11-02T14:00:00Z", matrix: "Liver",
        expected_samples: 2, panel: { name: "Panel A" },
        shipment: [arrival({ received_at: "2026-11-03T02:30:00Z", condition: "thawed", carrier: "UPS" }), arrival({ received_at: null, received_by: null, condition: null })],
        sample: [sampleRow("2026-11-07T16:00:00Z"), sampleRow("2026-11-07T16:00:00Z"), sampleRow("2026-11-07T16:00:00Z"), sampleRow("2026-11-07T15:30:00Z", "2026-11-07T15:31:00Z")],
      }),
      order({
        id: "o-43", code: "ORD043", order_number: 43, title: "Released study", stage: "released", created_at: "2026-10-01T14:00:00Z", client_id: "client-atlas", expected_samples: 4,
        shipment: [arrival({ received_at: "2026-10-02T15:00:00Z" })],
        sample: [sampleRow("2026-10-03T15:00:00Z"), sampleRow("2026-10-03T15:00:00Z")],
        result_file: [{ sha256: "a".repeat(64), status: "accepted", accepted_at: "2026-10-10T15:00:00Z", accepted_by: "user-operator", archived_at: null, batch: { name: "B2026-031" } }],
        dataset: [
          // As supersede_dataset leaves it: retired, archived, with its reason.
          { id: "ds-1", version: 1, status: "superseded", created_at: "2026-10-12T15:00:00Z", released_at: "2026-10-13T15:00:00Z", archived_at: "2026-10-21T21:00:00Z", archived_reason: "superseded by version 2 (ds-2)", signature: [] },
          { id: "ds-2", version: 2, status: "released", created_at: "2026-10-20T15:00:00Z", released_at: "2026-10-21T20:20:00Z", archived_at: null, signature: [
            { user_id: "user-owner", signed_at: "2026-10-21T19:00:00Z", archived_at: null },
            { user_id: "user-operator", signed_at: "2026-10-21T20:20:00Z", archived_at: null },
          ] },
        ],
      }),
      order({ id: "o-44", code: "ORD044", order_number: 44, title: "Withdrawn", stage: "request", created_at: "2026-11-01T14:00:00Z", archived_at: "2026-11-02T14:00:00Z" }),
    ],
  };
  const db = fakePostgrest(tables);
  vi.mocked(createAdminClient).mockResolvedValue({ schema: (name: string) => (name === "admin" ? { from: db.from } : null) } as never);
});

describe("live orders: the signed-in user's own token, RLS decides", () => {
  it("maps each order row the user can read into the pipeline's view model, skipping archived orders", async () => {
    const orders = await listOrders();
    expect(orders.map(o => o.code)).toEqual(["ORD041", "ORD042", "ORD043"]);
    expect(orders[0]).toMatchObject({
      code: "ORD041", clientId: "client-cedar", description: "Plasma pilot", stage: 0, sampleCount: 12, completedSamples: 0,
      sampleType: "Not specified", panel: "No panel", owner: "Unassigned", received: "", due: "", released: false,
      gates: [{ label: "Shipment received", status: "pending" }],
    });
  });

  it("derives stage, counts, arrival day, gates and history from the embedded rows", async () => {
    const registered = (await listOrders()).find(o => o.code === "ORD042")!;
    expect(registered).toMatchObject({ stage: 2, sampleCount: 3, completedSamples: 3, sampleType: "Liver", panel: "Panel A", batch: undefined });
    // 02:30 UTC on 3 Nov is still 2 Nov in New Haven; a shipment the client announced but the lab never received is not an arrival.
    expect(registered.received).toBe("2026-11-02");
    expect(registered.gates).toEqual([
      { label: "Shipment logged · UPS", status: "ok" },
      { label: "Arrived thawed · condition review", status: "fail" },
      { label: "3 samples registered with metadata", status: "ok" },
    ]);
    expect(registered.history.map(e => [e.date, e.title, e.actor])).toEqual([
      ["2026-11-07T16:00:00Z", "3 samples registered", "Lab staff"],
      ["2026-11-03T02:30:00Z", "Shipment received · UPS 7489 · 1 box · thawed", "Op One"],
      ["2026-11-02T14:00:00Z", "Order created", "Client"],
    ]);
  });

  it("marks a released order with its batch, the released dataset's instant and its signatures", async () => {
    const released = (await listOrders()).find(o => o.code === "ORD043")!;
    expect(released).toMatchObject({ stage: 9, released: true, releasedAt: "2026-10-21T20:20:00Z", batch: "B2026-031", sampleCount: 4, completedSamples: 4, clientId: "client-atlas", currentDatasetId: "ds-2" });
    expect(released.gates).toEqual([
      { label: "Dataset v2 built", status: "ok" },
      { label: "Signature · Owner One", status: "ok" },
      { label: "Signature · Op One", status: "ok" },
      { label: "Released", status: "ok" },
    ]);
    expect(released.retired).toBeUndefined();
    // Superseded versions stay in the record, with their status and reason.
    expect(released.history.slice(0, 2)).toEqual([
      { date: "2026-10-21T21:00:00Z", title: "Dataset v1 superseded · superseded by version 2 (ds-2)", actor: "Lab" },
      { date: "2026-10-21T20:20:00Z", title: "Dataset v2 released", actor: "Lab" },
    ]);
    expect(released.history.map(e => e.title)).toEqual(expect.arrayContaining(["Dataset v1 built", "Dataset v1 released", "Results file accepted · SHA-256 aaaaaaaaaaaa…"]));
  });

  it("tells a release that was withdrawn from a current one, for staff and for the client's own token alike", async () => {
    const signatures = [{ user_id: "user-owner", signed_at: "2026-10-21T19:00:00Z", archived_at: null }, { user_id: "user-operator", signed_at: "2026-10-21T20:20:00Z", archived_at: null }];
    tables.order.push(order({
      id: "o-45", code: "ORD045", order_number: 45, title: "Withdrawn study", stage: "released", created_at: "2026-10-01T14:00:00Z", expected_samples: 2,
      dataset: [
        { id: "ds-45-1", version: 1, status: "withdrawn", created_at: "2026-10-20T15:00:00Z", released_at: "2026-10-21T20:20:00Z", archived_at: "2026-11-02T10:00:00Z", archived_reason: "wrong sample metadata", signature: signatures },
        // A build discarded before signing is not part of the record.
        { id: "ds-45-2", version: 2, status: "built", created_at: "2026-11-03T10:00:00Z", released_at: null, archived_at: "2026-11-03T11:00:00Z", archived_reason: "discarded", signature: [] },
      ],
    }));
    const withdrawn = (await listOrders()).find(o => o.code === "ORD045")!;
    expect(withdrawn).toMatchObject({ stage: 9, released: true, releasedAt: undefined, retired: { version: 1, status: "withdrawn", reason: "wrong sample metadata", at: "2026-11-02T10:00:00Z" } });
    expect(withdrawn.currentDatasetId).toBeUndefined();
    expect(withdrawn.gates).toEqual([
      { label: "Dataset v1 built", status: "ok" },
      { label: "Signature · Owner One", status: "ok" },
      { label: "Signature · Op One", status: "ok" },
      { label: "Dataset v1 withdrawn · wrong sample metadata", status: "fail" },
    ]);
    expect(withdrawn.history.map(e => e.title)).toEqual(["Dataset v1 withdrawn · wrong sample metadata", "Dataset v1 released", "Dataset v1 signed", "Dataset v1 signed", "Dataset v1 built", "Order created"]);

    // A new version built after the withdrawal: still no current release, and its gates are the ones pending.
    (tables.order.at(-1)!.dataset as Row[]).push({ version: 3, status: "built", created_at: "2026-11-04T10:00:00Z", released_at: null, archived_at: null, archived_reason: null, signature: [] });
    const rebuilding = (await getOrder("ORD045"))!.order;
    expect(rebuilding.retired).toMatchObject({ version: 1, status: "withdrawn" });
    expect(rebuilding.gates).toEqual([{ label: "Dataset v3 built", status: "ok" }, { label: "Release signatures", status: "pending" }]);
  });

  it("lists the clients the user can read, with a stable colour each", async () => {
    expect(await listClients()).toEqual([
      { id: "client-atlas", name: "Atlas Group", color: "atlas" },
      { id: "client-cedar", name: "Cedar Lab", color: "cedar" },
    ]);
  });

  it("finds one order by code with its client, and returns null when RLS hides it", async () => {
    const found = await getOrder("ORD042");
    expect(found?.order.code).toBe("ORD042");
    expect(found?.client).toEqual({ id: "client-cedar", name: "Cedar Lab", color: "cedar" });
    // A client member asking for another client's order: PostgREST returns no row, so the page is a 404.
    tables.order.splice(0, tables.order.length, ...tables.order.filter(row => row.client_id === "client-cedar"));
    expect(await getOrder("ORD043")).toBeNull();
    expect(await getOrder("ORD999")).toBeNull();
  });

  it("names who asked for a client request from client_member (0023), a lab name first; the fixed text only when there is none", async () => {
    tables.client_member = [
      { user_id: "user-rowan", display_name: "Rowan Example", archived_at: null },
      { user_id: "user-left", display_name: "Former Member", archived_at: "2026-11-05T00:00:00Z", archived_reason: "left" },
      { user_id: "user-operator", display_name: "Also a client name", archived_at: null },
      { user_id: "user-unnamed", display_name: null, archived_at: null },
    ];
    tables.order.push(
      order({ id: "o-45", code: "ORD045", order_number: 45, title: "Asked", stage: "request", created_at: "2026-11-09T14:00:00Z", review: "pending", requested_by: "user-rowan" }),
      order({ id: "o-46", code: "ORD046", order_number: 46, title: "Asked and left", stage: "request", created_at: "2026-11-09T14:00:00Z", review: "accepted", reviewed_at: "2026-11-09T15:00:00Z", requested_by: "user-left" }),
      order({ id: "o-47", code: "ORD047", order_number: 47, title: "Unnamed", stage: "request", created_at: "2026-11-09T14:00:00Z", review: "pending", requested_by: "user-unnamed" }),
      order({ id: "o-48", code: "ORD048", order_number: 48, title: "Lab", stage: "request", created_at: "2026-11-09T14:00:00Z", review: "pending", requested_by: "user-operator" }),
    );
    const requested = Object.fromEntries((await listOrders()).filter(item => item.request).map(item => [item.code, item.request?.requestedBy]));
    expect(requested).toEqual({ ORD045: "Rowan Example", ORD046: "Former Member", ORD047: "A client member", ORD048: "Op One" });
    expect((await getOrder("ORD045"))?.order.history.at(-1)?.actor).toBe("Rowan Example");
  });

  it("fails closed without an authenticated client", async () => {
    vi.mocked(createAdminClient).mockResolvedValue(null);
    await expect(listOrders()).rejects.toThrow(DataError);
  });
});

describe("demo orders are unchanged", () => {
  it("returns the example orders and clients without touching Supabase", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
    expect((await listOrders()).map(o => o.code)).toContain("ORD041");
    expect((await listClients()).map(c => c.id)).toContain("example-atlas");
    expect((await getOrder("ORD041"))?.client.id).toBe("example-atlas");
    expect(await getOrder("ORD999")).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
