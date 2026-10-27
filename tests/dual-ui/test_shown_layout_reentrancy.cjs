// Simulate bslib emitting shown.bs.collapse synchronously from resize.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../www/js/app.js'), 'utf8');
const start = source.indexOf('var handlingShownLayout = false;');
const end = source.indexOf("$(document).on('shiny:connected shiny:value shiny:idle', tagDownloadButtons);", start);
assert.ok(start >= 0 && end > start);
let handler, resizeCount = 0, tagCount = 0;
const document = {};
const stub = { on: (_, fn) => { handler = fn; }, attr: () => '', data: () => '', each: () => {} };
const context = { document, $: () => stub, Event: function(name) { this.type = name; },
  tagDownloadButtons: () => { tagCount++; }, adjustResizableContainer: () => {},
  window: { dispatchEvent: () => { resizeCount++; if(resizeCount > 10) throw Error('recursive resize'); handler({target:{}}); } }
};
vm.runInNewContext(source.slice(start, end), context);
handler({target:{}});
assert.equal(resizeCount, 1); assert.equal(tagCount, 1);
handler({target:{}});
assert.equal(resizeCount, 2); assert.equal(tagCount, 2);
console.log('PASS: nested collapse does not recurse; subsequent layout events still work');
