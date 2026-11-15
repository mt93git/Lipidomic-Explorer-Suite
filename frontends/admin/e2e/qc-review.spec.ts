import { expect, test, type Page } from "@playwright/test";

// QC review in demo mode: exclude a sample with a reason, withdraw it, exclude it again, mark the order QC reviewed
// behind its confirm, then build the dataset in Release: the version lists the exclusion as a recorded decision and
// every sample is still in it. The screens fit a 390 px phone without page-level horizontal scroll. Synthetic data.
const slow = { timeout: 60_000 };
const phone = { width: 390, height: 844 };

async function enterLab(page: Page) {
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
}
const sampleRow = (page: Page, code: string) => page.getByRole("table", { name: "Samples of ORD053" }).getByRole("row").filter({ hasText: code });

test("exclude, withdraw, mark QC reviewed, then build: the dataset lists the decision and keeps every sample", async ({ page }) => {
  test.setTimeout(300_000);
  await enterLab(page);
  await page.getByRole("navigation").getByRole("link", { name: "QC review" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "QC review" })).toBeVisible(slow);
  const list = page.getByRole("table", { name: "Orders at Processed or QC reviewed" });
  await expect(list.getByRole("row").filter({ hasText: "ORD053" })).toContainText("08 · Processed");
  await list.getByRole("link", { name: "Open ORD053" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "QC review · ORD053" })).toBeVisible(slow);
  await expect(page.getByRole("heading", { level: 2, name: "22 samples · 0 excluded" })).toBeVisible();

  const row = sampleRow(page, "ORD053-S002");
  await row.locator("summary", { hasText: "Exclude" }).click();
  await row.getByRole("textbox", { name: "Reason" }).fill("Haemolysed synthetic tube");
  await row.getByRole("button", { name: "Exclude sample" }).click();
  await expect(page).toHaveURL(/\?order=ORD053&excluded=1$/, slow);
  await expect(page.getByRole("status")).toContainText("Exclusion recorded.", slow);
  await expect(sampleRow(page, "ORD053-S002")).toContainText("Excluded Haemolysed synthetic tube");

  await sampleRow(page, "ORD053-S002").locator("summary", { hasText: "Withdraw" }).click();
  await sampleRow(page, "ORD053-S002").getByRole("textbox", { name: "Reason" }).fill("Re-read the tube label");
  await sampleRow(page, "ORD053-S002").getByRole("button", { name: "Withdraw exclusion" }).click();
  await expect(page).toHaveURL(/withdrawn=1$/, slow);
  await expect(sampleRow(page, "ORD053-S002")).toContainText("Included");

  await sampleRow(page, "ORD053-S002").locator("summary", { hasText: "Exclude" }).click();
  await sampleRow(page, "ORD053-S002").getByRole("textbox", { name: "Reason" }).fill("Confirmed haemolysis");
  await sampleRow(page, "ORD053-S002").getByRole("button", { name: "Exclude sample" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "22 samples · 1 excluded" })).toBeVisible(slow);

  const step = page.getByRole("region", { name: "QC reviewed" });
  await expect(step.getByRole("button", { name: "Yes, mark QC reviewed" })).toBeHidden();
  await step.locator("summary", { hasText: "Mark QC reviewed" }).click();
  await expect(step.getByText(/Move ORD053 from Processed to QC reviewed\?/)).toBeVisible();
  await step.getByRole("button", { name: "Yes, mark QC reviewed" }).click();
  await expect(page).toHaveURL(/reviewed=1$/, slow);
  await expect(page.getByRole("status")).toContainText("ORD053 is QC reviewed.", slow);
  await expect(step).toContainText(/QC reviewed .*Demo Operator\./);

  await page.goto("/admin/release");
  const releaseRow = page.getByRole("row", { name: /ORD053/ });
  await expect(releaseRow).toContainText("09 · QC reviewed", slow);
  await releaseRow.getByRole("button", { name: "Build dataset v1" }).click();
  await expect(page).toHaveURL(/\/admin\/release\/[0-9a-f-]{36}\?built=1$/, slow);
  const record = page.getByRole("region", { name: "Files of this version" });
  await expect(record.getByRole("list", { name: "Sample exclusions" })).toContainText("ORD053-S002 · Confirmed haemolysis");
  await expect(record).toContainText("FullName from the registry (22 of 22 samples matched)");
  const datasetPath = new URL(page.url()).pathname.replace(/^\/admin/, "");

  await page.goto("/admin/datasets?order=ORD053");
  await expect(page.getByRole("list", { name: "Sample exclusions recorded for ORD053 v1" })).toContainText("ORD053-S002 excluded · Confirmed haemolysis", slow);

  await page.goto("/admin/qc-review?order=ORD053");
  await expect(page.getByText(/ORD053 is Excel built; its QC decisions are closed/)).toBeVisible(slow);
  await expect(page.getByRole("button", { name: "Exclude sample" })).toHaveCount(0);

  await page.setViewportSize(phone);
  for (const path of ["/admin/qc-review", "/admin/qc-review?order=ORD048", "/admin/qc-review?order=ORD053", `/admin${datasetPath}`, "/admin/datasets"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(slow);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});
