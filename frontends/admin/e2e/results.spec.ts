import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
const slow = { timeout: 60_000 };
test("review a flagged synthetic blank and accept results", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  await page.goto("/admin/ingest-results");
  await page.getByRole("combobox", { name: "Order", exact: true }).selectOption({ label: "ORD041 · registered" }, slow);
  const source = readFileSync(path.join(process.cwd(), "e2e/fixtures/sciex-synthetic.txt"), "utf8");
  // Synthetic variant: give the blank a detection for every retained analyte.
  const flagged = source.split("\n").map((line, i) => {
    if (i < 2 || !line) return line;
    const cells = line.split("\t"); cells[4] = "1"; return cells.join("\t");
  }).join("\n");
  await page.getByLabel("SCIEX OS results TXT").setInputFiles({ name: "synthetic-blank.txt", mimeType: "text/plain", buffer: Buffer.from(flagged) });
  await page.getByRole("button", { name: "Parse file" }).click();
  await expect(page.getByText(/Blank injection\(s\).*sample-like detection/)).toBeVisible(slow);
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
  await page.getByLabel("Override reason").fill("Reviewed synthetic blank; approved for demonstration.");
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  const notice = page.getByRole("status");
  await expect(notice).toContainText("Results accepted for ORD041", slow);
  await expect(notice).toContainText("The order is now Processed");
  await expect(notice.getByRole("link", { name: /Build dataset v1/ })).toHaveAttribute("href", /\/admin\/release$/);
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
});
