// Pure Team statistics and editor sanitizers, without their UI modules.
  var SOURCE: any = 'results_dashboard-plot_violin', VERSION: any = '1', PREFIX: any = 'tcstat-';
  var TESTS: any = {welch: 'Welch t-test', wilcoxon: 'Wilcoxon rank-sum (Mann-Whitney)'};
  var CORRECTIONS: any = {holm: 'Holm', BH: 'Benjamini-Hochberg (FDR, q)', bonferroni: 'Bonferroni', none: 'None (unadjusted)'};
  var SCOPES: any = {displayed: 'This lipid only', all_in_scope: 'Every lipid in the current scope'};
  var EFFECTS: any = {none: 'None', hedges_g: "Hedges' g", cliffs_delta: "Cliff's delta"};
  var MATCHED_EFFECT: any = {welch: 'hedges_g', wilcoxon: 'cliffs_delta'};
  var LIMITS: any = {comparisons: 45, groups: 30, features: 5000, tests: 20000};
  var PRESENTATION: any = {show: true, pValue: 'adjusted', label: 'both', fontSize: 12, spacing: 0.08, tip: 0.02, nDisplay: 'samples', hidden: []};
  function fail(message?: any): any { throw new Error(message || 'Invalid saved violin statistics.'); }
  function has(o: any, k: any): any { return Object.prototype.hasOwnProperty.call(o, k); }
  function keys(v: any, allowed: any, required?: any): any {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
    Object.keys(v).forEach(function (k: any): any { if (allowed.indexOf(k) < 0) fail(); });
    (required || allowed).forEach(function (k: any): any { if (!has(v, k)) fail(); });
  }
  function text(v: any, max: any, empty?: any): any { if (typeof v !== 'string' || v.length > max || (!empty && !v.length) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)) fail(); return v; }
  function choice(v: any, choices: any): any { if (typeof v !== 'string' || !has(choices, v)) fail(); return v; }
  function int(v: any, min: any, max: any): any { if (!Number.isInteger(v) || v < min || v > max) fail(); return v; }
  function num(v: any, min: any, max: any, nullable?: any): any { if ((v === null || v === undefined) && nullable) return null; if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(); return v; }
  function pairKey(pair: any): any { return JSON.stringify(pair); }
  function unordered(pair: any): any { return pairKey(pair.slice().sort()); }
  function pairs(v: any, min: any, max: any): any {
    if (!Array.isArray(v) || v.length < min || v.length > max) fail();
    var seen: any = new Set();
    return v.map(function (pair: any): any {
      if (!Array.isArray(pair) || pair.length !== 2) fail();
      var out: any = [text(pair[0], 500), text(pair[1], 500)], unordered: any = pairKey(out.slice().sort());
      if (out[0] === out[1] || seen.has(unordered)) fail();
      seen.add(unordered); return out;
    });
  }
  function sanitizeSettings(v: any): any {
    keys(v, ['test', 'correction', 'scope', 'comparisons', 'effect']);
    var test: any = choice(v.test, TESTS), effect: any = choice(v.effect, EFFECTS);
    if (effect !== 'none' && effect !== MATCHED_EFFECT[test]) fail();
    return {test: test, correction: choice(v.correction, CORRECTIONS), scope: choice(v.scope, SCOPES), comparisons: pairs(v.comparisons, 1, LIMITS.comparisons), effect: effect};
  }
  function sanitizePresentation(v: any, applied: any): any {
    keys(v, ['show', 'pValue', 'label', 'fontSize', 'spacing', 'tip', 'nDisplay', 'hidden']);
    if (typeof v.show !== 'boolean') fail();
    var hidden: any = pairs(v.hidden, 0, LIMITS.comparisons), declared: any = new Set((applied ? applied.comparisons : []).map(pairKey));
    if (hidden.some(function (pair: any): any { return !declared.has(pairKey(pair)); })) fail();
    return {show: v.show, pValue: choice(v.pValue, {adjusted: 1, raw: 1}), label: choice(v.label, {exact: 1, stars: 1, both: 1}),
      fontSize: int(v.fontSize, 8, 28), spacing: num(v.spacing, 0.03, 0.3), tip: num(v.tip, 0, 0.1),
      nDisplay: choice(v.nDisplay, {samples: 1, participants: 1, both: 1, hidden: 1}), hidden: hidden};
  }
  // Sanity check, log only: every compared group should appear once in the result's groups. It never
  // rejects, changes or blocks a result (the result and the saved state are exactly as without it).
  var warnedGroups: any = {};
  function warnInconsistentGroups(groups: any, rows: any, key: any): any {
    try {
      var names: any = {}, dup: any = false;
      groups.forEach(function (g: any): any { if (names[g.group]) dup = true; names[g.group] = true; });
      var missing: any = [];
      rows.forEach(function (r: any): any { [r.a, r.b].forEach(function (n: any): any { if (!names[n] && missing.indexOf(n) < 0) missing.push(n); }); });
      if ((!dup && !missing.length) || warnedGroups[key]) return;
      warnedGroups[key] = true;
      if (typeof console !== 'undefined' && console.warn) console.warn('[TeamCanvasStatistics] Inconsistent statistics result: ' + (dup ? 'duplicate group names' : '') + (dup && missing.length ? '; ' : '') + (missing.length ? 'compared groups missing from groups: ' + missing.join(', ') : '') + '.');
    } catch (ignore: any) {}
  }
  function sanitizeResult(v: any, applied: any): any {
    if (!applied) fail();
    keys(v, ['fingerprint', 'dataFingerprint', 'computedAt', 'lipid', 'grouping', 'family', 'groups', 'rows', 'provenance']);
    ['fingerprint', 'dataFingerprint'].forEach(function (k: any): any { if (typeof v[k] !== 'string' || !/^[a-f0-9]{64}$/.test(v[k])) fail(); });
    var computedAt: any = text(v.computedAt, 64);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(computedAt) || !Number.isFinite(Date.parse(computedAt))) fail();
    keys(v.family, ['m', 'features', 'comparisons', 'untestable']);
    var family: any = {features: int(v.family.features, 1, LIMITS.features), comparisons: int(v.family.comparisons, 1, LIMITS.comparisons), m: int(v.family.m, 1, LIMITS.tests)};
    family.untestable = int(v.family.untestable, 0, family.m);
    if (family.m !== family.features * family.comparisons || family.comparisons !== applied.comparisons.length || (applied.scope === 'displayed' && family.features !== 1)) fail();
    if (!Array.isArray(v.groups) || v.groups.length > LIMITS.groups) fail();
    var groups: any = v.groups.map(function (g: any): any {
      keys(g, ['group', 'nSamples', 'nExcluded', 'nParticipants'], ['group', 'nSamples', 'nExcluded']);
      return {group: text(g.group, 500), nSamples: int(g.nSamples, 0, 1e6), nExcluded: int(g.nExcluded, 0, 1e6), nParticipants: g.nParticipants == null ? null : int(g.nParticipants, 0, 1e6)};
    });
    if (!Array.isArray(v.rows) || v.rows.length !== applied.comparisons.length) fail();
    var rows: any = v.rows.map(function (row: any, i: any): any {
      keys(row, ['a', 'b', 'nA', 'nB', 'statistic', 'df', 'p', 'pAdj', 'effect', 'note'], ['a', 'b', 'nA', 'nB', 'note']);
      var declared: any = applied.comparisons[i];
      if (row.a !== declared[0] || row.b !== declared[1]) fail();
      var out: any = {a: declared[0], b: declared[1], nA: int(row.nA, 0, 1e6), nB: int(row.nB, 0, 1e6), statistic: num(row.statistic, -1e12, 1e12, true),
        df: num(row.df, 0, 1e12, true), p: num(row.p, 0, 1, true), pAdj: num(row.pAdj, 0, 1, true), effect: num(row.effect, -1e6, 1e6, true), note: text(row.note, 300, true)};
      if ((out.p === null) !== (out.pAdj === null) || (out.p !== null && out.pAdj < out.p - 1e-12)) fail();
      return out;
    });
    warnInconsistentGroups(groups, rows, v.fingerprint);
    var prov: any = v.provenance;
    keys(prov, ['method', 'transformation', 'normalization', 'imputation', 'participantIds', 'design']);
    return {fingerprint: v.fingerprint, dataFingerprint: v.dataFingerprint, computedAt: computedAt, lipid: text(v.lipid, 1000), grouping: choice(v.grouping, {Group1: 1, Group2: 1}),
      family: family, groups: groups, rows: rows,
      provenance: {method: text(prov.method, 2000), transformation: text(prov.transformation, 500), normalization: text(prov.normalization, 200, true),
        imputation: text(prov.imputation, 200, true), participantIds: choice(prov.participantIds, {unique: 1, absent: 1}), design: text(prov.design, 500)}};
  }
  function sanitizeStatistics(v: any): any {
    keys(v, ['version', 'presentation', 'applied', 'result'], ['version', 'presentation']);
    if (v.version !== VERSION) fail('Unsupported saved violin statistics version.');
    var applied: any = v.applied == null ? null : sanitizeSettings(v.applied);
    return {version: VERSION, presentation: sanitizePresentation(v.presentation, applied), applied: applied, result: v.result == null ? null : sanitizeResult(v.result, applied)};
  }

