import "server-only";
import { demoOrders, demoPanels } from "../demo";
import type { PanelRate, WizardPanel } from "../order-wizard";
import { getEnvironment } from "../environment";
import { demoLabStaff } from "../release-demo";
import { DataError } from "../samples";
import { applyDemoState } from "../samples-demo";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoCatalog, readDemoProfiles, readDemoState, writeDemoCatalog } from "./demo-store";

// Instruments & panels (0026): lab Owner or Admin create, edit and archive them through the admin functions; other lab
// staff read them. Live reads go through the signed-in user's token (RLS: instruments lab staff only, panels everyone);
// the demo keeps this browser's catalog in the demo store, seeded with the example panels New order offers.
export { DataError };
export const datasetTypes = ["global", "mediators"] as const;
export type DatasetType = (typeof datasetTypes)[number];
export const datasetTypeLabels: Record<DatasetType, string> = { global: "Global lipidome", mediators: "Lipid mediators" };
export type Instrument = {
  id: string; name: string; model: string | null; serialNumber: string | null;
  archivedAt: string | null; archivedReason: string | null; activePanels: number;
};
export type PanelRecord = {
  id: string; name: string; instrumentId: string | null; instrumentName: string | null; lcMethod: string | null; istdKits: string[];
  datasetType: DatasetType; archivedAt: string | null; archivedReason: string | null; orderCount: number; batchCount: number;
};
export type Catalog = { instruments: Instrument[]; panels: PanelRecord[] };
export type InstrumentInput = { name: string; model: string | null; serialNumber: string | null; actorId?: string };
export type PanelInput = { name: string; instrumentId: string | null; lcMethod: string | null; istdKits: string[]; datasetType: string; actorId?: string };

const live = () => !getEnvironment().mock;
const isDatasetType = (value: string): value is DatasetType => (datasetTypes as readonly string[]).includes(value);
const blankToNull = (value: string | null) => value?.trim() || null;
// Kits as the database stores them (admin.clean_istd_kits): trimmed, no blanks, no repeats, in the order given.
export const cleanKits = (kits: string[]) => [...new Set(kits.map(kit => kit.trim()).filter(Boolean))];
// The form's one text field: kits separated by commas or new lines.
export const parseKits = (text: string) => cleanKits(text.split(/[,\n]/));
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

// Owner or Admin (the demo acts as the chosen demo person); instrument profiles (0035) use the same check.
export async function manager(actorId?: string) {
  const session = await requireWorkspace("staff");
  let role = session.role.toLowerCase();
  if (!live() && actorId) {
    const person = demoLabStaff.find(person => person.userId === actorId);
    if (!person) throw new DataError("Choose a demo lab person.");
    role = person.role;
  }
  if (role !== "owner" && role !== "admin") throw new DataError("Lab Owner or Admin access is required to manage instruments and panels.");
}
export async function catalogPermissions() {
  const session = await requireWorkspace("staff");
  return { canEdit: !live() || ["Owner", "Admin"].includes(session.role), demoActors: live() ? null : demoLabStaff };
}
async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

// ---------------------------------------------------------------- reads

type InstrumentRow = { id: string; name: string; model: string | null; serial_number: string | null; archived_at: string | null; archived_reason: string | null; panel: { archived_at: string | null }[] | null };
type PanelRow = {
  id: string; name: string; instrument_id: string | null; lc_method: string | null; istd_kits: string[] | null; dataset_type: DatasetType;
  archived_at: string | null; archived_reason: string | null; instrument: { name: string } | { name: string }[] | null;
  order: { count: number }[] | null; batch: { count: number }[] | null;
};
const instrumentSelect = "id, name, model, serial_number, archived_at, archived_reason, panel(archived_at)";
const panelSelect = "id, name, instrument_id, lc_method, istd_kits, dataset_type, archived_at, archived_reason, instrument:instrument(name), order(count), batch(count)";
const countOf = (rows: { count: number }[] | null) => rows?.[0]?.count ?? 0;

