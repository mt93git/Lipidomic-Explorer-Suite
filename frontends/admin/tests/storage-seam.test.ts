// @vitest-environment node
// Storage (0025) through the actions and the data seam: in demo mode (this browser's placements in the demo store)
// and in live mode (the admin functions over rpc). The pure rules the demo shares with the database. Synthetic data only.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { cookies } from "next/headers";
import { moveAliquotAction, placeAliquotAction, removeAliquotAction } from "@/app/(workspace)/storage/actions";
import { getEnvironment } from "@/lib/environment";
import { aliquotPlans, listBox, listBoxes, listUnplaced, moveAliquot, placeAliquot, removeAliquot, searchAliquots } from "@/lib/data/storage";
import { writeDemoState } from "@/lib/data/demo-store";
import { emptyDemoState } from "@/lib/samples-demo";
import { createAdminClient } from "@/lib/supabase/server";
import { byPosition, demoAliquots, demoMove, demoPlace, demoRemove, initialDemoPlacements, parseReason, parseSlot, type StoredAliquot } from "@/lib/storage";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/action-redirect", () => ({ redirectAfterAction: async (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/session", () => ({
  getAppSession: vi.fn(async () => session),
  requireWorkspace: vi.fn(async (audience: string) => {
    if (!session) throw new Error("redirect /sign-in");
    if (audience === "staff" && session.view !== "staff") throw new Error("redirect /client/home");
    return session;
  }),
}));

type Session = { userId: string; role: string; view: "staff" | "client"; displayName: string; mock: true; clients: never[]; selectedClient: null } | null;
const staff: Session = { userId: "example-staff", role: "Operator", view: "staff", displayName: "Demo Operator", mock: true, clients: [], selectedClient: null };
let session: Session = staff;
const jar = new Map<string, string>();
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); jar.clear(); session = staff;
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});

const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const redirected = (promise: Promise<unknown>) => promise.then(value => ({ value }), (error: Error) => ({ redirect: error.message.replace(/^redirect:/, "") }));
const aliquot = (code: string) => demoAliquots.find(item => item.code === code)!;
const where = (rows: StoredAliquot[]) => rows.map(row => [row.code, row.location ? `${row.location.box} ${row.location.position}` : null]);
const NOW = new Date("2026-11-10T15:00:00Z");

describe("the rules the demo shares with the database", () => {
  const free = aliquot("ORD044-S004-A1");
  const placed = aliquot("ORD044-S001-A1"); // F1-R1-B02 A1 at the start
  test("box and position are trimmed; blank is refused; a removal needs a reason", () => {
    expect(parseSlot(form({ box: "  F1-R1-B03 ", position: " A1 " }))).toEqual({ ok: true, box: "F1-R1-B03", position: "A1" });
    expect(parseSlot(form({ box: " ", position: "A1" }))).toEqual({ ok: false, error: "Enter a box." });
    expect(parseSlot(form({ box: "B", position: "" }))).toEqual({ ok: false, error: "Enter a position in the box." });
    expect(parseReason(form({ reason: "  used up " }))).toEqual({ ok: true, reason: "used up" });
    expect(parseReason(form({ reason: "   " })).ok).toBe(false);
    expect(parseReason(form({ reason: "x".repeat(501) })).ok).toBe(false);
  });
  test("place refuses an occupied slot, an aliquot already in a box and a blank slot", () => {
    const placements = initialDemoPlacements();
    expect(() => demoPlace({ placements, aliquotId: free.id, box: "F1-R1-B02", position: "A1", now: NOW, id: "p1" })).toThrow("Box F1-R1-B02 position A1 already holds ORD044-S001-A1.");
    expect(() => demoPlace({ placements, aliquotId: placed.id, box: "F1-R1-B03", position: "A1", now: NOW, id: "p1" })).toThrow("Aliquot ORD044-S001-A1 is already in box F1-R1-B02 position A1; move it instead.");
    expect(() => demoPlace({ placements, aliquotId: free.id, box: " ", position: "A1", now: NOW, id: "p1" })).toThrow("Enter a box.");
    const after = demoPlace({ placements, aliquotId: free.id, box: " F1-R1-B02 ", position: " A4", now: NOW, id: "p1" });
    expect(after.at(-1)).toEqual({ id: "p1", aliquotId: free.id, box: "F1-R1-B02", position: "A4", placedAt: NOW.toISOString(), archivedAt: null, archivedReason: null });
  });
  test("move archives the old placement as moved and adds the new one; remove archives with the reason", () => {
    const moved = demoMove({ placements: initialDemoPlacements(), aliquotId: placed.id, box: "F1-R1-B03", position: "A1", now: NOW, id: "p2" });
    expect(moved.filter(item => item.aliquotId === placed.id).map(item => [item.box, item.position, item.archivedReason])).toEqual([["F1-R1-B02", "A1", "moved"], ["F1-R1-B03", "A1", null]]);
    expect(() => demoMove({ placements: moved, aliquotId: placed.id, box: "F1-R1-B03", position: "A1", now: NOW, id: "p3" })).toThrow("is already in box F1-R1-B03 position A1.");
    expect(() => demoMove({ placements: moved, aliquotId: free.id, box: "X", position: "1", now: NOW, id: "p3" })).toThrow("Aliquot ORD044-S004-A1 is not in a box; place it instead.");
    expect(() => demoRemove({ placements: moved, aliquotId: placed.id, reason: " ", now: NOW })).toThrow(/Say why the aliquot leaves its box/);
    const removed = demoRemove({ placements: moved, aliquotId: placed.id, reason: " used up ", now: NOW });
    expect(removed.filter(item => item.aliquotId === placed.id).map(item => item.archivedReason)).toEqual(["moved", "used up"]);
    expect(() => demoRemove({ placements: removed, aliquotId: placed.id, reason: "again", now: NOW })).toThrow("Aliquot ORD044-S001-A1 is not in a box.");
  });
  test("positions sort as the lab counts them", () => {
    const row = (position: string) => ({ id: position, code: "ORD001-S001-A1", sampleCode: "", clientName: "", orderCode: "", archivedReason: null, location: { box: "B", position, placedAt: "" } });
    expect(["A10", "B1", "A2", "A1"].map(row).sort(byPosition).map(item => item.location.position)).toEqual(["A1", "A2", "A10", "B1"]);
  });
});

