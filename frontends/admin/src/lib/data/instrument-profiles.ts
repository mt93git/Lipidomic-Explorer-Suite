import "server-only";
import { builderDefaults } from "../batch-builder";
import { getEnvironment } from "../environment";
import {
  builderDefaultsFrom, cleanSettings, defaultRules, MAX_COUNT, type BuilderDefaults, type InstrumentProfile, type ProfileRules, type ProfileSettings,
} from "../instrument-profiles";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoProfiles, writeDemoProfiles } from "./demo-store";
import { DataError, getCatalog, manager } from "./instruments-panels";

// Instrument profiles (0035): lab staff read them; the lab's Owner or Admin create, edit, activate and archive them
// through the admin functions (the same check as instruments and panels). The demo keeps this browser's profiles in
// the demo store, seeded with one example profile on the demo's triple quadrupole.
export { DataError };
export type DemoProfile = Omit<InstrumentProfile, "instrumentName">;
export type ProfileInput = { name: string; instrumentId: string; settings: Partial<ProfileSettings>; actorId?: string };

const live = () => !getEnvironment().mock;
const byActiveThenName = (a: InstrumentProfile, b: InstrumentProfile) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name);
const now = () => new Date().toISOString();

// Example data (synthetic: product names as the lab's prototype shows them, no lab records).
export function seedDemoProfiles(): DemoProfile[] {
  return [{
    id: "demo-profile-qqq", name: "SCIEX Triple Quad 7500 · Shimadzu LC-40R", instrumentId: "demo-instrument-qqq", isActive: true,
    archivedAt: null, archivedReason: null,
    settings: {
      software: "SCIEX OS (version to confirm)", batchFile: "built on a blank batch exported from the lab's SCIEX OS",
      benchSheet: "Sample · Identification # · Injection Volume (uL) · Plate Number · Vial Position", plates: "54-vial plates",
      sampleNamePattern: "{batch}_{order}_{sample}", resultsParser: "SCIEX OS wide TXT (Sample Name, Sample Type rows)",
    },
    rules: { blanksAtStart: 4, startBlankNote: "1:1 IPA:ACN", blanksBetween: 5, blanksBetweenEvery: 4, pooledQcEvery: 0, pooledQcNote: "recommended every 8", qcThresholds: "CV 20 % · ISTD ±30 % · S/N ≥ 10" },
  }];
}
async function demoStored(): Promise<DemoProfile[]> {
  return (await readDemoProfiles()) ?? seedDemoProfiles();
}

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (await admin()).rpc(name, args);
  if (error) throw new DataError(error.message);
  return data as unknown;
}

// ---------------------------------------------------------------- reads

type ProfileRow = {
  id: string; name: string; instrument_id: string; is_active: boolean; archived_at: string | null; archived_reason: string | null;
  software: string | null; batch_file: string | null; bench_sheet: string | null; plates: string | null; sample_name_pattern: string | null; results_parser: string | null;
  blanks_at_start: number; start_blank_note: string | null; blanks_between: number; blanks_between_every: number; pooled_qc_every: number;
  pooled_qc_note: string | null; qc_thresholds: string | null; instrument: { name: string } | { name: string }[] | null;
};
const profileSelect = "id, name, instrument_id, is_active, archived_at, archived_reason, software, batch_file, bench_sheet, plates, sample_name_pattern, results_parser, "
  + "blanks_at_start, start_blank_note, blanks_between, blanks_between_every, pooled_qc_every, pooled_qc_note, qc_thresholds, instrument:instrument(name)";
