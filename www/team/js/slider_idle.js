/* Team: hidden sliders do not poll.
   ion.rangeSlider (Shiny's sliderInput) re-runs updateScene every 300 ms for every slider, forever,
   to notice width changes. Team embeds Max's full module UI in hidden tab panes and canvas cards,
   so ~190 sliders polled while the Canvas sat idle (~640 timer callbacks a second, each reading
   layout). A slider with no box (display:none: an inactive pane or a closed panel) draws nothing
   anyway (drawHandles returns when its width is 0), so here it stops its loop instead and an
   IntersectionObserver resumes it the moment it is shown. Visible sliders, dragging and keyboard
   use run exactly as before; values, bindings and Shiny updates are untouched. */
(function () {
  'use strict';
  var patched = false, parked = new Map(), io = null;
  function wake(entries) {
    entries.forEach(function (e) {
      var inst = parked.get(e.target);
      if (!inst || e.target.closest('.tc-figure-chrome[inert]') || !e.target.getClientRects().length) return;
      parked.delete(e.target); io.unobserve(e.target); inst._tsParkedBox = null;
      try { inst.updateScene(); } catch (err) {}
    });
  }
  function patch(proto) {
    if (patched || !proto || typeof proto.updateScene !== 'function' || !window.IntersectionObserver) return;
    patched = true;
    io = new IntersectionObserver(wake);
    var run = proto.updateScene;
    proto.updateScene = function () {
      var rs = this.options && this.$cache && this.$cache.rs && this.$cache.rs[0];
      // A slider in a canvas card's parked chrome (card_figure.js: off-screen and inert until the
      // inspector's Data tab shows it) is idle too. Its 300 ms layout read forced a full style
      // recalculation during every pan/zoom frame (~5 s per 30 s with 24 cards). Checked first: it
      // reads no layout.
      if (rs && !this.is_active && !this.dragging && (rs.closest('.tc-figure-chrome[inert]') || !rs.getClientRects().length)) {
        if (this.raf_id) { cancelAnimationFrame(this.raf_id); this.raf_id = null; }
        clearTimeout(this.update_tm); this.update_tm = null;
        // update() rebuilds the slider's markup: forget the box it replaced.
        var old = this._tsParkedBox; if (old && old !== rs) { parked.delete(old); io.unobserve(old); }
        if (!parked.has(rs)) { parked.set(rs, this); this._tsParkedBox = rs; io.observe(rs); }
        return;
      }
      return run.apply(this, arguments);
    };
    window.TeamSliderIdle = { parked: function () { return parked.size; } };
  }
  function find() {
    if (patched || !window.jQuery) return;
    var el = document.querySelector('.js-range-slider');
    var inst = el && jQuery(el).data('ionRangeSlider');
    if (inst) patch(Object.getPrototypeOf(inst));
  }
  if (window.jQuery) jQuery(document).on('shiny:connected shiny:bound shiny:idle', find);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', find); else find();
})();
