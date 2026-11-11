export type BodyStatus = 'updating' | 'current' | 'waiting' | 'error';
/** A plot card's status from what its body shows (cards.ts syncStatus). */
export function bodyStatus(b: { rendering: number; text: string; drawn: boolean; confirming: boolean; restoringText: string }): BodyStatus | undefined {
  // A render still in flight is not up to date yet, even once the plot is on screen.
  if (b.rendering > 0) return 'updating';
  // Waiting for its first image (queued behind other cards, or restoring) is not a failure.
  if (b.text === 'Loading figure…' || (b.restoringText !== '' && b.text === b.restoringText)) return 'updating';
  if (b.drawn) return 'current';
  if (b.confirming) return 'waiting';
  if (b.text && b.text !== 'Snapshot unavailable') return 'error';
  return undefined;
}
/** The card status line: a change note (Phase 3, "Updated by <name>", collab/render.ts) while it lasts, else the state's label. */
export function statusLabel(label: string, note: { text: string; until: number } | undefined, now: number): string {
  return note && now < note.until ? note.text : label;
}