describe("demo mode: one browser's placements", () => {
  test("starts with two boxes and the other example aliquots waiting for one", async () => {
    expect(await listBoxes()).toEqual([{ box: "F1-R1-B01", occupied: 4 }, { box: "F1-R1-B02", occupied: 3 }]);
    expect(where(await listBox("F1-R1-B02"))).toEqual([["ORD044-S001-A1", "F1-R1-B02 A1"], ["ORD044-S002-A1", "F1-R1-B02 A2"], ["ORD044-S003-A1", "F1-R1-B02 A3"]]);
    expect((await listUnplaced()).map(row => row.code)).toEqual(["ORD044-S004-A1", "ORD044-S005-A1", "ORD044-S006-A1", "ORD058-S001-A1", "ORD058-S002-A1", "ORD058-S003-A1"]);
    expect(where(await searchAliquots(" ord044-s002 "))).toEqual([["ORD044-S002-A1", "F1-R1-B02 A2"]]);
    expect(await searchAliquots("  ")).toEqual([]);
    const [first] = await listBox("F1-R1-B01");
    expect(first).toMatchObject({ code: "ORD046-S001-A1", clientName: "Example Meridian", orderCode: "ORD046" });
  });

  test("place, move and remove through the actions, each confirmed on the box it ends in", async () => {
    const free = aliquot("ORD058-S001-A1");
    expect(await redirected(placeAliquotAction({}, form({ aliquotId: free.id, code: free.code, box: " F2-R1-B01 ", position: " A1 " }))))
      .toEqual({ redirect: "/storage?box=F2-R1-B01&done=placed&aliquot=ORD058-S001-A1" });
    expect(await redirected(moveAliquotAction({}, form({ aliquotId: free.id, code: free.code, box: "F2-R1-B01", position: "A2" }))))
      .toEqual({ redirect: "/storage?box=F2-R1-B01&done=moved&aliquot=ORD058-S001-A1" });
    expect(where(await searchAliquots(free.code))).toEqual([[free.code, "F2-R1-B01 A2"]]);
    expect(await redirected(removeAliquotAction({}, form({ aliquotId: free.id, code: free.code, from: "F2-R1-B01", reason: "used up in B2026-032" }))))
      .toEqual({ redirect: "/storage?box=F2-R1-B01&done=removed&aliquot=ORD058-S001-A1" });
    expect(await listBox("F2-R1-B01")).toEqual([]);
    expect((await listUnplaced()).map(row => row.code)).toContain(free.code);
  });

  test("a refusal comes back as the form's error with the typed values; nothing is saved", async () => {
    const free = aliquot("ORD044-S004-A1");
    expect(await placeAliquotAction({}, form({ aliquotId: free.id, code: free.code, box: "F1-R1-B01", position: "A1" })))
      .toEqual({ error: "Box F1-R1-B01 position A1 already holds ORD046-S001-A1.", box: "F1-R1-B01", position: "A1" });
    expect(await placeAliquotAction({}, form({ aliquotId: free.id, code: free.code, box: "  ", position: "A9" }))).toEqual({ error: "Enter a box.", box: "  ", position: "A9" });
    expect(await removeAliquotAction({}, form({ aliquotId: free.id, code: free.code, reason: "" }))).toMatchObject({ error: expect.stringMatching(/Say why/) });
    expect(await removeAliquotAction({}, form({ aliquotId: free.id, code: free.code, reason: "lost" }))).toEqual({ error: "Aliquot ORD044-S004-A1 is not in a box.", reason: "lost" });
    expect(await placeAliquotAction({}, form({ aliquotId: free.id, code: "not-a-code", box: "B", position: "1" }))).toMatchObject({ error: "That aliquot is not valid. Reload the page." });
    expect(jar.size).toBe(0); // no write reached the demo store
  });

  test("client users are sent to Client home and nothing changes", async () => {
    session = { ...staff!, view: "client", role: "Requester" };
    const free = aliquot("ORD044-S004-A1");
    expect(await redirected(placeAliquotAction({}, form({ aliquotId: free.id, code: free.code, box: "B", position: "1" })))).toEqual({ redirect: "/client/home" });
    await expect(listBoxes()).rejects.toThrow("redirect /client/home");
    session = null;
    expect(await redirected(moveAliquotAction({}, form({ aliquotId: free.id, code: free.code, box: "B", position: "1" })))).toEqual({ redirect: "/sign-in" });
  });
});

