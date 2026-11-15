// Evidence for the long searchable picker polish (mock build): single at 1440/1024/390, multiple at 1440.
// node tests/dual-ui/capture_nexo_picker_polish.cjs   (after a mock build: VITE_API_MOCK=1 npm run build)
'use strict';
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const root = path.resolve(__dirname, '../..'), nexo = path.join(root, 'frontends/nexo');
const out = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/wave2');
const { chromium } = require(path.join(root, 'tests/browser/ci/node_modules/playwright'));
const port = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
(async () => {
  const p = await port();
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${p}/nexo/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
    const open = async (width, height, source) => {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`http://127.0.0.1:${p}/nexo/?checkpoint=${encodeURIComponent(require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id)}`);
      await page.waitForSelector('.card');
      const id = await page.evaluate(async src => {
        let n = window.__nexo.store.get().nodes.find(x => x.id === src || x.instance?.source === src);
        if (!n) { await window.__nexo.handle.addCard(src); n = window.__nexo.store.get().nodes.find(x => x.id === src || x.instance?.source === src); }
        window.__nexo.handle.focusNode(n.id); return n.id;
      }, source);
      await page.waitForTimeout(400);
      await page.locator(`.card[data-id="${id}"] header`).click();
      await page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).click();
      return page;
    };
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
      const page = await open(w, h, 'results_dashboard-plot_violin');
      const list = page.locator('#inspector').getByRole('listbox', { name: 'Lipid', exact: true });
      await list.waitFor(); await list.scrollIntoViewIfNeeded();
      await page.locator('#inspector').getByRole('searchbox', { name: 'Filter Lipid', exact: true }).focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `after-picker-${w}.png`) });
      console.log('captured', w);
      await page.close();
    }
    const page = await open(1440, 900, 'results_dashboard-plot_heat');
    const lipids = page.locator('#inspector').getByRole('group', { name: 'Lipids', exact: true });
    await lipids.waitFor(); await lipids.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'after-picker-multi-1440.png') });
    console.log('captured multi 1440');
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
