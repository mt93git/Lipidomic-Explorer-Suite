/** Move by index without mutating the API value or sorting the hierarchy. */
export function moveOrderedItem(value: string[], from: number, to: number): string[] {
  if (from < 0 || from >= value.length || to < 0 || to >= value.length || from === to) return value;
  const next = [...value];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
