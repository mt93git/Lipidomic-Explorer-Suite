// The Storage screen (0025): the boxes, one box's positions, the aliquots waiting for a box, the search, one aliquot's
// Place / Move / Remove form and its refusals. Data and actions are mocked; synthetic data only.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoragePage from "@/app/(workspace)/storage/page";
import { AliquotForm } from "@/app/(workspace)/storage/aliquot-form";
import { moveAliquotAction, placeAliquotAction } from "@/app/(workspace)/storage/actions";
import { listBox, listBoxes, listUnplaced, searchAliquots, storageAccess } from "@/lib/data/storage";
import { requireWorkspace } from "@/lib/session";
import type { StoredAliquot } from "@/lib/storage";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => ({ view: "staff", role: "Operator" })) }));
vi.mock("@/app/(workspace)/storage/actions", () => ({ placeAliquotAction: vi.fn(), moveAliquotAction: vi.fn(), removeAliquotAction: vi.fn() }));
vi.mock("@/lib/data/freezers", () => ({ freezerCatalog: vi.fn(async () => ({ freezers: [], locations: [], canManage: false })) }));
vi.mock("@/app/(workspace)/storage/freezer-actions", () => ({
  createFreezerAction: vi.fn(), createRackAction: vi.fn(), archiveFreezerAction: vi.fn(), archiveRackAction: vi.fn(), setBoxLocationAction: vi.fn(),
}));
vi.mock("@/lib/data/storage", () => ({
  storageAccess: vi.fn(), listBoxes: vi.fn(), listBox: vi.fn(), listUnplaced: vi.fn(), searchAliquots: vi.fn(),
}));

const at = (box: string, position: string) => ({ box, position, placedAt: "2026-11-05T15:10:00Z" });
const item = (code: string, location: StoredAliquot["location"], extra: Partial<StoredAliquot> = {}): StoredAliquot => ({
  id: `id-${code}`, code, sampleCode: code.replace(/-A\d+$/, ""), clientName: "Example Cedar", orderCode: code.slice(0, 6), archivedReason: null, location, ...extra,
});
const inBox = [item("ORD044-S001-A1", at("F1-R1-B02", "A1")), item("ORD044-S002-A1", at("F1-R1-B02", "A2"), { archivedReason: "used up" })];
const waiting = [item("ORD044-S004-A1", null), item("ORD058-S001-A1", null, { clientName: "Example Meridian" })];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storageAccess).mockResolvedValue({ canWrite: true });
  vi.mocked(listBoxes).mockResolvedValue([{ box: "F1-R1-B01", occupied: 4 }, { box: "F1-R1-B02", occupied: 2 }]);
  vi.mocked(listBox).mockResolvedValue(inBox);
  vi.mocked(listUnplaced).mockResolvedValue(waiting);
  vi.mocked(searchAliquots).mockImplementation(async (text: string) => [...inBox, ...waiting].filter(row => row.code.includes(text.toUpperCase())));
});
const page = async (params: Record<string, string> = {}) => render(await StoragePage({ searchParams: Promise.resolve(params) }));