describe("live mode: the admin functions", () => {
  beforeEach(() => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc }) } as never);
  });
  const row = { aliquot_id: "a-uuid", aliquot_code: "ORD041-S001-A1", sample_code: "ORD041-S001", client_id: "c-uuid", client_name: "Example Cedar", order_code: "ORD041", archived_reason: null, box: "F1-R1-B01", position: "A10", placed_at: "2026-11-09T14:00:00Z" };

  test("reads boxes and rows through storage_boxes and storage_aliquots", async () => {
    rpc.mockResolvedValueOnce({ data: [{ box: "F1-R1-B10", occupied: 1 }, { box: "F1-R1-B2", occupied: 3 }], error: null });
    expect(await listBoxes()).toEqual([{ box: "F1-R1-B2", occupied: 3 }, { box: "F1-R1-B10", occupied: 1 }]);
    expect(rpc).toHaveBeenLastCalledWith("storage_boxes");
    rpc.mockResolvedValueOnce({ data: [row, { ...row, aliquot_id: "b-uuid", aliquot_code: "ORD041-S002-A1", position: "A2" }], error: null });
    expect((await listBox("F1-R1-B01")).map(item => item.location?.position)).toEqual(["A2", "A10"]);
    expect(rpc).toHaveBeenLastCalledWith("storage_aliquots", { p_box: "F1-R1-B01", p_search: null });
    rpc.mockResolvedValueOnce({ data: [{ ...row, box: null, position: null, placed_at: null }], error: null });
    expect(await listUnplaced()).toEqual([{ id: "a-uuid", code: "ORD041-S001-A1", sampleCode: "ORD041-S001", clientName: "Example Cedar", orderCode: "ORD041", archivedReason: null, location: null }]);
    expect(rpc).toHaveBeenLastCalledWith("storage_aliquots", { p_box: null, p_search: null });
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    await searchAliquots(" ord041 ");
    expect(rpc).toHaveBeenLastCalledWith("storage_aliquots", { p_box: null, p_search: "ORD041" });
  });

  test("writes through place_aliquot, move_aliquot and remove_aliquot; the database's refusals reach the form", async () => {
    rpc.mockResolvedValue({ data: "p-uuid", error: null });
    await placeAliquot("a-uuid", "F1-R1-B01", "A1");
    expect(rpc).toHaveBeenLastCalledWith("place_aliquot", { p_aliquot_id: "a-uuid", p_box: "F1-R1-B01", p_position: "A1" });
    await moveAliquot("a-uuid", "F1-R1-B02", "B3");
    expect(rpc).toHaveBeenLastCalledWith("move_aliquot", { p_aliquot_id: "a-uuid", p_box: "F1-R1-B02", p_position: "B3" });
    await removeAliquot("a-uuid", "used up");
    expect(rpc).toHaveBeenLastCalledWith("remove_aliquot", { p_aliquot_id: "a-uuid", p_reason: "used up" });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "Box F1-R1-B01 position A1 already holds ORD041-S002-A1" } });
    expect(await placeAliquotAction({}, form({ aliquotId: "a-uuid", code: "ORD041-S001-A1", box: "F1-R1-B01", position: "A1" })))
      .toEqual({ error: "Box F1-R1-B01 position A1 already holds ORD041-S002-A1.", box: "F1-R1-B01", position: "A1" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "only lab staff (owner, admin, operator) may move aliquots" } });
    await expect(moveAliquot("a-uuid", "B", "1")).rejects.toThrow("Only lab Owner, Admin or Operator may change where aliquots are stored.");
  });

  test("a lab member's session never reaches the database", async () => {
    session = { ...staff!, role: "Member" };
    await expect(placeAliquot("a-uuid", "B", "1")).rejects.toThrow("Only lab Owner, Admin or Operator may change where aliquots are stored.");
    expect(rpc).not.toHaveBeenCalled();
  });
});

