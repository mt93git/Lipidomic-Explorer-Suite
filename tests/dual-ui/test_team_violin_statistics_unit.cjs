// Pure client contract for violin statistics: node tests/dual-ui/test_team_violin_statistics_unit.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const stats = require(path.resolve('www/team/js/canvas_statistics.js'));
const t = stats._test;
const hex = c => c.repeat(64);
const applied = {test: 'welch', correction: 'holm', scope: 'displayed', comparisons: [['A', 'B'], ['A', 'C']], effect: 'hedges_g'};
const result = {fingerprint: hex('a'), dataFingerprint: hex('b'), computedAt: '2026-10-30T12:00:00.000Z', lipid: '=PC(34:1)', grouping: 'Group1',
  family: {m: 2, features: 1, comparisons: 2, untestable: 1},
  groups: [{group: 'A', nSamples: 3, nExcluded: 1, nParticipants: 3}, {group: 'B', nSamples: 4, nExcluded: 0, nParticipants: 4}, {group: 'C', nSamples: 1, nExcluded: 0, nParticipants: 1}],
  rows: [{a: 'A', b: 'B', nA: 3, nB: 4, statistic: 2.5, df: 4.8, p: 0.0123, pAdj: 0.0246, effect: 1.2, note: ''},
    {a: 'A', b: 'C', nA: 3, nB: 1, statistic: null, df: null, p: null, pAdj: null, effect: null, note: 'Fewer than 2 values in a group; not tested.'}],
  provenance: {method: 'Welch two-sample t-test; Holm adjustment across m = 2 tests.', transformation: 'log10', normalization: 'PQN', imputation: 'No imputation', participantIds: 'unique', design: 'Confirmed independent design.'}};
const presentation = {show: true, pValue: 'adjusted', label: 'both', fontSize: 12, spacing: 0.08, tip: 0.02, nDisplay: 'both', hidden: []};
const saved = {version: '1', presentation, applied, result};

// Round trip and strict rejection.
assert.deepEqual(stats.sanitize(JSON.parse(JSON.stringify(saved))), saved);
assert.deepEqual(stats.sanitize({version: '1', presentation: {...presentation, hidden: []}, applied: null, result: null}).applied, null);
const broken = [
  s => { s.applied.effect = 'cliffs_delta'; },
  s => { s.applied.comparisons.push(['B', 'A'], ['A', 'B']); },
  s => { s.presentation.hidden = [['B', 'C']]; },
  s => { s.result.rows[0].pAdj = 0.001; },
  s => { s.result.family.m = 3; },
  s => { s.result.rows.reverse(); },
  s => { s.result.fingerprint = 'abc'; },
  s => { s.applied = null; },
  s => { s.version = '2'; },
  s => { s.result.rows[0].extra = 1; },
  s => { s.presentation.fontSize = 99; },
  s => { s.result.provenance.participantIds = 'repeated'; },
];
broken.forEach((mutate, i) => { const s = JSON.parse(JSON.stringify(saved)); mutate(s); assert.throws(() => stats.sanitize(s), /statistics/i, 'mutation ' + i + ' must be rejected'); });

// Exact, star and combined labels on the shown p value; q under BH.
assert.equal(t.formatP(0.0123), '0.012'); assert.equal(t.formatP(0.00012), '1.2e-4'); assert.equal(t.formatP(0.5), '0.50'); assert.equal(t.formatP(null), 'n/a');
assert.equal(t.stars(0.0009), '***'); assert.equal(t.stars(0.009), '**'); assert.equal(t.stars(0.049), '*'); assert.equal(t.stars(0.05), 'ns');
const row = result.rows[0];
assert.equal(t.label(row, applied, presentation), '* (adj. p = 0.025)');
assert.equal(t.label(row, applied, {...presentation, label: 'exact', pValue: 'raw'}), 'p = 0.012');
assert.equal(t.label(row, applied, {...presentation, label: 'stars', pValue: 'raw'}), '*');
assert.equal(t.label(row, {...applied, correction: 'BH'}, {...presentation, label: 'exact'}), 'q = 0.025');
assert.equal(t.label(row, {...applied, correction: 'none'}, {...presentation, label: 'exact'}), 'p = 0.012');
assert.equal(t.nLabel(result.groups[0], 'both'), 'n = 3 samples<br>3 participants');
assert.equal(t.nLabel({group: 'A', nSamples: 3, nExcluded: 0, nParticipants: null}, 'participants'), 'n = 3 samples');
assert.equal(t.nLabel(result.groups[2], 'samples'), 'n = 1 sample');