var schema: any = {};
var PALETTES: any = Object.fromEntries(['Gelato Days', 'Lab', 'Okabe–Ito', 'Nature (NPG)', 'Viridis', 'Pastel'].map(name => [name, true]));
  function spec(key: any, type: any, min?: any, max?: any, choices?: any): any { schema[key] = {type:type,min:min,max:max,choices:choices}; }
  ['title.text','title.font.family','font.family','xaxis.title.text','yaxis.title.text','legend.font.family'].forEach(function(k: any): any{spec(k,'text');});
  ['title.font.family','font.family','legend.font.family'].forEach(function(k: any): any{schema[k].choices=['Arial','Helvetica','Verdana','Georgia','Times New Roman','Courier New','system-ui','sans-serif'];});
  ['paper_bgcolor','plot_bgcolor','font.color','title.font.color','legend.font.color','legend.bgcolor','xaxis.color','yaxis.color','xaxis.gridcolor','yaxis.gridcolor','xaxis.zerolinecolor','yaxis.zerolinecolor'].forEach(function(k: any): any{spec(k,'color');});
  ['font.size','title.font.size','legend.font.size','xaxis.title.font.size','yaxis.title.font.size','xaxis.tickfont.size','yaxis.tickfont.size'].forEach(function(k: any): any{spec(k,'number',6,72);});
  ['title.x','title.y','legend.x','legend.y'].forEach(function(k: any): any{spec(k,'number',-2,3);});
  ['xaxis','yaxis'].forEach(function(a: any): any{ ['showgrid','zeroline','showline','showticklabels'].forEach(function(k: any): any{spec(a+'.'+k,'boolean');}); ['gridwidth','zerolinewidth','linewidth'].forEach(function(k: any): any{spec(a+'.'+k,'number',0,10);}); spec(a+'.tickangle','number',-180,180); });
  spec('showlegend','boolean'); spec('legend.orientation','text',null,null,['h','v']);
  ['title.xanchor','legend.xanchor'].forEach(function(k: any): any{spec(k,'text',null,null,['left','center','right','auto']);});
  ['title.yanchor','legend.yanchor'].forEach(function(k: any): any{spec(k,'text',null,null,['top','middle','bottom','auto']);});
  function color(v: any): any{return typeof v==='string' && /^#[0-9a-f]{6}$/i.test(v);}
  function valid(v: any,s: any): any{return s.type==='number'?typeof v==='number'&&isFinite(v)&&v>=s.min&&v<=s.max:s.type==='boolean'?typeof v==='boolean':s.type==='color'?color(v):typeof v==='string'&&v.length<=500&&(!s.choices||s.choices.indexOf(v)>=0);}
  function sanitizeEditor(state: any): any{
    var out: any={layout:{},traces:[]}; state=state||{};if(typeof state.swapAxes==='boolean')out.swapAxes=state.swapAxes;if(PALETTES&&PALETTES[state.palette])out.palette=state.palette;if(typeof state.greyHealthy==='boolean')out.greyHealthy=state.greyHealthy;
    Object.keys(schema).forEach(function(k: any): any{if(state.layout&&valid(state.layout[k],schema[k]))out.layout[k]=state.layout[k];});
    (Array.isArray(state.traces)?state.traces:[]).slice(0,100).forEach(function(t: any): any{if(!t||!Number.isInteger(t.index)||t.index<0||t.index>999)return; var n: any={index:t.index}; ['name','sourceKey','hidden','points','innerBox','color','fillColor','fillOpacity','lineColor','lineWidth','markerSize','opacity','scaleLow','scaleMid','scaleHigh'].forEach(function(k: any): any{var s: any=['hidden','points','innerBox'].includes(k)?{type:'boolean'}:k==='name'||k==='sourceKey'?{type:'text'}:['color','fillColor','lineColor','scaleLow','scaleMid','scaleHigh'].includes(k)?{type:'color'}:{type:'number',min:0,max:['opacity','fillOpacity'].includes(k)?1:k==='lineWidth'?20:100};if(valid(t[k],s))n[k]=t[k];});if(!['scaleLow','scaleMid','scaleHigh'].every(function(k: any): any{return color(n[k]);})) ['scaleLow','scaleMid','scaleHigh'].forEach(function(k: any): any{delete n[k];});if(!n.sourceKey)delete n.hidden;out.traces.push(n);});
    // sourceKey owns the scientific mapping. Retain legacy index hints when
    // possible, but do not let an old hint collide with a newly rendered series
    // and make an otherwise valid checkpoint fail the strict server schema.
    var reservedIndices: any=new Set(out.traces.map(function(t: any): any{return t.index;})),usedIndices: any=new Set();out.traces.forEach(function(t: any): any{if(usedIndices.has(t.index)&&t.sourceKey){var spare: any=0;while(reservedIndices.has(spare)||usedIndices.has(spare))spare++;t.index=spare;reservedIndices.add(spare);}usedIndices.add(t.index);});
    if(Array.isArray(state.annotations)) out.annotations=state.annotations.slice(0,30).filter(function(a: any): any{return a&&typeof a.text==='string'&&a.text.length<=500&&Number.isFinite(a.x)&&a.x>=0&&a.x<=1&&Number.isFinite(a.y)&&a.y>=0&&a.y<=1;}).map(function(a: any): any{return {text:a.text,x:a.x,y:a.y,xref:'paper',yref:'paper',showarrow:false,font:{size:Math.max(6,Math.min(72,Number(a.size !== undefined ? a.size : a.font && a.font.size)||14)),color:color(a.color)?a.color:color(a.font && a.font.color)?a.font.color:'#17375e'}};});
    if(Array.isArray(state.categoryLabels)) {
      out.categoryLabels=[];
      state.categoryLabels.slice(0,2).forEach(function(a: any): any{
        if(!a||!['xaxis','yaxis'].includes(a.axis)||out.categoryLabels.some(function(v: any): any{return v.axis===a.axis;})||!Array.isArray(a.sourceKeys)||!a.sourceKeys.length||a.sourceKeys.length>100||a.sourceKeys.some(function(k: any): any{return typeof k!=='string'||!k.length||k.length>500;})||new Set(a.sourceKeys).size!==a.sourceKeys.length||!Array.isArray(a.values)||!Array.isArray(a.labels)||!a.values.length||a.values.length>100||a.values.length!==a.labels.length||a.values.some(function(v: any): any{return typeof v!=='string'||v.length>500;})||a.labels.some(function(v: any): any{return typeof v!=='string'||v.length>500;})||new Set(a.values).size!==a.values.length)return;
        out.categoryLabels.push({axis:a.axis,sourceKeys:a.sourceKeys.slice().sort(),values:a.values.slice(),labels:a.labels.slice()});
      });
    }
    return out;
  }

export { sanitizeStatistics, sanitizeEditor };
