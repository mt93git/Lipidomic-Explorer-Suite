/* Violin statistics for independent Team Canvas copies.
   Scientific settings are staged and only computed after Review -> Confirm; the
   server computes every p-value from the values this copy draws. Presentation
   changes redraw immediately and never change the correction family. */
(function (global) {
  'use strict';
  var SOURCE = 'results_dashboard-plot_violin', VERSION = '1', PREFIX = 'tcstat-';
  var TESTS = {welch: 'Welch t-test', wilcoxon: 'Wilcoxon rank-sum (Mann-Whitney)'};
  var CORRECTIONS = {holm: 'Holm', BH: 'Benjamini-Hochberg (FDR, q)', bonferroni: 'Bonferroni', none: 'None (unadjusted)'};
  var SCOPES = {displayed: 'This lipid only', all_in_scope: 'Every lipid in the current scope'};
  var EFFECTS = {none: 'None', hedges_g: "Hedges' g", cliffs_delta: "Cliff's delta"};
  var MATCHED_EFFECT = {welch: 'hedges_g', wilcoxon: 'cliffs_delta'};
  var LIMITS = {comparisons: 45, groups: 30, features: 5000, tests: 20000};
  var PRESENTATION = {show: true, pValue: 'adjusted', label: 'both', fontSize: 12, spacing: 0.08, tip: 0.02, nDisplay: 'samples', hidden: []};
  var STATUS = {
    none: 'No statistics applied. Choose the analysis below, then Review and confirm to compute p-values.',
    computing: 'Computing statistics from the values drawn in this plot…',
    verifying: 'Checking the saved statistics against the current data…',
    checking: 'The plot updated. Checking that the statistics still match the drawn data…',
    current: 'Statistics match the values drawn in this plot.',
    invalid: 'No current statistics: the data, displayed lipid, grouping, participant IDs or design approval changed after they were confirmed. Review and confirm to compute them again.'
  };
  var records = new Set(), requests = new Map(), sequence = 0, policy = null;

  // ---- Validation (mirrors team_canvas_statistics() in canvas_state.R) -----
  function fail(message) { throw new Error(message || 'Invalid saved violin statistics.'); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function keys(v, allowed, required) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
    Object.keys(v).forEach(function (k) { if (allowed.indexOf(k) < 0) fail(); });
    (required || allowed).forEach(function (k) { if (!has(v, k)) fail(); });
  }
  function text(v, max, empty) { if (typeof v !== 'string' || v.length > max || (!empty && !v.length) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)) fail(); return v; }
  function choice(v, choices) { if (typeof v !== 'string' || !has(choices, v)) fail(); return v; }
  function int(v, min, max) { if (!Number.isInteger(v) || v < min || v > max) fail(); return v; }
  function num(v, min, max, nullable) { if ((v === null || v === undefined) && nullable) return null; if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(); return v; }
  function pairKey(pair) { return JSON.stringify(pair); }
  function unordered(pair) { return pairKey(pair.slice().sort()); }
  function pairs(v, min, max) {
    if (!Array.isArray(v) || v.length < min || v.length > max) fail();
    var seen = new Set();
    return v.map(function (pair) {
      if (!Array.isArray(pair) || pair.length !== 2) fail();
      var out = [text(pair[0], 500), text(pair[1], 500)], unordered = pairKey(out.slice().sort());
      if (out[0] === out[1] || seen.has(unordered)) fail();
      seen.add(unordered); return out;
    });
  }
  function sanitizeSettings(v) {
    keys(v, ['test', 'correction', 'scope', 'comparisons', 'effect']);
    var test = choice(v.test, TESTS), effect = choice(v.effect, EFFECTS);
    if (effect !== 'none' && effect !== MATCHED_EFFECT[test]) fail();
    return {test: test, correction: choice(v.correction, CORRECTIONS), scope: choice(v.scope, SCOPES), comparisons: pairs(v.comparisons, 1, LIMITS.comparisons), effect: effect};
  }
  function sanitizePresentation(v, applied) {
    keys(v, ['show', 'pValue', 'label', 'fontSize', 'spacing', 'tip', 'nDisplay', 'hidden']);
    if (typeof v.show !== 'boolean') fail();
    var hidden = pairs(v.hidden, 0, LIMITS.comparisons), declared = new Set((applied ? applied.comparisons : []).map(pairKey));
    if (hidden.some(function (pair) { return !declared.has(pairKey(pair)); })) fail();
    return {show: v.show, pValue: choice(v.pValue, {adjusted: 1, raw: 1}), label: choice(v.label, {exact: 1, stars: 1, both: 1}),
      fontSize: int(v.fontSize, 8, 28), spacing: num(v.spacing, 0.03, 0.3), tip: num(v.tip, 0, 0.1),
      nDisplay: choice(v.nDisplay, {samples: 1, participants: 1, both: 1, hidden: 1}), hidden: hidden};
  }
  function sanitizeResult(v, applied) {
    if (!applied) fail();
    keys(v, ['fingerprint', 'dataFingerprint', 'computedAt', 'lipid', 'grouping', 'family', 'groups', 'rows', 'provenance']);
    ['fingerprint', 'dataFingerprint'].forEach(function (k) { if (typeof v[k] !== 'string' || !/^[a-f0-9]{64}$/.test(v[k])) fail(); });
    var computedAt = text(v.computedAt, 64);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(computedAt) || !Number.isFinite(Date.parse(computedAt))) fail();
    keys(v.family, ['m', 'features', 'comparisons', 'untestable']);
    var family = {features: int(v.family.features, 1, LIMITS.features), comparisons: int(v.family.comparisons, 1, LIMITS.comparisons), m: int(v.family.m, 1, LIMITS.tests)};
    family.untestable = int(v.family.untestable, 0, family.m);
    if (family.m !== family.features * family.comparisons || family.comparisons !== applied.comparisons.length || (applied.scope === 'displayed' && family.features !== 1)) fail();
    if (!Array.isArray(v.groups) || v.groups.length > LIMITS.groups) fail();
    var groups = v.groups.map(function (g) {
      keys(g, ['group', 'nSamples', 'nExcluded', 'nParticipants'], ['group', 'nSamples', 'nExcluded']);
      return {group: text(g.group, 500), nSamples: int(g.nSamples, 0, 1e6), nExcluded: int(g.nExcluded, 0, 1e6), nParticipants: g.nParticipants == null ? null : int(g.nParticipants, 0, 1e6)};
    });
    if (!Array.isArray(v.rows) || v.rows.length !== applied.comparisons.length) fail();
    var rows = v.rows.map(function (row, i) {
      keys(row, ['a', 'b', 'nA', 'nB', 'statistic', 'df', 'p', 'pAdj', 'effect', 'note'], ['a', 'b', 'nA', 'nB', 'note']);
      var declared = applied.comparisons[i];
      if (row.a !== declared[0] || row.b !== declared[1]) fail();
      var out = {a: declared[0], b: declared[1], nA: int(row.nA, 0, 1e6), nB: int(row.nB, 0, 1e6), statistic: num(row.statistic, -1e12, 1e12, true),
        df: num(row.df, 0, 1e12, true), p: num(row.p, 0, 1, true), pAdj: num(row.pAdj, 0, 1, true), effect: num(row.effect, -1e6, 1e6, true), note: text(row.note, 300, true)};
      if ((out.p === null) !== (out.pAdj === null) || (out.p !== null && out.pAdj < out.p - 1e-12)) fail();
      return out;
    });
    var prov = v.provenance;
    keys(prov, ['method', 'transformation', 'normalization', 'imputation', 'participantIds', 'design']);
    return {fingerprint: v.fingerprint, dataFingerprint: v.dataFingerprint, computedAt: computedAt, lipid: text(v.lipid, 1000), grouping: choice(v.grouping, {Group1: 1, Group2: 1}),
      family: family, groups: groups, rows: rows,
      provenance: {method: text(prov.method, 2000), transformation: text(prov.transformation, 500), normalization: text(prov.normalization, 200, true),
        imputation: text(prov.imputation, 200, true), participantIds: choice(prov.participantIds, {unique: 1, absent: 1}), design: text(prov.design, 500)}};
  }
  function sanitize(v) {
    keys(v, ['version', 'presentation', 'applied', 'result'], ['version', 'presentation']);
    if (v.version !== VERSION) fail('Unsupported saved violin statistics version.');
    var applied = v.applied == null ? null : sanitizeSettings(v.applied);
    return {version: VERSION, presentation: sanitizePresentation(v.presentation, applied), applied: applied, result: v.result == null ? null : sanitizeResult(v.result, applied)};
  }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  // ---- Pure formatting ------------------------------------------------------
  function formatP(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
    if (v < 1e-300) return '< 1e-300';
    var formatted;
    for (var digits=2;digits<=17;digits++){formatted=v<0.001?v.toExponential(digits-1):v.toPrecision(digits);if([0.05,0.01,0.001].every(function(t){return (v<t)===(Number(formatted)<t);}))break;}
    return formatted;
  }
  function stars(v) { return v === null || !Number.isFinite(v) ? 'n/a' : v < 0.001 ? '***' : v < 0.01 ? '**' : v < 0.05 ? '*' : 'ns'; }
  function shownP(row, applied, presentation) {
    var adjusted = presentation.pValue === 'adjusted' && applied.correction !== 'none';
    return {value: adjusted ? row.pAdj : row.p, symbol: adjusted ? (applied.correction === 'BH' ? 'q' : 'adj. p') : 'p'};
  }
  function label(row, applied, presentation) {
    var shown = shownP(row, applied, presentation), exact = shown.symbol + ' = ' + formatP(shown.value);
    if (shown.value !== null && shown.value < 1e-300) exact = shown.symbol + ' ' + formatP(shown.value);
    return presentation.label === 'exact' ? exact : presentation.label === 'stars' ? stars(shown.value) : stars(shown.value) + ' (' + exact + ')';
  }
  function nLabel(group, mode) {
    if (!group || mode === 'hidden') return '';
    var participants = group.nParticipants == null ? null : group.nParticipants + ' participant' + (group.nParticipants === 1 ? '' : 's');
    var samples = 'n = ' + group.nSamples + ' sample' + (group.nSamples === 1 ? '' : 's');
    if (mode === 'participants') return participants || samples;
    if (mode === 'both') return participants ? samples + '<br>' + participants : samples;
    return samples;
  }
  // Greedy non-overlapping lanes, shortest brackets lowest.
  function lanes(items) {
    var sorted = items.slice().sort(function (a, b) { return (a.i1 - a.i0) - (b.i1 - b.i0) || a.i0 - b.i0; }), used = [];
    sorted.forEach(function (item) {
      var lane = 0;
      while (used[lane] && used[lane].some(function (other) { return !(other.i1 < item.i0 || other.i0 > item.i1); })) lane++;
      (used[lane] = used[lane] || []).push(item); item.lane = lane;
    });
    return sorted;
  }
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(state) {
    var a = state.applied, r = state.result, p = state.presentation, hidden = new Set(p.hidden.map(pairKey));
    var header = ['Lipid', 'Grouping', 'Group_A', 'Group_B', 'n_A_samples', 'n_B_samples', 'n_A_participants', 'n_B_participants', 'Excluded_A', 'Excluded_B', 'Test', 'Statistic_B_vs_A', 'df',
      'p_unadjusted', 'p_adjusted', 'Correction', 'Family_scope', 'Family_size_m', 'Family_lipids', 'Family_comparisons', 'Effect_size', 'Effect_B_vs_A',
      'Shown_on_plot', 'Note', 'Transformation', 'Normalization', 'Imputation', 'Participant_IDs', 'Design', 'Method', 'Computed_at', 'Result_fingerprint'];
    function group(name) { return r.groups.find(function (g) { return g.group === name; }) || {}; }
    var lines = r.rows.map(function (row) {
      return [r.lipid, r.grouping, row.a, row.b, row.nA, row.nB, group(row.a).nParticipants, group(row.b).nParticipants, group(row.a).nExcluded, group(row.b).nExcluded, TESTS[a.test], row.statistic, row.df,
        row.p, a.correction === 'none' ? null : row.pAdj, CORRECTIONS[a.correction], SCOPES[a.scope], r.family.m, r.family.features, r.family.comparisons,
        a.effect === 'none' ? '' : EFFECTS[a.effect], row.effect, p.show && !hidden.has(pairKey([row.a, row.b])) ? 'TRUE' : 'FALSE', row.note,
        r.provenance.transformation, r.provenance.normalization, r.provenance.imputation, r.provenance.participantIds, r.provenance.design,
        r.provenance.method, r.computedAt, r.fingerprint].map(csvCell).join(',');
    });
    return [header.join(',')].concat(lines).join('\r\n') + '\r\n';
  }
  function allPairs(groups) {
    var out = [];
    for (var i = 0; i < groups.length; i++) for (var j = i + 1; j < groups.length; j++) out.push([groups[i], groups[j]]);
    return out;
  }

  // ---- Plot annotations -----------------------------------------------------
  function ours(item) { return item && typeof item.name === 'string' && item.name.indexOf(PREFIX) === 0; }
  function values(v) { return v == null ? [] : Array.isArray(v) || ArrayBuffer.isView(v) ? v : [v]; }
  function horizontal(gd) { return !!(global.TeamPlotEditor && global.TeamPlotEditor.isSwapped && global.TeamPlotEditor.isSwapped(gd)); }
  function categories(gd) {
    var axis = gd._fullLayout && gd._fullLayout[horizontal(gd)?'yaxis':'xaxis'];
    if (axis && Array.isArray(axis._categories) && axis._categories.length) return axis._categories.map(String);
    var out = [];
    (gd.data || []).forEach(function (t) { Array.from(values(horizontal(gd)?t.y:t.x)).forEach(function (x) { if (out.indexOf(String(x)) < 0) out.push(String(x)); }); });
    return out;
  }
  function extents(gd) {
    var by = {};
    (gd.data || []).forEach(function (t) {
      if (t.visible === false || t.visible === 'legendonly' || t.y == null || t.x == null) return;
      var xs = values(horizontal(gd)?t.y:t.x), ys = values(horizontal(gd)?t.x:t.y);
      for (var i = 0; i < ys.length; i++) {
        var y = Number(ys[i]), x = String(xs.length === 1 ? xs[0] : xs[i]);
        if (!Number.isFinite(y)) continue;
        var e = by[x] || (by[x] = {lo: Infinity, hi: -Infinity}); e.lo = Math.min(e.lo, y); e.hi = Math.max(e.hi, y);
      }
    });
    return by;
  }
  function layoutFor(gd, s) {
    var cats = categories(gd), seen = extents(gd), baseline = s.baseline.range, top = baseline[1], bottom = baseline[0];
    var span = top - bottom > 0 ? top - bottom : 1, p = s.presentation, hidden = new Set(p.hidden.map(pairKey)), font = {size: p.fontSize, color: '#172d4b'};
    var items = s.result.rows.filter(function (row) {
      return row.p !== null && !hidden.has(pairKey([row.a, row.b])) && seen[row.a] && seen[row.b] && cats.indexOf(row.a) >= 0 && cats.indexOf(row.b) >= 0;
    }).map(function (row) { var i = cats.indexOf(row.a), j = cats.indexOf(row.b); return {i0: Math.min(i, j), i1: Math.max(i, j), row: row}; });
    var shapes = [], annotations = [], line = {color: '#172d4b', width: 1.2}, highest = top, scale = p.fontSize / 12;
    lanes(items).forEach(function (item, n) {
      var y = top + span * p.spacing * (item.lane + 0.6) + span * 0.04 * scale * item.lane, tip = span * p.tip, name = PREFIX + 'bracket-' + n;
      [[item.i0, y - tip, item.i0, y], [item.i0, y, item.i1, y], [item.i1, y, item.i1, y - tip]].forEach(function (c, k) {
        shapes.push({type: 'line', name: name + '-' + k, xref: 'x', yref: 'y', x0: c[0], y0: c[1], x1: c[2], y1: c[3], line: line, layer: 'above'});
      });
      annotations.push({name: PREFIX + 'label-' + n, xref: 'x', yref: 'y', x: (item.i0 + item.i1) / 2, y: y, yanchor: 'bottom', showarrow: false,
        text: label(item.row, s.applied, p), font: font, bgcolor: 'rgba(255,255,255,0.85)'});
      highest = Math.max(highest, y);
    });
    var lowest = bottom;
    if (p.nDisplay !== 'hidden') cats.forEach(function (cat, i) {
      var g = s.result.groups.find(function (x) { return x.group === cat; }), text = nLabel(g, p.nDisplay);
      if (!text || !seen[cat]) return;
      annotations.push({name: PREFIX + 'n-' + i, xref: 'x', yref: 'y', x: i, y: bottom, yanchor: 'top', showarrow: false, text: text,
        font: {size: Math.max(8, p.fontSize - 1), color: '#526477'}, bgcolor:'rgba(255,255,255,0.94)', borderpad:2});
      lowest = bottom - span * (p.nDisplay === 'both' ? 0.17 : 0.09) * scale;
    });
    var upper = items.length ? highest + span * (0.05 + 0.07 * scale) : top;
    if(horizontal(gd)) {
      shapes.forEach(function(shape){var x0=shape.x0,x1=shape.x1;shape.x0=shape.y0;shape.x1=shape.y1;shape.y0=x0;shape.y1=x1;});
      annotations.forEach(function(a){var x=a.x;a.x=a.y;a.y=x;a.xanchor=a.yanchor==='bottom'?'left':'right';delete a.yanchor;});
    }
    return {shapes: shapes, annotations: annotations, range: [lowest, upper]};
  }
  function draw(r) {
    var s = r && r.statistics, gd = s && s.ctx.plot();
    if (!s || !gd || !gd.data || !gd.layout || !global.Plotly) return Promise.resolve();
    var valueAxis=horizontal(gd)?'xaxis':'yaxis',y = gd.layout[valueAxis] || {}, full = gd._fullLayout && gd._fullLayout[valueAxis];
    var touched = !!s.drawnRange && y.autorange === false && Array.isArray(y.range) && y.range[0] === s.drawnRange[0] && y.range[1] === s.drawnRange[1];
    if (!touched) {
      if (!full || !Array.isArray(full.range) || !full.range.every(Number.isFinite)) return Promise.resolve();
      s.baseline = {range: full.range.slice(), autorange: y.autorange !== false};
      s.drawnRange = null;
    }
    var annotations = (gd.layout.annotations || []).filter(function (a) { return !ours(a); }), shapes = (gd.layout.shapes || []).filter(function (x) { return !ours(x); });
    var hadOurs = annotations.length !== (gd.layout.annotations || []).length || shapes.length !== (gd.layout.shapes || []).length || touched;
    var show = s.status === 'current' && s.result && s.applied && s.presentation.show;
    var groups = s.describe && s.ctx.current() ? s.describe.groups : show ? s.result.groups : [];
    var annotationsState = Object.assign({}, s, {result: {rows: show ? s.result.rows : [], groups: groups}});
    var spec = show || groups.length && s.presentation.nDisplay !== 'hidden' ? layoutFor(gd, annotationsState) : null;
    if (!spec && !hadOurs) return Promise.resolve();
    var update = {annotations: annotations.concat(spec ? spec.annotations : []), shapes: shapes.concat(spec ? spec.shapes : [])};
    if (spec) { s.drawnRange = spec.range.slice(); update[valueAxis+'.range'] = spec.range; update[valueAxis+'.autorange'] = false; }
    else if (touched) {
      s.drawnRange = null;
      if (s.baseline.autorange) update[valueAxis+'.autorange'] = true; else update[valueAxis+'.range'] = s.baseline.range.slice();
    }
    return Promise.resolve(global.Plotly.relayout(gd, update)).catch(function () {});
  }

  // ---- Server bridge --------------------------------------------------------
  function send(r, mode, extra) {
    var s = r.statistics;
    if (!s || !r.instance || !global.Shiny || !global.Shiny.setInputValue) return false;
    var id = 'tcs' + Date.now().toString(36) + '_' + (++sequence).toString(36), kind = mode === 'describe' ? 'describe' : mode === 'apply' ? 'apply' : 'check';
    s.requests[kind] = id; requests.set(id, r);
    setTimeout(function(){
      if(!requests.has(id))return;
      requests.delete(id);
      if(r.statistics!==s || s.requests[kind]!==id)return;
      s.requests[kind]=null; if(kind==='describe')s.describe=null; s.status='error'; s.reason='The statistics service did not reply in time. No new analysis was applied. Retry the check, then review and confirm again if needed.';
      s.needsCheck=false; s.needsVerify=false; render(r); draw(r);
    },30000);
    global.Shiny.setInputValue('team_violin_stats_request', Object.assign({requestId: id, instanceId: r.instance.id, mode: mode}, extra || {}), {priority: 'event'});
    return true;
  }
  function settingsFor(staged) { return {test: staged.test, correction: staged.correction, scope: staged.scope, comparisons: clone(staged.comparisons), effect: staged.effect}; }
  function drop(s, status, reason) { s.result = null; s.status = status; s.reason = reason || ''; s.needsCheck = false; s.needsVerify = false; }
  function receive(message) {
    var r = message && requests.get(message.requestId);
    if (!r) return;
    requests.delete(message.requestId);
    var s = r.statistics;
    if (!s || !r.node) return;
    if (message.mode === 'describe') {
      if (s.requests.describe !== message.requestId) return;
      s.requests.describe = null;
      if (message.status === 'ok' && message.describe) { s.describe = message.describe; seedComparisons(s); }
      else {s.describe=null;s.status='error';s.reason=message.reason||'Group counts could not be verified. Retry the check.';}
      render(r); draw(r); return;
    }
    var kind = message.mode === 'apply' ? 'apply' : 'check';
    if (s.requests[kind] !== message.requestId) return;
    s.requests[kind] = null;
    var before = JSON.stringify([s.applied, s.result, s.status]), hadResult = !!s.result;
    // A check answers for the data it saw; a newer result on that same data stays valid.
    var matchesCurrent = !!(s.result && message.dataFingerprint && s.result.dataFingerprint === message.dataFingerprint);
    if (message.mode === 'apply') {
      if (message.status === 'ok') {
        try {
          var applied = sanitizeSettings(message.settings), result = sanitizeResult(message.result, applied);
          var declared = new Set(applied.comparisons.map(pairKey));
          s.applied = applied; s.result = result; s.status = 'current'; s.reason = ''; s.applyMessage = '';
          s.presentation.hidden = s.presentation.hidden.filter(function (pair) { return declared.has(pairKey(pair)); });
          s.staged = settingsFor(applied);
        } catch (error) { s.status = s.result ? 'current' : s.applied ? 'invalid' : 'none'; s.applyMessage = 'The server returned statistics that could not be validated. Nothing was applied.'; }
      } else {
        // A refused or failed apply never replaces the previously confirmed analysis.
        s.status = s.result ? 'current' : message.status === 'blocked' ? 'blocked' : s.applied ? 'invalid' : 'none';
        if(!s.result && message.status==='blocked')s.reason=message.reason;
        s.applyMessage = 'Not applied. ' + (message.reason || 'Statistics could not be computed.');
      }
    } else if (message.status === 'ok' && message.mode === 'verify') {
      try { s.result = sanitizeResult(message.result, sanitizeSettings(message.settings)); s.status = 'current'; s.reason = ''; s.needsVerify = false; }
      catch (error) { drop(s, 'invalid'); }
    } else if (message.status === 'unchanged' || message.status === 'invalidated') {
      if (matchesCurrent) { s.status = 'current'; s.needsCheck = false; }
      else if (s.result) drop(s, 'invalid');
    }
    else if (message.status === 'blocked') { drop(s, 'blocked', message.reason); }
    else { s.status = 'error'; s.reason = message.reason || 'Statistics could not be checked.'; }
    if (s.requests.apply) s.status = 'computing';
    if (hadResult && !s.result && s.ctx.withdrawn) s.ctx.withdrawn();
    if (JSON.stringify([s.applied, s.result, s.status]) !== before) s.ctx.changed();
    render(r); draw(r);
  }
  function receivePolicy(message) {
    policy = message || null;
    records.forEach(function (r) {
      var s = r.statistics; if (!s || !r.node) return;
      if (policy && policy.allowed === false && s.result) { drop(s, 'blocked', policy.reason); s.blockedByPolicy = true; if (s.ctx.withdrawn) s.ctx.withdrawn(); s.ctx.changed(); }
      else if (policy && policy.allowed && s.blockedByPolicy) { s.blockedByPolicy = false; s.status = s.applied ? 'invalid' : 'none'; s.reason = ''; }
      render(r); draw(r);
    });
  }

  // ---- Panel ----------------------------------------------------------------
  function el(tag, className, content) { var node = document.createElement(tag); if (className) node.className = className; if (content != null) node.textContent = content; return node; }
  function field(container, labelText, control) { control.setAttribute('aria-label', labelText); var wrap = el('label', 'tcs-field'); wrap.append(el('span', null, labelText), control); container.appendChild(wrap); return control; }
  function select(options, value) {
    var control = el('select');
    Object.keys(options).forEach(function (k) { var o = el('option', null, options[k]); o.value = k; control.appendChild(o); });
    control.value = value; return control;
  }
  // Staged pairs must name groups in the current plot; stale pairs could not be unticked.
  function seedComparisons(s) {
    var groups = (s.describe && s.describe.groups || []).map(function (g) { return g.group; }), all = allPairs(groups);
    if (!s.describe) return;
    if (!s.staged.comparisons) { s.staged.comparisons = all.length <= LIMITS.comparisons ? all : []; return; }
    var present = new Set(all.map(unordered));
    s.staged.comparisons = s.staged.comparisons.filter(function (pair) { return present.has(unordered(pair)); });
  }
  function dirty(s) { return !s.applied || JSON.stringify(settingsFor(s.staged)) !== JSON.stringify(s.applied); }
  function familySize(s, settings) {
    var features = settings.scope === 'displayed' ? 1 : (s.describe && s.describe.features) || 0, k = (settings.comparisons || []).length;
    return {features: features, comparisons: k, m: features * k};
  }
  function build(r) {
    var s = r.statistics, ui = s.ui = {};
    var panel = ui.panel = el('section', 'tc-statistics'); panel.setAttribute('aria-label', 'Violin statistics');
    ui.status = el('p', 'tcs-status'); ui.status.setAttribute('role', 'status'); panel.appendChild(ui.status);
    ui.retry=el('button',null,'Retry check');ui.retry.type='button';ui.retry.hidden=true;panel.appendChild(ui.retry);

    var science = el('div', 'tcs-block tcs-science'), sh = el('h4', null, 'Analysis'); sh.appendChild(el('span', 'tcs-kind', 'confirm before computing')); science.appendChild(sh);
    ui.test = field(science, 'Test', select(TESTS, s.staged.test));
    ui.correction = field(science, 'Multiple-testing correction', select(CORRECTIONS, s.staged.correction));
    ui.scope = field(science, 'Correction family', select(SCOPES, s.staged.scope));
    ui.comparisons = el('fieldset', 'tcs-comparisons'); ui.comparisons.appendChild(el('legend', null, 'Comparisons (B vs A)')); science.appendChild(ui.comparisons);
    ui.effect = field(science, 'Effect size', select({none: EFFECTS.none}, 'none'));
    ui.family = el('p', 'tcs-note tcs-family'); science.appendChild(ui.family);
    ui.applyMessage = el('p', 'tcs-warning'); science.appendChild(ui.applyMessage);
    var actions = el('div', 'tcs-actions');
    ui.review = el('button', 'tcs-primary', 'Review and confirm…'); ui.review.type = 'button';
    ui.discard = el('button', null, 'Discard changes'); ui.discard.type = 'button';
    actions.append(ui.review, ui.discard); science.appendChild(actions);
    ui.confirm = el('div', 'tcs-confirm'); ui.confirm.hidden = true; ui.confirm.setAttribute('role', 'group'); science.appendChild(ui.confirm);
    panel.appendChild(science);

    var display = el('div', 'tcs-block tcs-display'), dh = el('h4', null, 'Display'); dh.appendChild(el('span', 'tcs-kind', 'updates immediately')); display.appendChild(dh);
    var showWrap = el('label', 'tcs-check'); ui.show = el('input'); ui.show.type = 'checkbox'; showWrap.append(ui.show, el('span', null, 'Show significance annotations')); display.appendChild(showWrap);
    ui.pValue = field(display, 'P value shown', select({adjusted: 'Adjusted', raw: 'Unadjusted'}, s.presentation.pValue));
    ui.label = field(display, 'Label', select({both: 'Stars and exact value', exact: 'Exact value', stars: 'Stars'}, s.presentation.label));
    ui.nDisplay = field(display, 'Group size labels', select({samples: 'Samples', participants: 'Participants', both: 'Samples and participants', hidden: 'Hidden'}, s.presentation.nDisplay));
    function number(labelText, key, min, max, step) { var input = el('input'); input.type = key === 'fontSize' ? 'number' : 'range'; input.min = min; input.max = max; input.step = step; input.dataset.key = key; return field(display, labelText, input); }
    ui.fontSize = number('Annotation font size', 'fontSize', 8, 28, 1);
    ui.spacing = number('Bracket spacing', 'spacing', 0.03, 0.3, 0.01);
    ui.tip = number('Bracket tip length', 'tip', 0, 0.1, 0.005);
    ui.shown = el('fieldset', 'tcs-shown'); display.appendChild(ui.shown);
    panel.appendChild(display);

    var results = el('div', 'tcs-block tcs-results'); results.appendChild(el('h4', null, 'Results for the displayed lipid'));
    ui.table = el('table', 'tcs-table'); results.appendChild(ui.table);
    ui.methods = el('p', 'tcs-note'); results.appendChild(ui.methods);
    ui.download = el('button', null, 'Statistics CSV'); ui.download.type = 'button'; results.appendChild(ui.download);
    ui.downloads = el('div', 'tcs-downloads'); results.appendChild(ui.downloads);
    panel.appendChild(results);
    wire(r);
    return panel;
  }
  function wire(r) {
    var s = r.statistics, ui = s.ui;
    ui.retry.addEventListener('click',function(){s.reason='';s.status=s.result?'verifying':'none';s.needsVerify=!!s.result;send(r,'describe');if(s.result)send(r,'verify',{settings:settingsFor(s.applied),dataFingerprint:s.result.dataFingerprint});render(r);});
    function stage() { closeReview(r); s.applyMessage = ''; if(s.status==='blocked'&&!s.result&&!s.blockedByPolicy){s.status='none';s.reason='';} render(r); }
    ui.test.addEventListener('change', function () { s.staged.test = ui.test.value; if (s.staged.effect !== 'none') s.staged.effect = MATCHED_EFFECT[s.staged.test]; stage(); });
    ui.correction.addEventListener('change', function () { s.staged.correction = ui.correction.value; stage(); });
    ui.scope.addEventListener('change', function () { s.staged.scope = ui.scope.value; stage(); });
    ui.effect.addEventListener('change', function () { s.staged.effect = ui.effect.value; stage(); });
    ui.comparisons.addEventListener('change', function (event) {
      var input = event.target; if (!input.dataset.pair) return;
      var pair = JSON.parse(input.dataset.pair), key = unordered(pair), list = (s.staged.comparisons || []).filter(function (p) { return unordered(p) !== key; });
      if (input.checked) list.push(pair);
      var order = allPairs((s.describe && s.describe.groups || []).map(function (g) { return g.group; })).map(unordered);
      s.staged.comparisons = list.sort(function (a, b) { return order.indexOf(unordered(a)) - order.indexOf(unordered(b)); }); stage();
    });
    ui.discard.addEventListener('click', function () { s.staged = s.applied ? settingsFor(s.applied) : settingsFor(defaults()); seedComparisons(s); s.applyMessage = ''; closeReview(r); render(r); });
    ui.review.addEventListener('click', function () { openReview(r); });
    function present() { s.ctx.changed(); render(r); draw(r); }
    ui.show.addEventListener('change', function () { s.presentation.show = ui.show.checked; present(); });
    ['pValue', 'label', 'nDisplay'].forEach(function (k) { ui[k].addEventListener('change', function () { s.presentation[k] = ui[k].value; present(); }); });
    ['fontSize', 'spacing', 'tip'].forEach(function (k) {
      ui[k].addEventListener('input', function () {
        var v = Number(ui[k].value), min = Number(ui[k].min), max = Number(ui[k].max);
        if (ui[k].value === '' || !Number.isFinite(v) || v < min || v > max) return;
        s.presentation[k] = k === 'fontSize' ? Math.round(v) : v; present();
      });
    });
    ui.shown.addEventListener('change', function (event) {
      var input = event.target; if (!input.dataset.pair) return;
      var key = pairKey(JSON.parse(input.dataset.pair));
      s.presentation.hidden = s.presentation.hidden.filter(function (p) { return pairKey(p) !== key; });
      if (!input.checked) s.presentation.hidden.push(JSON.parse(input.dataset.pair));
      present();
    });
    ui.download.addEventListener('click', function () { download(r); });
    ui.panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !ui.confirm.hidden) { event.preventDefault(); event.stopPropagation(); closeReview(r); ui.review.focus(); }
    });
  }
  function closeReview(r) { var ui = r.statistics.ui; ui.confirm.hidden = true; ui.confirm.textContent = ''; }
  function openReview(r) {
    var s = r.statistics, ui = s.ui, staged = settingsFor(s.staged), size = familySize(s, staged), d = s.describe || {};
    ui.confirm.textContent = ''; ui.confirm.hidden = false;
    var heading = el('h5', null, 'Confirm statistical analysis'); heading.tabIndex = -1; heading.id = r.instance.id + '-tcs-confirm'; ui.confirm.setAttribute('aria-labelledby', heading.id);
    ui.confirm.appendChild(heading);
    var table = el('table', 'tcs-diff'), head = el('tr'); ['Setting', 'Applied', 'New'].forEach(function (h) { head.appendChild(el('th', null, h)); }); table.appendChild(head);
    var applied = s.applied, before = applied ? familySize(s, applied) : null;
    function describePairs(list) { return list && list.length ? list.map(function (p) { return p[1] + ' vs ' + p[0]; }).join('; ') : 'None'; }
    [['Test', applied && TESTS[applied.test], TESTS[staged.test]], ['Correction', applied && CORRECTIONS[applied.correction], CORRECTIONS[staged.correction]],
      ['Correction family', applied && SCOPES[applied.scope], SCOPES[staged.scope]], ['Comparisons', applied && describePairs(applied.comparisons), describePairs(staged.comparisons)],
      ['Effect size', applied && EFFECTS[applied.effect], EFFECTS[staged.effect]], ['Tests in family (m)', before && String(before.m), String(size.m)]].forEach(function (row) {
      var tr = el('tr'); tr.appendChild(el('th', null, row[0])); tr.appendChild(el('td', null, row[1] || 'Not applied'));
      var next = el('td', row[1] !== row[2] ? 'tcs-changed' : null, row[2]); tr.appendChild(next); table.appendChild(tr);
    });
    ui.confirm.appendChild(table);
    var notes = el('ul', 'tcs-notes'), blocking = [];
    function note(t) { notes.appendChild(el('li', null, t)); }
    note('p-values are computed on the values drawn: log10 of positive, finite prepared abundances (normalization: ' + (d.normalization || 'Unknown') + '; imputation: ' + (d.imputation || 'Unknown') + '). Missing, zero and negative values are excluded, not imputed here.');
    if (d.imputation && !/^no imputation$/i.test(d.imputation) && !/^none$/i.test(d.imputation)) note('Imputed values are tested as if they were measured. Interpret small p-values with caution.');
    note(d.participantIds === 'unique' ? 'Every sample has a distinct participant ID, so samples and participants coincide.' : d.participantIds === 'absent' ? 'No participant IDs are mapped. Independence relies on the confirmed independent study design.' : 'Some mapped participants repeat, have missing IDs or ambiguous aliases. Eligibility is checked again using only the declared comparison groups; affected comparisons will not be tested.');
    if (staged.scope === 'displayed') note('This family covers the displayed lipid only. If the lipid was selected after inspecting other lipids, this correction does not account for that selection; consider all lipids in scope.');
    if (staged.scope === 'all_in_scope') note('The correction covers every lipid in the current scope (' + size.features + ' lipids × ' + size.comparisons + ' comparisons). Only this lipid’s comparisons are drawn.');
    if (staged.correction === 'none' && size.m > 1) note('No multiple-testing correction is applied across ' + size.m + (size.m===1?' test.':' tests.'));
    note('Hiding an annotation later does not change the correction family.');
    if(staged.effect==='hedges_g') note("Hedges’ g is a standardized mean difference using pooled standard deviation, not the Welch test statistic; no confidence interval is provided.");
    if(staged.effect==='cliffs_delta') note("Cliff’s delta summarizes relative ranks; no confidence interval is provided.");
    if (s.result) note('Confirming replaces the p-values currently shown.');
    if (!staged.comparisons || !staged.comparisons.length) blocking.push('Select at least one comparison.');
    if (size.m > LIMITS.tests || size.features > LIMITS.features) blocking.push('The declared family is too large (' + size.m + ' tests). Narrow the scope or comparisons.');
    if (!d.designAllowed) blocking.push(d.designReason || 'Independent inference is not authorized for this study design.');
    if (policy && policy.allowed === false) blocking.push(policy.reason || 'Independent inference is not authorized for this study design.');
    if (!s.ctx.current()) blocking.push('Wait for this plot to finish updating.');
    if (!s.describe) blocking.push('Group information is still loading.');
    ui.confirm.appendChild(notes);
    blocking.forEach(function (t) { ui.confirm.appendChild(el('p', 'tcs-warning', t)); });
    var buttons = el('div', 'tcs-actions'), confirm = el('button', 'tcs-primary', 'Confirm and compute'), cancel = el('button', null, 'Cancel');
    confirm.type = cancel.type = 'button'; confirm.disabled = blocking.length > 0 || s.status === 'computing';
    confirm.addEventListener('click', function () {
      closeReview(r);
      if (!send(r, 'apply', {settings: staged})) { s.applyMessage = 'Not applied. The workspace is not connected.'; render(r); return; }
      s.status = 'computing'; s.applyMessage = ''; render(r); draw(r); ui.review.focus();
    });
    cancel.addEventListener('click', function () { closeReview(r); ui.review.focus(); });
    buttons.append(confirm, cancel); ui.confirm.appendChild(buttons);
    heading.focus();
  }
  function render(r) {
    var s = r.statistics, ui = s && s.ui; if (!ui) return;
    var statusText = s.status === 'blocked' || s.status === 'error' ? (s.status === 'error' ? 'Could not check statistics. ' : '') + (s.reason || 'No p-values were computed.') : STATUS[s.status] || '';
    ui.status.textContent = statusText; ui.status.dataset.status = s.status; ui.retry.hidden=s.status!=='error';
    ui.test.value = s.staged.test; ui.correction.value = s.staged.correction; ui.scope.value = s.staged.scope;
    var effect = MATCHED_EFFECT[s.staged.test], effectOptions = {none: EFFECTS.none}; effectOptions[effect] = EFFECTS[effect];
    if (ui.effect.dataset.test !== s.staged.test) { ui.effect.textContent = ''; Object.keys(effectOptions).forEach(function (k) { var o = el('option', null, effectOptions[k]); o.value = k; ui.effect.appendChild(o); }); ui.effect.dataset.test = s.staged.test; }
    ui.effect.value = s.staged.effect;
    var groups = (s.describe && s.describe.groups || []).map(function (g) { return g.group; }), all = allPairs(groups), chosen = new Set((s.staged.comparisons || []).map(unordered));
    var signature = JSON.stringify(all);
    if (ui.comparisons.dataset.signature !== signature) {
      Array.from(ui.comparisons.querySelectorAll('label,p')).forEach(function (x) { x.remove(); });
      if (!groups.length) ui.comparisons.appendChild(el('p', 'tcs-note', 'Groups load after the plot renders.'));
      if (all.length > LIMITS.comparisons) ui.comparisons.appendChild(el('p', 'tcs-note', 'Select at most ' + LIMITS.comparisons + ' comparisons.'));
      all.forEach(function (pair) {
        var wrap = el('label', 'tcs-check'), box = el('input'); box.type = 'checkbox'; box.dataset.pair = JSON.stringify(pair);
        wrap.append(box, el('span', null, pair[1] + ' vs ' + pair[0])); ui.comparisons.appendChild(wrap);
      });
      ui.comparisons.dataset.signature = signature;
    }
    ui.comparisons.querySelectorAll('input[data-pair]').forEach(function (box) { box.checked = chosen.has(unordered(JSON.parse(box.dataset.pair))); });
    var size = familySize(s, s.staged), isDirty = dirty(s);
    ui.family.textContent = 'Correction family: ' + size.comparisons + ' comparison' + (size.comparisons === 1 ? '' : 's') + ' × ' + (s.staged.scope === 'displayed' ? '1 lipid' : size.features + ' lipids') + ' = ' + size.m + (size.m===1?' test.':' tests.') + (isDirty ? ' Unconfirmed changes.' : '');
    ui.applyMessage.textContent = s.applyMessage || ''; ui.applyMessage.hidden = !s.applyMessage;
    ui.discard.disabled = !isDirty || !s.applied && !s.staged.comparisons; ui.review.disabled = s.status === 'computing' || !s.ctx.current() || !s.describe;
    ui.show.checked = s.presentation.show; ui.pValue.value = s.presentation.pValue; ui.label.value = s.presentation.label; ui.nDisplay.value = s.presentation.nDisplay;
    ['fontSize', 'spacing', 'tip'].forEach(function (k) { if (document.activeElement !== ui[k]) ui[k].value = String(s.presentation[k]); });
    var groupCounts = s.describe && s.describe.groups || s.result && s.result.groups || [];
    var participants = groupCounts.length > 0 && groupCounts.every(function(g){return g.nParticipants != null;});
    Array.from(ui.nDisplay.options).forEach(function (o) { o.disabled = !participants && (o.value === 'participants' || o.value === 'both'); });
    ui.pValue.disabled = !!(s.applied && s.applied.correction === 'none');
    var shownSignature = JSON.stringify([s.applied && s.applied.comparisons, s.result && s.result.family.m]);
    if (ui.shown.dataset.signature !== shownSignature) {
      ui.shown.textContent = '';
      if (s.applied) {
        ui.shown.appendChild(el('legend', null, 'Comparisons shown on the plot'));
        s.applied.comparisons.forEach(function (pair) {
          var wrap = el('label', 'tcs-check'), box = el('input'); box.type = 'checkbox'; box.dataset.pair = JSON.stringify(pair);
          wrap.append(box, el('span', null, pair[1] + ' vs ' + pair[0])); ui.shown.appendChild(wrap);
        });
        ui.shown.appendChild(el('p', 'tcs-note', 'Hidden comparisons stay in the correction family' + (s.result ? ' (m = ' + s.result.family.m + ').' : '.')));
      }
      ui.shown.dataset.signature = shownSignature;
    }
    var hidden = new Set(s.presentation.hidden.map(pairKey));
    ui.shown.querySelectorAll('input[data-pair]').forEach(function (box) { box.checked = !hidden.has(pairKey(JSON.parse(box.dataset.pair))); });
    ui.table.textContent = '';
    var result = s.status === 'current' ? s.result : null;
    if (result) {
      var shownSymbol = shownP(result.rows[0], s.applied, s.presentation).symbol;
      var head = el('tr'); ['Comparison', 'n (A / B)', 'Excluded (A / B)', 'p', s.applied.correction === 'none' ? 'p (no correction)' : s.applied.correction === 'BH' ? 'q' : 'adj. p'].concat(s.applied.effect === 'none' ? [] : [EFFECTS[s.applied.effect]]).forEach(function (h) { head.appendChild(el('th', null, h)); });
      ui.table.appendChild(head);
      result.rows.forEach(function (row) {
        var tr = el('tr'); tr.appendChild(el('td', null, row.b + ' vs ' + row.a)); tr.appendChild(el('td', null, row.nA + ' / ' + row.nB)); tr.appendChild(el('td', null, result.groups.find(function(g){return g.group===row.a;}).nExcluded + ' / ' + result.groups.find(function(g){return g.group===row.b;}).nExcluded));
        tr.appendChild(el('td', null, formatP(row.p))); tr.appendChild(el('td', null, s.applied.correction === 'none' ? '—' : formatP(row.pAdj)));
        if (s.applied.effect !== 'none') tr.appendChild(el('td', null, row.effect === null ? 'n/a' : row.effect.toFixed(2)));
        if (row.note) tr.title = row.note;
        ui.table.appendChild(tr);
        if (row.note) { var noteRow = el('tr', 'tcs-row-note'), cell = el('td', null, row.note); cell.colSpan = s.applied.effect === 'none' ? 5 : 6; noteRow.appendChild(cell); ui.table.appendChild(noteRow); }
      });
      ui.methods.textContent = result.provenance.method + ' ' + result.provenance.design + ' Labels use ' + shownSymbol + ': * < 0.05, ** < 0.01, *** < 0.001, ns otherwise. Computed ' + result.computedAt + '.';
    } else ui.methods.textContent = 'No current results.';
    ui.download.disabled = !result || !s.ctx.exportAllowed();
  }
  function download(r) {
    var s = r.statistics, result = s.result;
    if (s.status !== 'current' || !result || !s.ctx.exportAllowed()) { s.ctx.tell('Statistics are not current. Wait for the plot or confirm the analysis again.'); render(r); return; }
    var fingerprint = result.fingerprint, body = csv(s);
    var name = ('violin-statistics-' + result.lipid).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) + '-' + fingerprint.slice(0, 8) + '.csv';
    var url = URL.createObjectURL(new Blob([body], {type: 'text/csv;charset=utf-8'})), link = el('a', null, 'Save ' + name);
    link.href = url; link.download = name;
    // The fallback link stays valid only while these exact results are current.
    link.addEventListener('click', function (event) { if (s.status !== 'current' || !s.result || s.result.fingerprint !== fingerprint || !s.ctx.exportAllowed()) { event.preventDefault(); link.remove(); s.ctx.tell('These statistics are no longer current.'); } });
    s.ui.downloads.textContent = ''; s.ui.downloads.appendChild(link); link.click();
    setTimeout(function () { link.remove(); URL.revokeObjectURL(url); }, 600000);
    s.ctx.tell('Statistics CSV is ready. If the download did not start, use the Save link.');
  }
  function defaults() { return {test: 'welch', correction: 'holm', scope: 'displayed', comparisons: null, effect: 'none'}; }

  // ---- Record lifecycle -----------------------------------------------------
  function supports(source) { return source === SOURCE; }
  // saved: validated checkpoint state; copy: in-memory clipboard state.
  function attach(r, ctx, saved, copy) {
    if (!r || !r.node || !r.instance || !supports(r.instance.source)) return null;
    var state = saved ? sanitize(saved) : null;
    var s = r.statistics = {ctx: ctx, presentation: clone(state ? state.presentation : copy ? copy.presentation : PRESENTATION), applied: state ? state.applied : null,
      result: state ? state.result : null, staged: null, status: 'none', reason: '', describe: null, requests: {}, needsCheck: false, needsVerify: false,
      baseline: null, drawnRange: null, applyMessage: ''};
    s.staged = s.applied ? settingsFor(s.applied) : copy && copy.staged ? clone(copy.staged) : defaults();
    if (!s.applied) s.presentation.hidden = [];
    if (s.result) { s.status = 'verifying'; s.needsVerify = true; } else if (s.applied) s.status = 'invalid';
    r.node.appendChild(build(r)); records.add(r); render(r);
    // The server checks the copy's own drawn values, so this need not wait for a client render.
    setTimeout(function () {
      if (r.statistics !== s || !r.node) return;
      send(r, 'describe');
      if (s.result && s.needsVerify) send(r, 'verify', {settings: settingsFor(s.applied), dataFingerprint: s.result.dataFingerprint});
    }, 0);
    return s;
  }
  function detach(r) {
    var s = r && r.statistics; if (!s) return;
    if (s.ui && s.ui.panel) s.ui.panel.remove();
    records.delete(r); r.statistics = null;
  }
  function serialize(r) {
    var s = r && r.statistics; if (!s) return null;
    var keep = s.result && (s.status === 'current' || s.status === 'verifying' || s.status === 'checking' || s.status === 'computing' || s.status === 'error');
    return sanitize({version: VERSION, presentation: clone(s.presentation), applied: clone(s.applied), result: keep ? clone(s.result) : null});
  }
  function copyState(r) {
    var s = r && r.statistics; if (!s) return null;
    var presentation = clone(s.presentation); presentation.hidden = [];
    return {presentation: presentation, staged: settingsFor(s.applied || s.staged)};
  }
  // Every server render of this copy is checked; equivalent renders only redraw.
  function clearDescription(s) {
    if(s.requests.describe){requests.delete(s.requests.describe);s.requests.describe=null;}
    s.describe=null;
  }
  function sourceChanged(r) {
    var s = r && r.statistics; if (!s) return;
    clearDescription(s);
    if(s.ui && !s.ui.confirm.hidden) closeReview(r);
    if(s.requests.apply){requests.delete(s.requests.apply);s.requests.apply=null;s.status=s.applied?'invalid':'none';s.applyMessage='The plot changed. The pending analysis was cancelled; review and confirm again.';}
    if (s.result && s.status !== 'verifying') { drop(s, 'invalid'); s.ctx.withdrawn(); s.ctx.changed(); }
    render(r); draw(r);
    var revision=r.revision;setTimeout(function(){if(r.statistics===s&&r.node&&r.revision===revision&&!s.requests.describe)send(r,'describe');},0);
  }
  function rendered(r) {
    var s = r && r.statistics; if (!s || !r.node) return;
    if(!s.describe&&!s.requests.describe)send(r, 'describe');
    if (s.result && s.needsVerify) send(r, 'verify', {settings: settingsFor(s.applied), dataFingerprint: s.result.dataFingerprint});
    else if (s.result && s.needsCheck) send(r, 'check', {dataFingerprint: s.result.dataFingerprint});
    render(r); draw(r);
  }
  function preparationChanged(r) {
    var s = r && r.statistics; if (!s) return;
    clearDescription(s);draw(r);
    if(!s.result){render(r);return;}
    if (s.status === 'current') { s.status = 'checking'; s.needsCheck = true; draw(r); }
    if (!s.needsVerify) send(r, 'check', {dataFingerprint: s.result.dataFingerprint});
    render(r);
  }
  function busy(r) { var s = r && r.statistics; return !!(s && (s.requests.describe || s.requests.apply || s.requests.check || s.status === 'computing' || s.status === 'verifying' || s.status === 'checking')); }
  function provenance(r) {
    var s = r && r.statistics; if (!s) return null;
    var current = s.status === 'current' && s.result;
    return {statisticsStatus: current ? 'current' : s.status, statisticsFingerprint: current ? s.result.fingerprint : null,
      statisticsShown: !!(current && s.presentation.show), statisticsMethod: current ? s.result.provenance.method.slice(0, 1000) : null};
  }

  var api = {supports: supports, attach: attach, detach: detach, serialize: serialize, sanitize: sanitize, copyState: copyState, draw: draw, rendered: rendered,
    sourceChanged: sourceChanged, preparationChanged: preparationChanged, busy: busy, provenance: provenance, receive: receive, receivePolicy: receivePolicy,
    _test: {formatP: formatP, stars: stars, label: label, nLabel: nLabel, lanes: lanes, csv: csv, csvCell: csvCell, allPairs: allPairs, layoutFor: layoutFor}};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.TeamCanvasStatistics = api;
    var register = function () { if (window.Shiny && Shiny.addCustomMessageHandler) { Shiny.addCustomMessageHandler('team-violin-stats', receive); Shiny.addCustomMessageHandler('team-violin-stats-policy', receivePolicy); } };
    if (window.Shiny && Shiny.addCustomMessageHandler) register(); else document.addEventListener('DOMContentLoaded', register);
    // Export availability follows the canvas busy state.
    window.addEventListener('team-canvas-idle', function () { records.forEach(function (r) { if (r.node) render(r); }); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
