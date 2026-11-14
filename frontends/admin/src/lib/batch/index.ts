export { toSequenceCsv, toBenchSheetCsv } from "./csv";

export interface BatchSample {
  code: string;
  /** Registry FullName, kept separately from the lab-generated injection name. */
  FullName: string;
  client_id: string;
  aliquot_id: string;
}

export interface BatchRules {
  blanksAtStart: number;
  /** Number of Unknowns between pooled QCs; zero disables periodic QCs. */
  pooledQcEvery: number;
  /** N blanks after every `blanksBetweenEvery` Unknowns, between samples only; both 0 (or absent) disables it. */
  blanksBetween?: number;
  blanksBetweenEvery?: number;
  blankAfterQc: boolean;
  qcAtEnd: boolean;
  randomize: boolean;
  seed: string;
}

export interface PlateLayout {
  plate: string;
  order: "column-major" | "row-major";
}

export interface BatchInput {
  samples: readonly BatchSample[];
  rules: BatchRules;
  plateLayout: PlateLayout;
  minutesPerInjection: number;
}

export interface Injection {
  seq: number;
  sample_type: "Unknown" | "Blank" | "Quality Control";
  sample_name: string;
  /** Trimmed registry FullName for the bench sheet; null for controls. */
  FullName: string | null;
  client_id: string | null;
  aliquot_id: string | null;
  plate: string;
  vial: string;
}

export interface ValidationMessage {
  code: "empty_input" | "duplicate_name" | "plate_overflow" | "invalid_rules" | "invalid_duration" | "invalid_sample" | "invalid_layout";
  message: string;
}

export interface BatchResult {
  injections: Injection[];
  estimatedRunTimeMinutes: number;
  /** All messages are errors: invalid batches return no injections and zero minutes. */
  validationMessages: ValidationMessage[];
}

