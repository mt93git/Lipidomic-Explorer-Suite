#!/usr/bin/env node
// Run with the existing Admin dependencies; no install or server required:
// node frontends/help/tools/test-help.mjs /path/to/admin/node_modules
// Optional HELP_CAPTURE_DIR saves viewport screenshots outside the source tree.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = process.argv[2];
if (!modules) throw new Error('Pass the Admin node_modules directory (Playwright and axe-core).');
const require = createRequire(join(resolve(modules), '..', 'package.json'));
const { chromium } = require('playwright');
const axe = require('axe-core');
const search = require(join(site, 'help.js'));
const content = JSON.parse(await readFile(join(site, 'content.json'), 'utf8'));
const index = JSON.parse(await readFile(join(site, 'search-index.json'), 'utf8'));
const stepIds = content.parts.flatMap(part => part.steps.map(step => `${part.id}/${step.slug}`));
const imageFiles = [...new Set(content.parts.flatMap(part => part.steps.flatMap(step => step.shots.map(shot => shot.file))))];
const imageBytes = (await Promise.all(['desktop', 'mobile'].flatMap(folder => imageFiles.map(file => stat(join(site, 'screenshots', folder, `${file}.webp`)))))).reduce((n, file) => n + file.size, 0);
assert.ok(imageBytes <= 6_000_000, `Screenshot budget: ${imageBytes} bytes`);

