// Team SCIEX import: browser-side detection (www/team/js/sciex_import.js) agrees with the R
// detector on the fixtures. node tests/team-ux/test_sciex_detect.cjs  (from the repository root)
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const listeners = {};
const ctx = { window: null, document: { addEventListener() {}, querySelectorAll() { return []; } }, TextDecoder, Blob, console, setTimeout, clearTimeout, Promise };
ctx.window = ctx; ctx.addEventListener = (t, f) => { listeners[t] = f; };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('www/team/js/sciex_import.js', 'utf8'), ctx);
const S = ctx.TeamSciexImport;
let n = 0; const ok = (label, v) => { assert.ok(v, label); n++; console.log('ok  ', label); };
const fx = 'tests/team-ux/fixtures/sciex/';
ok('wide fixture detected', S.detectText(fs.readFileSync(fx + 'sciex7500_wide_example.txt', 'utf8')) === 'wide');
ok('long fixture detected', S.detectText(fs.readFileSync(fx + 'sciex_long_results_example.txt', 'utf8')) === 'long');
const wide = fs.readFileSync(fx + 'sciex7500_wide_example.txt');
ok('UTF-16LE with BOM detected', S.detectText(S.decodeHead(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(wide.toString('utf8'), 'utf16le')]))) === 'wide');
ok('UTF-8 BOM detected', S.detectText(S.decodeHead(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), wide]))) === 'wide');
ok('comma-separated long detected', S.detectText('Sample Name,Sample Type,Component Name,Area\nS1,Unknown,PC(1),1\n') === 'long');
ok('header with units and quotes', S.detectText('"Sample Name"\t"Component Name"\t"Calculated Concentration (ng/mL)"\nS1\tPC\t1\n') === 'long');
ok('preamble before a long header', S.detectText('Results\n\nSample Name\tComponent Name\tArea\nS1\tPC\t1\n') === 'long');
ok('plain wide matrix is not SCIEX', S.detectText('Lipid_Name,S1,S2\nPC(1),1,2\n') === null);
ok('Sample Name matrix without Sample Type row is not SCIEX', S.detectText('Sample Name\tA\tB\nCE(14:0)+NH4\t1\t2\n') === null);
ok('cut last line ignored', S.detectText('Sample Name\tA\nSample Ty') === null);
ok('change and drop listeners registered (capture)', typeof listeners.change === 'function' && typeof listeners.drop === 'function');
console.log(`\n${n} checks passed`);
