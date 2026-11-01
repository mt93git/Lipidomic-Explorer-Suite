(function () {
  'use strict';
  // Rendering extent only: retain Plotly's calculated bandwidth, observations,
  // quartiles and density estimator. Four bandwidths makes Gaussian tails
  // visually negligible instead of closing the default soft span at 2 bw.
  function fit(gd) {
    if (!gd || !window.Plotly || !Array.isArray(gd.calcdata)) return Promise.resolve(false);
    var indices = [], spans = [];
    (gd._fullData || []).forEach(function (trace, i) {
      if (trace.type !== 'violin' || trace.visible === false || trace.visible === 'legendonly' || trace.spanmode !== 'soft') return;
      var groups = (gd.calcdata[i] || []).filter(function (g) { return Number.isFinite(g.min) && Number.isFinite(g.max) && Number.isFinite(g.bandwidth) && g.bandwidth > 0; });
      if (!groups.length) return;
      var lo = Math.min.apply(null, groups.map(function(g) { return g.min - 4 * g.bandwidth; }));
      var hi = Math.max.apply(null, groups.map(function(g) { return g.max + 4 * g.bandwidth; }));
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return;
      indices.push(i); spans.push([lo, hi]);
    });
    if (!indices.length) return Promise.resolve(false);
    // Restyle honors existing axis ranges (including intentional zoom). The
    // initial autorange includes these complete density extents with padding.
    return Plotly.restyle(gd, {spanmode:'manual', span:spans}, indices).then(function () { return true; });
  }
  window.TeamViolinDisplay = {fit:fit};
}());
