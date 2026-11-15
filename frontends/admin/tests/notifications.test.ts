// @vitest-environment node
// Email notifications (0028): recipient selection, the person's switches, the allowlist, skipped and failed logging,
// the messages and the Resend request. Every transport here is a fake; nothing reaches Resend. Synthetic data only.
import { describe, expect, it, vi } from "vitest";
import {
  OFF_REASON, allowedDomains, buildMessage, defaultRules, eventLabel, labCell, matrixRows, normalizeRule, deliver, kindsFor, notifyConfig, publicOrigin, resendTransport, runNotification, selectRecipients,
  senderFrom, switchesFor, type AudiencePerson, type Mail, type NotificationEvent, type NotifyConfig,
} from "@/lib/notifications";

const lab = (userId: string, labRole: string, off: string[] = []): AudiencePerson => ({ userId, email: `${userId}@lab.example.test`, labRole, clientRole: null, off });
const member = (userId: string, clientRole: string, off: string[] = [], domain = "cedar.example.test"): AudiencePerson => ({ userId, email: `${userId}@${domain}`, labRole: null, clientRole, off });
const audience: AudiencePerson[] = [
  lab("owner", "owner"), lab("admin", "admin"), lab("operator", "operator", ["access_requested"]), lab("member", "member"),
  member("rowan", "requester"), member("sky", "client_admin", ["dataset_released"]), member("quinn", "viewer", [], "other.example.test"),
];

const accepted: NotificationEvent = { kind: "request_answered", orderId: "o-1", code: "ORD059", title: "Plasma lipids", clientId: "c-1", clientName: "Example Cedar", requestedBy: "rowan", accepted: true, reason: null };
const declined: NotificationEvent = { ...accepted, accepted: false, reason: "We do not run tissue <samples> this quarter." };
const released: NotificationEvent = { kind: "dataset_released", datasetId: "d-1", orderId: "o-1", code: "ORD059", version: 2, clientId: "c-1", clientName: "Example Cedar", requestedBy: "rowan" };
// Every client member of the audience, for the delivery tests (who is picked is tested under "recipient selection").
const members = audience.filter(person => person.clientRole).map(person => ({ userId: person.userId, email: person.email, enabled: !person.off.includes("dataset_released") }));
const requested: NotificationEvent = { kind: "order_requested", orderId: "o-2", code: "ORD060", title: null, clientId: "c-1", clientName: "Example Cedar" };
const access: NotificationEvent = { kind: "access_requested", reference: "AR-0012", fullName: "Kai Sample", organisation: "Example Larch" };

const on: NotifyConfig = { send: true, offReason: OFF_REASON, allow: null, apiKey: "re_test_key", from: "Lipidomics · Libreros Lab <lab@lab.example.test>", origin: "https://lipidomics.example.test" };
const noPause = async () => undefined;

describe("recipient selection", () => {
  it("an answered request goes only to the person who asked, as a member of the client", () => {
    expect(selectRecipients(accepted, audience)).toEqual([{ userId: "rowan", email: "rowan@cedar.example.test", enabled: true }]);
    expect(selectRecipients({ ...accepted, requestedBy: null }, audience)).toEqual([]);
    // The lab opened the order or the person left the client: no member row, no email.
    expect(selectRecipients({ ...accepted, requestedBy: "owner" }, audience)).toEqual([]);
    expect(selectRecipients({ ...accepted, requestedBy: "gone" }, audience)).toEqual([]);
  });

  it("a released dataset goes, by default (0040), to the lab's Operators and every member of the client, viewers too", () => {
    expect(selectRecipients(released, audience).map(r => [r.userId, r.enabled])).toEqual([["operator", true], ["rowan", true], ["sky", false], ["quinn", true]]);
    expect(selectRecipients({ ...released, requestedBy: null }, audience).map(r => r.userId)).toEqual(["operator", "rowan", "sky", "quinn"]);
  });

  it("new order and access requests go to lab Owner, Admin and Operator, not to a lab member or a client", () => {
    expect(selectRecipients(requested, audience).map(r => r.userId)).toEqual(["owner", "admin", "operator"]);
    expect(selectRecipients(access, audience).map(r => [r.userId, r.enabled])).toEqual([["owner", true], ["admin", true], ["operator", false]]);
  });

  it("one email per person even with two audience rows; rows without an address are dropped", () => {
    const twice = [lab("owner", "owner"), { ...member("owner", "client_admin"), email: "owner@lab.example.test" }, { ...member("blank", "viewer"), email: "  " }];
    expect(selectRecipients(released, twice)).toEqual([{ userId: "owner", email: "owner@lab.example.test", enabled: true }]);
    expect(selectRecipients(requested, twice)).toHaveLength(1);
  });
});

