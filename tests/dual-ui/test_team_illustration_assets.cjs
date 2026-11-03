// Run with: node tests/dual-ui/test_team_illustration_assets.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const file = path.resolve(__dirname, '../../www/team/js/illustrations.js');
const source = fs.readFileSync(file, 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: file });
const lib = context.window.TeamIllustrations;
assert.ok(lib && Array.isArray(lib.list), 'library is exposed on window');
assert.ok(lib.list.length >= 12, 'library contains the common lipidomics workflow assets');
assert.equal(new Set(lib.list.map(a => a.id)).size, lib.list.length, 'asset IDs are unique');
for (const asset of lib.list) {
  assert.match(asset.id, /^[a-z0-9-]+$/);
  assert.ok(asset.title && asset.category);
  const first = lib.svg(asset.id);
  const second = lib.svg(asset.id);
  assert.equal(first, second, `${asset.id} is deterministic`);
  const expectedViewBox = ['cohort-label','lipid-class-chip'].includes(asset.id) ? '24 44 192 72' : (asset.id === 'connector-arrow' ? '24 46 164 68' : '0 0 240 160');
  assert.match(first, new RegExp('^<svg[^>]+viewBox="' + expectedViewBox.replace(/ /g, '\\s+') + '"'));
  assert.match(first, /<title>/);
  assert.match(first, /data-team-illustration-version="1"/);
  assert.match(first, /not a measured anatomical reconstruction/);
  assert.ok(!first.includes('<img') && !first.includes('data:'), `${asset.id} is self-contained SVG`);
  assert.notEqual(first, lib.svg(asset.id, '#b24a78'), `${asset.id} responds to palette changes`);
}
const plate = lib.svg('microplate');
assert.equal((plate.match(/<circle /g) || []).length, 96, 'microplate uses a true 8 × 12 well layout');
assert.throws(() => lib.svg('missing-asset'), /Unknown Team illustration/);
assert.throws(() => lib.svg(lib.list[0].id, '#123'), /six-digit hex/);
assert.throws(() => lib.svg(lib.list[0].id, 'green'), /six-digit hex/);
console.log(`Team illustration assets: ${lib.list.length} assets passed deterministic SVG and input-safety checks`);

for (const asset of lib.list) assert.ok(!lib.svg(asset.id).includes('M28 143h184'), 'decorative baseline removed');
assert.match(lib.svg('whole-blood'), /fill="#ad2939"/);
assert.match(lib.svg('serum-vial'), /fill="#df8d32"/);
assert.match(lib.svg('serum-vial'), /fill="#f5d780"/);
assert.match(lib.svg('serum-vial'), /fill="#a32f38"/);
assert.ok(!lib.svg('cohort-label', '#235c77', 'Study').includes('textLength='), 'natural typography without forced stretching');
assert.match(lib.svg('lipid-class-chip', '#232b35', '<PC>&'), /&lt;PC&gt;&amp;/);
assert.match(lib.svg('lipid-class-chip', '#232b35', 'PC'), /fill="#ffffff">PC/);
