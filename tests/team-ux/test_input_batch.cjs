// www/team/js/input_batch.js: a batch of saved controls reaches the server as one
// update; Shiny 1.14's trailing empty updates are not sent. No server needed.
// node tests/team-ux/test_input_batch.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../www/team/js/input_batch.js'), 'utf8');

// The ShinyApp.sendInput and InputBatchSender of the bundled shiny.js 1.14
// (sendIsEnqueued is never set, so every non-event setInput queues its own send task;
// _sendNow runs the lastChanceCallbacks before taking pendingData).
function makeShiny() {
  const sent = [], tasks = [], conditionals = [];
  const shinyapp = { $inputValues: {},
    $sendMsg(msg) { sent.push(msg); },
    $updateConditionals() { conditionals.push(Object.keys(this.$inputValues).length); },
    sendInput(values) { this.$sendMsg(JSON.stringify({ method: 'update', data: values })); Object.assign(this.$inputValues, values); this.$updateConditionals(); },
    taskQueue: { enqueue: f => tasks.push(f) } };
  const sender = { pendingData: {}, reentrant: false, sendIsEnqueued: false, lastChanceCallback: [],
    setInput(name, value, opts) { this.pendingData[name] = value; if (!this.reentrant) { if (opts.priority === 'event') this._sendNow(); else if (!this.sendIsEnqueued) shinyapp.taskQueue.enqueue(() => { this.sendIsEnqueued = false; this._sendNow(); }); } },
    _sendNow() { this.reentrant = true; try { this.lastChanceCallback.forEach(cb => cb()); const d = this.pendingData; this.pendingData = {}; shinyapp.sendInput(d); } finally { this.reentrant = false; } } };
  return { shinyapp, sender, sent, conditionals, drain: () => { while (tasks.length) tasks.shift()(); } };
}
function setup(withPatch, window) {
  const s = makeShiny();
  window = window || { Shiny: {} };
  window.Shiny.shinyapp = s.shinyapp;
  if (withPatch) { if (window.TeamInputBatch) window.TeamInputBatch.patch(); else vm.runInNewContext(source, { window, jQuery: undefined }); }
  return Object.assign(s, { window });
}
function run(withPatch) {
  const s = setup(withPatch);
  s.sender.setInput('session_ready', true, { priority: 'event' });   // the app's first real update
  // A restored copy with eight saved controls, then one event-priority request.
  for (let i = 0; i < 8; i++) s.sender.setInput('tcinstance_a-k' + i, i, { priority: 'deferred' });
  s.drain();
  s.sender.setInput('team_canvas_instance_create', { id: 'b' }, { priority: 'event' });
  return s;
}
const before = run(false);
assert.equal(before.sent.length, 10);
assert.equal(before.sent.filter(m => m.endsWith('"data":{}}')).length, 7, 'Shiny 1.14 sends seven empty updates for eight controls');
const after = run(true);
assert.equal(after.sent.length, 3, 'the first update, one update for the card, then the event');
assert.deepEqual(Object.keys(JSON.parse(after.sent[1]).data), ['k0','k1','k2','k3','k4','k5','k6','k7'].map(k => 'tcinstance_a-' + k));
assert.equal(JSON.parse(after.sent[2]).data.team_canvas_instance_create.id, 'b');
// Local effects are kept: conditionals are evaluated once per sendInput call, empty or not,
// with the same input values, exactly as without the patch.
assert.deepEqual(after.conditionals, before.conditionals);
assert.deepEqual(after.shinyapp.$inputValues, before.shinyapp.$inputValues);
assert.equal(after.window.TeamInputBatch.skipped, 7);
// Every value still arrives, in the same messages that carried it before.
const values = msgs => Object.assign({}, ...msgs.map(m => JSON.parse(m).data));
assert.deepEqual(values(after.sent), values(before.sent));
// Before an app's first non-empty update, an empty update is forwarded unchanged.
{
  const s = setup(true);
  s.sender._sendNow();
  assert.deepEqual(s.sent, ['{"method":"update","data":{}}']); assert.equal(s.window.TeamInputBatch.skipped, 0);
  s.sender.setInput('x', 1, { priority: 'event' }); s.sender._sendNow();
  assert.equal(s.sent.length, 2); assert.equal(s.window.TeamInputBatch.skipped, 1); assert.equal(s.conditionals.length, 3);
  // The state is per app: a new shinyapp patched in the same window starts over.
  const t = setup(true, s.window);
  t.sender._sendNow(); assert.deepEqual(t.sent, ['{"method":"update","data":{}}']);
}
// A lastChanceCallback that adds keys turns a would-be-empty task into a real update, which is sent.
{
  const mk = patched => { const s = setup(patched); s.sender.setInput('first', 0, { priority: 'event' });
    let n = 0; s.sender.lastChanceCallback.push(() => { if (++n === 3) s.sender.pendingData['.clientdata_late'] = 'w'; });
    for (let i = 0; i < 4; i++) s.sender.setInput('c' + i, i, { priority: 'deferred' }); s.drain(); return s; };
  const b = mk(false), a = mk(true);
  assert.equal(b.sent.length, 5);
  assert.deepEqual(a.sent, b.sent.filter(m => !m.endsWith('"data":{}}')));
  assert.equal(JSON.parse(a.sent[2]).data['.clientdata_late'], 'w');
  assert.deepEqual(a.conditionals, b.conditionals);
}
// An event-priority input while hydration tasks are still queued: the event flushes all
// pending values at once, in the same order as before; the queued tasks find nothing.
{
  const mk = patched => { const s = setup(patched); s.sender.setInput('first', 0, { priority: 'event' });
    for (let i = 0; i < 5; i++) s.sender.setInput('h' + i, i, { priority: 'deferred' });
    s.sender.setInput('btn', 1, { priority: 'event' });
    s.sender.setInput('h5', 5, { priority: 'deferred' }); s.drain(); return s; };
  const b = mk(false), a = mk(true);
  const real = b.sent.filter(m => !m.endsWith('"data":{}}'));
  assert.deepEqual(a.sent, real);
  assert.deepEqual(Object.keys(JSON.parse(a.sent[1]).data), ['h0','h1','h2','h3','h4','btn']);
  assert.deepEqual(Object.keys(JSON.parse(a.sent[2]).data), ['h5']);
  assert.deepEqual(a.conditionals, b.conditionals);
  assert.deepEqual(values(a.sent), values(b.sent));
}
// Idempotent, and only exactly-empty objects are dropped.
const w = after.window; w.Shiny.shinyapp = after.shinyapp; const once = w.Shiny.shinyapp.sendInput; assert.equal(w.TeamInputBatch.patch(), true); assert.equal(w.Shiny.shinyapp.sendInput, once);
assert.equal(w.TeamInputBatch.isEmpty({}), true);
for (const v of [{ a: undefined }, { a: null }, [], null, undefined, 'x']) assert.equal(w.TeamInputBatch.isEmpty(v), false);
// The bundled shiny.js still has the behaviour this file compensates for (an upgrade that fixes it makes this file a no-op).
const shinyJs = process.env.SHINY_JS;
if (shinyJs && fs.existsSync(shinyJs)) {
  const js = fs.readFileSync(shinyJs, 'utf8');
  assert.match(js, /else if \(!this\.sendIsEnqueued\) \{\s*this\.shinyapp\.taskQueue\.enqueue/);
  // sendInput's local effects are exactly the ones kept for a skipped empty update.
  assert.match(js, /sendInput\(values\) \{\s*const msg = JSON\.stringify\(\{\s*method: "update",\s*data: values\s*\}\);\s*this\.\$sendMsg\(msg\);\s*[\w.]+\.extend\(this\.\$inputValues, values\);\s*this\.\$updateConditionals\(\);\s*\}/);
}
console.log('PASS: one input message per batch of saved controls; empty updates are not sent, local effects kept');
