import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../../collab/mode', () => ({ collab: () => null }));
vi.mock('../../collab/roles', () => ({ currentRole: () => null, subscribeRole: () => () => {} }));
import { mockDiagnosticsOptions, mockLandscape } from '../../mock/diagnostics';
import { TopBar } from '../TopBar';
import { defaultRequest, mirrorTag, visibleTests, withReference } from './DiagnosticsPage';
import { LandscapeFigure, NetworkFigure, PairedFigure, PerturbationFigure } from './Figures';
import { edgePath, fitLayout, landscapeCurve, perturbationLabel, rampColor, shortName } from './landscapeMath';

it('the landscape surface sits at S max away from the attractors and reaches each attractor entropy at its effective distance', () => {
  const attractors = [{ deff: 0, entropy: 1.2, basin: 0.1 }, { deff: 1, entropy: 0.6, basin: 0.8 }];
  const curve = landscapeCurve(attractors, 3, -0.15, 1.15, 260);
  const at = (x: number) => curve.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  expect(at(0).y).toBeCloseTo(1.2, 5);
  expect(at(1).y).toBeCloseTo(0.6, 5);
  expect(at(0.5).y).toBeGreaterThan(2.9);
  expect(curve.every(p => p.y <= 3 + 1e-9)).toBe(true);
});

it('a wider basin draws a wider valley', () => {
  const narrow = landscapeCurve([{ deff: 0.5, entropy: 0, basin: 0.05 }], 2), wide = landscapeCurve([{ deff: 0.5, entropy: 0, basin: 0.9 }], 2);
  const area = (c: { y: number }[]) => c.reduce((s, p) => s + (2 - p.y), 0);
  expect(area(wide)).toBeGreaterThan(area(narrow) * 2);
});

it('the effective distance ramp runs from teal (reference) to coral (target)', () => {
  expect(rampColor(0)).toBe('rgb(31,158,160)');
  expect(rampColor(1)).toBe('rgb(214,82,72)');
  expect(rampColor(-3)).toBe(rampColor(0));
});

it('network layout fits the box and edges stop at the node circles', () => {
  const pos = fitLayout([{ id: 1, x: -5, y: 0 }, { id: 2, x: 5, y: 10 }], 400, 300, 40);
  expect(pos[1]).toEqual({ x: 40, y: 40 });
  expect(pos[2]).toEqual({ x: 360, y: 260 });
  const straight = edgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, false);
  expect(straight.end.x).toBeCloseTo(88, 5);
  expect(straight.d.startsWith('M10.0,0.0')).toBe(true);
});

it('lipid names drop the adduct and perturbations read as low/high', () => {
  expect(shortName('TAG(51:1_FA18:1)+NH4')).toBe('TAG(51:1_FA18:1)');
  expect(shortName('CL(72:4_18:0)-2H')).toBe('CL(72:4_18:0)');
  expect(shortName('ACar 5:0')).toBe('ACar 5:0');
  expect(perturbationLabel('TAG(51:1_FA18:1)+NH4_1')).toBe('TAG(51:1_FA18:1) = high');
  expect(perturbationLabel('ACar 5:0_0')).toBe('ACar 5:0 = low');
});

it('the default request picks the condition column, a control reference and a disease target', () => {
  const request = defaultRequest({ samples: 42, features: 300, columns: [
    { name: 'Sex', numeric: false, missing: 0, levels: [{ level: 'Male', n: 20 }, { level: 'Female', n: 22 }] },
    { name: 'Condition', numeric: false, missing: 0, levels: [{ level: 'Remission', n: 14 }, { level: 'Control', n: 14 }, { level: 'Disease', n: 14 }] },
    { name: 'Subject_ID', numeric: false, missing: 0, levels: [] },
    { name: 'Age', numeric: true, missing: 0, levels: [] },
  ] });
  expect(request).toMatchObject({ groupColumn: 'Condition', reference: ['Control'], target: ['Disease'], subjectColumn: 'Subject_ID' });
  expect(request?.orderingColumn).toBeUndefined();
  expect(defaultRequest({ samples: 3, features: 1, columns: [{ name: 'Age', numeric: true, missing: 0, levels: [] }] })).toBeNull();
});

