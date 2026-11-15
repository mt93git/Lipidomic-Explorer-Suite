export interface PickerOption { value: string; label: string; class?: string }
export function isLongPicker(control: {type: string; options?: PickerOption[]}): boolean {
  return ['select','multiselect','checkboxgroup','text'].includes(control.type) && (control.options?.length ?? 0) > 12;
}
export function filterOptions(options: PickerOption[], query: string): PickerOption[] {
  const needle = query.trim().toLocaleLowerCase();
  return options.filter(o => [o.label,o.value,o.class ?? ''].some(v => v.toLocaleLowerCase().includes(needle)));
}
export function optionClasses(options: PickerOption[]): string[] {
  return [...new Set(options.flatMap(o => o.class ? [o.class] : []))];
}
/** Append new choices without reordering existing selections; remove a fully selected group. */
export function toggleOptions(selected: string[], choices: string[]): string[] {
  return choices.every(v => selected.includes(v)) ? selected.filter(v => !choices.includes(v)) : [...selected,...choices.filter(v => !selected.includes(v))];
}
