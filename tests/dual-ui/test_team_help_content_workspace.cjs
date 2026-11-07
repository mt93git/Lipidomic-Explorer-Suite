// Run with: node tests/dual-ui/test_team_help_content_workspace.cjs
// Team has two views only (Classic, and the Data -> Review -> Canvas workspace). The tool help reachable from
// the workspace (App Info opens in place of the Canvas, guided.js) must not send users to a seven-step navigation.
const assert = require('node:assert/strict');
const path = require('node:path');
const help = require(path.resolve('www/team/js/help_content.js'));
const all = Object.entries(help.topics).map(([key, t]) => [key, [t.title, t.what, t.how, t.limit].join(' ')]);
for (const [key, text] of all) {
  assert.doesNotMatch(text, /seven[- ]step/i, `${key}: help text names the old seven-step navigation`);
  assert.doesNotMatch(text, /\b[0-9]\s+of\s+7\b/i, `${key}: help text names a step "n of 7"`);
}
assert.match(help.topics['tool:App Info'].how, /Data · Review · Canvas/, 'App Info points back to the workspace steps');
console.log('PASS: Team tool help names the Data · Review · Canvas workspace, never the seven-step navigation');
