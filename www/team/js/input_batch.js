// One input message per batch of saved controls.
// Shiny's InputBatchSender (1.14) queues one send task for every non-event
// setInputValue: the first task sends every pending value at once and each later
// task sends an empty update. Restoring a canvas copy replays each saved control
// (canvas.js setInstanceInputs, then each binding's own change event), so one card
// cost one real update plus one empty update per control, and the server ran a full
// input cycle for each empty one (manageInputs -> manageHiddenOutputs over every
// output of the session). An empty update carries no value, so its websocket message
// is not sent: each batch of saved controls reaches the server as the one message that
// holds them. Everything else Shiny 1.14's sendInput does locally still happens
// (extending $inputValues with {} is a no-op; $updateConditionals() re-evaluates
// data-display-if and triggers 'shiny:conditional'). Until an app has sent its first
// non-empty update, empty updates are forwarded unchanged.
(function () {
  var stats = window.TeamInputBatch = window.TeamInputBatch || { sent: 0, skipped: 0 };
  function isEmpty(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
    for (var key in values) if (Object.prototype.hasOwnProperty.call(values, key)) return false;
    return true;
  }
  function patch() {
    var app = window.Shiny && window.Shiny.shinyapp;
    if (!app || typeof app.sendInput !== 'function') return false;
    if (app.sendInput.tcSkipsEmpty) return true;
    var send = app.sendInput;
    var realSent = false;   // per app: this wrapper belongs to this shinyapp only
    var wrapped = function (values) {
      if (realSent && isEmpty(values)) {
        stats.skipped++;
        if (typeof this.$updateConditionals === 'function') this.$updateConditionals();
        return;
      }
      if (!isEmpty(values)) realSent = true;
      stats.sent++;
      return send.apply(this, arguments);
    };
    wrapped.tcSkipsEmpty = true;
    app.sendInput = wrapped;
    return true;
  }
  stats.patch = patch;
  stats.isEmpty = isEmpty;
  if (!patch() && window.jQuery) {
    // shinyapp exists before the socket opens; patch before the first input batch.
    jQuery(document).on('shiny:connected', patch);
    jQuery(patch);
  }
})();
