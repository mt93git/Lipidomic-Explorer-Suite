// Freezers & racks (0041): the catalog's demo rules (the same refusals as the database), the Storage screen's
// "Freezers & racks" card, a box's "Freezer · Rack" and the printed box map's. Data and actions are mocked; synthetic data.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoragePage from "@/app/(workspace)/storage/page";
import PrintBoxPage from "@/app/(workspace)/storage/print/page";
import { freezerCatalog } from "@/lib/data/freezers";
import { aliquotPlans, listBox, listBoxes, listUnplaced, searchAliquots, storageAccess } from "@/lib/data/storage";
import {
  catalogView, demoArchiveFreezer, demoArchiveRack, demoCreateFreezer, demoCreateRack, demoSetBoxLocation, initialDemoFreezers, placeLabel,
} from "@/lib/freezers";
import type { StoredAliquot } from "@/lib/storage";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => ({ view: "staff", role: "Admin" })) }));
vi.mock("@/app/(workspace)/storage/actions", () => ({ placeAliquotAction: vi.fn(), moveAliquotAction: vi.fn(), removeAliquotAction: vi.fn() }));
vi.mock("@/app/(workspace)/storage/freezer-actions", () => ({
  createFreezerAction: vi.fn(), createRackAction: vi.fn(), archiveFreezerAction: vi.fn(), archiveRackAction: vi.fn(), setBoxLocationAction: vi.fn(),
}));
vi.mock("@/lib/data/storage", () => ({
  storageAccess: vi.fn(), listBoxes: vi.fn(), listBox: vi.fn(), listUnplaced: vi.fn(), searchAliquots: vi.fn(), aliquotPlans: vi.fn(),
}));
vi.mock("@/lib/data/freezers", () => ({ freezerCatalog: vi.fn() }));

const item = (code: string, position: string): StoredAliquot => ({
  id: `id-${code}`, code, sampleCode: code.replace(/-A\d+$/, ""), clientName: "Example Cedar", orderCode: code.slice(0, 6), archivedReason: null,
  location: { box: "F1-R1-B01", position, placedAt: "2026-11-05T15:10:00Z" },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storageAccess).mockResolvedValue({ canWrite: true });
  vi.mocked(listBoxes).mockResolvedValue([{ box: "F1-R1-B01", occupied: 2 }, { box: "F1-R1-B02", occupied: 1 }]);
  vi.mocked(listBox).mockResolvedValue([item("ORD046-S001-A1", "A1"), item("ORD046-S002-A1", "A2")]);
  vi.mocked(listUnplaced).mockResolvedValue([]);
  vi.mocked(searchAliquots).mockResolvedValue([]);
  vi.mocked(aliquotPlans).mockResolvedValue({ volumeUl: null, nextBatch: null, kind: "original" });
  vi.mocked(freezerCatalog).mockResolvedValue({ ...catalogView(initialDemoFreezers()), canManage: true });
});

