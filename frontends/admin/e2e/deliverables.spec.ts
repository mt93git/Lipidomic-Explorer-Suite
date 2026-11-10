import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Deliverables and the per-client Nexo switch (F4) in demo mode, in one browser (one demo store): the lab uploads a
// PDF and a PNG to ORD040 (Example Cedar, released) and shows only the PDF; the example client sees and downloads
// only the PDF, and the PNG's download is refused. The lab turns Example Cedar's Nexo access on and off, and the
// client's Open in Nexo follows (the environment gate is on in this run, playwright.config.ts).
// ADMIN_E2E_SCREENSHOTS=1 also saves the screens to docs/admin/client-portal-f4/ (synthetic data).
const slow = { timeout: 60_000 };
const shots = process.env.ADMIN_E2E_SCREENSHOTS === "1";
const desktop = { width: 1280, height: 900 };
const phone = { width: 390, height: 844 };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Synthetic study report for the demo\n%%EOF\n");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve(`../../docs/admin/client-portal-f4/${name}.png`), fullPage: true });
}
async function asClient(page: Page) {
  await page.getByRole("form", { name: "Example view" }).getByRole("button", { name: "Client" }).click();
  await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
  await page.getByRole("button", { name: /Example Cedar/ }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
}
async function asLab(page: Page) {
  await page.getByRole("form", { name: "Example view" }).getByRole("button", { name: "Lab staff" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
}
async function addFile(page: Page, title: string, kind: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const form = page.getByRole("form", { name: "Add a deliverable" });
  await form.getByLabel("Title", { exact: true }).fill(title);
  await form.getByLabel("Kind", { exact: true }).selectOption(kind);
  await form.getByLabel("File", { exact: true }).setInputFiles(file);
  await form.getByRole("button", { name: "Add file" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/ORD040\?deliverable=added#deliverables$/, slow);
  await expect(page.getByRole("status").filter({ hasText: "File added. It stays hidden from the client" })).toBeVisible(slow);
}
async function setNexo(page: Page, button: string, notice: string) {
  await page.goto("/admin/clients/example-cedar");
  const section = page.getByRole("region", { name: "Nexo access" });
  await section.getByLabel("Act as (demo)").selectOption("example-owner");
  await section.getByRole("button", { name: button }).click();
  await expect(page.getByRole("status").filter({ hasText: notice })).toBeVisible(slow);
}
async function clientRelease(page: Page) {
  await page.goto("/admin/orders/ORD040");
  await expect(page.getByRole("heading", { level: 2, name: "Released" })).toBeVisible(slow);
}

test("the lab shares a PDF and keeps a PNG hidden; the client downloads only the PDF; the Nexo switch changes the client's button", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(desktop);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);

  // The lab adds two files to the released order; both start hidden. It shows the PDF only.
  await page.goto("/admin/orders/ORD040");
  const section = page.getByRole("region", { name: "Deliverables" });
  await expect(section).toContainText("Files added now belong to dataset v1", slow);
  await addFile(page, "Study report", "report", { name: "Study report.pdf", mimeType: "application/pdf", buffer: PDF });
  await addFile(page, "Figure 1 · lipid classes", "figure", { name: "figure-1.png", mimeType: "image/png", buffer: PNG });
  const rows = section.getByRole("list", { name: "Deliverables" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  const pdfRow = rows.filter({ hasText: "Study report" });
  const pngRow = rows.filter({ hasText: "Figure 1" });
  await expect(pdfRow).toContainText("Hidden");
  await expect(pngRow).toContainText("Hidden");
  const pngHref = await pngRow.getByRole("link", { name: /^Download / }).getAttribute("href");
  await pdfRow.getByRole("button", { name: "Show to client" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The client now sees this file." })).toBeVisible(slow);
  await expect(pdfRow).toContainText("Client sees it");
  await expect(pngRow).toContainText("Hidden");
  await section.scrollIntoViewIfNeeded();
  await shot(page, "lab-deliverables-desktop");

  // The client sees the PDF only, downloads the same bytes, and cannot fetch the hidden PNG. Nexo is off for them.
  await asClient(page);
  await clientRelease(page);
  const files = page.getByRole("list", { name: "Your files" }).getByRole("listitem");
  await expect(files).toHaveCount(1);
  await expect(files.first()).toContainText("Study report");
  await expect(page.locator("main")).not.toContainText("Figure 1");
  await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), files.first().getByRole("link", { name: "Download Study report" }).click()]);
  expect(download.suggestedFilename()).toBe("Study-report.pdf");
  expect(await readFile((await download.path())!)).toEqual(PDF);
  expect((await page.request.get(pngHref!)).status()).toBe(404);
  await shot(page, "client-deliverables-desktop");
  await page.setViewportSize(phone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await shot(page, "client-deliverables-390");
  await page.setViewportSize(desktop);

  // The lab turns Nexo on for Example Cedar: the client gets Open in Nexo. Off again: it is gone.
  await asLab(page);
  await setNexo(page, "Turn Nexo access on", "Nexo access turned on for Example Cedar.");
  await expect(page.getByRole("region", { name: "Nexo access" }).getByTestId("nexo-state")).toHaveText("On");
  await shot(page, "nexo-switch-desktop");
  await asClient(page);
  await clientRelease(page);
  await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveAttribute("href", /\/\?dataset=example-dataset-ord040-v1$/);
  await page.goto("/admin/client/home");
  await expect(page.getByRole("region", { name: "Datasets" }).getByRole("link", { name: "Open in Nexo" }).first()).toBeVisible(slow);
  await asLab(page);
  await setNexo(page, "Turn Nexo access off", "Nexo access turned off for Example Cedar.");
  await asClient(page);
  await clientRelease(page);
  await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveCount(0);
});
