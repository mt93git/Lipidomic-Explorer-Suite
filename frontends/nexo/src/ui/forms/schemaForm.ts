import type { Inputs, SchemaControl } from '../../api';
export function controlsByGroup(controls: SchemaControl[]) {
  return controls.reduce<Record<string, SchemaControl[]>>((groups, c) => {
    (groups[c.group ?? ''] ??= []).push(c); return groups;
  }, {});
}
/** Team's sliderInput(value = c(lo, hi)): a two-ended range the API expects as two numbers (schema.R). */
export function isRangePair(control: SchemaControl): boolean {
  return control.type === 'range' && (control.multiple === true || (Array.isArray(control.default) && control.default.length === 2));
}
export function coerceValue(control: SchemaControl, raw: unknown): unknown {
  if (isRangePair(control)) { const ends = (Array.isArray(raw) ? raw : [raw, raw]).slice(0, 2).map(Number); return ends.some(n => !Number.isFinite(n)) ? null : [Math.min(ends[0], ends[1]), Math.max(ends[0], ends[1])]; }
  if (control.type === 'number' || control.type === 'range') return raw === '' ? null : Number(raw);
  if (control.type === 'boolean') return raw === true || raw === 'true' || raw === 1;
  if (control.type === 'multiselect' || control.type === 'checkboxgroup' || control.multiple) return Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw];
  return raw;
}
/** After a change, re-read the schema when Team may build or narrow controls from it: a choice (updateSelectInput and
 * friends) or a checkbox (renderUI gated by req(isTRUE(input$x)), e.g. the 2D PCA's per-group colours after
 * "Override sample colors", R/modules/2_qc_boxplot_module.R:809-818). A plain value (number, text, colour) does not. */
export function schemaRefreshNeeded(controls: SchemaControl[], patch: Inputs): boolean {
  return controls.some(c => c.id in patch && (!!c.options || c.type === 'boolean'));
}
export function diffInputs(before: Inputs, after: Inputs): Inputs {
  return Object.fromEntries(Object.entries(after).filter(([key,value]) => JSON.stringify(before[key]) !== JSON.stringify(value)));
}
/** Team labels often carry their help sentence ("Activate Column Annotation Adds color-coded bands…"):
 * the short title stays the accessible label, the rest becomes muted help text. */
export function splitLabel(label: string | null | undefined): [string, string] {
  const text = String(label ?? '').trim();
  if (!text) return ['', ''];
  const punctuated = text.match(/^(.{3,64}?[.:])\s+(\S.*)$/);
  if (punctuated) return [punctuated[1].replace(/[.:]$/, ''), punctuated[2]];
  const verb = text.match(/^((?:\S+\s+){1,6}?\S+)\s+((?:Adds|Applies|Controls|Displays|Enables|Hides|Includes|Limits|Removes|Selects|Sets|Shows|Toggles|Uses|When|Whether|If)\b.*)$/);
  if (verb && verb[1].length <= 48) return [verb[1], verb[2]];
  return [text, ''];
}

/** Preserve Team's hierarchy controls, including schemas predating plugin metadata. */
export function isOrderedMultiSelect(control: SchemaControl): boolean {
  return (control.type === 'multiselect' || (control.type === 'select' && control.multiple === true)) &&
    (/\(order matters\)/i.test(control.label ?? '') ||
      (control.selectize?.plugins ?? []).includes('drag_drop') || (control.plugins ?? []).includes('drag_drop'));
}

export interface ChoiceState { value: string; label: string; checked: boolean; disabled: boolean; describedBy?: string }
/** Team's status note for a control (schema.R api_control_status, e.g. heat_significance_status under the heatmap's
 * "Show" radio): shown right under the control with Team's text; no text, no note. */
export function statusNote(control: SchemaControl): { id: string; text: string; allowed: boolean } | undefined {
  const text = control.status?.text?.trim();
  return control.status && text ? { id: `${control.id}-status`, text, allowed: control.status.allowed } : undefined;
}
/** A radio's options as Team draws them (www/team/js/dashboard_significance.js): only the option the note gates is
 * disabled when it is unavailable, and that option is described by the note. A stored value stays checked even when
 * its option is disabled: the Inspector never changes an input on its own. */
export function choiceStates(control: SchemaControl, value: unknown): ChoiceState[] {
  const note = statusNote(control), gated = control.status?.option;
  return (control.options ?? []).map(o => {
    const state: ChoiceState = { value: o.value, label: o.label, checked: value === o.value, disabled: !!gated && o.value === gated && control.status?.allowed === false };
    if (note && gated && o.value === gated) state.describedBy = note.id;
    return state;
  });
}
/** A group's heading: the title Team shows for that tab (groupLabel), else a raw tab value ("differential_view") humanised. */
export function groupTitle(group: string, controls: SchemaControl[]): string {
  const label = controls.find(c => c.groupLabel)?.groupLabel;
  if (label) return label;
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(group)) return group;
  const words = group.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
