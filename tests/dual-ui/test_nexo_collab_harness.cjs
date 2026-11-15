// The real-path harness itself (tests/dual-ui/collab-real.cjs), no browser: R lists the fake Admin's released dataset
// (contract C2), and start({ requireUser: true }) runs R with LIPIDOMIC_ADMIN_REQUIRE_USER=1, so a client member no longer
// sees the lab's checkpoint (storage.R api_checkpoint_list); by default the store stays shared, as every journey expects.
// node tests/dual-ui/test_nexo_collab_harness.cjs
'use strict';
const assert = require('node:assert/strict');
const h = require('./collab-real.cjs');
const ids = list => list.map(c => c.id);
async function step(name, options, check) {
  try { const s = await h.start(options); await check(s); console.log(`PASS harness ${name}`); }
  catch (error) { console.error(`FAIL harness ${name}: ${error.stack ?? error.message}`); process.exitCode = 1; }
  finally { await h.stop(); }
}
(async () => {
  await step('released datasets list per C2, store shared by default', undefined, async s => {
    for (const who of ['a', 'client']) {
      const { status, value } = await h.api(who, '/datasets');
      assert.equal(status, 200, `${who}: ${JSON.stringify(value)}`);
      assert.deepEqual(value.datasets.map(d => [d.orderCode, d.version]), [['ORD900', 1]], who);
    }
    assert.deepEqual(ids((await h.api('client', '/checkpoints')).value), [s.checkpoint]);
  });
  await step('requireUser scopes checkpoints per client', { requireUser: true }, async s => {
    assert.deepEqual(ids((await h.api('a', '/checkpoints')).value), [s.checkpoint]);
    assert.deepEqual((await h.api('client', '/checkpoints')).value, []);
  });
})();