function instrumentFromRow(row: InstrumentRow): Instrument {
  return { id: row.id, name: row.name, model: row.model, serialNumber: row.serial_number, archivedAt: row.archived_at, archivedReason: row.archived_reason,
    activePanels: (row.panel ?? []).filter(panel => !panel.archived_at).length };
}
function panelFromRow(row: PanelRow): PanelRecord {
  const instrument = Array.isArray(row.instrument) ? row.instrument[0] ?? null : row.instrument;
  return { id: row.id, name: row.name, instrumentId: row.instrument_id, instrumentName: instrument?.name ?? null, lcMethod: row.lc_method,
    istdKits: row.istd_kits ?? [], datasetType: row.dataset_type, archivedAt: row.archived_at, archivedReason: row.archived_reason,
    orderCount: countOf(row.order), batchCount: countOf(row.batch) };
}

// The demo's stored catalog: instruments and panels without their counts (those come from the demo's orders and batches).
// rates (0033): the rate sheet; undefined (or a panel missing from it) means nothing is set: the demo invents no money.
export type DemoCatalog = { instruments: Omit<Instrument, "activePanels">[]; panels: Omit<PanelRecord, "instrumentName" | "orderCount" | "batchCount">[]; rates?: PanelRate[] };
// Seed: the panels New order has always offered in the demo (their id is their name, as before), on synthetic instruments.
export function seedDemoCatalog(): DemoCatalog {
  const instruments = [
    { id: "demo-instrument-qqq", name: "Demo QQQ 1", model: "Triple quadrupole (synthetic)", serialNumber: "SYN-0001", archivedAt: null, archivedReason: null },
    { id: "demo-instrument-qtof", name: "Demo QTOF 1", model: "QTOF (synthetic)", serialNumber: "SYN-0002", archivedAt: null, archivedReason: null },
  ];
  const panels = demoPanels.map((name, index) => ({
    id: name, name, instrumentId: index === 3 ? "demo-instrument-qtof" : "demo-instrument-qqq", lcMethod: index === 3 ? "C18, 12 min" : "HILIC, 15 min",
    istdKits: index === 3 ? ["Synthetic mediator ISTD mix"] : ["Synthetic SPLASH-like mix"], datasetType: (index === 3 ? "mediators" : "global") as DatasetType,
    archivedAt: null, archivedReason: null,
  }));
  return { instruments, panels };
}
async function demoStored(): Promise<DemoCatalog> {
  return (await readDemoCatalog()) ?? seedDemoCatalog();
}
async function demoCatalog(): Promise<Catalog> {
  const stored = await demoStored();
  const state = await readDemoState();
  const orders = applyDemoState(demoOrders, state);
  const batches = state.batches ?? [];
  const instruments = stored.instruments.map(instrument => ({
    ...instrument, activePanels: stored.panels.filter(panel => panel.instrumentId === instrument.id && !panel.archivedAt).length,
  }));
  // Demo orders and batches record the panel by name.
  const panels = stored.panels.map(panel => ({
    ...panel, instrumentName: stored.instruments.find(instrument => instrument.id === panel.instrumentId)?.name ?? null,
    orderCount: orders.filter(order => order.panel === panel.name || order.panel === panel.id).length,
    batchCount: batches.filter(batch => batch.panel === panel.name || batch.panel === panel.id).length,
  }));
  return { instruments: instruments.sort(byName), panels: panels.sort(byName) };
}

export async function getCatalog(): Promise<Catalog> {
  await requireWorkspace("staff");
  if (!live()) return demoCatalog();
  const db = await admin();
  const [instruments, panels] = await Promise.all([
    db.from("instrument").select(instrumentSelect).order("name"),
    db.from("panel").select(panelSelect).order("name"),
  ]);
  if (instruments.error) throw new DataError(`Instruments could not be read: ${instruments.error.message}`);
  if (panels.error) throw new DataError(`Panels could not be read: ${panels.error.message}`);
  return {
    instruments: ((instruments.data ?? []) as unknown as InstrumentRow[]).map(instrumentFromRow),
    panels: ((panels.data ?? []) as unknown as PanelRow[]).map(panelFromRow),
  };
}

