// Access requests (F3, 0020): the public form's checks and states, the per-IP/per-email limit, the demo's records
// (submit, approve, decline, the 90-day erase), the live seam's error mapping, the nav counter and the audit wording.
// Synthetic data only.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessRefusal, accessReference, answerDemoAccess, clientIp, createRateLimiter, defaultRoleFor, demoAccessSeed, eraseExpired, listDemoAccess,
  MAX_PENDING, submitDemoAccess, takeAccessLimit, validateAccessForm, validateApprove, type AccessForm, type AccessRequestState,
} from "@/lib/access-requests";
import { auditSummary, type AuditEvent } from "@/lib/audit";

vi.mock("server-only", () => ({}));
const headerValues = new Map<string, string>();
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: (name: string) => headerValues.get(name) ?? null })), cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn(() => environment) }));
let environment = { mock: false, url: "https://example.test", anonKey: "anon-example" };
vi.mock("@/lib/data/access-requests", async () => {
  const pure = await import("@/lib/access-requests");
  const { DataError } = await import("@/lib/samples");
  return { AccessRefusal: pure.AccessRefusal, DataError, submitAccessRequest: vi.fn() };
});

const { requestAccessAction } = await import("@/app/request-access/actions");
const { submitAccessRequest } = await import("@/lib/data/access-requests");
const { accessLimits } = await import("@/lib/access-requests");

const now = new Date("2026-11-10T14:00:00Z");
const valid: AccessForm = { fullName: " Robin Example ", email: " Robin@Larch.Example.Test ", organisation: " Example Larch ", kind: "company", message: "  " };
const formOf = (values: Partial<AccessForm> & { website?: string }) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...valid, ...values })) data.set(key, value ?? "");
  return data;
};
const clean = { fullName: "Kai Sample", email: "kai@cedar.example.test", organisation: "Example Cedar", kind: "pi_lab" as const, message: null };
const owner = { userId: "example-owner", role: "owner" };

