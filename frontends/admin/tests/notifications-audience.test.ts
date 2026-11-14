// @vitest-environment node
// The 2026-11-14 corrections to who hears about what (migration 0040): lab-only events, the "Client members" column,
// and the email a client gets when the lab confirms a receipt with tubes missing or not intact. Pure: no database, no
// Resend. Synthetic data only.
import { describe, expect, it } from "vitest";
import {
  buildMessage, defaultRules, kindsFor, labOnlyKinds, matrixRows, normalizeRule, ruleAllows, selectRecipients, storedRule,
  type AudiencePerson, type NotificationEvent,
} from "@/lib/notifications";

const lab = (userId: string, labRole: string, off: string[] = []): AudiencePerson => ({ userId, email: `${userId}@lab.example.test`, labRole, clientRole: null, off });
const member = (userId: string, clientRole: string, off: string[] = []): AudiencePerson => ({ userId, email: `${userId}@cedar.example.test`, labRole: null, clientRole, off });
// notification_audience(client c-1): every active lab person and the active members of that client only.
const audience: AudiencePerson[] = [
  lab("owner", "owner"), lab("admin", "admin"), lab("operator", "operator"), lab("member", "member"),
  member("rowan", "requester"), member("sky", "client_admin"), member("quinn", "viewer"), member("vale", "viewer", ["dataset_released"]),
];
const facts = { orderId: "o-1", code: "ORD059", clientId: "c-1", clientName: "Example Cedar", requestedBy: "rowan" };
const released: NotificationEvent = { kind: "dataset_released", datasetId: "d-1", version: 2, ...facts };

describe("item 1: lab-only events", () => {
  it("order requested, gate failed, results missing and access requested have no client cell", () => {
    expect([...labOnlyKinds].sort()).toEqual(["access_requested", "gate_failed", "order_requested", "results_missing"]);
    for (const kind of labOnlyKinds) expect(ruleAllows(kind).client, kind).toBe(false);
    for (const kind of ["shipment_received", "batch_acquired", "dataset_released", "request_answered"] as const) expect(ruleAllows(kind).client, kind).toBe(true);
  });

  it("normalizeRule refuses a client cell on them, like set_notification_rule", () => {
    for (const kind of labOnlyKinds) {
      const base = { kind, labRoles: ["admin"], stepOwner: false, clientAdmin: false, requester: false, clientMembers: false, days: kind === "results_missing" ? 3 : null };
      expect(normalizeRule(base), kind).not.toBeNull();
      for (const cell of ["clientAdmin", "requester", "clientMembers"]) expect(normalizeRule({ ...base, [cell]: true }), `${kind} ${cell}`).toBeNull();
    }
  });

  it("a client's people get no switch for them; lab staff still do", () => {
    expect(kindsFor("client")).toEqual(["shipment_received", "batch_acquired", "dataset_released", "request_answered"]);
    expect(kindsFor("staff")).toEqual(["shipment_received", "gate_failed", "batch_acquired", "results_missing", "dataset_released", "order_requested", "request_answered", "access_requested"]);
  });

  it("the demo mirrors it: a stored demo row with a client cell on a lab-only event falls back to its default", () => {
    const bad = { ...defaultRules.order_requested, clientAdmin: true };
    expect(storedRule("order_requested", bad)).toEqual(defaultRules.order_requested);
    // A row saved before the Client members column keeps its cells and takes the column's default.
    const { clientMembers: _drop, ...old } = { ...defaultRules.dataset_released, labRoles: ["admin" as const] };
    expect(storedRule("dataset_released", old)).toEqual({ ...defaultRules.dataset_released, labRoles: ["admin"] });
    expect(matrixRows([]).filter(row => labOnlyKinds.includes(row.kind)).every(row => !row.clientAdmin && !row.requester && !row.clientMembers)).toBe(true);
  });
});

describe("item 2: the Client members column", () => {
  it("is on by default for Dataset released only", () => {
    expect(matrixRows([]).filter(row => row.clientMembers).map(row => row.kind)).toEqual(["dataset_released"]);
  });

  it("a released dataset reaches every member of the client, viewers too; each person's own switch still applies", () => {
    expect(selectRecipients(released, audience).map(r => [r.userId, r.enabled])).toEqual([
      ["operator", true], ["rowan", true], ["sky", true], ["quinn", true], ["vale", false],
    ]);
  });

  it("nobody outside the client: lab staff only by role, never as members; a batch's lab copy reaches no member", () => {
    const row = { ...defaultRules.dataset_released, labRoles: [] };
    expect(selectRecipients(released, audience, row).map(r => r.userId)).toEqual(["rowan", "sky", "quinn", "vale"]);
    const labBatch: NotificationEvent = { kind: "batch_acquired", scope: "lab", batch: "B2026-031", orderId: null, code: "B2026-031", clientId: null, clientName: null, orders: ["ORD059"] };
    expect(selectRecipients(labBatch, audience, { ...defaultRules.batch_acquired, clientMembers: true }).map(r => r.userId)).toEqual(["operator"]);
  });

  it("turning the column off stops it: back to the client's admins and the requester", () => {
    const off = { ...defaultRules.dataset_released, clientMembers: false };
    expect(selectRecipients(released, audience, off).map(r => r.userId)).toEqual(["operator", "rowan", "sky"]);
  });

  it("normalizeRule takes it for client-facing events", () => {
    const row = normalizeRule({ kind: "shipment_received", labRoles: [], stepOwner: false, clientAdmin: false, requester: false, clientMembers: true, days: null });
    expect(row?.clientMembers).toBe(true);
  });
});

describe("item 3: missing or damaged tubes at receipt", () => {
  const receipt: NotificationEvent = {
    kind: "shipment_received", title: "Plasma lipids", boxes: null, condition: null, ...facts,
    checkin: { expected: 36, checkedIn: 34, missing: 2, notIntact: 2, note: "Tubes S020 and S036 were not in the box; S010 and S034 arrived hemolyzed." },
  };

  it("names the order, the counts and the lab's note, and links to the client's order", () => {
    const message = buildMessage(receipt, "https://lipidomics.example.test", "/admin");
    expect(message.subject).toBe("Receipt of ORD059: 2 tubes missing, 2 not intact");
    expect(message.text).toContain("The lab checked in the samples of order ORD059 (Plasma lipids) for Example Cedar, tube by tube, and found a difference from your manifest.");
    expect(message.text).toContain("Tubes expected: 36. Checked in: 34. Missing: 2. Not intact: 2.");
    expect(message.text).toContain("The lab's note: Tubes S020 and S036 were not in the box; S010 and S034 arrived hemolyzed.");
    expect(message.text).toContain("https://lipidomics.example.test/admin/orders/ORD059");
    expect(message.html).toContain("<a href=\"https://lipidomics.example.test/admin/orders/ORD059\">");
  });

  it("follows the Shipment received row: the client's admins and requester, the lab's Admins; not another kind's people", () => {
    expect(selectRecipients(receipt, audience).map(r => r.userId)).toEqual(["admin", "rowan", "sky"]);
    expect(selectRecipients(receipt, audience, { ...defaultRules.shipment_received, labRoles: [], clientAdmin: false, requester: false })).toEqual([]);
  });
});