describe("switches", () => {
  it("each view sees its own kinds, on unless turned off", () => {
    // 0040: the lab-only events (order requested, gate failed, results missing, access requested) have no client switch.
    expect(kindsFor("client")).toEqual(["shipment_received", "batch_acquired", "dataset_released", "request_answered"]);
    expect(kindsFor("staff")).toEqual(["shipment_received", "gate_failed", "batch_acquired", "results_missing", "dataset_released", "order_requested", "request_answered", "access_requested"]);
    expect(switchesFor("client", ["dataset_released", "request_answered"]).filter(s => !s.enabled).map(s => s.kind)).toEqual(["dataset_released", "request_answered"]);
    expect(switchesFor("staff", []).every(s => s.enabled)).toBe(true);
  });
});

describe("configuration", () => {
  it("sends only with ADMIN_NOTIFY_ENABLED=true; reads the allowlist, the sender and the public origin", () => {
    expect(notifyConfig({}).send).toBe(false);
    expect(notifyConfig({ ADMIN_NOTIFY_ENABLED: "1" }).send).toBe(false);
    expect(notifyConfig({ ADMIN_NOTIFY_ENABLED: "TRUE" }).send).toBe(false);
    const config = notifyConfig({ ADMIN_NOTIFY_ENABLED: " true ", ADMIN_NOTIFY_ALLOW: " Example.test, @lab.example.test,, ", RESEND_API_KEY: " re_x ", ADMIN_MAIL_FROM: "lab@lab.example.test", ADMIN_PUBLIC_ORIGIN: "https://lipidomics.example.test/" });
    expect(config).toEqual({ send: true, offReason: OFF_REASON, allow: ["example.test", "lab.example.test"], apiKey: "re_x", from: "Lipidomics · Libreros Lab <lab@lab.example.test>", origin: "https://lipidomics.example.test" });
    expect(allowedDomains(" , ")).toBeNull();
    expect(senderFrom("Lab desk <desk@lab.example.test>")).toBe("Lab desk <desk@lab.example.test>");
    expect(senderFrom("")).toBeNull();
    expect(publicOrigin("javascript:alert(1)")).toBeNull();
    expect(publicOrigin("not a url")).toBeNull();
    expect(publicOrigin("http://localhost:3110/admin")).toBe("http://localhost:3110");
  });
});

describe("messages", () => {
  it("accept: short plain text and HTML with a link to the request under the base path", () => {
    const m = buildMessage(accepted, "https://lipidomics.example.test", "/admin-staging");
    expect(m.subject).toBe("Your order request ORD059 was accepted");
    expect(m.text).toContain("The lab accepted your order request ORD059 (Plasma lipids) for Example Cedar.");
    expect(m.text).toContain("https://lipidomics.example.test/admin-staging/orders/ORD059");
    expect(m.text).toContain("Lipidomics · Libreros Lab");
    expect(m.text).toContain("https://lipidomics.example.test/admin-staging/notifications");
    expect(m.html).toContain('<a href="https://lipidomics.example.test/admin-staging/orders/ORD059">');
  });

  it("decline: the lab's reason, escaped in HTML; no link to the archived request", () => {
    const m = buildMessage(declined, "https://lipidomics.example.test", "/admin");
    expect(m.subject).toBe("Your order request ORD059 was declined");
    expect(m.text).toContain("The lab's reason: We do not run tissue <samples> this quarter.");
    expect(m.html).toContain("We do not run tissue &lt;samples&gt; this quarter.");
    expect(m.html).not.toContain("<samples>");
    expect(m.text).not.toContain("/orders/ORD059");
  });

  it("released, new order request and access request; without a public origin there is no link at all", () => {
    expect(buildMessage(released, null).subject).toBe("Dataset released: ORD059 version 2");
    expect(buildMessage(requested, null).subject).toBe("New order request ORD060 from Example Cedar");
    const a = buildMessage(access, null);
    expect(a.subject).toBe("New access request AR-0012");
    expect(a.text).toContain("Kai Sample (Example Larch) asked for access");
    for (const event of [accepted, released, requested, access]) {
      const m = buildMessage(event, null);
      expect(m.text, event.kind).not.toMatch(/https?:/);
      expect(m.html, event.kind).not.toContain("<a ");
    }
  });

  it("a subject stays on one line", () => {
    expect(buildMessage({ ...requested, clientName: "Example\nCedar\r\nBcc: x@example.test" }, null).subject).toBe("New order request ORD060 from Example Cedar Bcc: x@example.test");
  });
});

