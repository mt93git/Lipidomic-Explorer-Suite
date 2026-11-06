// Run: SCOPE_BASE=ux2/w2b node tests/dual-ui/test_team_scope_guard.cjs
// Uses the overlay helper's complete GUIDED inventory and the isolated Classic Shiny
// launcher from tests/browser/ci/playwright.config.mjs. No existing service is used.
// Requires Playwright/Chromium and Rscript with the app's installed dependencies.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {execFileSync, spawn} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');
const ROOT = path.resolve(__dirname, '../..');
const BASE = process.env.SCOPE_BASE || 'ux2/w2b';
const SEED = Number(process.env.SCOPE_SEED || 20261104);
const git = (args, cwd = ROOT) => execFileSync('git', args, {cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024}).trim();
const PROTECTED = ['R/modules', 'R/server.R', 'R/global.R', 'www/css', 'www/js', 'www/font.css'];
// The guided R implementation the fixtures stand in for (fixture_team_overlay_pages.cjs builds its pages
// from guide_header() in R/guided_workflow.R and the guided step markup): byte-identical to production.
const PRODUCTION = process.env.SCOPE_PRODUCTION || 'eed4451';
// Also the Classic frontend and the frontend switch (R/ui.R), whose controls the Classic run renders
// but does not activate (e.g. the Welcome Guide button's onclick).
const GUIDED_R = ['R/guided_workflow.R', 'R/guided_shared.R', 'R/guided_preparation_controls.R', 'R/ux_preparation.R', 'R/ui.R', 'R/frontends/classic'];
const frozen = file => /^www\/team\/(?:.*\/)?(?:context_help\.[^/]+|companion_assistant\.[^/]+|companion_guidance[^/]*|companion_workspace\.[^/]+|mascot_refine\.css|companion_art\.js)$/.test(file);
const MASCOT_EXCEPTIONS = require('./mascot_exceptions.cjs');
const files = output => output.split('\0').filter(Boolean);
function staticGuard() {
  const changed = files(git(['diff', '--name-only', '-z', '--no-renames', BASE, '--', ...PROTECTED, 'www/team']));
  // git diff alone misses new untracked files; include these as well.
  const untracked = files(git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...PROTECTED, 'www/team']));
  // Wave 5's approved exceptions (mascot_exceptions.cjs) are taken back out of their three files; the remainder must
  // still equal BASE byte-for-byte. Every other frozen file must be byte-identical as it is.
  const approved = f => MASCOT_EXCEPTIONS.EXCEPTION_FILES.includes(f) && MASCOT_EXCEPTIONS.frozenMatches(f, BASE);
  const bad = [...new Set([...changed, ...untracked])].filter(f => (frozen(f) && !approved(f)) || PROTECTED.some(p => f === p || f.startsWith(p + '/')));
  assert.deepEqual(bad, [], 'protected Classic/shared or frozen mascot files changed:\n' + bad.join('\n'));
  const leaks = MASCOT_EXCEPTIONS.negativeControl(BASE);
  assert.deepEqual(leaks, [], 'negative control: a one-character change outside the approved exceptions must fail:\n' + leaks.join('\n'));
  console.log(`PASS static: shared/Classic paths and mascot freeze versus ${BASE} (Wave 5 approved exceptions stripped; one-character negative control fails as it should)`);
  const guidedChanged = [...new Set([...files(git(['diff', '--name-only', '-z', '--no-renames', PRODUCTION, '--', ...GUIDED_R])),
    ...files(git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...GUIDED_R]))])];
  for (const f of GUIDED_R) assert.ok(fs.existsSync(path.join(ROOT, f)), `locked path missing: ${f}`);
  assert.ok(files(git(['ls-tree', '-r', '--name-only', '-z', PRODUCTION, '--', 'R/frontends/classic'])).length > 0, `R/frontends/classic is empty at ${PRODUCTION}`);
  assert.deepEqual(guidedChanged, [], `guided / Classic R files differ from ${PRODUCTION}:\n` + guidedChanged.join('\n'));
  console.log(`PASS static: guided and Classic R (${GUIDED_R.join(', ')}) byte-identical to ${PRODUCTION}`);
}

