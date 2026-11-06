// Regenerates fixtures/team_step_backdrop/ for test_team_step_backdrop.cjs from a running Team app:
//   LIPIDOMIC_INTERFACE=team LIPIDOMIC_TEAM_WORKSPACE=1 LIPIDOMIC_PROJECT_LIBRARY=1 Rscript -e 'shiny::runApp(".", port=45731)'
//   W3D_APP_URL=http://127.0.0.1:45731 node tests/dual-ui/capture_team_step_backdrop_fixtures.cjs
// Client-side only: the auth flag is flipped in the page and the sign-in form removed (as the signed-in library
// renders); nothing is sent to the identity service. Saved per step: the visible body DOM without scripts, styles,
// hidden subtrees or the companion (frozen, not part of the backdrop), plus the compiled vendor CSS (vendor.css).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
const URL_ = process.env.W3D_APP_URL || 'http://127.0.0.1:45731';
const OUT = path.join(__dirname, 'fixtures/team_step_backdrop');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL_); await p.waitForFunction(() => window.Shiny?.shinyapp?.isConnected() && window.TeamWorkspace, null, { timeout: 90000 }); await p.waitForTimeout(2500);
  const vendor = await p.evaluate(async () => {
    const out = [];
    for (const l of document.querySelectorAll('link[rel=stylesheet]')) {
      const h = l.getAttribute('href');
      if (/^https?:/.test(h) || /font-awesome|colourpicker|vis-network|datatables|crosstalk/.test(h)) continue;
      out.push('/* ' + h + ' */\n' + (await (await fetch(h)).text()).replace(/url\((?!["']?data:)[^)]*\)/g, 'none'));
    }
    return out.join('\n');
  });
  fs.writeFileSync(path.join(OUT, 'vendor.css'), vendor);
  await p.evaluate(() => { Shiny.shinyapp.dispatchMessage(JSON.stringify({ custom: { 'team-auth-state': { authenticated: true } } })); document.querySelectorAll('.team-library-login').forEach(n => n.remove()); });
  await p.waitForTimeout(600);
  const grab = async name => {
    const r = await p.evaluate(() => {
      const strip = src => {
        const c = src.cloneNode(false);
        for (const ch of src.childNodes) {
          if (ch.nodeType === 3) { c.appendChild(ch.cloneNode()); continue; }
          if (ch.nodeType !== 1 || /^(SCRIPT|STYLE|LINK|TEMPLATE|IFRAME|CANVAS)$/.test(ch.tagName)) continue;
          if (ch.closest('#lipidomic-companion,.companion-dock,.lipid-help-panel,.cg-tip')) continue;
          if (getComputedStyle(ch).display === 'none') continue;
          if (ch.namespaceURI === 'http://www.w3.org/2000/svg') { c.appendChild(ch.cloneNode(true)); continue; }
          c.appendChild(strip(ch));
        }
        return c;
      };
      const attrs = [...document.body.attributes].map(a => `${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join(' ');
      return { attrs, html: strip(document.body).innerHTML.replace(/\n\s*\n+/g, '\n') };
    });
    fs.writeFileSync(path.join(OUT, name + '.html'), `<body ${r.attrs}>\n${r.html}\n</body>\n`);
    console.log(name, r.html.length);
  };
  await grab('start');
  await p.evaluate(() => document.querySelector('[data-tw-choice=matrix]').click()); await p.waitForTimeout(800); await grab('data');
  await p.evaluate(() => { document.getElementById('guide_experiment_summary').textContent = 'Abundance matrix loaded'; }); await p.waitForTimeout(300);
  await p.evaluate(() => TeamWorkspace.next()); await p.waitForTimeout(800); await grab('metadata');
  await p.evaluate(() => { document.body.dataset.guideStep = '3'; const a = document.querySelector('a[data-value=Preparation]'); if (a && window.bootstrap) bootstrap.Tab.getOrCreateInstance(a).show(); });
  await p.waitForTimeout(1200); await grab('review');
  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