// The active panels the demo's New order, order requests and Batch builder offer (live reads admin.panel instead), in
// the order they were added: the example panels first, as before.
export async function demoActivePanels(): Promise<{ id: string; name: string }[]> {
  return (await demoStored()).panels.filter(panel => !panel.archivedAt).map(panel => ({ id: panel.id, name: panel.name }));
}

// The demo's New order wizard: the active panels with their instrument and their line on this browser's rate sheet.
export async function demoWizardPanels(): Promise<WizardPanel[]> {
  const stored = await demoStored();
  return stored.panels.filter(panel => !panel.archivedAt).map(panel => ({
    id: panel.id, name: panel.name, instrumentName: stored.instruments.find(instrument => instrument.id === panel.instrumentId)?.name ?? null,
    rate: stored.rates?.find(rate => rate.panelId === panel.id) ?? null,
  }));
}

// ---------------------------------------------------------------- writes

function cleanInstrument(input: InstrumentInput): InstrumentInput {
  const name = input.name.trim();
  if (!name) throw new DataError("Instrument name is required.");
  return { ...input, name, model: blankToNull(input.model), serialNumber: blankToNull(input.serialNumber) };
}
function cleanPanel(input: PanelInput): PanelInput & { datasetType: DatasetType } {
  const name = input.name.trim();
  if (!name) throw new DataError("Panel name is required.");
  if (!isDatasetType(input.datasetType)) throw new DataError("Choose a valid dataset type (global or mediators).");
  return { ...input, name, instrumentId: input.instrumentId || null, lcMethod: blankToNull(input.lcMethod), istdKits: cleanKits(input.istdKits), datasetType: input.datasetType };
}
function takenName<T extends { id: string; name: string; archivedAt: string | null }>(rows: T[], name: string, kind: "instrument" | "panel", id?: string) {
  const taken = rows.find(row => row.id !== id && row.name === name);
  if (!taken) return;
  if (taken.archivedAt) throw new DataError(`An archived ${kind} is already named "${name}"; archived ${kind}s keep their names, so choose another name.`);
  throw new DataError(`A${kind === "instrument" ? "n" : ""} ${kind} named "${name}" already exists.`);
}
function activeInstrument(catalog: DemoCatalog, id: string | null) {
  if (!id) return;
  const instrument = catalog.instruments.find(item => item.id === id);
  if (!instrument) throw new DataError("Instrument not found.");
  if (instrument.archivedAt) throw new DataError(`Instrument "${instrument.name}" is archived; choose an active instrument.`);
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (await admin()).rpc(name, args);
  if (error) throw new DataError(error.message);
  return data as unknown;
}
const reasonFor = (reason: string, kind: string) => {
  const clean = reason.trim();
  if (!clean) throw new DataError(`Archiving a${kind === "instrument" ? "n" : ""} ${kind} needs a reason.`);
  return clean;
};
const now = () => new Date().toISOString();

