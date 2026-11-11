#!/usr/bin/env node
// Refresh the manual from a recorded golden journey (steps.json plus desktop/mobile PNGs); last run: the no-two-step run of
// 2026-11-11 07:31 EST (Admin 8070cbbe, two-step sign-in off; ORD654, B2026-313, AR-0068). Each picture is found by its file name in steps.json.
// Usage: node tools/build-screenshots.mjs /path/to/journey-evidence-18of18 /path/to/admin/node_modules
// WebP quality 80, effort 6; native desktop width and 390 px phone width; top crops for Notifications and for the
// phone's Quality check (a full-page capture with its sticky bar in the middle; the crop is the phone's own screen).
// The three focus-link cleanups below are specific to this journey's captures and were visually checked in both sizes.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [source, modules] = process.argv.slice(2);
if (!source || !modules) throw new Error('Pass the journey evidence directory and Admin node_modules directory.');
const require = createRequire(join(resolve(modules), '..', 'package.json'));
const sharp = require('sharp');
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const content = JSON.parse(await readFile(join(site, 'content.json'), 'utf8'));
const steps = JSON.parse(await readFile(join(source, 'steps.json'), 'utf8'));
const files = [...new Set(content.parts.flatMap(part => part.steps.flatMap(step => step.shots.map(shot => shot.file))))].sort();
const pending = [];
for (const folder of ['desktop', 'mobile']) {
  for (const slug of files) {
    const matches = steps.filter(step => step.slug === slug);
    if (matches.length !== 1) throw new Error(`Expected one source for ${slug}`);
    const step = matches[0];
    let image = sharp(join(source, folder, `${String(step.n).padStart(2, '0')}-${slug}.png`));
    // Restore only the focus overlay's rectangle, from the immediately preceding fresh capture.
    const patch = slug === 'sample-registry' ? { from: '23-receive-shipment.png', left: 8, top: 12, width: 132, height: 56 }
      : slug === 'ingest-accepted' ? { from: '31-ingest-parsed.png', left: 8, top: 116, width: 132, height: 52 }
      : slug === 'request-sent' ? { from: '14-request-order-form.png', left: 8, top: 0, width: 132, height: 12 } : null;
    if (patch) {
      const { from, ...rect } = patch;
      const region = await sharp(join(source, folder, from)).extract(rect).png().toBuffer();
      image = sharp(await image.composite([{ input: region, left: rect.left, top: rect.top }]).png().toBuffer());
    }
    if (slug === 'notifications') image = image.extract({ left: 0, top: 0, width: folder === 'desktop' ? 1440 : 390, height: folder === 'desktop' ? 1500 : 2400 });
    if (slug === 'nexo-quality-check' && folder === 'mobile') image = image.extract({ left: 0, top: 0, width: 390, height: 844 });
    if (folder === 'mobile') image = image.resize({ width: 390 });
    pending.push({ folder, slug, bytes: await image.webp({ quality: 80, effort: 6 }).toBuffer() });
  }
}
const total = pending.reduce((sum, item) => sum + item.bytes.length, 0);
if (total > 6_000_000) throw new Error(`Screenshots exceed 6 MB: ${total} bytes`);
for (const item of pending) {
  const dir = join(site, 'screenshots', item.folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${item.slug}.webp`), item.bytes);
}
console.log(`Wrote ${pending.length} screenshots (${total} bytes). Run tools/build-search-index.mjs next.`);
