// Instruments & panels (0026): lab Owner or Admin add, edit and archive instruments and panels; other lab staff read
// them. Demo seam (per-browser catalog, the rules of the database functions), live RPCs and reads, server actions and
// the page. Synthetic data only.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jar, state } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  state: { mock: true, session: null as unknown },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => { jar.set(name, value); }, getAll: () => [] }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: () => state.mock ? { mock: true, url: "", anonKey: "" } : { mock: false, url: "https://example.test", anonKey: "anon-example" } }));
vi.mock("@/lib/session", () => ({
  getAppSession: vi.fn(async () => state.session),
  requireWorkspace: vi.fn(async (audience: string) => {
    const session = state.session as { view: string } | null;
    if (!session) throw new Error("redirect:/sign-in");
    if (audience === "staff" && session.view !== "staff") throw new Error("redirect:/client/home");
    return session;
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/action-redirect", () => ({ redirectAfterAction: async (url: string) => { throw new Error(`redirect:${url}`); } }));

const { createAdminClient } = await import("@/lib/supabase/server");
const catalog = await import("@/lib/data/instruments-panels");
const { listPanels } = await import("@/lib/data/orders");
const { writeDemoState, readDemoState } = await import("@/lib/data/demo-store");
const actions = await import("@/app/(workspace)/instruments-panels/actions");
const { default: Page } = await import("@/app/(workspace)/instruments-panels/page");

const staff = (role = "Operator", mock = true) => ({ userId: "example-staff", role, view: "staff", displayName: "Demo lab person", mock, clients: [], selectedClient: null });
const client = { userId: "example-client", role: "Viewer", view: "client", displayName: "Rowan Example", mock: true, clients: [{ id: "example-cedar", name: "Example Cedar", color: "cedar" }], selectedClient: null };
const owner = "example-owner";
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const page = (query: Record<string, string> = {}) => Page({ searchParams: Promise.resolve(query) });
const PANEL_A = "Panel A · broad lipidome";
const CUSTOM = "Custom MRM list";
const QQQ = "demo-instrument-qqq";

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  state.mock = true;
  state.session = staff();
});

describe("parsing the form", () => {
  it("ISTD kits: commas or new lines, trimmed, blanks and repeats dropped, in the order given", () => {
    expect(catalog.parseKits(" Kit A, ,Kit B\nKit A ,, Kit C ")).toEqual(["Kit A", "Kit B", "Kit C"]);
    expect(catalog.parseKits("   ")).toEqual([]);
  });
});

describe("data seam (demo)", () => {
  it("seeds the example panels New order offers, on synthetic instruments, with their orders counted", async () => {
    const { instruments, panels } = await catalog.getCatalog();
    expect(instruments.map(item => [item.name, item.activePanels])).toEqual([["Demo QQQ 1", 3], ["Demo QTOF 1", 1]]);
    expect(panels.map(item => item.name)).toEqual([CUSTOM, PANEL_A, "Panel B · sphingolipids", "Panel C · sterols & CE"]);
    expect(panels.find(item => item.name === CUSTOM)).toMatchObject({ datasetType: "mediators", instrumentName: "Demo QTOF 1" });
    expect(panels.find(item => item.name === PANEL_A)!.orderCount).toBeGreaterThan(0);
    expect((await listPanels()).map(item => item.id)).toEqual([PANEL_A, "Panel B · sphingolipids", "Panel C · sterols & CE", CUSTOM]);
  });

  it("an Owner or Admin adds and edits; an Operator (or an unknown demo person) is refused; names are trimmed and unique", async () => {
    const input = { name: "  Demo Orbitrap  ", model: " Synthetic ", serialNumber: "  ", actorId: owner };
    await expect(catalog.createInstrument({ ...input, actorId: undefined })).rejects.toThrow("Lab Owner or Admin access is required to manage instruments and panels.");
    await expect(catalog.createInstrument({ ...input, actorId: "example-staff" })).rejects.toThrow(/Owner or Admin/);
    await expect(catalog.createInstrument({ ...input, actorId: "nobody" })).rejects.toThrow("Choose a demo lab person.");
    await expect(catalog.createInstrument({ ...input, name: "  " })).rejects.toThrow("Instrument name is required.");
    const id = await catalog.createInstrument(input);
    expect((await catalog.getCatalog()).instruments.find(item => item.id === id)).toMatchObject({ name: "Demo Orbitrap", model: "Synthetic", serialNumber: null, activePanels: 0 });
    await expect(catalog.createInstrument({ ...input, name: "Demo QQQ 1" })).rejects.toThrow('An instrument named "Demo QQQ 1" already exists.');
    await catalog.updateInstrument({ id, name: "Demo Orbitrap 2", model: null, serialNumber: "SYN-9", actorId: "example-reviewer-a" });
    expect((await catalog.getCatalog()).instruments.find(item => item.id === id)).toMatchObject({ name: "Demo Orbitrap 2", serialNumber: "SYN-9" });

    const panel = await catalog.createPanel({ name: " Demo oxylipins ", instrumentId: id, lcMethod: " C18 ", istdKits: [" Kit M ", "Kit M"], datasetType: "mediators", actorId: owner });
    expect((await catalog.getCatalog()).panels.find(item => item.id === panel)).toMatchObject({ name: "Demo oxylipins", instrumentName: "Demo Orbitrap 2", lcMethod: "C18", istdKits: ["Kit M"], orderCount: 0 });
    await expect(catalog.createPanel({ name: PANEL_A, instrumentId: null, lcMethod: null, istdKits: [], datasetType: "global", actorId: owner })).rejects.toThrow(`A panel named "${PANEL_A}" already exists.`);
    await expect(catalog.createPanel({ name: "Typed", instrumentId: null, lcMethod: null, istdKits: [], datasetType: "lipidome", actorId: owner })).rejects.toThrow("Choose a valid dataset type");
    // A new panel is offered by New order; it changes dataset type freely while nothing uses it.
    expect((await listPanels()).map(item => item.name)).toContain("Demo oxylipins");
    await catalog.updatePanel({ id: panel, name: "Demo oxylipins", instrumentId: id, lcMethod: null, istdKits: [], datasetType: "global", actorId: owner });
    expect((await catalog.getCatalog()).panels.find(item => item.id === panel)?.datasetType).toBe("global");
  });

  it("a used panel's dataset type is fixed; other fields change", async () => {
    await expect(catalog.updatePanel({ id: PANEL_A, name: PANEL_A, instrumentId: QQQ, lcMethod: null, istdKits: [], datasetType: "mediators", actorId: owner }))
      .rejects.toThrow(`Panel "${PANEL_A}" is already used by an order or a batch, so its dataset type stays global; create a new panel for mediators.`);
    await catalog.updatePanel({ id: PANEL_A, name: PANEL_A, instrumentId: QQQ, lcMethod: "RP, 20 min", istdKits: ["Kit Z"], datasetType: "global", actorId: owner });
    expect((await catalog.getCatalog()).panels.find(item => item.id === PANEL_A)).toMatchObject({ lcMethod: "RP, 20 min", istdKits: ["Kit Z"] });
  });

  it("archiving needs a reason; an instrument only once no active panel uses it; an archived panel leaves New order but keeps its orders", async () => {
    await expect(catalog.archivePanel({ id: CUSTOM, reason: "  ", actorId: owner })).rejects.toThrow("Archiving a panel needs a reason.");
    await expect(catalog.archiveInstrument({ id: "demo-instrument-qtof", reason: "Synthetic", actorId: owner }))
      .rejects.toThrow(`Instrument "Demo QTOF 1" is used by the active panel(s) "${CUSTOM}"; archive them or move them to another instrument first.`);
    await catalog.archivePanel({ id: CUSTOM, reason: " Synthetic retirement ", actorId: owner });
    await catalog.archiveInstrument({ id: "demo-instrument-qtof", reason: "Synthetic decommission", actorId: owner });
    const after = await catalog.getCatalog();
    expect(after.panels.find(item => item.id === CUSTOM)).toMatchObject({ archivedReason: "Synthetic retirement", archivedAt: expect.any(String) });
    expect(after.instruments.find(item => item.id === "demo-instrument-qtof")?.archivedReason).toBe("Synthetic decommission");
    expect((await listPanels()).map(item => item.id)).not.toContain(CUSTOM);
    await expect(catalog.updatePanel({ id: CUSTOM, name: CUSTOM, instrumentId: null, lcMethod: null, istdKits: [], datasetType: "mediators", actorId: owner })).rejects.toThrow("Panel is archived.");
    await expect(catalog.createPanel({ name: "On archived", instrumentId: "demo-instrument-qtof", lcMethod: null, istdKits: [], datasetType: "global", actorId: owner }))
      .rejects.toThrow('Instrument "Demo QTOF 1" is archived; choose an active instrument.');
    await expect(catalog.createInstrument({ name: "Demo QTOF 1", model: null, serialNumber: null, actorId: owner })).rejects.toThrow(/archived instrument is already named "Demo QTOF 1"/);
  });

  it("keeps the catalog alongside the other demo records of this browser", async () => {
    await catalog.archivePanel({ id: CUSTOM, reason: "Synthetic", actorId: owner });
    await writeDemoState({ ...await readDemoState(), results: [] });
    expect((await catalog.getCatalog()).panels.find(item => item.id === CUSTOM)?.archivedAt).toEqual(expect.any(String));
    jar.clear(); // another browser
    expect((await catalog.getCatalog()).panels.find(item => item.id === CUSTOM)?.archivedAt).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("data seam (live)", () => {
  const live = (role: string) => {
    state.mock = false;
    state.session = staff(role, false);
    const rpc = vi.fn(async () => ({ data: "new-id", error: null }));
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({ order: vi.fn(async () => table === "instrument"
        ? { error: null, data: [{ id: "i1", name: "Synthetic QQQ", model: null, serial_number: "SN-1", archived_at: null, archived_reason: null, panel: [{ archived_at: null }, { archived_at: "2026-11-01T00:00:00Z" }] }] }
        : { error: null, data: [{ id: "p1", name: "Synthetic panel", instrument_id: "i1", lc_method: "HILIC", istd_kits: ["Kit A"], dataset_type: "global", archived_at: null, archived_reason: null, instrument: { name: "Synthetic QQQ" }, order: [{ count: 3 }], batch: [{ count: 1 }] }] }) })),
    }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc, from }) } as never);
    return { rpc, from };
  };

  it("reads both tables through the user's token, with active panels, orders and batches counted", async () => {
    const { from } = live("Operator");
    expect(await catalog.getCatalog()).toEqual({
      instruments: [{ id: "i1", name: "Synthetic QQQ", model: null, serialNumber: "SN-1", archivedAt: null, archivedReason: null, activePanels: 1 }],
      panels: [{ id: "p1", name: "Synthetic panel", instrumentId: "i1", instrumentName: "Synthetic QQQ", lcMethod: "HILIC", istdKits: ["Kit A"], datasetType: "global", archivedAt: null, archivedReason: null, orderCount: 3, batchCount: 1 }],
    });
    expect(from.mock.calls.map(call => call[0])).toEqual(["instrument", "panel"]);
  });

  it("calls the six functions with exact arguments; an Operator is refused before any call; a database refusal is the message", async () => {
    const { rpc } = live("Operator");
    await expect(catalog.createInstrument({ name: "X", model: null, serialNumber: null, actorId: owner })).rejects.toThrow(/Owner or Admin/);
    expect(rpc).not.toHaveBeenCalled();
    state.session = staff("Admin", false);
    expect(await catalog.createInstrument({ name: " Synthetic QQQ 2 ", model: " M ", serialNumber: "", actorId: owner })).toBe("new-id");
    expect(rpc).toHaveBeenLastCalledWith("create_instrument", { p_name: "Synthetic QQQ 2", p_model: "M", p_serial_number: null });
    await catalog.updateInstrument({ id: "i1", name: "Synthetic QQQ", model: null, serialNumber: "SN-1" });
    expect(rpc).toHaveBeenLastCalledWith("update_instrument", { p_id: "i1", p_name: "Synthetic QQQ", p_model: null, p_serial_number: "SN-1" });
    await catalog.archiveInstrument({ id: "i1", reason: " Synthetic decommission " });
    expect(rpc).toHaveBeenLastCalledWith("archive_instrument", { p_id: "i1", p_reason: "Synthetic decommission" });
    await catalog.createPanel({ name: "Synthetic panel 2", instrumentId: "", lcMethod: " ", istdKits: ["Kit A", " Kit A "], datasetType: "mediators" });
    expect(rpc).toHaveBeenLastCalledWith("create_panel", { p_instrument_id: null, p_name: "Synthetic panel 2", p_lc_method: null, p_istd_kits: ["Kit A"], p_dataset_type: "mediators" });
    await catalog.updatePanel({ id: "p1", name: "Synthetic panel", instrumentId: "i1", lcMethod: "HILIC", istdKits: [], datasetType: "global" });
    expect(rpc).toHaveBeenLastCalledWith("update_panel", { p_id: "p1", p_instrument_id: "i1", p_name: "Synthetic panel", p_lc_method: "HILIC", p_istd_kits: [], p_dataset_type: "global" });
    await catalog.archivePanel({ id: "p1", reason: "Synthetic retirement" });
    expect(rpc).toHaveBeenLastCalledWith("archive_panel", { p_id: "p1", p_reason: "Synthetic retirement" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'A panel named "Synthetic panel" already exists' } } as never);
    await expect(catalog.createPanel({ name: "Synthetic panel", instrumentId: null, lcMethod: null, istdKits: [], datasetType: "global" })).rejects.toThrow('A panel named "Synthetic panel" already exists');
  });
});

