// Renders proposal.html and saves one PNG per mockup figure (every element carrying data-shot) into screenshots/.
// Run from frontends/admin after `npm ci` (Playwright 1.55.0 is a dev dependency there):
//   node ../../docs/admin/client-zone-proposal/capture.mjs
// PLAYWRIGHT_FROM=<dir holding node_modules/playwright> points at another install when this checkout has none.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const from = process.env.PLAYWRIGHT_FROM ?? path.resolve(here, "../../../frontends/admin");
const { chromium } = createRequire(path.join(from, "package.json"))("playwright");
const out = path.join(here, "screenshots");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(here, "proposal.html")).href);
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(() => document.fonts.ready);
const fonts = await page.evaluate(() => ["600 20px 'Cormorant Garamond'", "400 14px 'Nunito Sans'", "400 12px 'IBM Plex Mono'"].map(font => `${font}: ${document.fonts.check(font)}`));
console.log("web fonts loaded:", fonts.join(" | "));

for (const figure of await page.locator("[data-shot]").all()) {
  const name = await figure.getAttribute("data-shot");
  await figure.scrollIntoViewIfNeeded();
  await figure.screenshot({ path: path.join(out, `${name}.png`) });
  console.log("shot", `${name}.png`);
}
await browser.close();
