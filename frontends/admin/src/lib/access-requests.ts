// Access requests (F3, 0020): the public Request access form's rules, its per-IP/per-email submission limit, and
// the demo's records, as pure functions over an immutable state slice (kept per browser in DemoState; the server
// side is data/access-requests.ts). Refusals use the wording of the 0020 database functions they stand in for.
import { clientRoles, type ClientRoleKey } from "./roles";
import { DataError } from "./samples";

export const clientKinds = ["pi_lab", "internal_group", "company"] as const;
export type ClientKind = (typeof clientKinds)[number];
export const clientKindNames: Record<ClientKind, string> = { pi_lab: "PI lab", internal_group: "Internal group", company: "Company" };

export type AccessStatus = "pending" | "approved" | "declined";
// What the lab's People screen shows. Personal fields are null once a declined request has been erased.
export type AccessRequest = {
  id: string; reference: string; createdAt: string; status: AccessStatus;
  fullName: string | null; email: string | null; organisation: string | null; kind: ClientKind; message: string | null;
  decidedAt: string | null; decidedBy: string | null; declineReason: string | null; clientId: string | null; invitationId: string | null;
  erasedAt: string | null; matchingClientId: string | null;
};
export type AccessRequestState = { requests: Omit<AccessRequest, "reference" | "matchingClientId">[]; next: number };

export const LIMITS = { name: 200, email: 254, organisation: 200, message: 2000, reason: 500 } as const;
export const MAX_PENDING = 200;
export const ERASE_AFTER_DAYS = 90;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DAY = 86_400_000;

export const accessReference = (n: number) => `AR-${String(n).padStart(4, "0")}`;

// ---------------------------------------------------------------- the public form

export type AccessForm = { fullName: string; email: string; organisation: string; kind: string; message: string };
export type AccessFormErrors = Partial<Record<keyof AccessForm, string>>;
export type CleanAccessForm = { fullName: string; email: string; organisation: string; kind: ClientKind; message: string | null };

// The checks submit_access_request makes, with a message per field for the form.
export function validateAccessForm(input: AccessForm): { values: CleanAccessForm } | { errors: AccessFormErrors } {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const organisation = input.organisation.trim();
  const message = input.message.trim();
  const errors: AccessFormErrors = {};
  if (!fullName) errors.fullName = "Enter your full name.";
  else if (fullName.length > LIMITS.name) errors.fullName = `Use ${LIMITS.name} characters at most.`;
  if (!EMAIL.test(email) || email.length > LIMITS.email) errors.email = "Enter a valid email address, like name@example.org.";
  if (!organisation) errors.organisation = "Enter your organisation or lab.";
  else if (organisation.length > LIMITS.organisation) errors.organisation = `Use ${LIMITS.organisation} characters at most.`;
  if (!(clientKinds as readonly string[]).includes(input.kind)) errors.kind = "Choose PI lab, internal group or company.";
  if (message.length > LIMITS.message) errors.message = `Use ${LIMITS.message} characters at most.`;
  if (Object.keys(errors).length) return { errors };
  return { values: { fullName, email, organisation, kind: input.kind as ClientKind, message: message || null } };
}

// ---------------------------------------------------------------- the submission limit

// A fixed-window counter per key, in this server process's memory (one Admin process serves the form). It is a
// courtesy limit in front of the database's own caps (one pending request per email, 200 pending in total).
export type RateLimiter = { take: (key: string, now?: number) => boolean; reset: () => void };
export function createRateLimiter({ max, windowMs, maxKeys = 5000 }: { max: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    take(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || now - entry.start >= windowMs) {
        if (!entry && hits.size >= maxKeys) {
          for (const [old, value] of hits) if (now - value.start >= windowMs) hits.delete(old);
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
        }
        hits.set(key, { start: now, count: 1 });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    },
    reset: () => hits.clear(),
  };
}
// 5 sends an hour from one address, 3 a day for one email. Both are spent before the database is asked, so the
// answer never depends on what the database knows about that email.
export const accessLimits = {
  ip: createRateLimiter({ max: 5, windowMs: 3_600_000 }),
  email: createRateLimiter({ max: 3, windowMs: DAY }),
};
export function takeAccessLimit(ip: string, email: string, now = Date.now(), limits = accessLimits) {
  const byIp = limits.ip.take(`ip:${ip}`, now);
  const byEmail = limits.email.take(`email:${email}`, now);
  return byIp && byEmail;
}

// The sender's address as the gateway passed it on (the first X-Forwarded-For entry), for the per-IP limit.
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

// What the public page shows after a send. "sent" and "pending" never say whether the email has an account.
export type AccessOutcome =
  | { kind: "sent"; email: string; reference: string | null }
  | { kind: "pending"; email: string }
  | { kind: "limited" } | { kind: "full" } | { kind: "unavailable" };

// ---------------------------------------------------------------- the approve dialog