/** FNV-1a over UTF-16 code units seeds Mulberry32; independent of Math.random. */
function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plan a single 96-well plate; every injection occupies one distinct well. */
export function buildBatch({ samples, rules, plateLayout, minutesPerInjection }: BatchInput): BatchResult {
  const validationMessages: ValidationMessage[] = [];
  const invalid = (): BatchResult => ({ injections: [], estimatedRunTimeMinutes: 0, validationMessages });
  if (samples.length === 0) {
    validationMessages.push({ code: "empty_input", message: "Select at least one sample." });
  }
  if (![rules.blanksAtStart, rules.pooledQcEvery].every(value => Number.isSafeInteger(value) && value >= 0)) {
    validationMessages.push({ code: "invalid_rules", message: "blanksAtStart and pooledQcEvery must be non-negative safe integers; zero disables the rule." });
  }
  const between = rules.blanksBetween ?? 0;
  const betweenEvery = rules.blanksBetweenEvery ?? 0;
  if (![between, betweenEvery].every(value => Number.isSafeInteger(value) && value >= 0)) {
    validationMessages.push({ code: "invalid_rules", message: "blanksBetween and blanksBetweenEvery must be non-negative safe integers; zero disables the rule." });
  } else if ((between === 0) !== (betweenEvery === 0)) {
    validationMessages.push({ code: "invalid_rules", message: "Blanks between samples needs both numbers (blanks, and after every how many samples), or 0 for both." });
  }
  if (rules.randomize && (typeof rules.seed !== "string" || !rules.seed.trim())) {
    validationMessages.push({ code: "invalid_rules", message: "Randomization requires a nonempty string seed." });
  }
  if (!Number.isFinite(minutesPerInjection) || minutesPerInjection <= 0) {
    validationMessages.push({ code: "invalid_duration", message: "Minutes per injection must be finite and greater than zero." });
  }
  if (!plateLayout.plate.trim() || !["column-major", "row-major"].includes(plateLayout.order)) {
    validationMessages.push({ code: "invalid_layout", message: "Provide a plate label and column-major or row-major order." });
  }

  const usedNames = new Set<string>();
  const duplicates = new Set<string>();
  for (const sample of samples) {
    if (![sample.code, sample.FullName, sample.client_id, sample.aliquot_id].every(value => typeof value === "string" && value.trim().length > 0)) {
      validationMessages.push({ code: "invalid_sample", message: "Each sample requires a code, FullName, client_id and aliquot_id." });
      continue;
    }
    const name = sample.code.trim();
    if (usedNames.has(name)) duplicates.add(name);
    usedNames.add(name);
  }
  for (const name of duplicates) {
    validationMessages.push({ code: "duplicate_name", message: `Duplicate sample code: ${name}. Names must be unique within the batch.` });
  }
  if (validationMessages.length) return invalid();

  const periodicQcCount = rules.pooledQcEvery > 0 ? Math.floor(samples.length / rules.pooledQcEvery) : 0;
  const needsEndQc = rules.qcAtEnd && (rules.pooledQcEvery === 0 || samples.length % rules.pooledQcEvery !== 0);
  const qcCount = periodicQcCount + Number(needsEndQc);
  const betweenCount = betweenEvery > 0 ? Math.floor((samples.length - 1) / betweenEvery) * between : 0;
  const injectionCount = samples.length + rules.blanksAtStart + qcCount * (rules.blankAfterQc ? 2 : 1) + betweenCount;
  if (injectionCount > 96) {
    validationMessages.push({ code: "plate_overflow", message: `Batch requires ${injectionCount} positions, including controls; the plate has 96.` });
    return invalid();
  }
  const estimatedRunTimeMinutes = injectionCount * minutesPerInjection;
  if (!Number.isFinite(estimatedRunTimeMinutes)) {
    validationMessages.push({ code: "invalid_duration", message: "Estimated run time exceeds the finite numeric range." });
    return invalid();
  }

  const orderedSamples = samples.map(sample => ({ ...sample, code: sample.code.trim(), FullName: sample.FullName.trim() }));
  if (rules.randomize) {
    const random = seededRandom(rules.seed);
    for (let i = orderedSamples.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [orderedSamples[i], orderedSamples[j]] = [orderedSamples[j], orderedSamples[i]];
    }
  }

  const injections: Injection[] = [];
  function append(sample_type: Injection["sample_type"], sample_name: string, sample?: BatchSample) {
    const position = injections.length;
    const columnMajor = plateLayout.order === "column-major";
    const row = columnMajor ? position % 8 : Math.floor(position / 12);
    const column = columnMajor ? Math.floor(position / 8) + 1 : position % 12 + 1;
    injections.push({
      seq: position + 1, sample_type, sample_name,
      FullName: sample?.FullName ?? null,
      client_id: sample?.client_id ?? null, aliquot_id: sample?.aliquot_id ?? null,
      plate: plateLayout.plate, vial: `${"ABCDEFGH"[row]}${column}`,
    });
  }

  const counters = { Blank: 0, "Quality Control": 0 };
  function appendControl(type: "Blank" | "Quality Control") {
    const prefix = type === "Blank" ? "Blank" : "QC";
    let name: string;
    do {
      name = `${prefix}_${String(++counters[type]).padStart(3, "0")}`;
    } while (usedNames.has(name));
    usedNames.add(name);
    append(type, name);
  }
  function appendQc() {
    appendControl("Quality Control");
    if (rules.blankAfterQc) appendControl("Blank");
  }

  for (let i = 0; i < rules.blanksAtStart; i++) appendControl("Blank");
  orderedSamples.forEach((sample, i) => {
    append("Unknown", sample.code, sample);
    if (rules.pooledQcEvery > 0 && (i + 1) % rules.pooledQcEvery === 0) appendQc();
    if (betweenEvery > 0 && (i + 1) % betweenEvery === 0 && i + 1 < orderedSamples.length) {
      for (let k = 0; k < between; k++) appendControl("Blank");
    }
  });
  if (needsEndQc) appendQc();

  return { injections, estimatedRunTimeMinutes, validationMessages };
}