it('choosing the target as the reference swaps the two groups instead of leaving them equal', () => {
  const request = { groupColumn: 'Genotype', reference: ['Knockout'], target: ['Wild type'], nodes: 12 };
  expect(withReference(request, 'Wild type')).toMatchObject({ reference: ['Wild type'], target: ['Knockout'] });
  expect(withReference(request, 'Heterozygous')).toMatchObject({ reference: ['Heterozygous'], target: ['Wild type'] });
});

it('a wild type group is the default reference', () => {
  const request = defaultRequest({ samples: 8, features: 32, columns: [
    { name: 'Genotype', numeric: false, missing: 0, levels: [{ level: 'Knockout', n: 4 }, { level: 'Wild type', n: 4 }] },
  ] });
  expect(request).toMatchObject({ reference: ['Wild type'], target: ['Knockout'] });
});

it('columns that rename the groups in full or in one level are tagged and hidden together', () => {
  const test = (column: string, extra: object) => ({ column, kind: 'categorical' as const, n: 60, statistic: 20, statisticName: 'Kruskal-Wallis H', p: 1e-6, fdr: 1e-5, ...extra });
  const tests = [test('State', { mirrorsGroup: true }), test('HU_group', { mirrorsGroup: false, containsGroup: 'Control' }), test('Sex', { mirrorsGroup: false })];
  expect(tests.map(mirrorTag)).toEqual(['mirrors groups', 'contains Control', null]);
  expect(visibleTests(tests, true).map(m => m.column)).toEqual(['Sex']);
  expect(visibleTests(tests, false)).toHaveLength(3);
});

it('the figures draw the mock landscape: lipid network, valleys and every perturbation', () => {
  const data = mockLandscape(defaultRequest(mockDiagnosticsOptions())!);
  const network = renderToStaticMarkup(createElement(NetworkFigure, { data }));
  expect(network).toContain('aria-label="Lipid co-regulation network"');
  expect((network.match(/<circle/g) ?? []).length).toBe(data.network.nodes.length);
  expect(network).toContain('stroke="#c0392b"'); // inhibitions are red
  const landscape = renderToStaticMarkup(createElement(LandscapeFigure, { attractors: data.attractors, smax: data.smax, score: data.score, title: 'Attractor landscape', reference: 'Control', target: 'Treatment' }));
  expect(landscape).toContain('Aberrance score = 0.681');
  const perturb = renderToStaticMarkup(createElement(PerturbationFigure, { data }));
  expect(perturb).toContain('PC(18:0/22:6) = low');
  expect((perturb.match(/>Control</g) ?? []).length).toBe(2);
});

it('the top bar offers Diagnostics after Canvas and marks the current view', () => {
  const html = (view: 'canvas' | 'diagnostics') => renderToStaticMarkup(createElement(TopBar, { projectName: 'Synthetic', onCheckpoints() {}, saveText: '', saveStatus: 'idle', view, onView() {} }));
  expect(html('canvas')).toMatch(/<button type="button" class="step" aria-current="step">Canvas<\/button><button type="button" class="step">Diagnostics<\/button>/);
  expect(html('diagnostics')).toMatch(/<button type="button" class="step">Canvas<\/button><button type="button" class="step" aria-current="step">Diagnostics<\/button>/);
  // Without a view switch (older callers) the bar keeps its single Canvas step.
  expect(renderToStaticMarkup(createElement(TopBar, { projectName: 'Synthetic', onCheckpoints() {}, saveText: '', saveStatus: 'idle' }))).toContain('<span aria-current="step">Canvas</span>');
});

it('the paired figure draws one line per subject between its two groups, with the median shift and p', () => {
  const pair = { from: 'Steady State', to: 'Crisis', n: 3, shift: 0.25, p: 0.03, subjects: [
    { subject: 'P1', from: 0.2, to: 0.5 }, { subject: 'P2', from: 0.4, to: 0.65 }, { subject: 'P3', from: 0.6, to: 0.5 }] };
  const html = renderToStaticMarkup(createElement(PairedFigure, { pair }));
  expect(html).toContain('aria-label="Same subject: Steady State → Crisis"');
  expect((html.match(/<line class="dx-pair/g) ?? []).length).toBe(3);
  expect((html.match(/dx-pair-down/g) ?? []).length).toBe(1); // P3 moved back towards the reference
  expect(html).toContain('3 subjects · median shift +0.25 · p = 0.030');
});