// Pairs and non-overlapping lanes.
assert.deepEqual(t.allPairs(['A', 'B', 'C']), [['A', 'B'], ['A', 'C'], ['B', 'C']]);
const laid = t.lanes([{i0: 0, i1: 2}, {i0: 0, i1: 1}, {i0: 1, i1: 2}]);
assert.deepEqual(laid.map(x => [x.i0, x.i1, x.lane]), [[0, 1, 0], [1, 2, 1], [0, 2, 2]]);
assert.deepEqual(t.lanes([{i0: 0, i1: 1}, {i0: 2, i1: 3}]).map(x => x.lane), [0, 0]);

// Hiding an annotation removes its bracket only; m and the rows stay declared.
const gd = {data: [{type: 'violin', x: ['A', 'A', 'A'], y: [1, 1.2, 1.4]}, {type: 'violin', x: ['B', 'B', 'B', 'B'], y: [2, 2.1, 2.2, 2.3]}, {type: 'violin', x: 'C', y: 1.8}],
  _fullLayout: {xaxis: {_categories: ['A', 'B', 'C']}}};
const state = {applied, result, presentation: {...presentation}, baseline: {range: [0.8, 2.5]}};
const shown = t.layoutFor(gd, state);
assert.equal(shown.shapes.length, 3, 'one testable bracket of three lines; untested pair is not drawn');
assert.ok(shown.shapes.every(s => s.name.startsWith('tcstat-')) && shown.annotations.every(a => a.name.startsWith('tcstat-')));
assert.ok(shown.annotations.some(a => a.text === '* (adj. p = 0.025)'));
assert.ok(shown.annotations.some(a => a.text === 'n = 1 sample<br>1 participant'), 'scalar Plotly x/y are counted');
assert.ok(shown.range[1] > 2.5 && shown.range[0] < 0.8);
const hidden = t.layoutFor(gd, {...state, presentation: {...presentation, hidden: [['A', 'B']]}});
assert.equal(hidden.shapes.length, 0);
assert.equal(state.result.family.m, 2);
const csvHidden = t.csv({...state, presentation: {...presentation, hidden: [['A', 'B']]}});
assert.equal(csvHidden.trim().split('\r\n').length, 3, 'hidden comparisons stay in the exported family');
assert.match(csvHidden, /,FALSE,/);

// CSV: exact values, provenance, fingerprint and formula-injection guard.
const csv = t.csv(state), lines = csv.trim().split('\r\n'), header = lines[0].split(','), first = lines[1].split(',');
assert.equal(first[header.indexOf('Lipid')], "'=PC(34:1)");
assert.equal(first[header.indexOf('p_unadjusted')], '0.0123');
assert.equal(first[header.indexOf('p_adjusted')], '0.0246');
assert.equal(first[header.indexOf('Family_size_m')], '2');
assert.equal(first[header.indexOf('Result_fingerprint')], hex('a'));
assert.equal(first[header.indexOf('Shown_on_plot')], 'TRUE');
assert.equal(t.csvCell(-1.5), '-1.5'); assert.equal(t.csvCell('-1'), "'-1"); assert.equal(t.csvCell('a,"b"'), '"a,""b"""');
const unadjusted = t.csv({...state, applied: {...applied, correction: 'none'}}).trim().split('\r\n')[1].split(',');
assert.equal(unadjusted[header.indexOf('p_adjusted')], '');
console.log('PASS violin statistics client: strict persistence, labels, lanes, hidden annotations keep the family, CSV provenance');

for(const p of [0.049999,0.009999,0.0009999,0.049999999999999996]){const displayed=Number(require("../../www/team/js/canvas_statistics.js")._test.formatP(p));for(const cutoff of [0.05,0.01,0.001])require("node:assert/strict").equal(displayed<cutoff,p<cutoff);}
console.log("PASS displayed p-value preserves significance thresholds");
