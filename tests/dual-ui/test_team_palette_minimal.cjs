// Run with: node tests/dual-ui/test_team_palette_minimal.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<body class="guided-app team-workspace-app" data-team-authenticated="true"><div id="team-workspace"><div class="tw-steps"><button aria-current="step"><span>1</span><strong>Data</strong></button></div><div class="tw-journey-actions"><button class="tw-next">Continue</button><button disabled>Disabled</button></div></div><div class="team-library"><button id="team_library_login" class="btn">Sign in</button><button id="team_library_save" class="btn"><i class="fa fa-download" style="color:#228833">↓</i> Save</button><button class="btn btn-warning">Retry</button><p class="guide-pending">Warning retained</p></div><div class="tc-workspace"><div class="tc-list"><button><i>+</i> Add plot</button></div><button class="tc-arrange">Arrange</button><div class="tc-preview"><button class="tc-preview-pdf">PDF</button></div><a href="#plot">Download CSV</a><svg><circle id="mark" fill="#228833" r="5"/></svg><input type="color" value="#228833"></div></body>`);
    for (const file of ['libreros','guided','workspace','canvas','canvas_preview','workspace_minimal']) await page.addStyleTag({ content: fs.readFileSync(`www/team/css/${file}.css`, 'utf8').replace(/^@import.*$/mg, '') });
    const color = (selector, prop) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
    for (const selector of ['.tw-next','#team_library_login','#team_library_save','.btn-warning','.tc-preview-pdf']) {
      assert.equal(await color(selector,'backgroundColor'), 'rgb(45, 95, 138)', selector);
      assert.equal(await color(selector,'color'), 'rgb(255, 255, 255)', selector);
    }
    assert.equal(await color('#team_library_save i','color'), 'rgb(255, 255, 255)', 'action glyph inherits the branded button foreground');
    assert.equal(await color('.tc-list i','color'), 'rgb(45, 95, 138)', 'secondary action glyph inherits blue');
    assert.equal(await color('.tc-arrange','color'), 'rgb(45, 95, 138)');
    assert.equal(await color('.tc-workspace a','color'), 'rgb(45, 95, 138)');
    assert.equal(await color('.tw-steps span','backgroundColor'), 'rgb(45, 95, 138)');
    await page.locator('.tw-next').hover();
    assert.equal(await color('.tw-next','backgroundColor'), 'rgb(32, 70, 99)');
    await page.locator('.tc-arrange').focus();
    assert.equal(await color('.tc-arrange','outlineColor'), 'rgb(45, 95, 138)');
    assert.equal(await color('button:disabled','opacity'), '0.45');
    assert.equal(await color('#mark','fill'), 'rgb(34, 136, 51)', 'data marks preserve their palette');
    assert.equal(await page.locator('input[type=color]').inputValue(), '#228833');
    assert.equal(await color('.guide-pending','backgroundColor'), 'rgb(252, 245, 233)', 'warnings retain semantic surface');
    await page.evaluate(() => document.body.classList.remove('team-workspace-app'));
    assert.equal(await color('.tc-arrange','color'), 'rgb(35, 87, 107)', 'Team overrides do not affect other shells');
    console.log('PASS: Team actions use Libreros blue/navy tokens; hover, focus, disabled, warnings, graph marks and non-Team scope preserved');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
