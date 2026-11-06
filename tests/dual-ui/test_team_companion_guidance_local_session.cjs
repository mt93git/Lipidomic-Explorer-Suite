// Run with: node tests/dual-ui/test_team_companion_guidance_local_session.cjs
// In a local session (window.LIPIDOMIC_TEAM_SESSION_ONLY === true, LIPIDOMIC_TEAM_LOCAL_SESSION=1) the browser
// guide must not promise autosave or checkpoints: the Save & export tip and the autosave topic (the topic
// "explain this step" shows on Save & export) are read through session-only getters. With the library the
// production text is unchanged. The four Data/Save getters are the approved exception in this frozen file.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve('www/team/js/companion_guidance_data.js'), 'utf8');
const window = {}; vm.runInNewContext(source, { window });
const G = window.LipidomicCompanionGuidance, topic = id => G.topics.find(t => t.id === id);
const read = flag => { window.LIPIDOMIC_TEAM_SESSION_ONLY = flag;
  return { save: G.tips.save[0].text, autosave: topic('autosave').text, choice: G.tips['data-choice'][0].text, data: topic('step-data').text }; };
const library = read(undefined), local = read(true);
assert.equal(library.save, 'Name the checkpoint so you can find it later; it keeps the data, canvas, colors and finished figures.');
assert.equal(library.autosave, 'With a private project, the workspace autosaves. Save & export creates named checkpoints that keep the data, canvas, colors and finished figures. Resume a checkpoint from Data.');
for (const [k, text] of Object.entries(local)) {
  assert.doesNotMatch(text, /Name the checkpoint|creates named checkpoints|workspace autosaves|Resume a checkpoint|Open latest/i, `local ${k}: no checkpoint or autosave promise: ${text}`);
}
assert.match(local.save, /not saved automatically/); assert.match(local.save, /session ZIP/);
assert.match(local.autosave, /nothing autosaves/); assert.match(local.autosave, /session ZIP/);
assert.deepEqual(read(false), library, 'only a literal true selects the local text');
assert.deepEqual(read('true'), library, 'a string flag does not select the local text');
console.log('PASS: Save & export tip and autosave topic speak of the session ZIP in a local session; library text unchanged');
