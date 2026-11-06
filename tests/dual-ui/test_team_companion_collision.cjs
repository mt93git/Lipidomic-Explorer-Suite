// Run with: node tests/dual-ui/test_team_companion_collision.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

function overlaps(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0;
}

async function start(page, journeyTop) {
  await page.setContent(`<!doctype html><html><head></head><body class="team-workspace-app" style="margin:0">
    <nav class="navbar" style="position:fixed;inset:0 0 auto;height:230px;background:#eef2f3"></nav>
    <div id="guide-context"></div>
    <main style="position:relative;height:1500px">
      <section id="team-workspace" style="position:absolute;left:12px;top:${journeyTop}px;width:366px">
        <nav class="tw-steps"><button>Data</button><button>Review</button><button>Canvas</button></nav>
        <div class="tw-journey" style="height:130px;background:#fff;border:1px solid #ddd">
          <div class="tw-journey-copy"><h2>Choose how to begin</h2><p>Select a saved analysis or start with a new matrix.</p></div>
        </div>
      </section>
    </main>
  </body></html>`);
  await page.addStyleTag({ path: path.resolve('www/team/css/context_help.css') });
  await page.evaluate(() => {
    window.$ = () => ({ on: () => {} });
    window.LipidomicHelpContent = { controls: {}, topics: {} };
    window.LipidomicCompanionArt = () => '<svg viewBox="0 0 10 10" aria-hidden="true"></svg>';
  });
  await page.addScriptTag({ path: path.resolve('www/team/js/context_help.js') });
  await page.evaluate(() => window.LipidomicHelp.setContext({ step: 1, tool: '' }));
  await page.waitForFunction(() => {
    const dock = document.querySelector('.companion-dock');
    return dock && getComputedStyle(dock).visibility !== 'hidden';
  });
  await page.waitForFunction(() => {
    const tip = document.querySelector('.companion-speech');
    return tip && getComputedStyle(tip).visibility === 'visible';
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    // On the first Data screen, the default top-right position used to cover
    // the heading because its text container was absent from collision scoring.
    await start(page, 250);
    let geometry = await page.evaluate(() => {
      const rect = element => {
        const r = element.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
      };
      return {
        dock:rect(document.querySelector('.companion-dock')),
        journey:rect(document.querySelector('.tw-journey')),
        tip:rect(document.querySelector('.companion-speech'))
      };
    });
    assert.equal(geometry.dock.width, 80, 'fixture uses the mobile companion footprint');
    assert.equal(geometry.dock.height, 147, 'fixture uses the mobile companion footprint');
    assert.equal(overlaps(geometry.dock, geometry.journey), false,
      'default dock placement stays clear of the Data heading and copy at 390×844');
    assert.equal(overlaps(geometry.tip, geometry.journey), false,
      'the floating screen tip also stays clear of the Data heading and copy');

    // Start with the heading below the dock, then scroll it into the dock's
    // saved placement. The transient scroll guard must move the dock away.
    await page.close();
    const scrolling = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await start(scrolling, 700);
    const before = await scrolling.locator('.companion-dock').boundingBox();
    assert.equal(before.y, 242, 'the scroll fixture begins at the normal top-right default');
    await scrolling.evaluate(() => window.scrollTo(0, 585));
    await scrolling.waitForFunction(() => {
      const dock = document.querySelector('.companion-dock').getBoundingClientRect();
      const journey = document.querySelector('.tw-journey').getBoundingClientRect();
      const intersects = journey.left < dock.right && journey.right > dock.left &&
        journey.top < dock.bottom && journey.bottom > dock.top;
      return journey.top < 300 && dock.top > 300 && !intersects;
    });
    geometry = await scrolling.evaluate(() => {
      const rect = element => {
        const r = element.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom };
      };
      return {
        dock:rect(document.querySelector('.companion-dock')),
        journey:rect(document.querySelector('.tw-journey')),
        tip:rect(document.querySelector('.companion-speech'))
      };
    });
    assert.equal(overlaps(geometry.dock, geometry.journey), false,
      'scroll-time placement moves the dock away from the journey copy');
    assert.equal(overlaps(geometry.tip, geometry.journey), false,
      'scroll-time placement keeps the speech balloon clear of the journey copy');
    console.log('PASS: Team companion avoids the progressive journey on mobile and during scroll');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
