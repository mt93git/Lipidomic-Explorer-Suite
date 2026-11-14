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
const profiles = await import("@/lib/data/instrument-profiles");
const { builderDefaults } = await import("@/lib/batch-builder");
const { builderDefaultsFrom, parseRulesForm, rulesText, defaultRules } = await import("@/lib/instrument-profiles");
const { listPanels } = await import("@/lib/data/orders");
const { writeDemoState, readDemoState, writeDemoProfiles } = await import("@/lib/data/demo-store");
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
const PANEL_B = "Panel B · sphingolipids";
const PROFILE = "demo-profile-qqq";
const PROFILE_NAME = "SCIEX Triple Quad 7500 · Shimadzu LC-40R";

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

  it("0039: an instrument a live profile uses cannot be archived; archiving the profile frees it", async () => {
    const iid = await catalog.createInstrument({ name: "Demo QTOF 2", model: null, serialNumber: null, actorId: owner });
    const pid = await profiles.createProfile({ name: "Demo QTOF 2 profile", instrumentId: iid, settings: {}, actorId: owner });
    const message = 'Instrument "Demo QTOF 2" is used by profile "Demo QTOF 2 profile"; archive or move the profile first.';
    await expect(catalog.archiveInstrument({ id: iid, reason: "Synthetic", actorId: owner })).rejects.toThrow(message);
    expect(await actions.archiveInstrumentAction({}, form({ id: iid, reason: "Synthetic", actor: owner }))).toEqual({ error: message });
    await profiles.archiveProfile({ id: pid, reason: "Synthetic", actorId: owner });
    await catalog.archiveInstrument({ id: iid, reason: "Synthetic", actorId: owner });
    expect((await catalog.getCatalog()).instruments.find(item => item.id === iid)?.archivedAt).toEqual(expect.any(String));
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
      select: vi.fn(() => ({ order: vi.fn(async () => table === "instrument_profile" ? { error: null, data: [] } : table === "instrument"
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

// 0035: instrument profiles and their blank and QC rules; Batch builder starts from the active one.
const liveProfileRow = {
  id: "pr1", name: "Synthetic QQQ profile", instrument_id: "i1", is_active: true, archived_at: null, archived_reason: null,
  software: "Synthetic OS", batch_file: null, bench_sheet: null, plates: "Synthetic plates", sample_name_pattern: "{batch}_{sample}", results_parser: null,
  blanks_at_start: 2, start_blank_note: "Synthetic solvent", blanks_between: 0, blanks_between_every: 0, pooled_qc_every: 8, pooled_qc_note: null, qc_thresholds: null,
  instrument: { name: "Synthetic QQQ" },
};
const rulesForm = (values: Record<string, string>) => form({ blanksAtStart: "3", startBlankNote: " Synthetic solvent ", blanksBetween: "2", blanksBetweenEvery: "6", pooledQcEvery: "10", pooledQcNote: "", qcThresholds: " CV 25 % ", ...values });

describe("instrument profiles: rules and Batch builder defaults", () => {
  it("reads the rules form: whole numbers 0..96, blank counts as 0, blanks between needs both numbers, notes trimmed", () => {
    expect(parseRulesForm(rulesForm({}))).toEqual({ ok: true, value: { blanksAtStart: 3, startBlankNote: "Synthetic solvent", blanksBetween: 2, blanksBetweenEvery: 6, pooledQcEvery: 10, pooledQcNote: null, qcThresholds: "CV 25 %" } });
    expect(parseRulesForm(rulesForm({ blanksBetween: "", blanksBetweenEvery: "" }))).toMatchObject({ ok: true, value: { blanksBetween: 0, blanksBetweenEvery: 0 } });
    expect(parseRulesForm(rulesForm({ blanksAtStart: "1.5" }))).toEqual({ ok: false, error: "Blanks at the start must be a whole number from 0 to 96." });
    expect(parseRulesForm(rulesForm({ pooledQcEvery: "97" }))).toEqual({ ok: false, error: "Pooled QC every must be a whole number from 0 to 96." });
    expect(parseRulesForm(rulesForm({ blanksBetweenEvery: "0" }))).toEqual({ ok: false, error: "Blanks between samples needs both numbers (blanks and every how many samples), or 0 for both." });
  });

  it("says each rule in one line", () => {
    expect(rulesText({ blanksAtStart: 4, startBlankNote: "1:1 IPA:ACN", blanksBetween: 5, blanksBetweenEvery: 4, pooledQcEvery: 0, pooledQcNote: "recommended every 8", qcThresholds: null }))
      .toEqual({ start: "4 blanks (1:1 IPA:ACN)", between: "5 blanks after every 4 samples", pooledQc: "none · recommended every 8", thresholds: "Not set" });
    expect(rulesText({ ...defaultRules, blanksAtStart: 1, blanksBetween: 1, blanksBetweenEvery: 1, pooledQcEvery: 1 }))
      .toMatchObject({ start: "1 blank", between: "1 blank after every 1 sample", pooledQc: "every 1 sample" });
  });

  it("Batch builder takes blanks at the start and pooled QC from the active profile and keeps the rest of its own defaults", () => {
    expect(builderDefaultsFrom(null)).toBe(builderDefaults);
    expect(builderDefaultsFrom({ rules: { ...defaultRules, blanksAtStart: 4, pooledQcEvery: 0 } })).toEqual({ ...builderDefaults, blanksAtStart: 4, pooledQcEvery: 0 });
  });
});

describe("instrument profiles: data seam (demo)", () => {
  it("seeds one active example profile on the demo triple quadrupole; Batch builder starts from its rules", async () => {
    const list = await profiles.getProfiles();
    expect(list.map(item => [item.name, item.instrumentName, item.isActive])).toEqual([[PROFILE_NAME, "Demo QQQ 1", true]]);
    expect(await profiles.activeBuilderDefaults()).toEqual({ ...builderDefaults, blanksAtStart: 4, pooledQcEvery: 0 });
  });

  it("an Owner or Admin adds, edits, sets rules and activates; an Operator is refused; names are unique", async () => {
    const input = { name: "  Demo QTOF profile ", instrumentId: "demo-instrument-qtof", settings: { software: " Synthetic OS ", plates: "  " }, actorId: owner };
    await expect(profiles.createProfile({ ...input, actorId: "example-staff" })).rejects.toThrow("Lab Owner or Admin access is required to manage instruments and panels.");
    await expect(profiles.createProfile({ ...input, name: " " })).rejects.toThrow("Profile name is required.");
    await expect(profiles.createProfile({ ...input, instrumentId: "" })).rejects.toThrow("Choose the instrument this profile is for.");
    await expect(profiles.createProfile({ ...input, instrumentId: "gone" })).rejects.toThrow("Instrument not found.");
    await expect(profiles.createProfile({ ...input, name: PROFILE_NAME })).rejects.toThrow(`A profile named "${PROFILE_NAME}" already exists.`);
    const id = await profiles.createProfile(input);
    let created = (await profiles.getProfiles()).find(item => item.id === id)!;
    expect(created).toMatchObject({ name: "Demo QTOF profile", isActive: false, instrumentName: "Demo QTOF 1", rules: defaultRules });
    expect(created.settings).toEqual({ software: "Synthetic OS", batchFile: null, benchSheet: null, plates: null, sampleNamePattern: null, resultsParser: null });
    await profiles.updateProfile({ id, name: "Demo QTOF profile 2", instrumentId: "demo-instrument-qtof", settings: { resultsParser: "Synthetic TXT" }, actorId: "example-reviewer-a" });
    await profiles.setProfileRules({ id, rules: { ...defaultRules, blanksAtStart: 3, pooledQcEvery: 9 }, actorId: owner });
    await expect(profiles.setProfileRules({ id, rules: { ...defaultRules, blanksBetween: 2 }, actorId: owner })).rejects.toThrow(/needs both numbers/);
    created = (await profiles.getProfiles()).find(item => item.id === id)!;
    expect(created).toMatchObject({ name: "Demo QTOF profile 2", settings: { software: null, resultsParser: "Synthetic TXT" }, rules: { blanksAtStart: 3, pooledQcEvery: 9 } });
    // Still the example profile's rules until this one is made active.
    expect(await profiles.activeBuilderDefaults()).toMatchObject({ blanksAtStart: 4, pooledQcEvery: 0 });
    await profiles.activateProfile({ id, actorId: owner });
    expect((await profiles.getProfiles()).map(item => [item.name, item.isActive])).toEqual([["Demo QTOF profile 2", true], [PROFILE_NAME, false]]);
    expect(await profiles.activeBuilderDefaults()).toMatchObject({ blanksAtStart: 3, pooledQcEvery: 9 });
  });

  it("archiving needs a reason and refuses the active profile; an archived profile keeps its name and refuses edits", async () => {
    await expect(profiles.archiveProfile({ id: PROFILE, reason: "Synthetic", actorId: owner })).rejects.toThrow(`Profile "${PROFILE_NAME}" is the active one; make another profile active first.`);
    const id = await profiles.createProfile({ name: "Old profile", instrumentId: QQQ, settings: {}, actorId: owner });
    await expect(profiles.archiveProfile({ id, reason: "  ", actorId: owner })).rejects.toThrow("Archiving a profile needs a reason.");
    await profiles.archiveProfile({ id, reason: "Synthetic retirement", actorId: owner });
    await expect(profiles.activateProfile({ id, actorId: owner })).rejects.toThrow('Profile "Old profile" is archived.');
    await expect(profiles.createProfile({ name: "Old profile", instrumentId: QQQ, settings: {}, actorId: owner })).rejects.toThrow(/An archived profile is already named "Old profile"/);
  });
});

describe("instrument profiles: data seam (live)", () => {
  const live = (role: string, active: { data: unknown; error: unknown } = { data: { blanks_at_start: 2, pooled_qc_every: 8 }, error: null }) => {
    state.mock = false;
    state.session = staff(role, false);
    const rpc = vi.fn(async () => ({ data: "new-id", error: null }));
    const eq = vi.fn(() => ({ maybeSingle: vi.fn(async () => active) }));
    const from = vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(async () => ({ error: null, data: [liveProfileRow] })), eq })) }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc, from }) } as never);
    return { rpc, from, eq };
  };

  it("reads the profiles through the user's token, and the active one for Batch builder", async () => {
    const { from, eq } = live("Operator");
    expect(await profiles.getProfiles()).toEqual([{
      id: "pr1", name: "Synthetic QQQ profile", instrumentId: "i1", instrumentName: "Synthetic QQQ", isActive: true, archivedAt: null, archivedReason: null,
      settings: { software: "Synthetic OS", batchFile: null, benchSheet: null, plates: "Synthetic plates", sampleNamePattern: "{batch}_{sample}", resultsParser: null },
      rules: { blanksAtStart: 2, startBlankNote: "Synthetic solvent", blanksBetween: 0, blanksBetweenEvery: 0, pooledQcEvery: 8, pooledQcNote: null, qcThresholds: null },
    }]);
    expect(from).toHaveBeenCalledWith("instrument_profile");
    expect(await profiles.activeBuilderDefaults()).toEqual({ ...builderDefaults, blanksAtStart: 2, pooledQcEvery: 8 });
    expect(eq).toHaveBeenCalledWith("is_active", true);
  });

  it("Batch builder keeps its own defaults with no active profile or when the read fails (a database without 0035)", async () => {
    live("Operator", { data: null, error: null });
    expect(await profiles.activeBuilderDefaults()).toBe(builderDefaults);
    live("Operator", { data: null, error: { message: 'relation "admin.instrument_profile" does not exist' } });
    expect(await profiles.activeBuilderDefaults()).toBe(builderDefaults);
  });

  it("calls the five functions with exact arguments; an Operator is refused before any call; a database refusal is the message", async () => {
    const { rpc } = live("Operator");
    await expect(profiles.createProfile({ name: "X", instrumentId: "i1", settings: {} })).rejects.toThrow(/Owner or Admin/);
    expect(rpc).not.toHaveBeenCalled();
    state.session = staff("Admin", false);
    expect(await profiles.createProfile({ name: " Synthetic profile ", instrumentId: "i1", settings: { software: " OS ", batchFile: "" } })).toBe("new-id");
    const settings = { p_software: "OS", p_batch_file: null, p_bench_sheet: null, p_plates: null, p_sample_name_pattern: null, p_results_parser: null };
    expect(rpc).toHaveBeenLastCalledWith("create_instrument_profile", { p_instrument_id: "i1", p_name: "Synthetic profile", ...settings });
    await profiles.updateProfile({ id: "pr1", name: "Synthetic profile", instrumentId: "i1", settings: { software: "OS" } });
    expect(rpc).toHaveBeenLastCalledWith("update_instrument_profile", { p_id: "pr1", p_instrument_id: "i1", p_name: "Synthetic profile", ...settings });
    await profiles.setProfileRules({ id: "pr1", rules: { blanksAtStart: 4, startBlankNote: "S", blanksBetween: 5, blanksBetweenEvery: 4, pooledQcEvery: 0, pooledQcNote: null, qcThresholds: "CV" } });
    expect(rpc).toHaveBeenLastCalledWith("set_instrument_profile_rules", { p_id: "pr1", p_blanks_at_start: 4, p_start_blank_note: "S", p_blanks_between: 5, p_blanks_between_every: 4, p_pooled_qc_every: 0, p_pooled_qc_note: null, p_qc_thresholds: "CV" });
    await profiles.activateProfile({ id: "pr1" });
    expect(rpc).toHaveBeenLastCalledWith("activate_instrument_profile", { p_id: "pr1" });
    await profiles.archiveProfile({ id: "pr1", reason: " Synthetic " });
    expect(rpc).toHaveBeenLastCalledWith("archive_instrument_profile", { p_id: "pr1", p_reason: "Synthetic" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Profile "Synthetic profile" is the active one; make another profile active first' } } as never);
    await expect(profiles.archiveProfile({ id: "pr1", reason: "x" })).rejects.toThrow("is the active one");
  });
});

