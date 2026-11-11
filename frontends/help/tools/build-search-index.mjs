#!/usr/bin/env node
// Builds the two generated files of the help manual from content.json:
//
//   search-index.json   the search index: title phrase and three token lists per step, part and overview
//   help-data.js        content.json plus screenshot names and dimensions, as a script, so the page also
//                       works when index.html is opened from disk (browsers do not fetch JSON over file://)
//
// Screenshots: a step lists one to three in "shots": { "file", "caption", "alt" }. "file" names the picture without
// folder or extension: screenshots/desktop/<file>.webp and screenshots/mobile/<file>.webp. Steps may share a file.
// A step that describes a screen being reworked carries "updating": true; the page then shows a quiet note.
//
// A part or a step in content.json may carry "keywords": words a reader may search for that its title and text
// do not use (for example "login" where the app says "Sign in"). They are searched and never shown.
//
// Run it after editing content.json, and after adding or removing screenshots:
//
//   node tools/build-search-index.mjs            writes both files and prints a report
//   node tools/build-search-index.mjs --check    writes nothing; exits 1 if a file is out of date or content.json is wrong
//
// No dependencies. The index is built by the same code the page falls back to (the HelpSearch part of help.js).

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const content = JSON.parse(readFileSync(join(site, 'content.json'), 'utf8'));

// ---- content.json: the mistakes that would show on the page ----

const problems = [];
const ids = new Set(['cycle', 'roles']);
const steps = [];
const roleIds = new Set((content.roles ?? []).map(role => role.id));
const seenSlugs = new Set();
const shotFiles = new Set();
const badKeywords = thing => thing.keywords !== undefined && !(Array.isArray(thing.keywords) && thing.keywords.every(word => typeof word === 'string' && word.trim()));

for (const part of content.parts ?? []) {
  if (ids.has(part.id)) problems.push(`part id used twice: ${part.id}`);
  ids.add(part.id);
  for (const key of ['title', 'app', 'label', 'summary', 'what', 'who']) if (!part[key]) problems.push(`part ${part.id}: no "${key}"`);
  if (badKeywords(part)) problems.push(`part ${part.id}: "keywords" must be a list of words`);
  for (const step of part.steps ?? []) {
    const name = `${part.id}/${step.slug}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(step.slug ?? '')) problems.push(`${name}: a slug is lower-case letters, digits and hyphens`);
    if (seenSlugs.has(step.slug)) problems.push(`${name}: slug used twice`);
    seenSlugs.add(step.slug);
    ids.add(name);
    steps.push(step);
    for (const key of ['title', 'what', 'when']) if (!step[key]) problems.push(`${name}: no "${key}"`);
    if (step.updating !== undefined && typeof step.updating !== 'boolean') problems.push(`${name}: "updating" must be true or false`);
    if ('draft' in step || 'screenshot' in step) problems.push(`${name}: "draft" and "screenshot" are gone; use "updating" and "shots"`);
    if (!step.steps?.length) problems.push(`${name}: no steps`);
    if (!step.who?.length) problems.push(`${name}: no role in "who"`);
    for (const role of step.who ?? []) if (!roleIds.has(role)) problems.push(`${name}: unknown role "${role}"`);
    if (!Array.isArray(step.shots) || !step.shots.length || step.shots.length > 3) problems.push(`${name}: "shots" must list one to three screenshots`);
    for (const shot of step.shots ?? []) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(shot.file ?? '')) problems.push(`${name}: a shot "file" is lower-case letters, digits and hyphens, without folder or extension`);
      if (!shot.alt) problems.push(`${name}: shot ${shot.file}: no alt text`);
      if (!shot.caption) problems.push(`${name}: shot ${shot.file}: no caption`);
      shotFiles.add(shot.file);
    }
    if (badKeywords(step)) problems.push(`${name}: "keywords" must be a list of words`);
  }
}
for (const stage of content.cycle?.stages ?? []) {
  if (!stage.links?.length) problems.push(`cycle stage "${stage.title}": no link`);
  for (const link of stage.links ?? []) if (!ids.has(link)) problems.push(`cycle stage "${stage.title}": link to "${link}", which does not exist`);
  if (!['client', 'lab', 'both'].includes(stage.side)) problems.push(`cycle stage "${stage.title}": side must be client, lab or both`);
}
(function walk(value, where) {
  if (typeof value === 'string') {
    if ((value.match(/\*\*/g) ?? []).length % 2) problems.push(`${where}: unbalanced ** in "${value.slice(0, 48)}"`);
    if ((value.match(/`/g) ?? []).length % 2) problems.push(`${where}: unbalanced \` in "${value.slice(0, 48)}"`);
    for (const [, target] of value.matchAll(/\]\(#([^)\s]+)\)/g)) if (!ids.has(target)) problems.push(`${where}: link to "#${target}", which does not exist`);
  } else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${where}[${i}]`));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, where ? `${where}.${key}` : key);
})(content, '');

if (problems.length) {
  console.error(`content.json has ${problems.length} problem(s):\n  ` + problems.join('\n  '));
  process.exit(1);
}

// ---- screenshots that exist ----

const files = [...shotFiles];
const screenshots = {}, imageSizes = {}, strays = [];
// WebP's own dimensions reserve space before lazy images load. No imaging dependency is needed for the build.
function webpSize(path) {
  const bytes = readFileSync(path);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid WebP: ${path}`);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (start + length > bytes.length) break;
    if (type === 'VP8X' && length >= 10) return [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    if (type === 'VP8 ' && length >= 10) return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    if (type === 'VP8L' && length >= 5) {
      const bits = bytes.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = start + length + (length % 2);
  }
  throw new Error(`No WebP dimensions: ${path}`);
}
for (const folder of ['desktop', 'mobile']) {
  const dir = join(site, 'screenshots', folder);
  const found = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.webp')).map(name => name.slice(0, -5)) : [];
  screenshots[folder] = files.filter(file => found.includes(file)).sort();
  imageSizes[folder] = Object.fromEntries(screenshots[folder].map(file => [file, webpSize(join(dir, `${file}.webp`))]));
  strays.push(...found.filter(file => !shotFiles.has(file)).map(file => `screenshots/${folder}/${file}.webp`));
}

