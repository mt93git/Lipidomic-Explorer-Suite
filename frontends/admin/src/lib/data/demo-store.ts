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
