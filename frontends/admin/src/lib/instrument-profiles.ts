// Instrument profiles (0035): what is instrument-specific (software, batch file, bench sheet, plates, sample name
// pattern, results parser) and the blank and QC rules Batch builder starts from. Pure: types, the form's checks, the
// rule texts and the Batch builder defaults. The database calls and the demo store are in data/instrument-profiles.ts.
import { builderDefaults } from "./batch-builder";

export type ProfileSettings = {
  software: string | null; batchFile: string | null; benchSheet: string | null; plates: string | null;
  sampleNamePattern: string | null; resultsParser: string | null;
};
export type ProfileRules = {
  blanksAtStart: number; startBlankNote: string | null; blanksBetween: number; blanksBetweenEvery: number;
  pooledQcEvery: number; pooledQcNote: string | null; qcThresholds: string | null;
};
export type InstrumentProfile = {
  id: string; name: string; instrumentId: string; instrumentName: string | null; isActive: boolean;
  archivedAt: string | null; archivedReason: string | null; settings: ProfileSettings; rules: ProfileRules;
};

// The settings table, in the order the lab reads it.
export const settingRows: [keyof ProfileSettings, string][] = [
  ["software", "Software"], ["batchFile", "Batch file"], ["benchSheet", "Bench sheet"], ["plates", "Plates"],
  ["sampleNamePattern", "Sample name"], ["resultsParser", "Results parser"],
];
export const settingKeys = settingRows.map(([key]) => key);
export const emptySettings: ProfileSettings = { software: null, batchFile: null, benchSheet: null, plates: null, sampleNamePattern: null, resultsParser: null };
// A new profile starts from Batch builder's usual rules (as the database defaults do).
export const defaultRules: ProfileRules = {
  blanksAtStart: builderDefaults.blanksAtStart, startBlankNote: null, blanksBetween: 0, blanksBetweenEvery: 0,
  pooledQcEvery: builderDefaults.pooledQcEvery, pooledQcNote: null, qcThresholds: null,
};
export const MAX_COUNT = 96;

const blankToNull = (value: string | null | undefined) => value?.trim() || null;
export const cleanSettings = (settings: Partial<ProfileSettings>): ProfileSettings =>
  Object.fromEntries(settingKeys.map(key => [key, blankToNull(settings[key])])) as ProfileSettings;

type Source = { get(name: string): FormDataEntryValue | null };
export type RulesField = "blanksAtStart" | "blanksBetween" | "blanksBetweenEvery" | "pooledQcEvery";
const countLabels: Record<RulesField, string> = {
  blanksAtStart: "Blanks at the start", blanksBetween: "Blanks between samples", blanksBetweenEvery: "Samples between blanks", pooledQcEvery: "Pooled QC every",
};

// The rules form: counts are whole numbers from 0 to 96 (one plate); "" counts as 0. Blanks between samples is a pair
// (N blanks after every M samples): both numbers or neither, as admin.set_instrument_profile_rules checks.
export function parseRulesForm(source: Source): { ok: true; value: ProfileRules } | { ok: false; error: string } {
  const counts = {} as Record<RulesField, number>;
  for (const field of Object.keys(countLabels) as RulesField[]) {
    const raw = String(source.get(field) ?? "").trim();
    const value = raw ? Number(raw) : 0;
    if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) return { ok: false, error: `${countLabels[field]} must be a whole number from 0 to ${MAX_COUNT}.` };
    counts[field] = value;
  }
  if ((counts.blanksBetween === 0) !== (counts.blanksBetweenEvery === 0)) {
    return { ok: false, error: "Blanks between samples needs both numbers (blanks and every how many samples), or 0 for both." };
  }
  const note = (name: string) => blankToNull(String(source.get(name) ?? ""));
  return { ok: true, value: { ...counts, startBlankNote: note("startBlankNote"), pooledQcNote: note("pooledQcNote"), qcThresholds: note("qcThresholds") } };
}

// The rules as one line each, for places that only read them.
export function rulesText(rules: ProfileRules) {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const withNote = (text: string, note: string | null) => note ? `${text} (${note})` : text;
  return {
    start: withNote(plural(rules.blanksAtStart, "blank"), rules.startBlankNote),
    between: rules.blanksBetween ? `${plural(rules.blanksBetween, "blank")} after every ${plural(rules.blanksBetweenEvery, "sample")}` : "none",
    pooledQc: [rules.pooledQcEvery ? `every ${plural(rules.pooledQcEvery, "sample")}` : "none", rules.pooledQcNote].filter(Boolean).join(" · "),
    thresholds: rules.qcThresholds ?? "Not set",
  };
}

// What Batch builder pre-fills from the active profile; everything else keeps Batch builder's own defaults. With no
// active profile, Batch builder's defaults as before. The lab can still change each value per batch.
export type BuilderDefaults = typeof builderDefaults;
export function builderDefaultsFrom(profile: Pick<InstrumentProfile, "rules"> | null): BuilderDefaults {
  if (!profile) return builderDefaults;
  const { blanksAtStart, pooledQcEvery, blanksBetween, blanksBetweenEvery } = profile.rules;
  return { ...builderDefaults, blanksAtStart, pooledQcEvery, blanksBetween, blanksBetweenEvery };
}
