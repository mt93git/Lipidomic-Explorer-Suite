import type { Rect } from '../tiers';
export interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number }
export function snap(moving: Rect, others: Rect[], opts: { threshold: number; bypass?: boolean; grid?: number }): { x: number; y: number; guides: Guide[] } {
  const grid = opts.grid ?? 1;
  const round = (v: number) => Math.round(v / grid) * grid;
  const result = { x: round(moving.x), y: round(moving.y), guides: [] as Guide[] };
  if (opts.bypass) return result;
  const matches: { axis: 'x' | 'y'; at: number; delta: number; other: Rect }[] = [];
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height';
    let best: typeof matches[number] | undefined;
    // Prototype tie order: moving edge, opposite edge, centre; then other boxes.
    for (const offset of [0, moving[size], moving[size] / 2]) {
      for (const other of others) {
        for (const at of [other[axis], other[axis] + other[size], other[axis] + other[size] / 2]) {
          const delta = at - moving[axis] - offset;
          if (Math.abs(delta) < opts.threshold && (!best || Math.abs(delta) < Math.abs(best.delta)))
            best = { axis, at, delta, other };
        }
      }
    }
    if (best) { result[axis] = moving[axis] + best.delta; matches.push(best); }
  }
  for (const match of matches) {
    const cross = match.axis === 'x' ? 'y' : 'x';
    const size = match.axis === 'x' ? 'height' : 'width';
    result.guides.push({ axis: match.axis, at: match.at,
      from: Math.min(result[cross], match.other[cross]),
      to: Math.max(result[cross] + moving[size], match.other[cross] + match.other[size]) });
  }
  return result;
}
