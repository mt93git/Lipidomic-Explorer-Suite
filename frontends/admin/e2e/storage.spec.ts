import { expect, test, type Page } from "@playwright/test";

// Storage (0025) in demo mode, in one browser (one demo store): the lab places an example aliquot waiting for a box
// (an occupied position is refused first), moves it, removes it with a reason, and finds another by its sample code.
// The screen fits a 390 px phone; the client view never reaches it. Synthetic data only.
const slow = { timeout: 60_000 };
const phone = { width: 390, height: 844 };

async function enterLab(page: Page) {
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
}
async function submit(page: Page, name: string, fields: Record<string, string>, button: string) {
  const form = page.getByRole("form", { name });
  for (const [label, value] of Object.entries(fields)) await form.getByRole("textbox", { name: label, exact: true }).fill(value);
  await form.getByRole("button", { name: button }).click();
}

test("the lab places, moves and removes an aliquot, and finds one by its sample code", async ({ page }) => {
  test.setTimeout(240_000);
  await enterLab(page);
  await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Storage" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Storage" })).toBeVisible(slow);
  const boxes = page.getByRole("list", { name: "Boxes" });
  await expect(boxes.getByRole("link")).toHaveText(["F1-R1-B014 positions taken", "F1-R1-B023 positions taken"]);

  // Place: the position is taken first, then a free one.
  const waiting = page.getByRole("table", { name: "Aliquots waiting for a box" });
  await waiting.getByRole("link", { name: "Place ORD044-S004-A1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Place ORD044-S004-A1" })).toContainText("not in a box", slow);
  await submit(page, "Place ORD044-S004-A1", { Box: "F1-R1-B02", Position: "A1" }, "Place");
  await expect(page.getByRole("form", { name: "Place ORD044-S004-A1" }).getByRole("alert")).toHaveText("Box F1-R1-B02 position A1 already holds ORD044-S001-A1.", slow);
  await expect(page.getByRole("form", { name: "Place ORD044-S004-A1" }).getByRole("textbox", { name: "Box" })).toHaveValue("F1-R1-B02");
  await submit(page, "Place ORD044-S004-A1", { Position: " A4 " }, "Place");
  await expect(page.getByRole("status")).toHaveText("ORD044-S004-A1 placed in box F1-R1-B02, position A4.", slow);
  const box = page.getByRole("table", { name: "Positions in box F1-R1-B02" });
  await expect(box.getByRole("row").filter({ hasText: "ORD044-S004-A1" })).toContainText("A4");
  await expect(boxes.getByRole("link", { name: /F1-R1-B02/ })).toHaveText("F1-R1-B024 positions taken");

  // Move to a new box: the old position frees up.
  await box.getByRole("link", { name: "Move ORD044-S004-A1", exact: true }).click();
  await submit(page, "Move ORD044-S004-A1", { "New box": "F1-R1-B03", Position: "A1" }, "Move");
  await expect(page.getByRole("status")).toHaveText("ORD044-S004-A1 moved to box F1-R1-B03, position A1. Its old position is kept in the history.", slow);
  await expect(page.getByRole("table", { name: "Positions in box F1-R1-B03" }).getByRole("row")).toHaveCount(2);
  await expect(boxes.getByRole("link")).toHaveText(["F1-R1-B014 positions taken", "F1-R1-B023 positions taken", "F1-R1-B031 position taken"]);

  // Remove with a reason: it waits for a box again.
  await page.getByRole("table", { name: "Positions in box F1-R1-B03" }).getByRole("link", { name: "Remove ORD044-S004-A1", exact: true }).click();
  await submit(page, "Remove ORD044-S004-A1", { Reason: "used up in batch B2026-032" }, "Remove");
  await expect(page.getByRole("status")).toHaveText(/^ORD044-S004-A1 removed from storage\./, slow);
  await expect(page.getByText("Box F1-R1-B03 holds no aliquot.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Aliquots waiting for a box" }).getByText("ORD044-S004-A1")).toBeVisible();

  // Search by sample code.
  const search = page.getByRole("search", { name: "Find an aliquot" });
  await search.getByRole("searchbox", { name: "Sample or aliquot code" }).fill("ord046-s002");
  await search.getByRole("button", { name: "Search" }).click();
  const found = page.getByRole("table", { name: "Aliquots matching ord046-s002" });
  await expect(found.getByRole("row")).toHaveCount(2, slow);
  await expect(found).toContainText("ORD046-S002-A1");
  await expect(found).toContainText("F1-R1-B01 · A2");
});

test("Storage fits a 390 px phone, with a box and a form open", async ({ page }) => {
  await enterLab(page);
  await page.setViewportSize(phone);
  for (const path of ["/admin/storage", "/admin/storage?box=F1-R1-B01&act=move&aliquot=ORD046-S001-A1", "/admin/storage?q=ORD04"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Storage" })).toBeVisible(slow);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});

test("the client view never reaches Storage", async ({ page }) => {
  await enterLab(page);
  await page.getByRole("form", { name: "Example view" }).getByRole("button", { name: "Client" }).click();
  await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
  await page.getByRole("button", { name: /Example Cedar/ }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
  await expect(page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Storage" })).toHaveCount(0);
  await page.goto("/admin/storage");
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
});