describe("freezer catalog rules (demo, as the database)", () => {
  it("adds freezers and racks trimmed, named once; a rack name may repeat in another freezer", () => {
    let state = demoCreateFreezer(initialDemoFreezers(), { name: "  Freezer F2 ", temperature: " −20 °C ", note: "" }, "f2");
    expect(catalogView(state).freezers.find(f => f.id === "f2")).toEqual({ id: "f2", name: "Freezer F2", temperature: "−20 °C", note: null, racks: [] });
    state = demoCreateRack(state, "f2", " Rack 1 ", "f2r1");
    expect(catalogView(state).freezers.find(f => f.id === "f2")?.racks).toEqual([{ id: "f2r1", name: "Rack 1" }]);
    expect(() => demoCreateRack(state, "f2", "Rack 1", "x")).toThrow('Freezer F2 already has a rack named "Rack 1".');
    expect(() => demoCreateFreezer(state, { name: "Freezer F1", temperature: "", note: "" }, "x")).toThrow('A freezer named "Freezer F1" already exists (archived freezers keep their names).');
    expect(() => demoCreateFreezer(state, { name: "  ", temperature: "", note: "" }, "x")).toThrow("Enter the freezer's name.");
  });

  it("sets and clears a box's place; the rack must be in the freezer", () => {
    const start = initialDemoFreezers();
    const f1 = catalogView(start).freezers[0];
    let state = demoSetBoxLocation(start, " F1-R1-B02 ", f1.id, f1.racks[1].id);
    expect(catalogView(state).locations.find(p => p.box === "F1-R1-B02")).toMatchObject({ freezerName: "Freezer F1", rackName: "Rack 2" });
    state = demoCreateRack(demoCreateFreezer(state, { name: "Freezer F2", temperature: "", note: "" }, "f2"), "f2", "Rack 9", "f2r9");
    expect(() => demoSetBoxLocation(state, "F1-R1-B02", f1.id, "f2r9")).toThrow("Rack Rack 9 is not in freezer Freezer F1.");
    expect(() => demoSetBoxLocation(state, "F1-R1-B02", null, "f2r9")).toThrow("Choose the freezer the rack is in.");
    state = demoSetBoxLocation(state, "F1-R1-B02", null, null);
    expect(catalogView(state).locations.find(p => p.box === "F1-R1-B02")).toBeUndefined();
  });

  it("archives, never deletes: refused while a box is there; a freezer's racks go with it", () => {
    const start = initialDemoFreezers();
    const f1 = catalogView(start).freezers[0];
    expect(() => demoArchiveRack(start, f1.racks[0].id, "broken")).toThrow("Rack Rack 1 still holds box F1-R1-B01; move the boxes to another rack first.");
    expect(() => demoArchiveFreezer(start, f1.id, "replaced")).toThrow("Freezer Freezer F1 still holds box F1-R1-B01; move the boxes to another freezer first.");
    expect(() => demoArchiveFreezer(start, f1.id, " ")).toThrow("Say why it is archived (500 characters at most).");
    const cleared = demoSetBoxLocation(start, "F1-R1-B01", null, null);
    const archived = demoArchiveFreezer(cleared, f1.id, "replaced");
    expect(catalogView(archived).freezers).toEqual([]);
    expect(archived.freezers[0]).toMatchObject({ archivedReason: "replaced", racks: [{ archivedReason: "replaced" }, { archivedReason: "replaced" }] });
    expect(() => demoSetBoxLocation(archived, "F1-R1-B01", f1.id, null)).toThrow("Freezer Freezer F1 is archived; choose another one.");
  });

  it("says Freezer · Rack, or the freezer alone", () => {
    expect(placeLabel({ freezerName: "Freezer F1", rackName: "Rack 1" })).toBe("Freezer F1 · Rack 1");
    expect(placeLabel({ freezerName: "Freezer F1", rackName: null })).toBe("Freezer F1");
  });
});

describe("storage page: Freezers & racks", () => {
  const page = async (params: Record<string, string>) => render(await StoragePage({ searchParams: Promise.resolve(params) }));

  it("lists the freezers with their temperature and racks, with forms to add and archive for the Owner or Admin", async () => {
    await page({});
    const card = screen.getByRole("region", { name: "Freezers & racks" });
    expect(card).toHaveTextContent("Freezer F1");
    expect(card).toHaveTextContent("−80 °C");
    expect(card).toHaveTextContent("Rack 1");
    expect(within(card).getByRole("form", { name: "Add a freezer" })).toBeInTheDocument();
    expect(within(card).getByRole("form", { name: "Add a rack to Freezer F1" })).toBeInTheDocument();
  });

  it("shows only the list to someone who may not manage the catalog", async () => {
    vi.mocked(freezerCatalog).mockResolvedValue({ ...catalogView(initialDemoFreezers()), canManage: false });
    await page({});
    const card = screen.getByRole("region", { name: "Freezers & racks" });
    expect(within(card).queryByRole("form")).toBeNull();
    expect(card).toHaveTextContent("Only a lab Owner or Admin adds or archives freezers and racks.");
  });

  it("names the open box's freezer and rack, in the box list too, and offers to change it", async () => {
    await page({ box: "F1-R1-B01" });
    const box = screen.getByRole("region", { name: "Box F1-R1-B01" });
    expect(box).toHaveTextContent("Freezer F1 · Rack 1");
    expect(within(box).getByRole("combobox", { name: "Freezer and rack" })).toHaveValue("example-freezer-f1|example-rack-f1-r1");
    expect(within(screen.getByRole("list", { name: "Boxes" })).getByRole("link", { name: /F1-R1-B01/ })).toHaveTextContent("Freezer F1 · Rack 1");
  });

  it("says when a box has no place yet", async () => {
    await page({ box: "F1-R1-B02" });
    expect(screen.getByRole("region", { name: "Box F1-R1-B02" })).toHaveTextContent("Freezer and rack not set");
  });

  it("prints Freezer · Rack in the box map's header", async () => {
    render(await PrintBoxPage({ searchParams: Promise.resolve({ box: "F1-R1-B01" }) }));
    expect(screen.getByRole("banner")).toHaveTextContent("Freezer F1 · Rack 1 · −80 °C");
  });
});
