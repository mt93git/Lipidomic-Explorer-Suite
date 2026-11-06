// E1 (Nexo spike): read-only canvas in Chromium and WebKit against the mock build.
// Run from the repository root: node tests/dual-ui/test_nexo_canvas_readonly.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const nexo = path.join(root, 'frontends', 'nexo');
const ciDir = path.join(root, 'tests', 'browser', 'ci');
const evidence = path.join(root, 'docs', 'integration', 'nexo-spike-evidence');
const plotly = process.env.NEXO_PLOTLY_JS || path.join(os.homedir(), 'nexo-vendor', 'plotly.min.js');
const checkpoint = require(path.join(nexo, 'src', 'mock', 'checkpoints.json'))[0].id;
const nodes = require(path.join(nexo, 'src', 'mock', 'session.json')).canvas.nodes;
const plotNodes = nodes.filter(n => n.kind === 'plot');

let failures = 0;
let server;

function run(cmd, cwd, env = {}) {
  const r = spawnSync('sh', ['-c', cmd], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`setup failed: ${cmd}\n${r.stdout}\n${r.stderr}`);
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
function get(url) {
  return new Promise(resolve => http.get(url, r => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(0)));
}
async function waitHttp(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await get(url) === 200) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error(`preview server did not answer 200 at ${url}`);
}
function killServer() {
  if (!server || server.exitCode !== null) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { try { server.kill('SIGTERM'); } catch { /* already gone */ } }
}
process.on('exit', killServer);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killServer(); process.exit(130); });

async function check(browser, name, fn) {
  try { await fn(); console.log(`PASS E1 ${browser} ${name}`); }
  catch (e) { failures++; console.log(`FAIL E1 ${browser} ${name}: ${String(e && e.message || e).split('\n')[0]}`); }
}
function assert(ok, message) { if (!ok) throw new Error(message); }

// Waits for every card to report its tier, then returns per-card body state.
async function cardStates(page) {
  return page.$$eval('.card', els => els.map(el => {
    const body = el.querySelector('.body'), plot = el.querySelector('.js-plotly-plot');
    return { id: el.dataset.id, tier: el.dataset.tier, img: !!body.querySelector('img'), plot: !!plot,
      traces: plot && Array.isArray(plot.data) ? plot.data.length : 0, children: body.childElementCount, text: body.textContent.trim() };
  }));
}
const isPlot = id => plotNodes.some(n => n.id === id);

async function setZoom(page, value) {
  await page.selectOption('#zoom', value);
  await page.waitForFunction(v => document.querySelector('#hud')?.textContent.endsWith(`| ${Math.round(v * 100)}%`), Number(value));
}

async function openCanvas(context, base) {
  const page = await context.newPage();
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
  await page.waitForSelector('#viewport .card');
  return page;
}

async function runBrowser(pw, name, base) {
  const errors = [];
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    context.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    context.on('weberror', e => errors.push(`pageerror: ${e.error().message}`));
    context.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    context.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
    const page = await openCanvas(context, base);

    await check(name, 'cards-equal-nodes', async () => {
      const n = await page.locator('.card').count();
      assert(n === nodes.length, `${n} .card elements, expected ${nodes.length} canvas nodes`);
    });

    await check(name, 'live-plots-have-traces-at-100', async () => {
      assert(plotNodes.length > 0, 'mock canvas has no plot nodes');
      assert((await page.inputValue('#zoom')) === '1', 'canvas did not open at 100 %');
      const ids = plotNodes.map(n => n.id);
      try {
        await page.waitForFunction(ids => ids.every(id => {
          const el = document.querySelector(`.card[data-id="${CSS.escape(id)}"] .js-plotly-plot`);
          return el && Array.isArray(el.data) && el.data.length > 0;
        }), ids, { timeout: 20000 });
      } catch {
        throw new Error(`plot cards not live with traces: ${JSON.stringify((await cardStates(page)).filter(c => isPlot(c.id)))}`);
      }
      const states = (await cardStates(page)).filter(c => isPlot(c.id));
      assert(states.every(c => c.tier === 'live'), `plot cards not data-tier=live: ${JSON.stringify(states)}`);
    });

    await check(name, 'zoom-25-frozen', async () => {
      await setZoom(page, '0.25');
      const states = await cardStates(page);
      assert(states.length === nodes.length, `${states.length} cards after zoom`);
      const bad = states.filter(c => c.tier !== 'frozen' || (isPlot(c.id) && (c.plot || !(c.img || c.text))));
      assert(!bad.length, `cards not frozen with img/placeholder: ${JSON.stringify(bad)}`);
    });

    await check(name, 'zoom-200-culled-empty', async () => {
      await setZoom(page, '2');
      const states = await cardStates(page);
      const culled = states.filter(c => c.tier === 'culled');
      assert(culled.length > 0, `no culled card at 200 %: ${JSON.stringify(states.map(c => [c.id, c.tier]))}`);
      const nonEmpty = culled.filter(c => c.children || c.text);
      assert(!nonEmpty.length, `culled cards with non-empty .body: ${JSON.stringify(nonEmpty)}`);
    });

    await check(name, 'fit-click-inspector-live', async () => {
      await page.click('#fit');
      const node = plotNodes[0];
      const card = page.locator(`.card[data-id="${node.id}"]`);
      await card.locator('header').click();
      await page.waitForFunction(id => document.querySelector(`.card[data-id="${CSS.escape(id)}"] .js-plotly-plot`)?.data?.length > 0, node.id, { timeout: 20000 });
      assert((await card.getAttribute('data-tier')) === 'live', `card tier ${await card.getAttribute('data-tier')} after Fit`);
      const fields = await page.$$eval('#inspector h3', hs => Object.fromEntries(hs.map(h => [h.textContent, h.nextElementSibling?.textContent ?? ''])));
      assert(await page.locator('#inspector').isVisible(), '#inspector hidden');
      assert(fields.Label === node.label, `inspector Label ${JSON.stringify(fields.Label)}, expected ${JSON.stringify(node.label)}`);
      assert(fields.Tier === 'live', `inspector Tier ${JSON.stringify(fields.Tier)}, expected "live"`);
    });

    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, `e1-${name}-1440.png`) });
    if (name === 'chromium') {
      for (const [width, height] of [[1024, 768], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.reload();
        await page.waitForSelector('#viewport .card');
        await page.click('#fit');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(evidence, `e1-${name}-${width}.png`) });
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  await check(name, 'no-console-errors-or-failed-requests', async () => {
    assert(!errors.length, `${errors.length} error(s): ${JSON.stringify(errors)}`);
  });
}

(async () => {
  try {
    run('npm ci', nexo);
    run('sh scripts/vendor-plotly.sh', nexo, { NEXO_PLOTLY_JS: plotly });
    run('npm run build', nexo, { VITE_API_MOCK: '1' });
    if (!fs.existsSync(path.join(ciDir, 'node_modules', '@playwright', 'test'))) run('npm ci', ciDir);
    const pw = require(require.resolve('@playwright/test', { paths: [ciDir] }));
    const port = await freePort();
    server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: nexo, detached: true, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}`;
    await waitHttp(`${base}/nexo/`, 30000);
    for (const name of ['chromium', 'webkit']) await runBrowser(pw, name, base);
  } catch (e) {
    failures++;
    console.log(`FAIL E1 setup: ${e && e.stack || e}`);
  } finally {
    killServer();
  }
  console.log(failures ? `E1 FAILED (${failures})` : 'E1 OK');
  process.exit(failures ? 1 : 0);
})();