// ---- the two files ----

await import(pathToFileURL(join(site, 'help.js')).href);
const HelpSearch = globalThis.HelpSearch;
if (!HelpSearch?.buildIndex) throw new Error('help.js did not define HelpSearch');

const source = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
const index = HelpSearch.buildIndex(content, source);

const lineEnds = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');   // legal in JSON, but they end a line in older JavaScript
const indexText = `{\n  "version": ${index.version},\n  "source": ${JSON.stringify(index.source)},\n  "entries": [\n`
  + index.entries.map(entry => '    ' + JSON.stringify(entry)).join(',\n') + '\n  ]\n}\n';
const dataText = '/* Generated by tools/build-search-index.mjs from content.json and the screenshots folders.\n'
  + '   Do not edit this file: edit content.json (or add screenshots) and run the tool again. */\n'
  + 'window.HELP_DATA = ' + JSON.stringify({ source, screenshots, imageSizes, content }, null, 2).replace(lineEnds, char => '\\u' + char.charCodeAt(0).toString(16)) + ';\n';

const outputs = [['search-index.json', indexText], ['help-data.js', dataText]];
const stale = outputs.filter(([name, text]) => !existsSync(join(site, name)) || readFileSync(join(site, name), 'utf8') !== text).map(([name]) => name);
if (!checkOnly) for (const [name, text] of outputs) writeFileSync(join(site, name), text);

// ---- report ----

const kB = text => (Buffer.byteLength(text) / 1024).toFixed(1) + ' kB';
const tokenCount = index.entries.reduce((sum, entry) => sum + entry.title.length + entry.labels.length + entry.text.length, 0);
console.log(`content.json        ${content.parts.length} parts, ${steps.length} steps, ${steps.filter(step => step.updating).length} marked updating, ${files.length} screenshot files`);
console.log(`search-index.json   ${index.entries.length} entries, ${tokenCount} tokens, ${kB(indexText)}, source ${source}`);
console.log(`help-data.js        ${kB(dataText)}`);
for (const folder of ['desktop', 'mobile']) {
  const missing = files.filter(file => !screenshots[folder].includes(file));
  console.log(`screenshots/${folder.padEnd(8)}${screenshots[folder].length} of ${files.length}` + (missing.length ? `; placeholder shown for: ${missing.join(', ')}` : ''));
}
if (strays.length) console.log(`not used by any step: ${strays.join(', ')}`);

if (checkOnly) {
  if (stale.length) { console.error(`out of date: ${stale.join(', ')}. Run: node tools/build-search-index.mjs`); process.exit(1); }
  console.log('up to date');
} else {
  console.log(stale.length ? `wrote ${stale.join(' and ')}` : 'nothing changed');
}