describe("server actions", () => {
  it("add a panel from the form (kits from the text field) and return with a confirmation", async () => {
    await expect(actions.createPanelAction({}, form({ name: "Demo sterols 2", instrumentId: QQQ, lcMethod: "RP", istdKits: "Kit S, Kit T", datasetType: "global", actor: owner })))
      .rejects.toThrow("redirect:/instruments-panels?done=panel-created");
    expect((await catalog.getCatalog()).panels.find(item => item.name === "Demo sterols 2")).toMatchObject({ istdKits: ["Kit S", "Kit T"], instrumentId: QQQ });
  });
  it("answer a refusal as the form's error", async () => {
    expect(await actions.archiveInstrumentAction({}, form({ id: QQQ, reason: "Synthetic", actor: owner }))).toEqual({ error: expect.stringMatching(/is used by the active panel\(s\)/) });
    expect(await actions.createInstrumentAction({}, form({ name: "X", actor: "example-staff" }))).toEqual({ error: "Lab Owner or Admin access is required to manage instruments and panels." });
  });
  it("a client user never writes", async () => {
    state.session = client;
    await expect(actions.archivePanelAction({}, form({ id: CUSTOM, reason: "Synthetic", actor: owner }))).rejects.toThrow("redirect:/client/home");
    state.session = staff();
    expect((await catalog.getCatalog()).panels.find(item => item.id === CUSTOM)?.archivedAt).toBeNull();
  });
});