describe("instrument profile actions", () => {
  it("save the rules from the form and return with a confirmation; a bad number is the form's message", async () => {
    expect(await actions.saveRulesAction({}, rulesForm({ id: PROFILE, blanksAtStart: "-1", actor: owner }))).toEqual({ error: "Blanks at the start must be a whole number from 0 to 96." });
    await expect(actions.saveRulesAction({}, rulesForm({ id: PROFILE, actor: owner }))).rejects.toThrow("redirect:/instruments-panels?done=rules-saved");
    expect(await profiles.activeBuilderDefaults()).toMatchObject({ blanksAtStart: 3, pooledQcEvery: 10 });
    expect(await actions.saveRulesAction({}, rulesForm({ id: PROFILE, actor: "example-staff" }))).toEqual({ error: "Lab Owner or Admin access is required to manage instruments and panels." });
  });
  it("add a profile with its settings, make it active; a client user never writes", async () => {
    await expect(actions.createProfileAction({}, form({ name: "Demo profile 2", instrumentId: QQQ, software: "Synthetic OS", sampleNamePattern: "{sample}", actor: owner })))
      .rejects.toThrow("redirect:/instruments-panels?done=profile-created");
    const id = (await profiles.getProfiles()).find(item => item.name === "Demo profile 2")!.id;
    expect((await profiles.getProfiles()).find(item => item.id === id)!.settings).toMatchObject({ software: "Synthetic OS", sampleNamePattern: "{sample}", plates: null });
    await expect(actions.activateProfileAction({}, form({ id, actor: owner }))).rejects.toThrow("redirect:/instruments-panels?done=profile-activated");
    state.session = client;
    await expect(actions.activateProfileAction({}, form({ id: PROFILE, actor: owner }))).rejects.toThrow("redirect:/client/home");
    await expect(actions.saveRulesAction({}, rulesForm({ id: PROFILE, actor: owner }))).rejects.toThrow("redirect:/client/home");
    state.session = staff();
    expect((await profiles.getProfiles()).find(item => item.isActive)!.id).toBe(id);
  });
});