describe("the public form", () => {
  it("cleans the fields: trimmed, the email lower-cased, an empty message is null", () => {
    expect(validateAccessForm(valid)).toEqual({ values: { fullName: "Robin Example", email: "robin@larch.example.test", organisation: "Example Larch", kind: "company", message: null } });
  });
  it("names every problem", () => {
    const result = validateAccessForm({ fullName: " ", email: "robin@", organisation: "", kind: "hospital", message: "x".repeat(2001) });
    expect(result).toEqual({ errors: {
      fullName: "Enter your full name.", email: "Enter a valid email address, like name@example.org.", organisation: "Enter your organisation or lab.",
      kind: "Choose PI lab, internal group or company.", message: "Use 2000 characters at most.",
    } });
    expect(validateAccessForm({ ...valid, fullName: "x".repeat(201) })).toEqual({ errors: { fullName: "Use 200 characters at most." } });
  });
  it("reads the sender's address from the gateway's first X-Forwarded-For entry", () => {
    const get = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
    expect(clientIp(get({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(get({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(get({ "cf-connecting-ip": "192.0.2.9", "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("192.0.2.9");
    expect(clientIp(get({}))).toBe("unknown");
  });
});

describe("the submission limit", () => {
  it("allows max sends per key in a window, then refuses until the window has passed", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    expect([limiter.take("a", 0), limiter.take("a", 10), limiter.take("a", 20)]).toEqual([true, true, false]);
    expect(limiter.take("b", 20)).toBe(true);
    expect(limiter.take("a", 1000)).toBe(true);
  });
  it("keeps a bounded number of keys", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 2 });
    limiter.take("a", 0); limiter.take("b", 0); limiter.take("c", 0);
    expect(limiter.take("a", 1)).toBe(true); // "a" was evicted to make room
  });
  it("5 an hour from one address and 3 a day for one email, whichever runs out first", () => {
    const limits = { ip: createRateLimiter({ max: 5, windowMs: 3_600_000 }), email: createRateLimiter({ max: 3, windowMs: 86_400_000 }) };
    const t = now.getTime();
    expect([1, 2, 3, 4, 5, 6].map(n => takeAccessLimit("203.0.113.7", `p${n}@example.test`, t, limits))).toEqual([true, true, true, true, true, false]);
    expect(takeAccessLimit("203.0.113.7", "p7@example.test", t + 3_600_000, limits)).toBe(true);
    expect(["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4"].map(ip => takeAccessLimit(ip, "same@example.test", t, limits))).toEqual([true, true, true, false]);
  });
});

describe("requestAccessAction", () => {
  beforeEach(() => {
    vi.mocked(submitAccessRequest).mockReset();
    accessLimits.ip.reset(); accessLimits.email.reset();
    headerValues.clear();
    headerValues.set("x-forwarded-for", "203.0.113.9");
  });

  it("sends a clean request and shows the reference", async () => {
    vi.mocked(submitAccessRequest).mockResolvedValue("AR-0013");
    expect(await requestAccessAction({}, formOf({}))).toEqual({ attempt: 1, outcome: { kind: "sent", email: "robin@larch.example.test", reference: "AR-0013" } });
    expect(submitAccessRequest).toHaveBeenCalledWith({ fullName: "Robin Example", email: "robin@larch.example.test", organisation: "Example Larch", kind: "company", message: null });
  });
  it("the trap field: told it was received, nothing stored, no limit spent", async () => {
    expect((await requestAccessAction({}, formOf({ website: "https://spam.example" }))).outcome).toEqual({ kind: "sent", email: "robin@larch.example.test", reference: null });
    expect(submitAccessRequest).not.toHaveBeenCalled();
  });
  it("field errors keep what was typed and spend no limit", async () => {
    const state = await requestAccessAction({ attempt: 3 }, formOf({ email: "nope" }));
    expect(state).toMatchObject({ attempt: 4, errors: { email: expect.any(String) }, values: { email: "nope" } });
    expect(submitAccessRequest).not.toHaveBeenCalled();
  });
  it("an email already waiting shows the pending state; a full queue and a failure do not say why", async () => {
    vi.mocked(submitAccessRequest).mockRejectedValueOnce(new AccessRefusal("pending", "already waiting"));
    expect((await requestAccessAction({}, formOf({}))).outcome).toEqual({ kind: "pending", email: "robin@larch.example.test" });
    vi.mocked(submitAccessRequest).mockRejectedValueOnce(new AccessRefusal("full", "full"));
    expect((await requestAccessAction({}, formOf({ email: "b@example.test" }))).outcome).toEqual({ kind: "full" });
    const { DataError } = await import("@/lib/samples");
    vi.mocked(submitAccessRequest).mockRejectedValueOnce(new DataError("not configured"));
    expect((await requestAccessAction({}, formOf({ email: "c@example.test" }))).outcome).toEqual({ kind: "unavailable" });
  });
  it("the sixth send from one address is limited before the database is asked", async () => {
    vi.mocked(submitAccessRequest).mockResolvedValue("AR-0020");
    for (let n = 0; n < 5; n++) await requestAccessAction({}, formOf({ email: `n${n}@example.test` }));
    expect((await requestAccessAction({}, formOf({ email: "n6@example.test" }))).outcome).toEqual({ kind: "limited" });
    expect(submitAccessRequest).toHaveBeenCalledTimes(5);
  });
  it("the demo is not limited: it only writes this browser's in-memory records", async () => {
    vi.mocked(submitAccessRequest).mockResolvedValue("AR-0021");
    environment = { ...environment, mock: true };
    try {
      for (let n = 0; n < 7; n++) expect((await requestAccessAction({}, formOf({ email: "d@example.test" }))).outcome?.kind).toBe("sent");
    } finally { environment = { ...environment, mock: false }; }
  });
  it("the answer has the same shape for an email with an account and one without: the action never asks", async () => {
    vi.mocked(submitAccessRequest).mockResolvedValueOnce("AR-0030").mockResolvedValueOnce("AR-0031");
    const known = await requestAccessAction({}, formOf({ email: "owner@example.test" }));
    const unknown = await requestAccessAction({}, formOf({ email: "stranger@example.test" }));
    expect(Object.keys(known.outcome!)).toEqual(Object.keys(unknown.outcome!));
    expect(known.outcome?.kind).toBe("sent");
  });
});

describe("the page's states", () => {
  it("renders the five fields, a hidden trap and the way back to sign in; after a send, Request received with the reference", async () => {
    vi.mocked(submitAccessRequest).mockResolvedValue("AR-0013");
    accessLimits.ip.reset(); accessLimits.email.reset();
    const { RequestAccessForm } = await import("@/app/request-access/request-access-form");
    render(<RequestAccessForm />);
    for (const label of ["Full name", "Work email", "Organisation or lab", "Type", "What would you like to measure?"]) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByLabelText("Leave this empty").closest("[aria-hidden]")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Sign in →" })).toHaveAttribute("href", "/sign-in");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Full name"), "Robin Example");
    await user.type(screen.getByLabelText("Work email"), "robin@larch.example.test");
    await user.type(screen.getByLabelText("Organisation or lab"), "Example Larch");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("heading", { name: "Request received." })).toBeInTheDocument();
    expect(screen.getByText("AR-0013")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("the lab will write to robin@larch.example.test");
  });
});

describe("demo records", () => {
  const seed = () => demoAccessSeed(now);
  it("the seed has two pending requests; a submit takes the next reference", () => {
    expect(seed().requests.map(item => item.status)).toEqual(["pending", "pending"]);
    const { state, reference } = submitDemoAccess(seed(), { ...clean, email: "new@example.test" }, now);
    expect(reference).toBe("AR-0013");
    expect(state.requests.at(-1)).toMatchObject({ id: "example-access-13", status: "pending", email: "new@example.test" });
    expect(accessReference(7)).toBe("AR-0007");
  });
  it("one pending request per email; a capped queue", () => {
    expect(() => submitDemoAccess(seed(), clean, now)).toThrow(AccessRefusal);
    const full: AccessRequestState = { next: 1, requests: Array.from({ length: MAX_PENDING }, (_, n) => ({ ...seed().requests[0], id: `example-access-${n}`, email: `p${n}@example.test` })) };
    expect(() => submitDemoAccess(full, { ...clean, email: "x@example.test" }, now)).toThrow(/not taking more/);
  });
  it("lists newest first, with a matching client by organisation name", () => {
    const rows = listDemoAccess(seed(), [{ id: "example-cedar", name: "Example Cedar" }]);
    expect(rows.map(row => [row.reference, row.matchingClientId])).toEqual([["AR-0012", null], ["AR-0011", "example-cedar"]]);
  });
  it("Owner or Admin answers once; the Operator is refused; a decline needs a reason", () => {
    const state = seed();
    expect(() => answerDemoAccess(state, { id: "example-access-12", status: "declined", reason: "x", actor: { userId: "example-staff", role: "operator" }, now })).toThrow(/Owner or Admin/);
    expect(() => answerDemoAccess(state, { id: "example-access-12", status: "declined", reason: " ", actor: owner, now })).toThrow(/needs a reason/);
    const approved = answerDemoAccess(state, { id: "example-access-12", status: "approved", clientId: "c1", invitationId: "i1", actor: owner, now });
    expect(approved.requests.find(item => item.id === "example-access-12")).toMatchObject({ status: "approved", clientId: "c1", invitationId: "i1", decidedBy: "example-owner" });
    expect(() => answerDemoAccess(approved, { id: "example-access-12", status: "declined", reason: "late", actor: owner, now })).toThrow(/already answered/);
  });
  it("erases a request declined more than 90 days ago, keeping its status and dates", () => {
    const declined = answerDemoAccess(seed(), { id: "example-access-11", status: "declined", reason: "Synthetic reason", actor: owner, now: new Date(now.getTime() - 91 * 86_400_000) });
    const recent = answerDemoAccess(declined, { id: "example-access-12", status: "declined", reason: "Recent", actor: owner, now: new Date(now.getTime() - 89 * 86_400_000) });
    const erased = eraseExpired(recent, now);
    expect(erased.requests[0]).toMatchObject({ status: "declined", fullName: null, email: null, organisation: null, message: null, declineReason: null, erasedAt: now.toISOString() });
    expect(erased.requests[0].decidedAt).not.toBeNull();
    expect(erased.requests[1]).toMatchObject({ fullName: "Robin Example", erasedAt: null });
    expect(eraseExpired(erased, now)).toBe(erased);
  });
  it("the approve dialog: Client admin for a new client, Requester for an existing one; exactly one target", () => {
    expect([defaultRoleFor("new"), defaultRoleFor("existing")]).toEqual(["client_admin", "requester"]);
    expect(validateApprove({ target: "new", clientId: "", newClientName: " Example Larch ", newClientKind: "company", role: "viewer" }))
      .toEqual({ target: { newClientName: "Example Larch", newClientKind: "company" }, role: "viewer" });
    expect(validateApprove({ target: "existing", clientId: "c1", newClientName: "x", newClientKind: "", role: "requester" })).toEqual({ target: { clientId: "c1" }, role: "requester" });
    expect(() => validateApprove({ target: "new", clientId: "", newClientName: " ", newClientKind: "company", role: "viewer" })).toThrow(/name is required/);
    expect(() => validateApprove({ target: "existing", clientId: "c1", newClientName: "", newClientKind: "", role: "owner" })).toThrow(/valid client role/);
    expect(() => validateApprove({ target: "both", clientId: "c1", newClientName: "", newClientKind: "", role: "viewer" })).toThrow(/exactly one/);
  });
});

describe("audit wording", () => {
  const event = (action: "INSERT" | "UPDATE", before: Record<string, unknown> | null, after: Record<string, unknown>): AuditEvent =>
    ({ id: 1, createdAt: now.toISOString(), actor: null, entity: "access_request", entityId: "r1", action, before, after }) as AuditEvent;
  const ctx = { people: {}, orders: {}, datasets: {} };
  it("names the request by its reference, never the person", () => {
    expect(auditSummary(event("INSERT", null, { number: 12, status: "pending" }), ctx)).toBe("Access request AR-0012 received");
    expect(auditSummary(event("UPDATE", { number: 12, status: "pending" }, { number: 12, status: "approved" }), ctx)).toBe("Access request AR-0012 approved");
    expect(auditSummary(event("UPDATE", { number: 12, status: "declined", erased_at: null }, { number: 12, status: "declined", erased_at: now.toISOString() }), ctx))
      .toBe("Access request AR-0012: personal data erased (90 days after it was declined)");
  });
});
