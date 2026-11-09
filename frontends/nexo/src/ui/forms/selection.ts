// Team's dashboard selection bars store their value in a hidden text input as a token or a JSON array
// (www/team/js/dashboard_selection.js read/write). Nexo reads and writes the same wire format.
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
export function readSelection(value: unknown, choices: string[], defaults?: string[] | null): string[] {
  if (value === '__ALL__') return (defaults && defaults.length ? defaults.filter(v => choices.includes(v)) : choices).slice();
  if (value === '__EVERY__') return choices.slice();
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return isStrings(parsed) ? choices.filter(v => parsed.includes(v)) : []; }
  catch { return []; }
}
export function writeSelection(values: string[], choices: string[], allToken: '__ALL__' | '__EVERY__' = '__ALL__'): string {
  const ordered = choices.filter(v => values.includes(v));
  return ordered.length === choices.length ? allToken : JSON.stringify(ordered);
}