function profileFromRow(row: ProfileRow): InstrumentProfile {
  const instrument = Array.isArray(row.instrument) ? row.instrument[0] ?? null : row.instrument;
  return {
    id: row.id, name: row.name, instrumentId: row.instrument_id, instrumentName: instrument?.name ?? null, isActive: row.is_active,
    archivedAt: row.archived_at, archivedReason: row.archived_reason,
    settings: { software: row.software, batchFile: row.batch_file, benchSheet: row.bench_sheet, plates: row.plates, sampleNamePattern: row.sample_name_pattern, resultsParser: row.results_parser },
    rules: { blanksAtStart: row.blanks_at_start, startBlankNote: row.start_blank_note, blanksBetween: row.blanks_between, blanksBetweenEvery: row.blanks_between_every,
      pooledQcEvery: row.pooled_qc_every, pooledQcNote: row.pooled_qc_note, qcThresholds: row.qc_thresholds },
  };
}

// Every profile (archived included), the active one first.
export async function getProfiles(): Promise<InstrumentProfile[]> {
  await requireWorkspace("staff");
  if (!live()) {
    const { instruments } = await getCatalog();
    return (await demoStored()).map(profile => ({ ...profile, instrumentName: instruments.find(item => item.id === profile.instrumentId)?.name ?? null })).sort(byActiveThenName);
  }
  const { data, error } = await (await admin()).from("instrument_profile").select(profileSelect).order("name");
  if (error) throw new DataError(`Instrument profiles could not be read: ${error.message}`);
  return ((data ?? []) as unknown as ProfileRow[]).map(profileFromRow).sort(byActiveThenName);
}

// Batch builder's starting values: the active profile's rules. Batch builder must open even when the profiles cannot
// be read (a database without 0035, a refused read), so any failure keeps its own defaults.
export async function activeBuilderDefaults(): Promise<BuilderDefaults> {
  try {
    await requireWorkspace("staff");
    if (!live()) return builderDefaultsFrom((await demoStored()).find(profile => profile.isActive) ?? null);
    const { data, error } = await (await admin()).from("instrument_profile").select("blanks_at_start, pooled_qc_every, blanks_between, blanks_between_every").eq("is_active", true).maybeSingle();
    if (error || !data) return builderDefaults;
    const row = data as { blanks_at_start: number; pooled_qc_every: number; blanks_between: number; blanks_between_every: number };
    return builderDefaultsFrom({ rules: { ...defaultRules, blanksAtStart: row.blanks_at_start, pooledQcEvery: row.pooled_qc_every,
      blanksBetween: row.blanks_between, blanksBetweenEvery: row.blanks_between_every } });
  } catch (error) {
    if (error instanceof DataError) return builderDefaults;
    throw error;
  }
}

// ---------------------------------------------------------------- writes

function cleanInput(input: ProfileInput) {
  const name = input.name.trim();
  if (!name) throw new DataError("Profile name is required.");
  if (!input.instrumentId) throw new DataError("Choose the instrument this profile is for.");
  return { name, instrumentId: input.instrumentId, settings: cleanSettings(input.settings) };
}
const settingArgs = (settings: ProfileSettings) => ({
  p_software: settings.software, p_batch_file: settings.batchFile, p_bench_sheet: settings.benchSheet, p_plates: settings.plates,
  p_sample_name_pattern: settings.sampleNamePattern, p_results_parser: settings.resultsParser,
});
async function demoActiveInstrument(id: string) {
  const instrument = (await getCatalog()).instruments.find(item => item.id === id);
  if (!instrument) throw new DataError("Instrument not found.");
  if (instrument.archivedAt) throw new DataError(`Instrument "${instrument.name}" is archived; choose an active instrument.`);
}
function takenName(profiles: DemoProfile[], name: string, id?: string) {
  const taken = profiles.find(profile => profile.id !== id && profile.name === name);
  if (!taken) return;
  if (taken.archivedAt) throw new DataError(`An archived profile is already named "${name}"; archived profiles keep their names, so choose another name.`);
  throw new DataError(`A profile named "${name}" already exists.`);
}
function liveProfile(profiles: DemoProfile[], id: string) {
  const profile = profiles.find(item => item.id === id);
  if (!profile) throw new DataError("Profile not found.");
  if (profile.archivedAt) throw new DataError(`Profile "${profile.name}" is archived.`);
  return profile;
}
const replace = (profiles: DemoProfile[], id: string, change: (profile: DemoProfile) => DemoProfile) => profiles.map(item => item.id === id ? change(item) : item);

