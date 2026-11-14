import "server-only";
import { cookies } from "next/headers";
import { preferenceCookieOptions } from "../auth-cookies";
import { emptyDemoState, type DemoState } from "../samples-demo";

// The demo's shipments and samples live in this process's memory, one record set per browser, keyed by an
// app-scoped cookie (like the demo view and client cookies). Nothing is written to a database; the records
// vanish when the server restarts. Kept on globalThis so every route bundle and dev reload shares them.
export const demoStoreCookie = "le-admin-demo-store";
const MAX_BROWSERS = 50;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Stores = Map<string, DemoState>;
const stores: Stores = ((globalThis as unknown as { __leAdminDemoStores?: Stores }).__leAdminDemoStores ??= new Map());

export async function readDemoState(): Promise<DemoState> {
  const id = (await cookies()).get(demoStoreCookie)?.value;
  return (id && ID.test(id) ? stores.get(id) : undefined) ?? emptyDemoState();
}

// Call from a server action only: a page render cannot set the cookie.
export async function writeDemoState(state: DemoState): Promise<void> {
  const jar = await cookies();
  let id = jar.get(demoStoreCookie)?.value;
  if (!id || !ID.test(id)) {
    id = crypto.randomUUID();
    jar.set(demoStoreCookie, id, preferenceCookieOptions);
  }
  if (!stores.has(id) && stores.size >= MAX_BROWSERS) stores.delete(stores.keys().next().value as string);
  stores.set(id, state);
}

// ---------------------------------------------------------------- Clients, wave 3 (round 1)
// An optional block preserves the existing sample/release state and the same browser cookie.
type ClientState = DemoState & { clients?: import("./clients").ClientRecord[] };
export async function readDemoClients() {
  return (await readDemoState() as ClientState).clients;
}
export async function writeDemoClients(clients: import("./clients").ClientRecord[]) {
  const state: ClientState = { ...await readDemoState(), clients };
  await writeDemoState(state);
}

// ---------------------------------------------------------------- People, wave 3 (round 2)
// Same pattern: an optional block on the browser's demo state; undefined until the first people write.
type PeopleDemoState = DemoState & { people?: import("../people").PeopleState };
export async function readDemoPeople() {
  return (await readDemoState() as PeopleDemoState).people;
}
export async function writeDemoPeople(people: import("../people").PeopleState) {
  const state: PeopleDemoState = { ...await readDemoState(), people };
  await writeDemoState(state);
}

// ---------------------------------------------------------------- Access requests, F3
// Same pattern. The public Request access page writes here too (a server action can set the cookie without a
// session), so a request sent on this browser shows up in this browser's demo People screen.
type AccessDemoState = DemoState & { accessRequests?: import("../access-requests").AccessRequestState };
export async function readDemoAccess() {
  return (await readDemoState() as AccessDemoState).accessRequests;
}
export async function writeDemoAccess(accessRequests: import("../access-requests").AccessRequestState) {
  const state: AccessDemoState = { ...await readDemoState(), accessRequests };
  await writeDemoState(state);
}

// ---------------------------------------------------------------- Deliverables, F4
// Same pattern. The files' bytes are kept here (base64, 5 MB each at most) so the demo client can download them.
export type DemoDeliverable = import("../deliverables").Deliverable & { data: string };
type DeliverableDemoState = DemoState & { deliverables?: DemoDeliverable[] };
export async function readDemoDeliverables() {
  return (await readDemoState() as DeliverableDemoState).deliverables;
}
export async function writeDemoDeliverables(deliverables: DemoDeliverable[]) {
  const state: DeliverableDemoState = { ...await readDemoState(), deliverables };
  await writeDemoState(state);
}

// ---------------------------------------------------------------- Instruments & panels (0026)
// Same pattern; undefined until the first write, when the example catalog (seedDemoCatalog) is used.
type CatalogDemoState = DemoState & { catalog?: import("./instruments-panels").DemoCatalog };
export async function readDemoCatalog() {
  return (await readDemoState() as CatalogDemoState).catalog;
}
export async function writeDemoCatalog(catalog: import("./instruments-panels").DemoCatalog) {
  const state: CatalogDemoState = { ...await readDemoState(), catalog };
  await writeDemoState(state);
}

// ---------------------------------------------------------------- Storage (0025)
// Same pattern: this browser's box placements (live and archived), undefined until the first place, move or remove.
type StorageDemoState = DemoState & { placements?: import("../storage").DemoPlacement[] };
export async function readDemoPlacements() {
  return (await readDemoState() as StorageDemoState).placements;
}
export async function writeDemoPlacements(placements: import("../storage").DemoPlacement[]) {
  const state: StorageDemoState = { ...await readDemoState(), placements };
  await writeDemoState(state);
}

// ---------------------------------------------------------------- Notifications (0028)
// Same pattern: each demo person's turned-off kinds and the demo send log (the demo never sends: every row is skipped).
export type DemoNotificationLog = import("../notifications").LogEntry & { id: string; at: string };
export type DemoNotifications = { off: Record<string, string[]>; log: DemoNotificationLog[] };
type NotificationDemoState = DemoState & { notifications?: DemoNotifications };
export async function readDemoNotifications(): Promise<DemoNotifications> {
  return (await readDemoState() as NotificationDemoState).notifications ?? { off: {}, log: [] };
}
export async function writeDemoNotifications(notifications: DemoNotifications) {
  const state: NotificationDemoState = { ...await readDemoState(), notifications };
  await writeDemoState(state);
}

// ---------------------------------------------------------------- Dataset workbooks (release preview)
// The demo's stored dataset workbooks, by their SHA-256: what a real build uploads to admin-files. Kept in this
// process's memory like the rest (content-addressed, so browsers can share them), at most 100.
type Workbooks = Map<string, Buffer>;
const workbooks: Workbooks = ((globalThis as unknown as { __leAdminDemoWorkbooks?: Workbooks }).__leAdminDemoWorkbooks ??= new Map());
export function storeDemoWorkbook(sha256: string, bytes: Buffer): void {
  if (!workbooks.has(sha256) && workbooks.size >= 100) workbooks.delete(workbooks.keys().next().value as string);
  workbooks.set(sha256, Buffer.from(bytes));
}
export const readDemoWorkbook = (sha256: string): Buffer | undefined => workbooks.get(sha256);

// ---------------------------------------------------------------- New order drafts (0033)
// Same pattern: this browser's order drafts (open, placed and discarded), undefined until the first Save draft.
type DraftDemoState = DemoState & { orderDrafts?: import("../order-wizard").DemoOrderDraft[] };
export async function readDemoOrderDrafts() {
  return (await readDemoState() as DraftDemoState).orderDrafts ?? [];
}
export async function writeDemoOrderDrafts(orderDrafts: import("../order-wizard").DemoOrderDraft[], base?: DemoState) {
  const state: DraftDemoState = { ...(base ?? await readDemoState()), orderDrafts };
  await writeDemoState(state);
}
