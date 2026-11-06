// Shiny.addCustomMessageHandler throws unless the handler takes exactly one
// argument; a throw during init silently disables the whole script (71dc349
// shipped autosave.js with a two-argument context handler). Check every Team
// handler: inline functions and named functions declared in the same file.
const fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..', '..', 'www', 'team', 'js');
const bad = []; let checked = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /addCustomMessageHandler\(\s*(['"][^'"]+['"])\s*,\s*(function\s*\(([^)]*)\)|([A-Za-z_$][\w$]*))/g;
  let m;
  while ((m = re.exec(src))) {
    let params;
    if (m[2].startsWith('function')) params = m[3];
    else {
      const d = new RegExp('function\\s+' + m[4] + '\\s*\\(([^)]*)\\)').exec(src) || new RegExp('(?:var|let|const)\\s+' + m[4] + '\\s*=\\s*function\\s*\\(([^)]*)\\)').exec(src);
      if (!d) { bad.push(`${f}: ${m[1]} handler ${m[4]} not resolvable`); continue; }
      params = d[1];
    }
    const n = params.split(',').map(s => s.trim()).filter(Boolean).length;
    checked++;
    if (n !== 1) bad.push(`${f}: ${m[1]} handler takes ${n} arguments`);
  }
}
assert.ok(checked > 20, 'expected to find the Team message handlers, found ' + checked);
assert.deepStrictEqual(bad, []);
console.log(`PASS: ${checked} Team Shiny message handlers take exactly one argument`);