// These are reader questions, not copies of the scoring implementation.
const queries = [
  ['request an order', 'client/client-request-order'], ['password reset', 'client/client-sign-in'],
  ['QC review', 'lab/qc-review'], ['where are my aliquots', 'lab/storage'], ['move aliquot', 'lab/storage'],
  ['invite a colleague', 'lab/invite-people'], ['release policy', 'lab/release-policy'],
  ['notifications', 'lab/notifications'], ['shipping instructions', 'lab/shipping-instructions'],
  ['SCIEX TXT', 'lab/ingest-results'], ['download report', 'client/client-dataset-files'],
  ['viewer request order', 'client/client-request-order'], ['nexo access', 'lab/nexo-access'],
  ['regster samples', 'lab/register-samples'],
];
for (const [query, expected] of queries) assert.equal(search.search(index, query).hits[0]?.id, expected, query);
assert.equal(search.search(index, 'zzxqzzxq').hits.length, 0);
assert.equal(search.search(index, 'storage zzxqzzxq').partial, true);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/help') { res.writeHead(301, { Location: '/help/' }); res.end(); return; }
    assert.ok(url.pathname.startsWith('/help/'));
    const path = resolve(site, decodeURIComponent(url.pathname.slice(6)) || 'index.html');
    assert.ok(path.startsWith(site + sep));
    const bytes = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream',
      ...(extname(path) === '.html' ? { 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'" } : {}) });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const bases = [`${origin}/help/`, pathToFileURL(join(site, 'index.html')).href];
const browser = await chromium.launch({ headless: true });
const captures = process.env.HELP_CAPTURE_DIR;
if (captures) await mkdir(captures, { recursive: true });

async function audit(page, label) {
  // DevTools evaluation keeps the site's strict CSP active for its own scripts and styles.
  await page.evaluate(axe.source);
  // File pages already have computed styles; axe's extra stylesheet XHR is blocked by file-origin CORS.
  const result = await page.evaluate(() => axe.run(document, { preload: location.protocol !== 'file:', runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
  assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], label);
}
async function inView(page, id) {
  await page.waitForFunction(id => {
    const top = document.getElementById(id).getBoundingClientRect().top;
    return top >= document.querySelector('.topbar').offsetHeight && top < 110;
  }, id);
}
async function openSearch(page) { await page.keyboard.press('/'); await page.locator('#q').waitFor({ state: 'visible' }); }

try {
  for (const base of bases) for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark']) {
    const mode = base.startsWith('file:') ? 'file' : 'help';
    const label = `${mode} ${width} ${colorScheme}`;
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme });
    const errors = [], external = [], failed = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('request', req => {
      if (!(mode === 'file' ? req.url().startsWith(pathToFileURL(site + sep).href) : req.url().startsWith(`${origin}/help/`))) external.push(req.url());
    });
    page.on('requestfailed', req => failed.push(req.url()));
    page.on('response', res => { if (res.status() >= 400) responses.push(`${res.status()} ${res.url()}`); });
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.step').count(), stepIds.length);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${label}: horizontal scroll`);
    const structure = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(el => Number(el.tagName.slice(1)));
      return { duplicates: ids.filter((id, i) => ids.indexOf(id) !== i), skipped: levels.some((n, i) => i && n > levels[i - 1] + 1),
        broken: [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a => a.hash),
        images: [...document.images].filter(img => !img.alt.trim() || !img.getAttribute('width') || !img.getAttribute('height')).length };
    });
    assert.deepEqual(structure, { duplicates: [], skipped: false, broken: [], images: 0 }, `${label}: document structure`);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
    assert.ok(await page.locator('.skip-link').evaluate(el => el.getBoundingClientRect().top >= 0));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement.id === 'main');
    assert.ok(await page.locator('h1').evaluate(el => el.getBoundingClientRect().top >= document.querySelector('.topbar').offsetHeight));
    await audit(page, label);
    if (captures) await page.screenshot({ path: join(captures, `${mode}-${width}-${colorScheme}.png`) });

    await openSearch(page);
    for (const [query, expected] of queries) {
      await page.locator('#q').fill(query);
      assert.equal(await page.locator('.result').first().getAttribute('href'), `#${expected}`, `${label}: ${query}`);
    }
    await page.locator('#q').fill('zzxqzzxq');
    assert.equal(await page.locator('.result').count(), 0);
    assert.match(await page.locator('#search-status').innerText(), /Nothing found/);
    await page.locator('#q').fill('storage zzxqzzxq');
    assert.match(await page.locator('#search-status').innerText(), /partial matches/);
    await page.locator('#q').fill('storage');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('.result').first().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#q').evaluate(el => el === document.activeElement), true);
    await audit(page, `${label}: search and mobile menu`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement.id === 't-lab-storage');
    await inView(page, 'lab/storage');
    assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('#t-lab-storage').evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 2), 'Visible keyboard focus');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'step-anchor');

    // Check all destinations before loading every image, then verify they remain aligned after loading.
    for (const id of stepIds) { await page.evaluate(id => { location.hash = id; }, id); await inView(page, id); }
    await page.goto(`${base}#lab/storage`);
    await page.waitForLoadState('networkidle');
    await page.reload(); // Also check a deep link on initial document load, before lazy images arrive.
    await page.evaluate(() => document.fonts.ready);
    await inView(page, 'lab/storage');
    await page.evaluate(() => [...document.images].forEach(img => { img.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth));
    const undecoded = await page.evaluate(async () => {
      const failures = [];
      // decode() holds pixels until the next frame; release each hold before decoding another full-page capture.
      for (const img of document.images) {
        await new Promise(requestAnimationFrame);
        try { await img.decode(); } catch (error) { failures.push({ src: img.src, error: error.message }); }
      }
      return failures;
    });
    assert.deepEqual(undecoded, [], `${label}: image decoding; ${JSON.stringify({ errors, external, failed, responses })}`);
    await inView(page, 'lab/storage');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.ok(await page.evaluate(() => [...document.images].every(img => img.naturalWidth === Number(img.getAttribute('width')) && img.naturalHeight === Number(img.getAttribute('height')))));
    const shot = page.locator('.step[id="lab/storage"] .shot').first();
    await shot.getByRole('button', { name: width === 390 ? 'Desktop' : 'Phone', exact: true }).click();
    const selected = width === 390 ? 'desktop' : 'phone';
    assert.equal(await shot.getAttribute('data-view'), selected);
    await shot.locator(`.shot-pane--${selected} .shot-full`).click();
    assert.ok(page.url().startsWith(base.replace(/index\.html$/, '') + `screenshots/${selected === 'phone' ? 'mobile' : 'desktop'}/`));
    await page.goBack();
    await page.locator('.brand').click();
    await page.waitForFunction(() => document.activeElement.tagName === 'H1' && scrollY === 0);
    if (width === 390) {
      await page.locator('#menu-button').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#menu-button').evaluate(el => el === document.activeElement), true);
      await page.locator('#search-button').click();
      await page.locator('#q').fill('QC');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#q').inputValue(), '');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'), 'false');
    }
    assert.deepEqual({ errors, external, failed, responses }, { errors: [], external: [], failed: [], responses: [] }, label);
    console.log(`PASS ${label}: accessibility, search, focus, anchors, all images, no overflow/errors/external requests`);
    await page.close();
  }
  // A stale index must never override the bundled content or its current search algorithm.
  const page = await browser.newPage();
  await page.route('**/search-index.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...index, version: 1 }) }));
  await page.goto(bases[0]);
  await page.locator('#q').fill('request an order');
  assert.equal(await page.locator('.result').first().getAttribute('href'), '#client/client-request-order');
  assert.equal(await page.locator('html').getAttribute('data-search-index'), 'built-in-page');
  await page.close();
  console.log(`PASS screenshot budget: ${imageFiles.length * 2} files, ${imageBytes} bytes; stale-index fallback`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