export type ApproveTarget = { clientId: string } | { newClientName: string; newClientKind: ClientKind };
// The role the dialog proposes: a new client's first person runs it; someone joining an existing client requests.
export const defaultRoleFor = (target: "new" | "existing"): ClientRoleKey => target === "new" ? "client_admin" : "requester";
export function validateApprove(input: { target: string; clientId: string; newClientName: string; newClientKind: string; role: string }): { target: ApproveTarget; role: ClientRoleKey } {
  if (!(clientRoles as readonly string[]).includes(input.role)) throw new DataError("Choose a valid client role.");
  const role = input.role as ClientRoleKey;
  if (input.target === "existing") {
    if (!input.clientId.trim()) throw new DataError("Choose the client to add this person to.");
    return { target: { clientId: input.clientId.trim() }, role };
  }
  if (input.target !== "new") throw new DataError("Approve into exactly one of: an existing client, or a new client with its name.");
  const name = input.newClientName.trim();
  if (!name) throw new DataError("Client name is required.");
  if (!(clientKinds as readonly string[]).includes(input.newClientKind)) throw new DataError("Choose a valid client kind.");
  return { target: { newClientName: name, newClientKind: input.newClientKind as ClientKind }, role };
}

// ---------------------------------------------------------------- demo records

const nameKey = (name: string | null) => (name ?? "").trim().toLowerCase();
export function demoAccessSeed(now: Date): AccessRequestState {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  const base = { status: "pending" as const, decidedAt: null, decidedBy: null, declineReason: null, clientId: null, invitationId: null, erasedAt: null };
  return {
    next: 13,
    requests: [
      { ...base, id: "example-access-11", createdAt: at(20), fullName: "Kai Sample", email: "kai@cedar.example.test", organisation: "Example Cedar", kind: "pi_lab",
        message: "Postdoc in the group; I need to follow ORD044." },
      { ...base, id: "example-access-12", createdAt: at(3), fullName: "Robin Example", email: "robin@larch.example.test", organisation: "Example Larch", kind: "company",
        message: "About 40 plasma samples on the broad lipidome panel, starting in January." },
    ],
  };
}

// erase_expired_access_requests: declined more than 90 days ago loses its personal data; the row stays.
export function eraseExpired(state: AccessRequestState, now: Date): AccessRequestState {
  const cutoff = now.getTime() - ERASE_AFTER_DAYS * DAY;
  if (!state.requests.some(item => item.status === "declined" && !item.erasedAt && item.decidedAt && Date.parse(item.decidedAt) < cutoff)) return state;
  return { ...state, requests: state.requests.map(item => item.status === "declined" && !item.erasedAt && item.decidedAt && Date.parse(item.decidedAt) < cutoff
    ? { ...item, fullName: null, email: null, organisation: null, message: null, declineReason: null, erasedAt: now.toISOString() } : item) };
}

export function listDemoAccess(state: AccessRequestState, clients: { id: string; name: string; archivedAt?: string | null }[]): AccessRequest[] {
  const n = (id: string) => Number(id.replace(/\D+/g, "")) || 0;
  return [...state.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || n(b.id) - n(a.id)).map(item => ({
    ...item, reference: accessReference(n(item.id)),
    matchingClientId: clients.find(client => !client.archivedAt && item.organisation && nameKey(client.name) === nameKey(item.organisation))?.id ?? null,
  }));
}

// submit_access_request. Throws "pending" / "full" as DataError codes the action maps to the page's states.
export class AccessRefusal extends DataError {
  constructor(readonly code: "pending" | "full", message: string) { super(message); }
}
export function submitDemoAccess(state: AccessRequestState, input: CleanAccessForm, now: Date): { state: AccessRequestState; reference: string } {
  const pending = state.requests.filter(item => item.status === "pending");
  if (pending.some(item => item.email === input.email)) throw new AccessRefusal("pending", "A request for this email address is already waiting for the lab.");
  if (pending.length >= MAX_PENDING) throw new AccessRefusal("full", "The lab is not taking more access requests right now.");
  const id = `example-access-${state.next}`;
  return {
    reference: accessReference(state.next),
    state: { next: state.next + 1, requests: [...state.requests, {
      id, createdAt: now.toISOString(), status: "pending", ...input, decidedAt: null, decidedBy: null, declineReason: null,
      clientId: null, invitationId: null, erasedAt: null,
    }] },
  };
}

// lock_pending_access_request: unknown, or answered already (the PT409 conflict).
export function pendingDemoAccess(state: AccessRequestState, id: string) {
  const item = state.requests.find(request => request.id === id);
  if (!item) throw new DataError("Access request not found.");
  if (item.status !== "pending") throw new DataError(`Access request ${accessReference(Number(id.replace(/\D+/g, "")))} was already answered: it is ${item.status}.`);
  return item;
}
export function requireAccessManager(role: string) {
  if (role !== "owner" && role !== "admin") throw new DataError("Lab Owner or Admin access is required to answer access requests.");
}
export function answerDemoAccess(state: AccessRequestState, input: { id: string; actor: { userId: string; role: string }; now: Date } &
  ({ status: "approved"; clientId: string; invitationId: string } | { status: "declined"; reason: string })): AccessRequestState {
  requireAccessManager(input.actor.role);
  pendingDemoAccess(state, input.id);
  const decided = { decidedAt: input.now.toISOString(), decidedBy: input.actor.userId };
  const change = input.status === "approved"
    ? { status: "approved" as const, clientId: input.clientId, invitationId: input.invitationId, ...decided }
    : (() => {
      const reason = input.reason.trim();
      if (!reason || reason.length > LIMITS.reason) throw new DataError(`Declining a request needs a reason (${LIMITS.reason} characters at most); only the lab reads it.`);
      return { status: "declined" as const, declineReason: reason, ...decided };
    })();
  return { ...state, requests: state.requests.map(item => item.id === input.id ? { ...item, ...change } : item) };
}