describe("page", () => {
  it("shows the active profile card, its settings, its panels and its blank and QC rules, as the prototype (demo)", async () => {
    render(await page());
    expect(screen.getByRole("heading", { level: 1, name: "Instruments & panels" })).toBeInTheDocument();
    expect(screen.getByText("Everything instrument-specific lives here, so a second instrument is a new profile, not a new app.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add profile" })).toHaveAttribute("href", "/instruments-panels?profile=new#profile-form");
    const card = screen.getByRole("region", { name: PROFILE_NAME });
    expect(within(card).getByText("active")).toBeInTheDocument();
    const settings = within(card).getByRole("table", { name: "Profile settings" });
    expect(within(settings).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Setting", "Value"]);
    expect(within(settings).getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["Software", "Batch file", "Bench sheet", "Plates", "Sample name", "Results parser"]);
    expect(within(settings).getByText("{batch}_{order}_{sample}")).toBeInTheDocument();
    expect(card).toHaveTextContent("Instrument: Demo QQQ 1");
    const panels = screen.getByRole("table", { name: "Panels" });
    expect(within(panels).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Panel", "LC method", "ISTD", "Nexo dataset"]);
    expect(within(panels).getAllByRole("row")).toHaveLength(4); // the header and the instrument's 3 panels
    expect(within(panels).getByRole("link", { name: `Edit ${PANEL_A}` }).closest("tr")).toHaveTextContent(`${PANEL_A}HILIC, 15 minSynthetic SPLASH-like mixGlobal lipidome`);
    // The panel on the other instrument is still reachable.
    expect(screen.getByText(/On other instruments:/)).toHaveTextContent(`On other instruments: ${CUSTOM} (Demo QTOF 1)`);
    const rules = screen.getByRole("region", { name: "Blank and QC rules" });
    expect(within(rules).getByRole("group", { name: "Start of run" })).toBeInTheDocument();
    expect(within(rules).getByLabelText("Blanks at the start")).toHaveValue(4);
    expect(within(rules).getByLabelText("Blank solvent")).toHaveValue("1:1 IPA:ACN");
    expect(within(rules).getByLabelText("Blanks between samples")).toHaveValue(5);
    expect(within(rules).getByLabelText("Samples between blanks")).toHaveValue(4);
    expect(within(rules).getByLabelText("Pooled QC every (samples; 0 for none)")).toHaveValue(0);
    expect(within(rules).getByLabelText("Pooled QC note")).toHaveValue("recommended every 8");
    expect(within(rules).getByLabelText("QC thresholds")).toHaveValue("CV 20 % · ISTD ±30 % · S/N ≥ 10");
    expect(within(rules).getByRole("button", { name: "Save rules" })).toBeInTheDocument();
    const instruments = screen.getByRole("table", { name: "Instruments" });
    expect(within(instruments).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Instrument", "Model", "Serial number", "Active panels"]);
    expect(screen.getByRole("link", { name: "Add panel" })).toHaveAttribute("href", "/instruments-panels?panel=new#panel-form");
    expect(screen.getByRole("link", { name: "Add instrument" })).toHaveAttribute("href", "/instruments-panels?instrument=new#instrument-form");
    // No form open until asked; nothing archived: no Show archived (0) toggle.
    expect(screen.queryByRole("region", { name: /^(New|Edit) / })).toBeNull();
    expect(screen.queryByRole("link", { name: /Show archived/ })).toBeNull();
  });

  it("opens the add forms when asked; a new panel starts on the shown profile's instrument", async () => {
    render(await page({ profile: "new" }));
    const profile = screen.getByRole("region", { name: "New profile" });
    expect(within(profile).getAllByRole("textbox").map(input => input.getAttribute("name"))).toEqual(["name", "software", "batchFile", "benchSheet", "plates", "sampleNamePattern", "resultsParser"]);
    expect(within(profile).getByRole("button", { name: "Add profile" })).toBeInTheDocument();
    document.body.innerHTML = "";
    render(await page({ panel: "new" }));
    expect(within(screen.getByRole("region", { name: "New panel" })).getByLabelText("Instrument")).toHaveValue(QQQ);
    document.body.innerHTML = "";
    render(await page({ instrument: "new" }));
    expect(within(screen.getByRole("region", { name: "New instrument" })).getByRole("button", { name: "Add instrument" })).toBeInTheDocument();
  });

  it("edits the active profile but does not archive it; another profile is shown with Make active", async () => {
    render(await page({ profile: PROFILE }));
    const section = screen.getByRole("region", { name: `Edit ${PROFILE_NAME}` });
    expect(within(section).getByLabelText("Profile name")).toHaveValue(PROFILE_NAME);
    expect(within(section).getByText(/This is the active profile/)).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Archive profile" })).toBeNull();
    const id = await profiles.createProfile({ name: "Demo QTOF profile", instrumentId: "demo-instrument-qtof", settings: { software: "Synthetic OS" }, actorId: owner });
    document.body.innerHTML = "";
    render(await page({ show: id }));
    const nav = screen.getByRole("navigation", { name: "Instrument profiles" });
    expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual([`${PROFILE_NAME} · active`, "Demo QTOF profile"]);
    const card = screen.getByRole("region", { name: "Demo QTOF profile" });
    expect(within(card).getByText("inactive")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Make active" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Panels" })).getByText(CUSTOM)).toBeInTheDocument();
    // A new profile starts from Batch builder's usual rules.
    expect(within(screen.getByRole("region", { name: "Blank and QC rules" })).getByLabelText("Blanks at the start")).toHaveValue(1);
  });

  it("hides archived rows until the toggle shows them, with their reason", async () => {
    await catalog.archivePanel({ id: PANEL_B, reason: "Synthetic retirement", actorId: owner });
    render(await page({ done: "panel-archived" }));
    expect(screen.getByRole("status")).toHaveTextContent("Panel archived.");
    expect(within(screen.getByRole("table", { name: "Panels" })).queryByText(PANEL_B)).toBeNull();
    expect(screen.getByRole("link", { name: "Show archived (1)" })).toBeInTheDocument();
    document.body.innerHTML = "";
    render(await page({ archived: "1" }));
    const row = within(screen.getByRole("table", { name: "Panels" })).getByText(PANEL_B).closest("tr")!;
    expect(row).toHaveTextContent("Archived · Synthetic retirement");
    expect(within(row).queryByRole("link")).toBeNull(); // archived rows are not edited
    expect(screen.getByRole("link", { name: "Hide archived" })).toHaveAttribute("href", "/instruments-panels");
  });

  it("with every record archived, says how many are archived instead of \"none yet\"", async () => {
    await writeDemoProfiles([]); // a live profile keeps its instrument (0039); a lab with no profile at all can archive every instrument
    const before = await catalog.getCatalog();
    for (const panel of before.panels) await catalog.archivePanel({ id: panel.id, reason: "Synthetic: closed", actorId: owner });
    for (const instrument of before.instruments) await catalog.archiveInstrument({ id: instrument.id, reason: "Synthetic: closed", actorId: owner });
    render(await page());
    expect(screen.getByText(`No active instruments. Show archived to see the ${before.instruments.length} archived.`)).toBeInTheDocument();
    // With no profile the Panels card counts every panel (with one, only its instrument's).
    expect(screen.getByText("No active panels. Show archived to see the 4 archived.")).toBeInTheDocument();
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
  });

  it("an instrument with active panels cannot be archived from its edit form", async () => {
    render(await page({ instrument: QQQ }));
    const section = screen.getByRole("region", { name: "Edit Demo QQQ 1" });
    expect(within(section).getByText(/3 active panels use this instrument/)).toBeInTheDocument();
    // The reason says what to do; no disabled form under it.
    expect(within(section).queryByRole("button", { name: "Archive instrument" })).toBeNull();
    expect(within(section).queryByLabelText("Reason")).toBeNull();
  });

  it("0039: an instrument a live profile uses says so on its edit form instead of offering Archive", async () => {
    const iid = await catalog.createInstrument({ name: "Demo QTOF 2", model: null, serialNumber: null, actorId: owner });
    await profiles.createProfile({ name: "Demo QTOF 2 profile", instrumentId: iid, settings: {}, actorId: owner });
    render(await page({ instrument: iid }));
    const section = screen.getByRole("region", { name: "Edit Demo QTOF 2" });
    expect(within(section).getByText('Profile "Demo QTOF 2 profile" uses this instrument. Archive or move the profile first.')).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Archive instrument" })).toBeNull();
  });

  it("an Operator (live) reads the profile, its rules as text and the tables, and gets no form, no edit link, whatever the URL asks", async () => {
    state.mock = false;
    state.session = staff("Operator", false);
    const from = vi.fn((table: string) => ({ select: vi.fn(() => ({ order: vi.fn(async () => ({ error: null, data: table === "instrument_profile" ? [liveProfileRow]
      : table === "instrument"
      ? [{ id: "i1", name: "Synthetic QQQ", model: "Triple quad", serial_number: null, archived_at: null, archived_reason: null, panel: [] }]
      : [{ id: "p1", name: "Synthetic panel", instrument_id: "i1", lc_method: null, istd_kits: [], dataset_type: "global", archived_at: null, archived_reason: null, instrument: { name: "Synthetic QQQ" }, order: [{ count: 2 }], batch: [] }] })) })) }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ from }) } as never);
    render(await page({ panel: "p1", instrument: "i1", profile: "pr1" }));
    expect(within(screen.getByRole("region", { name: "Synthetic QQQ profile" })).getByText("active")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Panels" })).getByText("Synthetic panel").closest("tr")).toHaveTextContent("Synthetic panelNot setNoneGlobal lipidome");
    const rules = screen.getByRole("region", { name: "Blank and QC rules" });
    expect(within(rules).getByText("2 blanks (Synthetic solvent)")).toBeInTheDocument();
    expect(within(rules).getByText("none")).toBeInTheDocument();
    expect(within(rules).getByText("every 8 samples")).toBeInTheDocument();
    expect(within(rules).getByText("Not set")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Add / })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    // One notice above the cards, not one in each empty form panel.
    expect(screen.getByRole("status")).toHaveTextContent("You can read instrument profiles and panels; adding, editing or archiving them needs a lab Owner or Admin.");
    expect(screen.queryByRole("region", { name: /^(New|Edit) / })).toBeNull();
  });

  it("is a lab screen: a client user is sent to Client home", async () => {
    state.session = client;
    await expect(page()).rejects.toThrow("redirect:/client/home");
  });
});