// Keep actual UI text and exact computed values. Only ISO timestamps and explicitly
// labelled timestamp/nonce attribute values are normalized here, plus the per-render random ids in
// stabilize() below; ordinary numbers remain.
async function snapshot(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = 0; }
  });
  return page.evaluate(() => {
    const normalize = s => String(s).replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, '<timestamp>').replace(/\s+/g, ' ').trim();
    const props = ['display', 'position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'height',
      'min-width', 'max-width', 'min-height', 'max-height', 'box-sizing', 'z-index', 'font', 'font-family',
      'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color', 'background',
      'visibility', 'opacity', 'transform'];
    function visit(el, route) {
      if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName)) return null;
      const attributes = {};
      for (const a of [...el.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
        // tabindex / disabled / inert / hidden: keyboard reach and availability (aria-hidden is an aria-*).
        // on* (onclick, onchange, ...): inline handlers a control depends on (the Classic Welcome Guide button).
        if (['id', 'class', 'role', 'href', 'data-bs-target', 'data-target', 'tabindex', 'disabled', 'inert', 'hidden'].includes(a.name) || a.name.startsWith('aria-') || /^on[a-z]+$/.test(a.name)) {
          attributes[a.name] = /nonce|timestamp/.test(a.name) ? '<volatile>' : normalize(a.value);
        }
      }
      const css = getComputedStyle(el), rect = el.getBoundingClientRect();
      const visible = el.getClientRects().length > 0 && rect.width > 0 && rect.height > 0 &&
        css.visibility !== 'hidden' && css.visibility !== 'collapse' && css.display !== 'none';
      const result = {route, tag: el.tagName.toLowerCase(), attributes,
        // Direct text nodes avoid repeating whole subtrees while preserving text order.
        content: [...el.childNodes].map((n, i) => n.nodeType === Node.TEXT_NODE ? normalize(n.nodeValue) :
          n.nodeType === Node.ELEMENT_NODE ? visit(n, `${route}/${n.tagName.toLowerCase()}[${i}]`) : null).filter(n => n !== null && n !== '')};
      if (visible) {
        result.style = Object.fromEntries(props.map(p => [p, css.getPropertyValue(p)]));
        result.bounds = {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
      }
      return result;
    }
    return visit(document.documentElement, 'html');
  });
}
// Server-rendered per-render random ids (bslib navbar-collapse-NNNN, tab-NNNN-k, bslib-accordion-NNNN,
// bslib-accordion-panel-NNNN, bslib-sidebar-NNNN; shinyjqui jqui-interaction-XXXXXXXX; the Shiny
// session token in download hrefs; selectize listbox ids, below) differ on every run. Each distinct random token becomes a stable
// placeholder by order of first appearance in this tree (DOM order, attributes sorted), so ids and
// the href / aria-controls / data-bs-target that reference them stay consistent, while a moved,
// added or removed element still changes the placeholders and is caught.
const RANDOM_IDS = [
  /\b(navbar-collapse-)(\d+)\b/g,
  /\b(tab-)(\d+)(?=-\d+\b)/g,
  /\b(bslib-[a-z]+(?:-[a-z]+)*-)(\d+)\b/g,
  /\b(jqui-interaction-)([A-Za-z0-9]{8})\b/g,
  /(^|\/)(session\/)([0-9a-f]{16,})(?=\/)/g,
];
function stabilize(tree) {
  const seen = RANDOM_IDS.map(() => new Map());
  const token = value => RANDOM_IDS.reduce((v, re, k) => v.replace(re, (...m) => {
    const groups = m.slice(1, -2), random = groups.pop(), key = groups.join('') + random;
    if (!seen[k].has(key)) seen[k].set(key, seen[k].size + 1);
    return `${groups.join('')}<random-${seen[k].get(key)}>`;
  }), value);
  // selectize's a11y plugin names each dropdown list with a client-side random id (10 chars, drawn in
  // input-initialisation order, which varies with timing): the listbox id and its combobox's aria-owns.
  const lists = new Map(), list = v => { if (!lists.has(v)) lists.set(v, lists.size + 1); return `selectize-<random-${lists.get(v)}>`; };
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    const at = node.attributes || {};
    if (/(?:^|\s)selectize-dropdown-content(?:\s|$)/.test(at.class || '') && at.id) at.id = list(at.id);
    if (at.role === 'combobox' && /-selectized$/.test(at.id || '')) for (const n of ['aria-owns', 'aria-controls']) if (at[n]) at[n] = list(at[n]);
    for (const name of Object.keys(node.attributes || {})) node.attributes[name] = token(node.attributes[name]);
    for (const child of node.content || []) walk(child);
  })(tree);
  return tree;
}
// Walking both trees in parallel, pair every placeholder of one tree with the one at the same place in
// the other; only if that pairing is a bijection (one-to-one in both directions: no two base ids become
// one tree id, no base id splits in two) are the tree's placeholder values taken from the base. Anything
// else, a merge included, is left for differences() to report. Four-digit server ids can collide by
// chance inside one UI build (two accordions drawing the same number); classic() re-renders a page whose
// random-id elements share an id (randomIdCollision) with the next Shiny seed (the UI, and its ids, are
// built once per process, from Shiny's private seed, which both trees start from the same value), so a
// chance collision never reaches this point while a duplicate the code makes on purpose survives every
// seed and is reported.
const PLACEHOLDER = /[^\s"#/]*<random-\d+>/g;
function reconcile(a, b) {
  const pairs = [], spots = [];
  (function walk(x, y) {
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object') return;
    for (const name of Object.keys(x.attributes || {})) {
      const u = x.attributes[name], v = (y.attributes || {})[name];
      if (typeof v !== 'string' || u.replace(PLACEHOLDER, '<r>') !== v.replace(PLACEHOLDER, '<r>')) continue;
      const pu = u.match(PLACEHOLDER) || [], pv = v.match(PLACEHOLDER) || [];
      pu.forEach((t, i) => pairs.push([t, pv[i]]));
      if (u !== v) spots.push([y.attributes, name, u]);
    }
    (x.content || []).forEach((c, i) => walk(c, (y.content || [])[i]));
  })(a, b);
  const isFunction = (from, to) => { const m = new Map(); return pairs.every(p => (m.has(p[from]) ? m.get(p[from]) : (m.set(p[from], p[to]), p[to])) === p[to]); };
  if (spots.length && isFunction(0, 1) && isFunction(1, 0)) for (const [attrs, name, value] of spots) attrs[name] = value;
  return b;
}
// Two elements of one raw snapshot (before stabilize) with the same id that carries a per-render random
// token: a chance collision when it does not survive the next Shiny seed.
function randomIdCollision(tree) {
  const seen = new Set();
  let hit = null;
  (function walk(node) {
    if (hit || !node || typeof node !== 'object') return;
    const id = (node.attributes || {}).id;
    if (id && RANDOM_IDS.some(re => { re.lastIndex = 0; const m = re.test(id); re.lastIndex = 0; return m; })) { if (seen.has(id)) hit = id; seen.add(id); }
    for (const child of node.content || []) walk(child);
  })(tree);
  return hit;
}
// Self-test (no browser): reconcile() must keep a duplicate-id mutation visible and accept a consistent
// renumbering. Two accordions with their buttons; the mutation gives both the same id.
function selfTest() {
  const page = (a, b) => ({route: 'html', tag: 'html', attributes: {}, content: [a, b].map((n, i) => ({route: `html/div[${i}]`, tag: 'div', attributes: {class: 'accordion', id: `bslib-accordion-panel-${n}`},
    content: [{route: `html/div[${i}]/button[0]`, tag: 'button', attributes: {'aria-controls': `bslib-accordion-panel-${n}`, class: 'accordion-button'}, content: ['Panel']}]}))});
  const base = stabilize(page(1111, 2222));
  assert.deepEqual(differences(base, reconcile(base, stabilize(page(4444, 5555)))), [], 'self-test: fresh random ids must compare equal');
  const dup = differences(base, reconcile(base, stabilize(page(3333, 3333))));
  assert.ok(dup.length > 0, 'self-test: two base ids merged into one tree id must be reported');
  const merged = stabilize(page(1111, 2222)), swapped = stabilize(page(1111, 1111));
  assert.ok(differences(swapped, reconcile(swapped, merged)).length > 0, 'self-test: one base id split into two tree ids must be reported');
  assert.equal(randomIdCollision(page(3333, 3333)), 'bslib-accordion-panel-3333', 'self-test: a duplicate random id is detected');
  assert.equal(randomIdCollision(page(1111, 2222)), null, 'self-test: distinct random ids are not a collision');
  console.log('PASS self-test: reconcile() requires a bijection; a duplicate-id mutation is reported');
}
// Self-test (browser): the snapshot sees keyboard reach and availability. A navigation button that leaves
// the Tab order (tabindex 0 -> -1), is disabled, or is hidden from assistive technology must differ.
async function snapshotSelfTest(browser) {
  const page = await newPage(browser, {width: 800, height: 600});
  try {
    const take = async attrs => { await page.setContent(`<!doctype html><nav><button type="button" class="guide-step-button"${attrs}>Data</button><button type="button">Review</button></nav>`); return snapshot(page); };
    const base = await take(' tabindex="0"');
    assert.deepEqual(differences(base, await take(' tabindex="0"')), [], 'snapshot self-test: identical pages must compare equal');
    const withHandler = await take(' tabindex="0" onclick="startTour()"');
    assert.ok(differences(withHandler, base).length > 0, 'snapshot self-test: removing an onclick handler not caught');
    assert.ok(differences(withHandler, await take(' tabindex="0" onclick="startTour(2)"')).length > 0, 'snapshot self-test: changing an onclick handler not caught');
    for (const mutated of [' tabindex="-1"', ' tabindex="0" disabled', ' tabindex="0" aria-hidden="true"', ' tabindex="0" inert'])
      assert.ok(differences(base, await take(mutated)).length > 0, `snapshot self-test: mutation${mutated} not caught`);
    console.log('PASS self-test: tabindex, disabled, aria-hidden, inert and onclick mutations are caught by the snapshot');
  } finally { await page.close(); }
}
function differences(a, b, at = 'document', out = []) {
  if (isDeepStrictEqual(a, b) || out.length >= 12) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${at}.${key}`, out);
  } else out.push(`${at}\n  base: ${JSON.stringify(a)}\n  tree: ${JSON.stringify(b)}`);
  return out;
}
async function newPage(browser, viewport) {
  const page = await browser.newPage({viewport, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce'});
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [1704067200000])); }
      static now() { return 1704067200000; }
    };
    let seed = 12345;
    Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  });
  return page;
}
async function guided(browser, root) {
  // The helper resolves assets and wiring against cwd; never run the two roots concurrently.
  process.chdir(root);
  const F = require(path.join(root, 'tests/dual-ui/fixture_team_overlay_pages.cjs'));
  const results = {};
  for (const viewport of F.VIEWPORTS) {
    for (const kind of Object.keys(F.GUIDED)) {
      const page = await newPage(browser, viewport);
      try {
        await F.install(page);
        await F.setupGuided(page, kind);
        results[`guided/${kind}/${viewport.width}`] = await snapshot(page);
      } finally { await page.close(); }
    }
  }
  return results;
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const children = new Set();
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
  children.delete(child);
}
async function classic(browser, root) {
  for (let attempt = 1; ; attempt++) {
    // Shiny draws the server ids (bslib accordions, tabsets) from its private seed: both trees start it from
    // the same seed, so a pure-chance collision is the same in both and a fresh seed avoids it. A duplicate
    // the code makes on purpose survives every seed: the third is compared (and reported).
    const result = await classicOnce(browser, root, attempt === 3, SEED + attempt - 1);
    if (!result.collision) return result.out;
    console.log(`${result.collision}; starting Classic again with the next seed`);
  }
}
async function classicOnce(browser, root, keep, seed) {
  const rscript = process.env.RSCRIPT || 'Rscript';
  // Check first: spawn's ENOENT must be a failure, never a skipped Classic comparison.
  execFileSync(rscript, ['--version'], {stdio: 'pipe', timeout: 5000});
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  const seeded = `set.seed(${seed});assign("ownSeed",.Random.seed,envir=shiny:::.globals);rm(.Random.seed,envir=.GlobalEnv);`;
  const child = spawn(rscript, ['--vanilla', '-e', `${seeded}shiny::runApp(".",host="127.0.0.1",port=${port},launch.browser=FALSE)`], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, LIPIDOMIC_INTERFACE: 'classic',
      LIPIDOMIC_COMPANION_AI: '0', LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL: '0', R_PROFILE_USER: '/dev/null', R_ENVIRON_USER: '/dev/null'}});
  children.add(child);
  let log = '';
  child.stdout.on('data', b => { log = (log + b).slice(-8000); });
  child.stderr.on('data', b => { log = (log + b).slice(-8000); });
  try {
    const deadline = Date.now() + 90000;
    for (;;) {
      if (child.exitCode !== null || child.signalCode !== null) throw Error('Classic exited:\n' + log);
      try { const response = await fetch(url, {signal: AbortSignal.timeout(10000)}); if (response.ok) break; } catch (_) {}
      if (Date.now() > deadline) throw Error('Classic startup timed out:\n' + log);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const out = {};
    for (const width of [390, 1280, 1440]) {
      const page = await newPage(browser, {width, height: width === 390 ? 844 : width === 1280 ? 800 : 900});
      try {
        await page.goto(url);
        await page.waitForFunction(() => document.documentElement.classList.contains('shiny-connected') || document.querySelector('.shiny-bound-input'));
        // The welcome dialog appears once the server has built the session; that can take well over
        // the 10 s default on a loaded machine.
        await page.getByRole('button', {name: 'Close', exact: true}).click({timeout: 60000});
        await page.getByRole('dialog').waitFor({state: 'hidden'});
        await page.waitForFunction(() => !document.documentElement.classList.contains('shiny-busy'));
        // Idle: not busy, and the set of outputs still recalculating unchanged for 3 s (a renderUI such as
        // the targeted scope pill, or a hidden output that is never suspended, can arrive after busy
        // clears; outputs suspended in hidden tabs stay recalculating for good). Bounded at 60 s: a
        // still-pending output then shows up as a difference.
        for (let quiet = 0, tries = 0, last = null; quiet < 3 && tries < 60; tries++) {
          await page.waitForTimeout(1000);
          const now = await page.evaluate(() => document.documentElement.classList.contains('shiny-busy') ? null :
            [...document.querySelectorAll('.recalculating')].map(e => e.id).join(' '));
          quiet = now !== null && now === last ? quiet + 1 : 0; last = now;
        }
        const raw = await snapshot(page), dup = randomIdCollision(raw);
        // The Classic UI is built once per R process, from its seed, so its server ids are drawn once: a
        // chance collision is fixed by a fresh process (classic() retries), never by a reload.
        if (dup && keep) console.log(`classic/${width}: random id ${dup} drawn twice with a third seed; compared as it is`);
        if (dup && !keep) return {collision: `classic/${width}: random id ${dup} drawn twice with seed ${seed}`};
        out[`classic/${width}`] = stabilize(raw);
      } finally { await page.close(); }
    }
    return {out};
  } finally { await stop(child); }
}

(async () => {
  selfTest();
  staticGuard();
  let playwright;
  try { playwright = require('../browser/ci/node_modules/playwright'); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; playwright = require('playwright'); }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'team-scope-guard-'));
  let browser;
  // Private Git metadata avoids writing to the source repository's common .git.
  // The baseline itself is a detached git worktree, not an archive or copied assets.
  const timer = setTimeout(() => { console.error('FAIL: scope guard exceeded 270 seconds'); for (const c of children) c.kill('SIGKILL'); process.exit(1); }, 270000);
  try {
    const sha = git(['rev-parse', '--verify', `${BASE}^{commit}`]);
    git(['clone', '--quiet', '--shared', '--no-checkout', ROOT, path.join(temp, 'repo')]);
    git(['worktree', 'add', '--quiet', '--detach', path.join(temp, 'base'), sha], path.join(temp, 'repo'));
    browser = await playwright.chromium.launch({headless: true});
    await snapshotSelfTest(browser);
    const before = await guided(browser, path.join(temp, 'base'));
    const after = await guided(browser, ROOT);
    let failures = 0;
    function compare(a, b) {
      for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const diff = differences(a[name], reconcile(a[name], b[name]));
        if (diff.length) { failures++; console.error(`FAIL ${name}: first differences\n${diff.join('\n')}`); }
        else console.log(`PASS ${name}: normalized DOM and all visible element styles identical`);
      }
    }
    compare(before, after);
    const classicBefore = await classic(browser, path.join(temp, 'base'));
    const classicAfter = await classic(browser, ROOT);
    compare(classicBefore, classicAfter);
    assert.equal(failures, 0, `${failures} scope comparison(s) differ`);
    console.log('PASS scope guard: all guided fixtures and Classic at 390/1280/1440');
  } finally {
    clearTimeout(timer);
    for (const child of children) await stop(child);
    if (browser) await browser.close();
    process.chdir(ROOT);
    fs.rmSync(temp, {recursive: true, force: true});
  }
})().catch(error => { console.error('FAIL scope guard:', error.message); process.exitCode = 1; });
