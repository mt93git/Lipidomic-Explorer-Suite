import { expect, test, type Page } from "@playwright/test";

// Instruments & panels (0026) in the demo: add an instrument and a panel on it, find the panel in New order, try to
// change a used panel's dataset type (fixed), archive the new panel with a reason (gone from New order, shown again
// with the archived toggle), and the screen fits a 390 px phone. Synthetic data only.
const slow = { timeout: 60_000 };
const phone = { width: 390, height: 844 };
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test("add an instrument and a panel, see it in New order, archive it with a reason", async ({ page }) => {
  await page.goto("/admin/instruments-panels");
  await expect(page.getByRole("heading", { name: "Instruments & panels", exact: true })).toBeVisible(slow);

  const newInstrument = page.getByRole("region", { name: "New instrument", exact: true });
  await newInstrument.getByLabel("Instrument name", { exact: true }).fill("  Synthetic Orbitrap E2E  ");
  await newInstrument.getByLabel("Model", { exact: true }).fill("Synthetic HRMS");
  await newInstrument.getByLabel("Act as (demo)").selectOption("example-owner");
  await newInstrument.getByRole("button", { name: "Add instrument", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Instrument added.", slow);
  const instruments = page.getByRole("table", { name: "Instruments" });
  await expect(instruments.getByRole("row").filter({ hasText: "Synthetic Orbitrap E2E" })).toContainText("Synthetic HRMS");

  const newPanel = page.getByRole("region", { name: "New panel", exact: true });
  await newPanel.getByLabel("Panel name", { exact: true }).fill("Synthetic oxylipins E2E");
  await newPanel.getByLabel("Instrument", { exact: true }).selectOption({ label: "Synthetic Orbitrap E2E" });
  await newPanel.getByLabel("LC method", { exact: true }).fill("C18, 12 min");
  await newPanel.getByLabel("ISTD kits", { exact: true }).fill("Synthetic kit M, Synthetic kit M, Synthetic kit N");
  await newPanel.getByLabel("Dataset type", { exact: true }).selectOption("mediators");
  await newPanel.getByLabel("Act as (demo)").selectOption("example-reviewer-a");
  await newPanel.getByRole("button", { name: "Add panel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Panel added.", slow);
  const row = page.getByRole("table", { name: "Panels" }).getByRole("row").filter({ hasText: "Synthetic oxylipins E2E" });
  await expect(row).toContainText("Synthetic Orbitrap E2E");
  await expect(row).toContainText("Synthetic kit M, Synthetic kit N");
  await expect(row).toContainText("Lipid mediators");

  await page.goto("/admin/new-order");
  await expect(page.getByLabel("Panel", { exact: true }).locator("option", { hasText: "Synthetic oxylipins E2E" })).toHaveCount(1, slow);

  // A used panel keeps its dataset type.
  await page.goto("/admin/instruments-panels");
  await page.getByRole("link", { name: "Edit Panel A · broad lipidome", exact: true }).click();
  const used = page.getByRole("region", { name: "Edit Panel A · broad lipidome", exact: true });
  await expect(used.getByLabel("Dataset type", { exact: true })).toBeDisabled(slow);
  await expect(used.getByText("Fixed: orders or batches already use this panel.", { exact: false })).toBeVisible();

  // Archive the new panel.
  await page.goto("/admin/instruments-panels");
  await page.getByRole("link", { name: "Edit Synthetic oxylipins E2E", exact: true }).click();
  const edit = page.getByRole("region", { name: "Edit Synthetic oxylipins E2E", exact: true });
  await edit.getByLabel("Reason", { exact: true }).fill("Synthetic retirement");
  await edit.getByLabel("Act as (demo)").last().selectOption("example-owner");
  await edit.getByRole("button", { name: "Archive panel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Panel archived.", slow);
  await expect(page.getByRole("table", { name: "Panels" }).getByText("Synthetic oxylipins E2E")).toHaveCount(0);
  await page.getByRole("link", { name: /^Show archived/ }).click();
  await expect(page.getByRole("table", { name: "Panels" }).getByRole("row").filter({ hasText: "Synthetic oxylipins E2E" })).toContainText("Archived · Synthetic retirement", slow);

  await page.goto("/admin/new-order");
  await expect(page.getByLabel("Panel", { exact: true }).locator("option", { hasText: "Panel A · broad lipidome" })).toHaveCount(1, slow);
  await expect(page.getByLabel("Panel", { exact: true }).locator("option", { hasText: "Synthetic oxylipins E2E" })).toHaveCount(0);
});

test("Instruments & panels fits a 390 px phone, with an edit form open and archived rows shown", async ({ page }) => {
  await page.setViewportSize(phone);
  for (const path of ["/admin/instruments-panels", "/admin/instruments-panels?archived=1&panel=Panel%20A%20%C2%B7%20broad%20lipidome", "/admin/instruments-panels?instrument=demo-instrument-qqq"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Instruments & panels", exact: true })).toBeVisible(slow);
    expect(await fits(page), path).toBeLessThanOrEqual(390);
  }
});