// a09: the selected position's Volume and Next batch.
describe("aliquot plans", () => {
  const stored: StoredAliquot = { id: "a-uuid", code: "ORD041-S001-A1", sampleCode: "ORD041-S001", clientName: "Example Cedar", orderCode: "ORD041", archivedReason: null, location: null };

  test("live: the aliquot's volume and its next planned batch, read with the signed-in token", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    const calls: Record<string, unknown[][]> = {};
    const answers: Record<string, unknown> = {
      aliquot: { data: { volume_ul: "200" }, error: null },
      injection: { data: [
        { status: "acquired", batch_version: { archived_at: null, batch: { name: "B2026-020", status: "acquired", archived_at: null } } },
        { status: "planned", batch_version: { archived_at: null, batch: { name: "B2026-032", status: "sequence_exported", archived_at: null } } },
      ], error: null },
    };
    const from = (table: string) => {
      const chain: Record<string, unknown> = {};
      calls[table] = [];
      for (const method of ["select", "eq", "is", "maybeSingle"]) chain[method] = (...args: unknown[]) => { calls[table].push([method, ...args]); return chain; };
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(answers[table]).then(resolve);
      return chain;
    };
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ from }) } as never);
    expect(await aliquotPlans(stored)).toEqual({ volumeUl: 200, nextBatch: "B2026-032" });
    expect(calls.aliquot).toEqual([["select", "volume_ul"], ["eq", "id", "a-uuid"], ["maybeSingle"]]);
    expect(calls.injection).toEqual([["select", "status, batch_version!inner(archived_at, batch!inner(name, status, archived_at))"], ["eq", "aliquot_id", "a-uuid"], ["is", "archived_at", null]]);

    answers.aliquot = { data: null, error: { code: "42501", message: "permission denied" } };
    answers.injection = { data: null, error: { code: "42501", message: "permission denied" } };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await aliquotPlans(stored)).toEqual({ volumeUl: null, nextBatch: null });
    quiet.mockRestore();
  });

  test("demo: the demo batches' planned injections of the same sample; no volume is recorded", async () => {
    expect(await aliquotPlans(stored)).toEqual({ volumeUl: null, nextBatch: null });
    const injection = { seq: 1, sample_type: "Unknown", sample_name: "B2026-034_001_ORD041-S001", sampleCode: "ORD041-S001", orderCode: "ORD041", status: "planned" };
    await writeDemoState({ ...emptyDemoState(), batches: [
      { id: "b1", name: "B2026-034", panel: "Example panel", status: "planned", createdAt: "2026-11-10T15:00:00Z", createdBy: "Demo Operator", rules: {} as never, injections: [injection as never], orderCodes: ["ORD041"] },
    ] });
    expect(await aliquotPlans(stored)).toEqual({ volumeUl: null, nextBatch: "B2026-034" });
  });

  test("a client session reads nothing", async () => {
    session = { ...staff!, view: "client" };
    await expect(aliquotPlans(stored)).rejects.toThrow("redirect /client/home");
  });
});