describe("page", () => {
  it("lists instruments and panels with the asked columns and offers both add forms (demo)", async () => {
    render(await page());
    expect(screen.getByRole("heading", { level: 1, name: "Instruments & panels" })).toBeInTheDocument();
    const instruments = screen.getByRole("table", { name: "Instruments" });
    expect(within(instruments).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Instrument", "Model", "Serial number", "Active panels"]);
    const panels = screen.getByRole("table", { name: "Panels" });
    expect(within(panels).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Panel", "Instrument", "LC method", "ISTD kits", "Dataset type", "Orders using it"]);
    const custom = within(panels).getByRole("link", { name: `Edit ${CUSTOM}` }).closest("tr")!;
    expect(within(custom).getByText("Lipid mediators")).toBeInTheDocument();
    expect(within(custom).getByText("Demo QTOF 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add instrument" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add panel" })).toBeInTheDocument();
    // Nothing archived: no Show archived (0) toggle.
    expect(screen.queryByRole("link", { name: /Show archived/ })).toBeNull();
  });

  it("hides archived rows until the toggle shows them, with their reason", async () => {
    await catalog.archivePanel({ id: CUSTOM, reason: "Synthetic retirement", actorId: owner });
    render(await page({ done: "panel-archived" }));
    expect(screen.getByRole("status")).toHaveTextContent("Panel archived.");
    expect(within(screen.getByRole("table", { name: "Panels" })).queryByText(CUSTOM)).toBeNull();
    expect(screen.getByRole("link", { name: "Show archived (1)" })).toBeInTheDocument();
    document.body.innerHTML = "";
    render(await page({ archived: "1" }));
    const row = within(screen.getByRole("table", { name: "Panels" })).getByText(CUSTOM).closest("tr")!;
    expect(row).toHaveTextContent("Archived · Synthetic retirement");
    expect(within(row).queryByRole("link")).toBeNull(); // archived rows are not edited
    expect(screen.getByRole("link", { name: "Hide archived" })).toHaveAttribute("href", "/instruments-panels");
  });

  it("with every record archived, says how many are archived instead of \"none yet\"", async () => {
    const before = await catalog.getCatalog();
    for (const panel of before.panels) await catalog.archivePanel({ id: panel.id, reason: "Synthetic: closed", actorId: owner });
    for (const instrument of before.instruments) await catalog.archiveInstrument({ id: instrument.id, reason: "Synthetic: closed", actorId: owner });
    render(await page());
    expect(screen.getByText(`No active instruments. Show archived to see the ${before.instruments.length} archived.`)).toBeInTheDocument();
    expect(screen.getByText(`No active panels. Show archived to see the ${before.panels.length} archived.`)).toBeInTheDocument();
    expect(screen.queryByText(/yet\./)).toBeNull();
  });

  it("edits a used panel with its dataset type fixed, and offers archiving with a reason", async () => {
    render(await page({ panel: PANEL_A }));
    const section = screen.getByRole("region", { name: `Edit ${PANEL_A}` });
    expect(within(section).getByLabelText("Panel name")).toHaveValue(PANEL_A);
    const type = within(section).getByLabelText("Dataset type");
    expect(type).toBeDisabled();
    expect(type).toHaveAccessibleDescription(/Fixed: orders or batches already use this panel/);
    expect(section.querySelector('input[type="hidden"][name="datasetType"]')).toHaveValue("global");
    expect(within(section).getByRole("button", { name: "Save panel" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Archive panel" })).toBeEnabled();
    expect(within(section).getByLabelText("Reason")).toBeRequired();
    expect(screen.getByRole("button", { name: "Add instrument" })).toBeInTheDocument();
  });

  it("an instrument with active panels cannot be archived from its edit form", async () => {
    render(await page({ instrument: QQQ }));
    const section = screen.getByRole("region", { name: "Edit Demo QQQ 1" });
    expect(within(section).getByText(/3 active panels use this instrument/)).toBeInTheDocument();
    // The reason says what to do; no disabled form under it.
    expect(within(section).queryByRole("button", { name: "Archive instrument" })).toBeNull();
    expect(within(section).queryByLabelText("Reason")).toBeNull();
  });

  it("an Operator (live) reads both tables and gets no form, no edit link, whatever the URL asks", async () => {
    state.mock = false;
    state.session = staff("Operator", false);
    const from = vi.fn((table: string) => ({ select: vi.fn(() => ({ order: vi.fn(async () => ({ error: null, data: table === "instrument"
      ? [{ id: "i1", name: "Synthetic QQQ", model: "Triple quad", serial_number: null, archived_at: null, archived_reason: null, panel: [] }]
      : [{ id: "p1", name: "Synthetic panel", instrument_id: "i1", lc_method: null, istd_kits: [], dataset_type: "global", archived_at: null, archived_reason: null, instrument: { name: "Synthetic QQQ" }, order: [{ count: 2 }], batch: [] }] })) })) }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ from }) } as never);
    render(await page({ panel: "p1", instrument: "i1" }));
    expect(within(screen.getByRole("table", { name: "Panels" })).getByText("Synthetic panel").closest("tr")).toHaveTextContent("Synthetic panelSynthetic QQQNot setNoneGlobal lipidome2");
    expect(screen.queryByRole("link", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    // One notice above the tables, not one in each empty form panel.
    expect(screen.getByRole("status")).toHaveTextContent("You can read instruments and panels; adding, editing or archiving them needs a lab Owner or Admin.");
    expect(screen.queryByRole("region", { name: /^(New|Edit) / })).toBeNull();
  });

  it("is a lab screen: a client user is sent to Client home", async () => {
    state.session = client;
    await expect(page()).rejects.toThrow("redirect:/client/home");
  });
});
