// Team Signal distribution transport (R/results_dashboard.R,
// plotly_build.team_compact_distribution). The server sends a box trace's
// repeated sample name once and its values as exact little-endian doubles.
// Restore the same plain arrays before the plotly binding (and every other
// shiny:value reader) sees the value, so Plotly receives the figure unchanged.
(function () {
  'use strict';
  function doubles(b64) {
    var bin = atob(b64);
    if (bin.length % 8) throw new Error('truncated doubles');
    var n = bin.length >> 3, view = new DataView(new ArrayBuffer(bin.length)), out = new Array(n);
    for (var i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i));
    for (var j = 0; j < n; j++) out[j] = view.getFloat64(j * 8, true);
    return out;
  }
  function plain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function only(v, keys) { var k = Object.keys(v); return k.length === keys.length && keys.every(function (key) { return k.indexOf(key) >= 0; }); }
  // A trace's x/y as they will reach Plotly: a received array, or a packed member that must
  // be complete and well formed. Anything else is an error.
  function member(v, kind) {
    if (Array.isArray(v) || v === undefined || v === null || typeof v !== 'object') return { packed: false, value: v };
    if (kind === 'x' && only(v, ['teamRepeat', 'n']) && typeof v.teamRepeat === 'string' && Number.isSafeInteger(v.n) && v.n > 0) {
      var xs = new Array(v.n); for (var i = 0; i < v.n; i++) xs[i] = v.teamRepeat; return { packed: true, value: xs };
    }
    if (kind === 'y' && only(v, ['teamFloat64']) && typeof v.teamFloat64 === 'string') return { packed: true, value: doubles(v.teamFloat64) };
    throw new Error('malformed packed ' + kind);
  }
  // Every trace is validated and decoded before anything is assigned: on any failure the
  // whole value is left exactly as received (teamPacked kept), and nothing is drawn from it.
  function unpack(x) {
    if (!x || x.teamPacked !== 1 || !Array.isArray(x.data)) return false;
    var decoded;
    try {
      decoded = x.data.map(function (trace) {
        if (!plain(trace)) throw new Error('trace is not an object');
        var dx = member(trace.x, 'x'), dy = member(trace.y, 'y');
        if ((dx.packed || dy.packed) && !(Array.isArray(dx.value) && Array.isArray(dy.value) && dx.value.length === dy.value.length)) throw new Error('packed x/y lengths differ');
        return { x: dx.packed ? dx.value : null, y: dy.packed ? dy.value : null };
      });
    } catch (error) {
      if (window.console) console.warn('Team plot payload could not be restored; left unchanged.', error);
      return false;
    }
    x.data.forEach(function (trace, i) { if (decoded[i].x) trace.x = decoded[i].x; if (decoded[i].y) trace.y = decoded[i].y; });
    delete x.teamPacked;
    return true;
  }
  window.TeamPlotPayload = { unpack: unpack };
  if (window.jQuery) jQuery(document).on('shiny:value', function (e) {
    if (e.value && typeof e.value === 'object') unpack(e.value.x);
  });
})();
