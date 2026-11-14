import "server-only";
import { demoClients, demoOrders } from "../demo";
import { getEnvironment } from "../environment";
import { allows, labRoleKey } from "../roles";
import { applyDemoState } from "../samples-demo";
import { DataError } from "../samples";
import { requireWorkspace } from "../session";
import {
  byBox, byPosition, demoMove, demoPlace, demoRemove, demoStorageRows, initialDemoPlacements, nextBatchOf,
  type AliquotPlans, type BoxSummary, type DemoPlacement, type StoredAliquot,
} from "../storage";
import { createAdminClient } from "../supabase/server";
import { readDemoPlacements, readDemoState, writeDemoPlacements } from "./demo-store";

// Storage (0025). Live mode calls the admin functions with the signed-in user's token: storage_boxes and
// storage_aliquots to read (lab staff), place_aliquot, move_aliquot and remove_aliquot to write (lab writers; the
// database checks the role again). Demo mode keeps this browser's placements in the demo store.
const live = () => !getEnvironment().mock;

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

// The database's messages are written for the lab; only the permission refusal is reworded.
function refusal(error: { code?: string; message: string }): DataError {
  if (error.code === "42501" || /permission denied/i.test(error.message)) return new DataError("Only lab Owner, Admin or Operator may change where aliquots are stored.");
  if (error.code === "P0002") return new DataError("That aliquot was not found. Reload the page.");
  return new DataError(/[.!?]$/.test(error.message) ? error.message : `${error.message}.`);
}

type Row = {
  aliquot_id: string; aliquot_code: string; sample_code: string; client_name: string; order_code: string; archived_reason: string | null;
  box: string | null; position: string | null; placed_at: string | null;
};
const fromRow = (row: Row): StoredAliquot => ({
  id: row.aliquot_id, code: row.aliquot_code, sampleCode: row.sample_code, clientName: row.client_name, orderCode: row.order_code, archivedReason: row.archived_reason,
  location: row.box !== null && row.position !== null ? { box: row.box, position: row.position, placedAt: row.placed_at ?? "" } : null,
});

async function liveRows(box: string | null, search: string | null): Promise<StoredAliquot[]> {
  const { data, error } = await (await admin()).rpc("storage_aliquots", { p_box: box, p_search: search });
  if (error) throw refusal(error);
  return ((data ?? []) as Row[]).map(fromRow);
}

// ---------------------------------------------------------------- demo

async function demoPlacements(): Promise<DemoPlacement[]> {
  return (await readDemoPlacements()) ?? initialDemoPlacements();
}
const clientName = (id: string) => demoClients.find(client => client.id === id)?.name ?? "Client";
async function demoRows() {
  const orders = applyDemoState(demoOrders, await readDemoState());
  return demoStorageRows(await demoPlacements(), orders, clientName);
}

// ---------------------------------------------------------------- reads (lab staff)

// Whether the signed-in person may place, move and remove (a lab writer); reading needs lab staff only.
export async function storageAccess(): Promise<{ canWrite: boolean }> {
  const session = await requireWorkspace("staff");
  return { canWrite: allows("storage", labRoleKey(session.role)) };
}

export async function listBoxes(): Promise<BoxSummary[]> {
  await requireWorkspace("staff");
  if (live()) {
    const { data, error } = await (await admin()).rpc("storage_boxes");
    if (error) throw refusal(error);
    return ((data ?? []) as { box: string; occupied: number }[]).map(row => ({ box: row.box, occupied: Number(row.occupied) })).sort(byBox);
  }
  const counts = new Map<string, number>();
  for (const row of await demoRows()) if (row.location) counts.set(row.location.box, (counts.get(row.location.box) ?? 0) + 1);
  return [...counts].map(([box, occupied]) => ({ box, occupied })).sort(byBox);
}

// One box's slots, in position order.
export async function listBox(box: string): Promise<StoredAliquot[]> {
  await requireWorkspace("staff");
  const rows = live() ? await liveRows(box, null) : (await demoRows()).filter(row => row.location?.box === box.trim());
  return rows.map(strip).sort(byPosition);
}

// Aliquots whose code contains the text (a sample code finds that sample's aliquots), any case.
export async function searchAliquots(text: string): Promise<StoredAliquot[]> {
  await requireWorkspace("staff");
  const wanted = text.trim().toUpperCase();
  if (!wanted) return [];
  if (live()) return liveRows(null, wanted);
  return (await demoRows()).filter(row => row.code.includes(wanted) && (!row.archivedReason || row.location)).map(strip);
}