export async function createProfile(input: ProfileInput): Promise<string> {
  await manager(input.actorId);
  const clean = cleanInput(input);
  if (live()) return await rpc("create_instrument_profile", { p_instrument_id: clean.instrumentId, p_name: clean.name, ...settingArgs(clean.settings) }) as string;
  const profiles = await demoStored();
  takenName(profiles, clean.name);
  await demoActiveInstrument(clean.instrumentId);
  const id = crypto.randomUUID();
  const isActive = !profiles.some(profile => profile.isActive);
  await writeDemoProfiles([...profiles, { id, name: clean.name, instrumentId: clean.instrumentId, isActive, archivedAt: null, archivedReason: null, settings: clean.settings, rules: defaultRules }]);
  return id;
}
export async function updateProfile(input: ProfileInput & { id: string }): Promise<void> {
  await manager(input.actorId);
  const clean = cleanInput(input);
  if (live()) { await rpc("update_instrument_profile", { p_id: input.id, p_instrument_id: clean.instrumentId, p_name: clean.name, ...settingArgs(clean.settings) }); return; }
  const profiles = await demoStored();
  const profile = liveProfile(profiles, input.id);
  takenName(profiles, clean.name, input.id);
  if (clean.instrumentId !== profile.instrumentId) await demoActiveInstrument(clean.instrumentId);
  await writeDemoProfiles(replace(profiles, input.id, item => ({ ...item, name: clean.name, instrumentId: clean.instrumentId, settings: clean.settings })));
}
export async function setProfileRules(input: { id: string; rules: ProfileRules; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  const { rules } = input;
  const counts = [rules.blanksAtStart, rules.blanksBetween, rules.blanksBetweenEvery, rules.pooledQcEvery];
  if (!counts.every(value => Number.isInteger(value) && value >= 0 && value <= MAX_COUNT)) throw new DataError(`Counts must be whole numbers from 0 to ${MAX_COUNT}.`);
  if ((rules.blanksBetween === 0) !== (rules.blanksBetweenEvery === 0)) throw new DataError("Blanks between samples needs both numbers (blanks and every how many samples), or 0 for both.");
  if (live()) {
    await rpc("set_instrument_profile_rules", {
      p_id: input.id, p_blanks_at_start: rules.blanksAtStart, p_start_blank_note: rules.startBlankNote, p_blanks_between: rules.blanksBetween,
      p_blanks_between_every: rules.blanksBetweenEvery, p_pooled_qc_every: rules.pooledQcEvery, p_pooled_qc_note: rules.pooledQcNote, p_qc_thresholds: rules.qcThresholds,
    });
    return;
  }
  const profiles = await demoStored();
  liveProfile(profiles, input.id);
  await writeDemoProfiles(replace(profiles, input.id, item => ({ ...item, rules: { ...rules } })));
}
export async function activateProfile(input: { id: string; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  if (live()) { await rpc("activate_instrument_profile", { p_id: input.id }); return; }
  const profiles = await demoStored();
  liveProfile(profiles, input.id);
  await writeDemoProfiles(profiles.map(item => ({ ...item, isActive: item.id === input.id })));
}
export async function archiveProfile(input: { id: string; reason: string; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  const reason = input.reason.trim();
  if (!reason) throw new DataError("Archiving a profile needs a reason.");
  if (live()) { await rpc("archive_instrument_profile", { p_id: input.id, p_reason: reason }); return; }
  const profiles = await demoStored();
  const profile = liveProfile(profiles, input.id);
  if (profile.isActive) throw new DataError(`Profile "${profile.name}" is the active one; make another profile active first.`);
  await writeDemoProfiles(replace(profiles, input.id, item => ({ ...item, archivedAt: now(), archivedReason: reason })));
}
