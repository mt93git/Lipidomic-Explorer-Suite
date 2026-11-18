import type { Attractor, DiagnosticsOptions, Landscape, LandscapeRequest } from '../api/diagnostics';
// Synthetic Diagnostics answers for VITE_API_MOCK=1 and the tests: 2 conditions x 3 time points (the mock checkpoint).
const names = ['PC(16:0/18:1)', 'PC(18:0/22:6)', 'PE(18:1/20:4)', 'TG(16:0_18:1_18:1)', 'TG(18:1_20:4_18:1)', 'SM(d18:1/24:0)', 'LPC(18:0)', 'Cer(d18:1/24:1)'];
const groups = ['Control', 'Treatment'];
const att = (id: string, basin: number, deff: number, entropy: number, label = ''): Attractor => ({
  id, code: 0, basin, deff, entropy, depth: 1 - entropy / 5.17, cyclic: false, label,
  state: names.map((_, i) => (deff > 0.5 ? i % 2 : 1 - (i % 2))),
});
export function mockDiagnosticsOptions(): DiagnosticsOptions {
  return { samples: 24, features: 76, columns: [
    { name: 'Condition', numeric: false, missing: 0, levels: groups.map(level => ({ level, n: 12 })) },
    { name: 'TimePoint', numeric: false, missing: 0, levels: ['T1', 'T2', 'T3'].map(level => ({ level, n: 8 })) },
    { name: 'Age', numeric: true, missing: 0, levels: [] },
  ] };
}
export function mockLandscape(request: LandscapeRequest): Landscape {
  const reference = request.reference[0] ?? 'Control', target = request.target[0] ?? 'Treatment';
  const attractors = [att('A1', 0.52, 1, 0.9, target), att('A2', 0.27, 0.62, 1.8), att('A3', 0.14, 0, 1.2, reference), att('A4', 0.07, 0.31, 2.4)];
  const samples = Array.from({ length: 24 }, (_, i) => {
    const g = i < 12 ? reference : target, t = (i % 12) / 11, d = i < 12 ? 0.25 * t : 0.45 + 0.55 * t;
    const a = d > 0.8 ? 'A1' : d > 0.5 ? 'A2' : d > 0.2 ? 'A4' : 'A3';
    return { sample: `S${String(i + 1).padStart(2, '0')}`, group: g, pc1: d * 6 - 3, pc2: Math.sin(i) * 0.8, order: d, dInit: d,
      dFinal: attractors.find(x => x.id === a)!.deff, entropy: 2.2 - 1.4 * d + 0.2 * Math.cos(i), attractor: a, state: '01010101', subject: null };
  });
  const single = names.flatMap((_, node) => [0, 1].map(value => ({ id: `${names[node]}_${value}`, node: node + 1, value,
    score: Math.max(0.05, 0.68 - (node === 1 && value === 0 ? 0.4 : node === 4 && value === 1 ? 0.3 : 0.03 * ((node + value) % 4))), attractors })));
  return {
    params: { groupColumn: request.groupColumn, reference, target, ordering: request.orderingColumn || 'axis', nodes: names.length, window: 3, step: 4, cut: 0.6, samples: 24, features: 76, stateSpace: 256 },
    network: {
      nodes: names.map((name, i) => ({ id: i + 1, name, cls: name.replace(/[ (].*$/, ''), effect: i % 2 ? 1.4 : -1.2, p: 0.001, fdr: 0.01, core: i < 6,
        x: Math.cos(i / names.length * 2 * Math.PI), y: Math.sin(i / names.length * 2 * Math.PI) })),
      edges: [[1, 2, -1], [2, 1, -1], [2, 3, 1], [3, 4, 1], [4, 2, 1], [5, 6, 1], [6, 5, 1], [1, 5, 1], [7, 8, -1], [8, 1, 1]].map(([from, to, sign]) => ({ from, to, sign })),
    },
    rules: names.map((node, i) => ({ node, rule: names[(i + 1) % names.length], fit: 0.9, self: false })),
    attractors, score: 0.681, smax: 5.17, samples,
    flow: [0, 0.25, 0.5, 0.75, 1].flatMap(dInit => attractors.map(a => ({ dInit, dFinal: a.deff, count: Math.round(400 * a.basin * (1 - Math.abs(dInit - a.deff) / 2)) }))),
    entropyByAttractor: attractors.map(a => ({ attractor: a.id, deff: a.deff, min: a.entropy - 0.6, q1: a.entropy - 0.2, median: a.entropy, q3: a.entropy + 0.2, max: a.entropy + 0.6 })),
    perturbations: { single, control: { score: 0.681 }, double: [
      { first: single[2].id, second: single[9].id, score: 0.056, attractors: [att('A1', 0.8, 0.05, 0.8, reference), att('A2', 0.2, 0.3, 1.5)] },
      { first: single[2].id, second: single[5].id, score: 0.3, attractors },
      { first: single[9].id, second: single[5].id, score: 0.48, attractors },
    ] },
    metadata: [
      { column: 'TimePoint', kind: 'categorical', n: 24, statistic: 9.1, statisticName: 'Kruskal-Wallis H', p: 0.01, fdr: 0.02, attractorP: 0.04, mirrorsGroup: false,
        levels: ['T1', 'T2', 'T3'].map((level, k) => ({ level, n: 8, min: 0.1 * k, q1: 0.2 + 0.1 * k, median: 0.3 + 0.15 * k, q3: 0.45 + 0.15 * k, max: 0.6 + 0.15 * k, attractors: { A1: k, A2: 2, A3: 3 - k, A4: 3 } })) },
      { column: 'Age', kind: 'numeric', n: 24, statistic: 0.12, statisticName: 'Spearman rho', p: 0.57, fdr: 0.57, points: samples.map((x, i) => ({ x: 18 + i, y: x.dInit, attractor: x.attractor })) },
    ],
    metadataCases: [],
    diagnostic: [{ group: target, vs: reference, n: 24, aucInit: 0.97, aucFinal: 0.9, inTarget: 0.75 }],
    transitionIndex: [{ group: reference, n: 12, index: 1.1 }, { group: target, n: 12, index: 1.4 }],
    warnings: [],
  };
}