// Live aliquots of received orders that are in no box yet.
export async function listUnplaced(): Promise<StoredAliquot[]> {
  await requireWorkspace("staff");
  if (live()) return liveRows(null, null);
  return (await demoRows()).filter(row => !row.location && !row.archivedReason && row.orderStage >= 1).map(strip);
}

// The selected position's extra lines (a09): the aliquot's recorded volume and the batch it is planned in next. Live:
// admin.aliquot and admin.injection → batch_version → batch with the signed-in token (RLS: lab staff read them). A
// failed read leaves the lines out instead of failing the screen. Demo: the demo batches' Unknowns by sample code
// (the demo's aliquots record no volume).
export async function aliquotPlans(item: StoredAliquot): Promise<AliquotPlans> {
  await requireWorkspace("staff");
  if (!live()) {
    const state = await readDemoState();
    return {
      volumeUl: null,
      nextBatch: nextBatchOf((state.batches ?? []).flatMap(batch => batch.injections
        .filter(row => row.sampleCode === item.sampleCode)
        .map(row => ({ batch: batch.name, batchStatus: batch.status, batchArchived: false, versionArchived: false, injectionStatus: row.status })))),
    };
  }
  const db = await admin();
  type PlanRow = { status: string; batch_version: { archived_at: string | null; batch: { name: string; status: string; archived_at: string | null } | null } | null };
  const [aliquot, injections] = await Promise.all([
    db.from("aliquot").select("volume_ul").eq("id", item.id).maybeSingle(),
    db.from("injection").select("status, batch_version!inner(archived_at, batch!inner(name, status, archived_at))").eq("aliquot_id", item.id).is("archived_at", null),
  ]);
  if (aliquot.error || injections.error) console.error("[storage] aliquot plans failed", { code: (aliquot.error ?? injections.error)?.code });
  const volume = (aliquot.data as { volume_ul: number | string | null } | null)?.volume_ul;
  const rows = ((injections.error ? [] : injections.data ?? []) as PlanRow[]).flatMap(row => row.batch_version?.batch ? [{
    batch: row.batch_version.batch.name, batchStatus: row.batch_version.batch.status, batchArchived: !!row.batch_version.batch.archived_at,
    versionArchived: !!row.batch_version.archived_at, injectionStatus: row.status,
  }] : []);
  return { volumeUl: volume === null || volume === undefined || Number.isNaN(Number(volume)) ? null : Number(volume), nextBatch: nextBatchOf(rows) };
}

function strip(row: StoredAliquot & { orderStage?: number }): StoredAliquot {
  const copy = { ...row };
  delete copy.orderStage;
  return copy;
}

// ---------------------------------------------------------------- writes (lab writers)

async function requireWriter() {
  const { canWrite } = await storageAccess();
  if (!canWrite) throw new DataError("Only lab Owner, Admin or Operator may change where aliquots are stored.");
}

async function demoWrite(change: (placements: DemoPlacement[]) => DemoPlacement[]) {
  await writeDemoPlacements(change(await demoPlacements()));
}

export async function placeAliquot(aliquotId: string, box: string, position: string): Promise<void> {
  await requireWriter();
  if (live()) {
    const { error } = await (await admin()).rpc("place_aliquot", { p_aliquot_id: aliquotId, p_box: box, p_position: position });
    if (error) throw refusal(error);
    return;
  }
  await demoWrite(placements => demoPlace({ placements, aliquotId, box, position, now: new Date(), id: crypto.randomUUID() }));
}

export async function moveAliquot(aliquotId: string, box: string, position: string): Promise<void> {
  await requireWriter();
  if (live()) {
    const { error } = await (await admin()).rpc("move_aliquot", { p_aliquot_id: aliquotId, p_box: box, p_position: position });
    if (error) throw refusal(error);
    return;
  }
  await demoWrite(placements => demoMove({ placements, aliquotId, box, position, now: new Date(), id: crypto.randomUUID() }));
}

export async function removeAliquot(aliquotId: string, reason: string): Promise<void> {
  await requireWriter();
  if (live()) {
    const { error } = await (await admin()).rpc("remove_aliquot", { p_aliquot_id: aliquotId, p_reason: reason });
    if (error) throw refusal(error);
    return;
  }
  await demoWrite(placements => demoRemove({ placements, aliquotId, reason, now: new Date() }));
}
