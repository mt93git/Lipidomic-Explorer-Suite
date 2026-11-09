// Steph review 4b: which cards a session palette change actually redrew. Team's palette response (palette.R) does not
// say which cards follow the session palette, and the schema's sessionPalette flag is per family (a card restyled in
// its Appearance tab keeps its own colours), so Nexo looks: each plot card's drawing before the change, then after
// the redraw the change starts. Changed: it follows the palette; drawn again unchanged: it keeps its own colours;
// not drawn again in time (off screen, still drawing, never drawn): not known yet.
export interface DrawProbe { id: string; signature(): string | undefined; busy(): boolean }
export interface PaletteRedraw { redrew: string[]; kept: string[]; later: string[] }
export function startRedrawWatch(probes: DrawProbe[]) {
  const before = new Map(probes.map(p => [p.id, p.signature()]));
  return {
    /** Call once the change is applied (its redraws have started); waits for them, bounded by timeoutMs. */
    async settle({ timeoutMs, now = () => Date.now(), sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)) }:
      { timeoutMs: number; now?: () => number; sleep?: (ms: number) => Promise<void> }): Promise<PaletteRedraw> {
      const started = probes.filter(p => p.busy()), end = now() + timeoutMs;
      while (started.some(p => p.busy()) && now() < end) await sleep(100);
      const out: PaletteRedraw = { redrew: [], kept: [], later: [] };
      for (const p of probes) {
        const was = before.get(p.id), is = p.signature();
        if (!started.includes(p) || p.busy() || was === undefined || is === undefined) out.later.push(p.id);
        else (was === is ? out.kept : out.redrew).push(p.id);
      }
      return out;
    }
  };
}
// Per card, what the last checked change showed. A card never checked falls back to the schema's sessionPalette.
const observed = new Map<string, boolean>();
export const PALETTE_FOLLOWERS_EVENT = 'nexo-palette-followers';
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PALETTE_FOLLOWERS_EVENT)); };
export function recordPaletteRedraw(result: PaletteRedraw): void {
  result.redrew.forEach(id => observed.set(id, true)); result.kept.forEach(id => observed.set(id, false)); changed();
}
export function followsSessionPalette(nodeId: string, schemaFlag: boolean | undefined): boolean { return observed.get(nodeId) ?? !!schemaFlag; }
/** A card's own colour settings changed (Appearance tab), or all cards (no id): what was seen no longer holds. */
export function forgetPaletteRedraw(nodeId?: string): void {
  if (nodeId === undefined) observed.clear(); else if (!observed.delete(nodeId)) return;
  changed();
}
