import type { DatasetSettings, PreparationChoice, PreparationChoices } from '../api/types';
/** One preparation setting to ask for: Team's QC widget, with its default exactly as the API sent it. */
export interface PrepareField { name: string; label: string; kind: 'number' | 'choice' | 'boolean' | 'text'; choices?: string[]; min?: number; max?: number; step?: number; default: unknown }
export interface PrepareState { samples: string[]; selected: string[]; fields: PrepareField[]; values: Record<string, unknown> }
const kindOf = (choice: PreparationChoice): PrepareField['kind'] =>
  choice.kind === 'number' || choice.kind === 'choice' || choice.kind === 'boolean' ? choice.kind
  : choice.choices?.length ? 'choice' : typeof choice.teamControlDefault === 'boolean' ? 'boolean' : typeof choice.teamControlDefault === 'number' ? 'number' : 'text';
/** The 422 preparation_choices_required body as a form: every sample ticked, every setting at Team's default (kept, never recomputed). */
export function prepareState(body: PreparationChoices): PrepareState {
  const sampleChoice = body.missing.find(m => m.name === 'samples' || m.kind === 'samples');
  const samples = [...(sampleChoice?.choices ?? body.availableSamples ?? [])];
  const ticked = Array.isArray(sampleChoice?.teamControlDefault) ? samples.filter(s => (sampleChoice!.teamControlDefault as unknown[]).includes(s)) : [...samples];
  const settings = body.missing.filter(m => m !== sampleChoice);
  return {
    samples, selected: ticked,
    fields: settings.map(m => ({ name: m.name, label: m.label, kind: kindOf(m), choices: m.choices, min: m.min, max: m.max, step: m.step, default: m.teamControlDefault })),
    values: Object.fromEntries(settings.map(m => [m.name, m.teamControlDefault]))
  };
}
/** The selection in workbook order, whatever order the person ticked in. */
export const setSamples = (state: PrepareState, selected: readonly string[]): PrepareState => ({ ...state, selected: state.samples.filter(s => selected.includes(s)) });
export const setSample = (state: PrepareState, name: string, on: boolean): PrepareState => setSamples(state, on ? [...state.selected, name] : state.selected.filter(s => s !== name));
// An integer slider (integer step, bounds and default) stays integer, as Shiny's own decoding of Team's slider gives it.
const integerField = (f: PrepareField) => [f.step ?? 1, f.min ?? 0, f.max ?? 0, typeof f.default === 'number' ? f.default : 0].every(Number.isInteger);
export function setValue(state: PrepareState, name: string, raw: string | boolean | number): PrepareState {
  const field = state.fields.find(f => f.name === name);
  if (!field) return state;
  let value: unknown = raw;
  if (field.kind === 'number') {
    if (typeof raw === 'boolean' || raw === '') return state;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return state;
    value = integerField(field) ? Math.round(n) : n;
  } else if (field.kind === 'boolean') value = raw === true || raw === 'true';
  return { ...state, values: { ...state.values, [name]: value } };
}
/** The settings body: the ticked samples plus every setting, untouched values exactly as received. */
export const settingsBody = (state: PrepareState): DatasetSettings => ({ samples: [...state.selected], ...state.values });
export const canConfirm = (state: PrepareState): boolean => state.selected.length > 0;

// The opened dataset session in the shell: its title (top bar, window) and the band's summary.
import type { DatasetSession, Session } from '../api/types';
import { datasetStrings as d } from './strings';
const isDataset = (session: Session): session is DatasetSession => typeof (session as DatasetSession).dataset?.orderCode === 'string';
const count = (value: unknown): number | undefined => typeof value === 'number' ? value : Array.isArray(value) ? value.length : undefined;
/** ORD041 · v1, from dataset.orderCode and dataset.version; undefined for a checkpoint session. */
export const datasetTitle = (session: Session): string | undefined => isDataset(session) ? d.projectTitle(session.dataset.orderCode, session.dataset.version) : undefined;
/** 76 lipids · 5 samples, as the API reports them (counts or lists); undefined for a checkpoint session. */
export function datasetSummary(session: Session): string | undefined {
  if (!isDataset(session)) return undefined;
  const lipids = count(session.lipids), samples = count(session.samples);
  return lipids !== undefined && samples !== undefined ? d.summary(lipids, samples) : undefined;
}