describe("storage page", () => {
  it("is a lab screen: the boxes with their taken positions and the aliquots waiting for a box", async () => {
    await page();
    expect(requireWorkspace).toHaveBeenCalledWith("staff");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Storage");
    expect(screen.getByText(/Lab work \/ Pipeline/).closest(".eyebrow")).toHaveTextContent("Storage");
    const boxes = screen.getByRole("list", { name: "Boxes" });
    expect(within(boxes).getAllByRole("link").map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["F1-R1-B014 positions taken", "/storage?box=F1-R1-B01"], ["F1-R1-B022 positions taken", "/storage?box=F1-R1-B02"],
    ]);
    expect(listBox).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Waiting for a box · 2" })).toBeVisible();
    const table = screen.getByRole("table", { name: "Aliquots waiting for a box" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Aliquot", "Client", "Order", "Actions"]);
    expect(within(table).getByRole("link", { name: "Place ORD044-S004-A1" })).toHaveAttribute("href", "/storage?act=place&aliquot=ORD044-S004-A1#act");
    expect(within(table).getByRole("link", { name: "ORD058" })).toHaveAttribute("href", "/orders/ORD058");
    expect(within(table).getByText("Example Meridian")).toBeVisible();
  });

  it("opens a box as a table of positions with Move and Remove for each aliquot", async () => {
    await page({ box: "F1-R1-B02" });
    expect(listBox).toHaveBeenCalledWith("F1-R1-B02");
    expect(screen.getByRole("link", { name: /F1-R1-B02/ })).toHaveAttribute("aria-current", "true");
    const table = screen.getByRole("table", { name: "Positions in box F1-R1-B02" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Position", "Aliquot", "Client", "Order", "Placed", "Actions"]);
    const [, first, second] = within(table).getAllByRole("row");
    expect(first).toHaveTextContent(/^A1ORD044-S001-A1Example CedarORD044Nov 5, 2026, 10:10 EST/);
    expect(within(first).getByRole("link", { name: "Move ORD044-S001-A1" })).toHaveAttribute("href", "/storage?box=F1-R1-B02&act=move&aliquot=ORD044-S001-A1#act");
    expect(within(first).getByRole("link", { name: "Remove ORD044-S001-A1" })).toHaveAttribute("href", "/storage?box=F1-R1-B02&act=remove&aliquot=ORD044-S001-A1#act");
    expect(second).toHaveTextContent("Archived: used up");
  });

  it("searches by sample or aliquot code and says where each match is", async () => {
    await page({ q: " ord044-s00 " });
    expect(searchAliquots).toHaveBeenCalledWith("ord044-s00");
    const search = screen.getByRole("search", { name: "Find an aliquot" });
    expect(within(search).getByRole("searchbox", { name: "Sample or aliquot code" })).toHaveValue("ord044-s00");
    const table = screen.getByRole("table", { name: "Aliquots matching ord044-s00" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Aliquot", "Client", "Order", "Location", "Actions"]);
    expect(within(table).getAllByRole("link", { name: "F1-R1-B02" })[0].closest("td")).toHaveTextContent("F1-R1-B02 · A1");
    expect(within(table).getByText("Not in a box")).toBeVisible();
    vi.mocked(searchAliquots).mockResolvedValue([]);
    document.body.innerHTML = "";
    await page({ q: "ORD999" });
    expect(screen.getByText(/No aliquot matches ORD999\./)).toBeVisible();
  });

  it("opens one aliquot's form with what it is and where it is now", async () => {
    await page({ box: "F1-R1-B02", act: "move", aliquot: "ORD044-S001-A1" });
    const panel = screen.getByRole("region", { name: "Move ORD044-S001-A1" });
    expect(panel).toHaveTextContent("ORD044-S001 · Example Cedar · ORD044 · now in box F1-R1-B02, position A1");
    const formEl = within(panel).getByRole("form", { name: "Move ORD044-S001-A1" });
    expect(within(formEl).getByRole("textbox", { name: "New box" })).toBeRequired();
    expect(within(formEl).getByRole("textbox", { name: "Position" })).toBeRequired();
    expect(within(panel).getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/storage?box=F1-R1-B02");
  });

  it("says why an action does not apply instead of offering its form", async () => {
    await page({ act: "place", aliquot: "ORD044-S001-A1" });
    expect(screen.getByRole("region", { name: "Place ORD044-S001-A1" })).toHaveTextContent("ORD044-S001-A1 is already in box F1-R1-B02, position A1. Move it instead.");
    expect(screen.queryByRole("form")).toBeNull();
    document.body.innerHTML = "";
    await page({ act: "remove", aliquot: "ORD044-S004-A1" });
    expect(screen.getByRole("region", { name: "Remove ORD044-S004-A1" })).toHaveTextContent("ORD044-S004-A1 is not in a box. Place it instead.");
  });

  it("confirms a place, a move and a removal from where the aliquot is now", async () => {
    await page({ box: "F1-R1-B02", done: "moved", aliquot: "ORD044-S001-A1" });
    expect(screen.getByRole("status")).toHaveTextContent("ORD044-S001-A1 moved to box F1-R1-B02, position A1. Its old position is kept in the history.");
    document.body.innerHTML = "";
    await page({ done: "removed", aliquot: "ORD044-S004-A1" });
    expect(screen.getByRole("status")).toHaveTextContent("ORD044-S004-A1 removed from storage.");
    document.body.innerHTML = "";
    await page({ done: "placed", aliquot: "<script>" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers no action to someone who may not write", async () => {
    vi.mocked(storageAccess).mockResolvedValue({ canWrite: false });
    await page({ box: "F1-R1-B02", act: "move", aliquot: "ORD044-S001-A1" });
    expect(screen.queryByRole("link", { name: /^(Move|Remove|Place) / })).toBeNull();
    expect(screen.getByRole("region", { name: "Move ORD044-S001-A1" })).toHaveTextContent("Only a lab Owner, Admin or Operator may place, move or remove aliquots.");
  });

  it("says so when nothing is stored and nothing is waiting", async () => {
    vi.mocked(listBoxes).mockResolvedValue([]);
    vi.mocked(listUnplaced).mockResolvedValue([]);
    await page();
    expect(screen.getByText("No aliquot is in a box yet.")).toBeVisible();
    expect(screen.getByText("Every aliquot of a received order is in a box.")).toBeVisible();
  });
});

describe("aliquot form", () => {
  it("sends the aliquot and the slot, and shows a refusal under the button with the typed values kept", async () => {
    vi.mocked(placeAliquotAction).mockResolvedValue({ error: "Box F1-R1-B02 position A1 already holds ORD044-S001-A1.", box: "F1-R1-B02", position: "A1" });
    const user = userEvent.setup();
    render(<AliquotForm action="place" aliquotId="id-ORD044-S004-A1" code="ORD044-S004-A1" />);
    await user.type(screen.getByRole("textbox", { name: "Box" }), "F1-R1-B02");
    await user.type(screen.getByRole("textbox", { name: "Position" }), "A1");
    await user.click(screen.getByRole("button", { name: "Place" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Box F1-R1-B02 position A1 already holds ORD044-S001-A1.");
    const sent = vi.mocked(placeAliquotAction).mock.calls[0][1];
    expect(Object.fromEntries(sent)).toEqual({ aliquotId: "id-ORD044-S004-A1", code: "ORD044-S004-A1", box: "F1-R1-B02", position: "A1" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Box" })).toHaveValue("F1-R1-B02"));
    expect(screen.getByRole("textbox", { name: "Position" })).toHaveValue("A1");
  });

  it("a move names the new box and carries the box it leaves; a removal asks for the reason", async () => {
    vi.mocked(moveAliquotAction).mockResolvedValue({});
    const user = userEvent.setup();
    const { unmount } = render(<AliquotForm action="move" aliquotId="a" code="ORD044-S001-A1" from="F1-R1-B02" />);
    await user.type(screen.getByRole("textbox", { name: "New box" }), "F1-R1-B03");
    await user.type(screen.getByRole("textbox", { name: "Position" }), "C4");
    await user.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() => expect(moveAliquotAction).toHaveBeenCalledOnce());
    expect(vi.mocked(moveAliquotAction).mock.calls[0][1].get("from")).toBe("F1-R1-B02");
    unmount();
    render(<AliquotForm action="remove" aliquotId="a" code="ORD044-S001-A1" from="F1-R1-B02" />);
    expect(screen.getByRole("textbox", { name: "Reason" })).toBeRequired();
    expect(screen.queryByRole("textbox", { name: "Box" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove" })).toHaveClass("secondary");
  });
});