export async function createInstrument(input: InstrumentInput): Promise<string> {
  await manager(input.actorId);
  const clean = cleanInstrument(input);
  if (live()) return await rpc("create_instrument", { p_name: clean.name, p_model: clean.model, p_serial_number: clean.serialNumber }) as string;
  const catalog = await demoStored();
  takenName(catalog.instruments, clean.name, "instrument");
  const id = crypto.randomUUID();
  await writeDemoCatalog({ ...catalog, instruments: [...catalog.instruments, { id, name: clean.name, model: clean.model, serialNumber: clean.serialNumber, archivedAt: null, archivedReason: null }] });
  return id;
}
export async function updateInstrument(input: InstrumentInput & { id: string }): Promise<void> {
  await manager(input.actorId);
  const clean = cleanInstrument(input);
  if (live()) { await rpc("update_instrument", { p_id: input.id, p_name: clean.name, p_model: clean.model, p_serial_number: clean.serialNumber }); return; }
  const catalog = await demoStored();
  const instrument = catalog.instruments.find(item => item.id === input.id);
  if (!instrument) throw new DataError("Instrument not found.");
  if (instrument.archivedAt) throw new DataError("Instrument is archived.");
  takenName(catalog.instruments, clean.name, "instrument", input.id);
  await writeDemoCatalog({ ...catalog, instruments: catalog.instruments.map(item => item.id === input.id ? { ...item, name: clean.name, model: clean.model, serialNumber: clean.serialNumber } : item) });
}
export async function archiveInstrument(input: { id: string; reason: string; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  const reason = reasonFor(input.reason, "instrument");
  if (live()) { await rpc("archive_instrument", { p_id: input.id, p_reason: reason }); return; }
  const catalog = await demoStored();
  const instrument = catalog.instruments.find(item => item.id === input.id);
  if (!instrument) throw new DataError("Instrument not found.");
  if (instrument.archivedAt) throw new DataError("Instrument is already archived.");
  const using = catalog.panels.filter(panel => panel.instrumentId === input.id && !panel.archivedAt).map(panel => `"${panel.name}"`).sort();
  if (using.length) throw new DataError(`Instrument "${instrument.name}" is used by the active panel(s) ${using.join(", ")}; archive them or move them to another instrument first.`);
  // 0039: nor while a live profile points at it (instrument-profiles imports this module, hence the late import).
  const profiles = (await readDemoProfiles()) ?? (await import("./instrument-profiles")).seedDemoProfiles();
  const profileNames = profiles.filter(profile => profile.instrumentId === input.id && !profile.archivedAt).map(profile => `"${profile.name}"`).sort();
  if (profileNames.length) throw new DataError(`Instrument "${instrument.name}" is used by profile ${profileNames.join(", ")}; archive or move the profile first.`);
  await writeDemoCatalog({ ...catalog, instruments: catalog.instruments.map(item => item.id === input.id ? { ...item, archivedAt: now(), archivedReason: reason } : item) });
}

const panelArgs = (clean: ReturnType<typeof cleanPanel>) =>
  ({ p_instrument_id: clean.instrumentId, p_name: clean.name, p_lc_method: clean.lcMethod, p_istd_kits: clean.istdKits, p_dataset_type: clean.datasetType });
export async function createPanel(input: PanelInput): Promise<string> {
  await manager(input.actorId);
  const clean = cleanPanel(input);
  if (live()) return await rpc("create_panel", panelArgs(clean)) as string;
  const catalog = await demoStored();
  takenName(catalog.panels, clean.name, "panel");
  activeInstrument(catalog, clean.instrumentId);
  const id = crypto.randomUUID();
  await writeDemoCatalog({ ...catalog, panels: [...catalog.panels, { id, name: clean.name, instrumentId: clean.instrumentId, lcMethod: clean.lcMethod, istdKits: clean.istdKits, datasetType: clean.datasetType, archivedAt: null, archivedReason: null }] });
  return id;
}
export async function updatePanel(input: PanelInput & { id: string }): Promise<void> {
  await manager(input.actorId);
  const clean = cleanPanel(input);
  if (live()) { await rpc("update_panel", { p_id: input.id, ...panelArgs(clean) }); return; }
  const catalog = await demoStored();
  const panel = (await demoCatalog()).panels.find(item => item.id === input.id);
  if (!panel) throw new DataError("Panel not found.");
  if (panel.archivedAt) throw new DataError("Panel is archived.");
  takenName(catalog.panels, clean.name, "panel", input.id);
  if (clean.datasetType !== panel.datasetType && panel.orderCount + panel.batchCount > 0) {
    throw new DataError(`Panel "${panel.name}" is already used by an order or a batch, so its dataset type stays ${panel.datasetType}; create a new panel for ${clean.datasetType}.`);
  }
  if (clean.instrumentId !== panel.instrumentId) activeInstrument(catalog, clean.instrumentId);
  await writeDemoCatalog({ ...catalog, panels: catalog.panels.map(item => item.id === input.id
    ? { ...item, name: clean.name, instrumentId: clean.instrumentId, lcMethod: clean.lcMethod, istdKits: clean.istdKits, datasetType: clean.datasetType } : item) });
}
export async function archivePanel(input: { id: string; reason: string; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  const reason = reasonFor(input.reason, "panel");
  if (live()) { await rpc("archive_panel", { p_id: input.id, p_reason: reason }); return; }
  const catalog = await demoStored();
  const panel = catalog.panels.find(item => item.id === input.id);
  if (!panel) throw new DataError("Panel not found.");
  if (panel.archivedAt) throw new DataError("Panel is already archived.");
  await writeDemoCatalog({ ...catalog, panels: catalog.panels.map(item => item.id === input.id ? { ...item, archivedAt: now(), archivedReason: reason } : item) });
}

// ---------------------------------------------------------------- rate sheet (0033)

// The lab's rate sheet: one line per panel (price per sample and currency, minutes per injection), each part null when
// not set. Lab staff read it (live: admin.panel_rate, RLS lab staff only); lab Owner or Admin set it (set_panel_rate).
export type RateInput = { panelId: string; ratePerSample: number | null; currency: string | null; minutesPerInjection: number | null; actorId?: string };
type RateRow = { panel_id: string; rate_per_sample: number | string | null; currency: string | null; minutes_per_injection: number | string | null };
const numberOrNull = (value: number | string | null) => value === null || value === "" ? null : Number(value);
export const rateFromRow = (row: RateRow): PanelRate => ({
  panelId: row.panel_id, ratePerSample: numberOrNull(row.rate_per_sample), currency: row.currency, minutesPerInjection: numberOrNull(row.minutes_per_injection),
});

export async function listPanelRates(): Promise<PanelRate[]> {
  await requireWorkspace("staff");
  if (!live()) return (await demoStored()).rates ?? [];
  const { data, error } = await (await admin()).from("panel_rate").select("panel_id, rate_per_sample, currency, minutes_per_injection");
  if (error) throw new DataError(`The rate sheet could not be read: ${error.message}`);
  return ((data ?? []) as RateRow[]).map(rateFromRow);
}

// The same checks as set_panel_rate, so the demo refuses what the database would.
export function cleanRate(input: RateInput): RateInput {
  const currency = input.currency?.trim().toUpperCase() || null;
  const { ratePerSample, minutesPerInjection } = input;
  if (ratePerSample !== null && (!Number.isFinite(ratePerSample) || ratePerSample < 0)) throw new DataError("A rate per sample is 0 or more.");
  if ((ratePerSample === null) !== (currency === null)) throw new DataError("A rate needs its currency, and a currency needs a rate.");
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new DataError("Write the currency as its three-letter code (USD, EUR, GBP…).");
  if (minutesPerInjection !== null && (!Number.isFinite(minutesPerInjection) || minutesPerInjection <= 0 || minutesPerInjection > 600)) throw new DataError("Minutes per injection are more than 0 and at most 600.");
  return { ...input, currency, ratePerSample: ratePerSample === null ? null : Math.round(ratePerSample * 100) / 100, minutesPerInjection: minutesPerInjection === null ? null : Math.round(minutesPerInjection * 100) / 100 };
}

export async function setPanelRate(input: RateInput): Promise<void> {
  await manager(input.actorId);
  const clean = cleanRate(input);
  if (live()) {
    await rpc("set_panel_rate", { p_panel_id: clean.panelId, p_rate_per_sample: clean.ratePerSample, p_currency: clean.currency, p_minutes_per_injection: clean.minutesPerInjection });
    return;
  }
  const catalog = await demoStored();
  const panel = catalog.panels.find(item => item.id === clean.panelId);
  if (!panel) throw new DataError("Panel not found.");
  if (panel.archivedAt) throw new DataError(`Panel "${panel.name}" is archived; its rate cannot change.`);
  const line: PanelRate = { panelId: clean.panelId, ratePerSample: clean.ratePerSample, currency: clean.currency, minutesPerInjection: clean.minutesPerInjection };
  await writeDemoCatalog({ ...catalog, rates: [...(catalog.rates ?? []).filter(rate => rate.panelId !== clean.panelId), line] });
}
