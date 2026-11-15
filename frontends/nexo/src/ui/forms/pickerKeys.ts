/** Keyboard model of the single searchable picker: the filter keeps focus, these keys move the active option. */
export function moveActive(key: string, index: number, count: number): number | null {
  if (!count) return null;
  switch (key) {
    case 'ArrowDown': return index < 0 ? 0 : Math.min(index + 1, count - 1);
    case 'ArrowUp': return index < 0 ? count - 1 : Math.max(index - 1, 0);
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
/** Rows the list shows: whole rows only (its height is rows × row height), never taller than six. */
export const wholeRows = (count: number) => Math.min(6, Math.max(1, count));
