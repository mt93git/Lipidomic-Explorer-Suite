// Screenshots of the wave 2 samples flow in demo mode (receive shipment, sample registry, order detail, pipeline)
// at 1440x900 and 390x844. Needs a dev or prod server at BASE (default http://127.0.0.1:3110/admin) and the
// Playwright Chromium (npx playwright install chromium). Example:
//   node scripts/samples-screens.mjs verification/samples
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://127.0.0.1:3110/admin";
const out = process.argv[2] ?? "verification/samples";
const browser = await chromium.launch();
const sheet = "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm\nCtrl_1\tControl\tWildType\t1\tP01\t0h\nCtrl_2\tControl\tWildType\t2\tP02\t0h\nTrt_1\tTreated\tWildType\t1\tP03\t24h";
async function flow(viewport, tag) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/sign-in`);
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await page.waitForURL(/\/pipeline$/);
  await page.goto(`${base}/receive-shipment`);
  await page.screenshot({ path: `${out}/receive-shipment-empty-${tag}.png`, fullPage: true });
  await page.getByLabel("Order", { exact: true }).selectOption({ label: "ORD042 · Example Cedar · Example lipid panel · feasibility" });
  await page.waitForURL(/order=ORD042/);
  await page.getByLabel("Carrier").fill("FedEx");
  await page.getByLabel("Tracking number").fill("7489 0000 0001");
  await page.getByRole("radio", { name: /^Thawed/ }).check();
  await page.getByLabel("Boxes").fill("2");
  await page.getByLabel("Notes").fill("Dry ice gone; tubes cool to the touch.");
  await page.screenshot({ path: `${out}/receive-shipment-filled-${tag}.png`, fullPage: true });
  await page.getByRole("button", { name: "Record arrival" }).click();
  await page.waitForURL(/sample-registry\?order=ORD042&received=/);
  await page.screenshot({ path: `${out}/sample-registry-received-${tag}.png`, fullPage: true });
  await page.getByLabel("Paste from Excel").fill(sheet);
  await page.getByRole("button", { name: "Add rows" }).click();
  await page.getByRole("button", { name: "Add empty row" }).click();
  await page.getByLabel("Row 2 FullName").fill("Ctrl_1");
  await page.getByLabel("Row 3 Volume (µL)").fill("fifty");
  await page.screenshot({ path: `${out}/sample-registry-errors-${tag}.png`, fullPage: true });
  await page.getByRole("button", { name: "Remove row 4" }).click();
  await page.getByLabel("Row 2 FullName").fill("Ctrl_2");
  await page.getByLabel("Row 3 Volume (µL)").fill("50");
  await page.screenshot({ path: `${out}/sample-registry-grid-${tag}.png`, fullPage: true });
  await page.getByRole("button", { name: "Register 3 samples" }).click();
  await page.waitForURL(/saved=3/);
  await page.screenshot({ path: `${out}/sample-registry-saved-${tag}.png`, fullPage: true });
  await page.goto(`${base}/orders/ORD042`);
  await page.screenshot({ path: `${out}/order-detail-after-${tag}.png`, fullPage: true });
  await page.goto(`${base}/pipeline?client=example-cedar`);
  await page.screenshot({ path: `${out}/pipeline-after-${tag}.png` });
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  console.log(tag, "pipeline page horizontal scroll:", scrollWidth > clientWidth, scrollWidth, clientWidth);
  await page.goto(`${base}/sample-registry`);
  await page.screenshot({ path: `${out}/sample-registry-picker-${tag}.png`, fullPage: true });
  for (const path of ["/receive-shipment?order=ORD052", "/sample-registry?order=ORD042"]) {
    await page.goto(`${base}${path}`);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    console.log(tag, path, "horizontal page scroll:", sw > cw, sw, cw);
  }
  await context.close();
}
await flow({ width: 1440, height: 900 }, "1440");
await flow({ width: 390, height: 844 }, "390");
await browser.close();