describe("delivery and the log", () => {
  it("sends one email per enabled recipient and logs each as sent, with the related ids", async () => {
    const transport = vi.fn<(mail: Mail) => Promise<void>>(async () => undefined);
    const entries = await deliver(released, members, { config: on, transport, pause: noPause });
    expect(transport.mock.calls.map(([mail]) => mail.to)).toEqual(["rowan@cedar.example.test", "quinn@other.example.test"]);
    expect(transport.mock.calls[0][0]).toMatchObject({ from: on.from, subject: "Dataset released: ORD059 version 2" });
    expect(entries.map(e => [e.userId, e.status, e.error])).toEqual([["rowan", "sent", null], ["sky", "skipped", "Turned off by the recipient"], ["quinn", "sent", null]]);
    expect(entries[0]).toMatchObject({ kind: "dataset_released", clientId: "c-1", orderId: "o-1", datasetId: "d-1", reference: "ORD059" });
  });

  it("with sending off every recipient is skipped and the transport is never called", async () => {
    const transport = vi.fn(async () => undefined);
    const entries = await deliver(requested, selectRecipients(requested, audience), { config: { ...on, send: false }, transport, pause: noPause });
    expect(transport).not.toHaveBeenCalled();
    expect(entries.map(e => [e.status, e.error])).toEqual([["skipped", OFF_REASON], ["skipped", OFF_REASON], ["skipped", OFF_REASON]]);
    expect(entries[0]).toMatchObject({ clientId: "c-1", orderId: "o-2", datasetId: null, reference: "ORD060" });
  });

  it("the allowlist skips other domains; a turned-off switch is reported before the allowlist", async () => {
    const transport = vi.fn(async () => undefined);
    const entries = await deliver(released, members, { config: { ...on, allow: ["cedar.example.test"] }, transport, pause: noPause });
    expect(entries.map(e => [e.userId, e.status, e.error])).toEqual([["rowan", "sent", null], ["sky", "skipped", "Turned off by the recipient"], ["quinn", "skipped", "Not on ADMIN_NOTIFY_ALLOW"]]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("a refusal, a timeout or a missing key is logged as failed; the others are still sent", async () => {
    const transport = vi.fn(async (mail: Mail) => {
      if (mail.to.startsWith("owner")) throw new Error("Resend answered 422: Invalid `from` field");
      if (mail.to.startsWith("admin")) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    });
    const people = selectRecipients(requested, audience);
    const entries = await deliver(requested, people, { config: on, transport, pause: noPause });
    expect(entries.map(e => [e.userId, e.status, e.error])).toEqual([
      ["owner", "failed", "Resend answered 422: Invalid `from` field"], ["admin", "failed", "No answer from Resend within 5 s"], ["operator", "sent", null],
    ]);
    const unset = await deliver(requested, people, { config: { ...on, apiKey: null }, transport, pause: noPause });
    expect(unset.every(e => e.status === "failed" && e.error === "RESEND_API_KEY or ADMIN_MAIL_FROM is not set")).toBe(true);
  });

  it("pauses between sends, not before the first", async () => {
    const pause = vi.fn(async () => undefined);
    await deliver(requested, selectRecipients(requested, audience), { config: on, transport: async () => undefined, pause });
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it("runNotification: audience for the event's client, then the log; never throws, never names an address in its report", async () => {
    const audienceFor = vi.fn(async () => audience);
    const log = vi.fn(async () => undefined);
    const entries = await runNotification(access, { audience: audienceFor, log, config: { ...on, send: false }, transport: async () => undefined, pause: noPause });
    expect(audienceFor).toHaveBeenCalledWith(null);
    expect(log).toHaveBeenCalledWith(entries);
    await runNotification(released, { audience: audienceFor, log, config: on, transport: async () => undefined, pause: noPause });
    expect(audienceFor).toHaveBeenLastCalledWith("c-1");

    const report = vi.fn();
    expect(await runNotification(released, { audience: async () => { throw new Error("notification_audience failed (42501)"); }, log, config: on, transport: async () => undefined, report })).toEqual([]);
    const failedLog = await runNotification(released, { audience: async () => audience, log: async () => { throw new Error("insert failed (42501)"); }, config: on, transport: async () => undefined, pause: noPause, report });
    expect(failedLog).toHaveLength(4); // 0040: the viewer too
    expect(report.mock.calls.map(([text]) => text)).toEqual([
      "[notifications] dataset_released: nothing sent (notification_audience failed (42501))",
      "[notifications] dataset_released: the send log could not be written (insert failed (42501))",
    ]);
    // Nobody to tell: no log call at all.
    const quiet = vi.fn(async () => undefined);
    expect(await runNotification({ ...accepted, requestedBy: "gone" }, { audience: async () => audience, log: quiet, config: on, transport: async () => undefined })).toEqual([]);
    expect(quiet).not.toHaveBeenCalled();
  });
});

describe("the Resend transport (fake fetch)", () => {
  const mail: Mail = { from: on.from as string, to: "rowan@cedar.example.test", subject: "S", text: "T", html: "<p>T</p>" };

  it("POSTs one email to https://api.resend.com/emails with the key, a timeout signal and no other recipient", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    await resendTransport("re_test_key", fetchImpl as unknown as typeof fetch)(mail);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ from: mail.from, to: ["rowan@cedar.example.test"], subject: "S", text: "T", html: "<p>T</p>" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("a refusal throws Resend's status and message, without the key", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ statusCode: 403, message: "The example.test domain is not verified", name: "validation_error" }), { status: 403 });
    await expect(resendTransport("re_secret", fetchImpl as unknown as typeof fetch)(mail)).rejects.toThrow(/^Resend answered 403: The example.test domain is not verified$/);
    const bare = async () => new Response("oops", { status: 500 });
    await expect(resendTransport("re_secret", bare as unknown as typeof fetch)(mail)).rejects.toThrow(/^Resend answered 500$/);
  });

  it("gives up after the timeout", async () => {
    const hang = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const entries = await deliver(access, [{ userId: "owner", email: "owner@lab.example.test", enabled: true }], {
      config: on, transport: resendTransport("re_test_key", hang as unknown as typeof fetch, 20), pause: noPause,
    });
    expect(entries[0]).toMatchObject({ status: "failed", error: "No answer from Resend within 5 s" });
  });
});

describe("the event x audience matrix (0036)", () => {
  const gate: NotificationEvent = { kind: "gate_failed", orderId: "o-1", code: "ORD059", clientId: "c-1", clientName: "Example Cedar", requestedBy: "rowan", gate: "arrived thawed, condition review", stepOwner: "operator" };
  const shipment: NotificationEvent = { kind: "shipment_received", orderId: "o-1", code: "ORD059", title: "Plasma", clientId: "c-1", clientName: "Example Cedar", requestedBy: "rowan", boxes: 2, condition: "thawed" };
  const labBatch: NotificationEvent = { kind: "batch_acquired", scope: "lab", batch: "B2026-031", orderId: null, code: "B2026-031", clientId: null, clientName: null, orders: ["ORD059", "ORD061"] };
  const clientBatch: NotificationEvent = { kind: "batch_acquired", scope: "client", batch: "B2026-031", orderId: "o-1", code: "ORD059", clientId: "c-1", clientName: "Example Cedar", requestedBy: "rowan" };
  const late: NotificationEvent = { kind: "results_missing", orderId: "o-1", code: "ORD059", title: null, clientId: "c-1", clientName: "Example Cedar", requestedBy: "rowan", days: 3, acquiredAt: "2026-11-09T15:00:00Z" };

  it("the defaults read as the prototype: Admin; owner of the step; Operator; Operator, Admin; Operator", () => {
    const rows = matrixRows([]);
    expect(rows.map(row => [eventLabel(row.kind, row.days), labCell(row), row.clientAdmin, row.requester])).toEqual([
      ["Shipment received", "Admin", true, true],
      ["Gate failed", "owner of the step", false, false],
      ["Batch acquired", "Operator", false, true],
      ["No results TXT 3 days after acquisition", "Operator, Admin", false, false],
      ["Dataset released", "Operator", true, true],
      ["Order requested", "Operator, Admin, Owner", false, false],
      ["Order request answered", "—", false, true],
      ["Access requested", "Operator, Admin, Owner", false, false],
    ]);
    // A stored row replaces its default; the order stays the matrix's.
    const changed = { ...defaultRules.gate_failed, labRoles: ["owner" as const] };
    expect(matrixRows([changed])[1]).toBe(changed);
    expect(labCell(changed)).toBe("Owner of the step, Owner");
    expect(eventLabel("results_missing", 1)).toBe("No results TXT 1 day after acquisition");
  });

  it("normalizeRule checks a row like admin.set_notification_rule", () => {
    const base = { kind: "batch_acquired", labRoles: ["admin", "operator", "admin"], stepOwner: false, clientAdmin: true, requester: false, days: null };
    expect(normalizeRule(base)).toEqual({ kind: "batch_acquired", labRoles: ["operator", "admin"], stepOwner: false, clientAdmin: true, requester: false, clientMembers: false, days: null });
    expect(normalizeRule({ ...base, kind: "invitation" })).toBeNull();
    expect(normalizeRule({ ...base, labRoles: ["member"] })).toBeNull();
    expect(normalizeRule({ ...base, stepOwner: true })).toBeNull();
    expect(normalizeRule({ ...base, days: "3" })).toBeNull();
    expect(normalizeRule({ ...base, kind: "access_requested" })).toBeNull();
    expect(normalizeRule({ ...base, kind: "results_missing", clientAdmin: false, days: "5" })?.days).toBe(5);
    for (const days of [null, "0", "61", "2.5", "x"]) expect(normalizeRule({ ...base, kind: "results_missing", days }), String(days)).toBeNull();
    expect(normalizeRule({ ...base, kind: "gate_failed", clientAdmin: false, stepOwner: true })?.stepOwner).toBe(true);
  });

  it("each cell picks its people: lab roles, the owner of the step, the client's admins, the order's requester", () => {
    expect(selectRecipients(shipment, audience).map(r => r.userId)).toEqual(["admin", "rowan", "sky"]);
    expect(selectRecipients(gate, audience).map(r => r.userId)).toEqual(["operator"]);
    // A lab Member is never the owner of a step; nobody when the step has no owner.
    expect(selectRecipients({ ...gate, stepOwner: "member" }, audience)).toEqual([]);
    expect(selectRecipients({ ...gate, stepOwner: null }, audience)).toEqual([]);
    expect(selectRecipients(late, audience).map(r => r.userId)).toEqual(["admin", "operator"]);
    // Every cell off: nobody.
    expect(selectRecipients(shipment, audience, { ...defaultRules.shipment_received, labRoles: [], clientAdmin: false, requester: false })).toEqual([]);
    // A lab person who opened the order is no requester.
    expect(selectRecipients({ ...shipment, requestedBy: "owner" }, audience, { ...defaultRules.shipment_received, labRoles: [] }).map(r => r.userId)).toEqual(["sky"]);
  });

  it("a batch event's lab copy reaches only lab staff, each client copy only that client's people", () => {
    const row = { ...defaultRules.batch_acquired, clientAdmin: true };
    expect(selectRecipients(labBatch, audience, row).map(r => r.userId)).toEqual(["operator"]);
    expect(selectRecipients(clientBatch, audience, row).map(r => r.userId)).toEqual(["rowan", "sky"]);
  });

  it("the new emails: short, with the order or batch and a link; a client's batch email names only its order", () => {
    const origin = "https://lipidomics.example.test";
    expect(buildMessage(shipment, origin, "/admin").text).toContain("The lab received the samples for order ORD059 (Plasma) of Example Cedar (2 boxes), thawed.\n\nFollow the order in Lipidomics Admin:\n\nhttps://lipidomics.example.test/admin/orders/ORD059");
    expect(buildMessage(gate, origin, "/admin").subject).toBe("Gate failed: ORD059");
    expect(buildMessage(gate, origin, "/admin").text).toContain("A check failed on order ORD059 of Example Cedar: arrived thawed, condition review.");
    const labCopy = buildMessage(labBatch, origin, "/admin");
    expect(labCopy.subject).toBe("Batch acquired: B2026-031");
    expect(labCopy.text).toContain("with orders ORD059, ORD061");
    expect(labCopy.text).toContain("https://lipidomics.example.test/admin/batch-run/B2026-031");
    const clientCopy = buildMessage(clientBatch, origin, "/admin");
    expect(clientCopy.subject).toBe("Samples of ORD059 acquired");
    expect(clientCopy.text).not.toContain("ORD061");
    expect(buildMessage(late, origin, "/admin").subject).toBe("No results TXT for ORD059 after 3 days");
    expect(buildMessage(late, null).text).toContain("Ingest the results in Lipidomics Admin.");
  });
});
