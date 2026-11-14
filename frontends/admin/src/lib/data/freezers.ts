import "server-only";
import { getEnvironment } from "../environment";
import {
  catalogView, demoArchiveFreezer, demoArchiveRack, demoCreateFreezer, demoCreateRack, demoSetBoxLocation, initialDemoFreezers,
  type DemoFreezerState, type FreezerCatalog,
} from "../freezers";
import { allows, labRoleKey } from "../roles";
import { DataError } from "../samples";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoFreezers, writeDemoFreezers } from "./demo-store";

// Freezers & racks (0041). Live mode reads admin.freezer, admin.freezer_rack and admin.storage_box_location with the
// signed-in user's token (RLS: lab staff) and writes through create_freezer, create_freezer_rack, archive_freezer,
// archive_freezer_rack (Owner or Admin) and set_box_location (lab writers); the database checks the role again.
// Demo mode keeps this browser's catalog in the demo store.
const live = () => !getEnvironment().mock;

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
function refusal(error: { code?: string; message: string }): DataError {
  if (error.code === "42501" || /permission denied/i.test(error.message)) return new DataError("Only a lab Owner or Admin may change the freezer list.");
  return new DataError(/[.!?]$/.test(error.message) ? error.message : `${error.message}.`);
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { error } = await (await admin()).rpc(name, args);
  if (error) throw refusal(error);
}

async function demoState(): Promise<DemoFreezerState> {
  return (await readDemoFreezers()) ?? initialDemoFreezers();
}

type FreezerRow = { id: string; name: string; temperature: string | null; note: string | null };
type RackRow = { id: string; freezer_id: string; name: string };
type LocationRow = { box: string; freezer_id: string | null; rack_id: string | null };
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

// The live freezers with their live racks, every box's place, and whether the signed-in person manages the list.
export async function freezerCatalog(): Promise<FreezerCatalog & { canManage: boolean }> {
  const session = await requireWorkspace("staff");
  const canManage = allows("freezers", labRoleKey(session.role));
  if (!live()) return { ...catalogView(await demoState()), canManage };
  const db = await admin();
  const [freezers, racks, boxes] = await Promise.all([
    db.from("freezer").select("id, name, temperature, note").is("archived_at", null),
    db.from("freezer_rack").select("id, freezer_id, name").is("archived_at", null),
    db.from("storage_box_location").select("box, freezer_id, rack_id").not("freezer_id", "is", null),
  ]);
  const failed = freezers.error ?? racks.error ?? boxes.error;
  if (failed) {
    // The freezer list is extra information: a failed read leaves it out instead of failing the Storage screen.
    console.error("[storage] freezer catalog read failed", { code: failed.code });
    return { freezers: [], locations: [], canManage };
  }
  const rackRows = (racks.data ?? []) as RackRow[];
  const freezerRows = ((freezers.data ?? []) as FreezerRow[]).sort((a, b) => natural.compare(a.name, b.name));
  const list = freezerRows.map(row => ({
    ...row, racks: rackRows.filter(rack => rack.freezer_id === row.id).sort((a, b) => natural.compare(a.name, b.name)).map(rack => ({ id: rack.id, name: rack.name })),
  }));
  const locations = ((boxes.data ?? []) as LocationRow[]).flatMap(row => {
    const freezer = freezerRows.find(item => item.id === row.freezer_id);
    if (!freezer) return [];
    const rack = rackRows.find(item => item.id === row.rack_id) ?? null;
    return [{ box: row.box, freezerId: freezer.id, freezerName: freezer.name, temperature: freezer.temperature, rackId: rack?.id ?? null, rackName: rack?.name ?? null }];
  });
  return { freezers: list, locations, canManage };
}

async function requireManager() {
  const session = await requireWorkspace("staff");
  if (!allows("freezers", labRoleKey(session.role))) throw new DataError("Only a lab Owner or Admin may change the freezer list.");
}
async function demoWrite(change: (state: DemoFreezerState) => DemoFreezerState) {
  await writeDemoFreezers(change(await demoState()));
}

export async function createFreezer(input: { name: string; temperature: string; note: string }): Promise<void> {
  await requireManager();
  if (live()) return rpc("create_freezer", { p_name: input.name, p_temperature: input.temperature, p_note: input.note });
  await demoWrite(state => demoCreateFreezer(state, input, crypto.randomUUID()));
}

export async function createRack(freezerId: string, name: string): Promise<void> {
  await requireManager();
  if (live()) return rpc("create_freezer_rack", { p_freezer_id: freezerId, p_name: name });
  await demoWrite(state => demoCreateRack(state, freezerId, name, crypto.randomUUID()));
}

export async function archiveFreezer(id: string, reason: string): Promise<void> {
  await requireManager();
  if (live()) return rpc("archive_freezer", { p_id: id, p_reason: reason });
  await demoWrite(state => demoArchiveFreezer(state, id, reason));
}

export async function archiveRack(id: string, reason: string): Promise<void> {
  await requireManager();
  if (live()) return rpc("archive_freezer_rack", { p_id: id, p_reason: reason });
  await demoWrite(state => demoArchiveRack(state, id, reason));
}

// A lab writer (as for placing aliquots) sets or clears where a box sits.
export async function setBoxLocation(box: string, freezerId: string | null, rackId: string | null): Promise<void> {
  const session = await requireWorkspace("staff");
  if (!allows("storage", labRoleKey(session.role))) throw new DataError("Only lab Owner, Admin or Operator may change where aliquots are stored.");
  if (live()) {
    const { error } = await (await admin()).rpc("set_box_location", { p_box: box, p_freezer_id: freezerId, p_rack_id: rackId });
    if (error) throw new DataError(/[.!?]$/.test(error.message) ? error.message : `${error.message}.`);
    return;
  }
  await demoWrite(state => demoSetBoxLocation(state, box, freezerId, rackId));
}
