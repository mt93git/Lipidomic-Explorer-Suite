import { expect, test, type Page } from "@playwright/test";

// Instruments & panels (0026, 0035) in the demo: add an instrument, a profile on it with its own blank and QC rules,
// make it active, add a panel on it and find it in New order, try to
// change a used panel's dataset type (fixed), archive the new panel with a reason (gone from New order, shown again
// with the archived toggle), and the screen fits a 390 px phone. Synthetic data only.
const slow = { timeout: 60_000 };
const phone = { width: 390, height: 844 };
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);
// New order offers the panels on its Service step (step 2 of the wizard): step 1 needs a client and a title first.
async function openServiceStep(page: Page) {
  await page.goto("/admin/new-order");
  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ index: 1 }, slow);
  await page.getByLabel("Order title").fill("Synthetic panel check");
  await page.getByRole("button", { name: "Next: service" }).click();
}

test("add an instrument, a profile on it with its own rules and a panel, make it active, archive the panel", async ({ page }) => {
  test.setTimeout(240_000); // several screens, each compiled on first visit by the dev server
  await page.goto("/admin/instruments-panels");
  await expect(page.getByRole("heading", { name: "Instruments & panels", exact: true })).toBeVisible(slow);
  await expect(page.getByRole("region", { name: "SCIEX Triple Quad 7500 · Shimadzu LC-40R" }).getByText("active", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Add instrument", exact: true }).click();
  const newInstrument = page.getByRole("region", { name: "New instrument", exact: true });
  await newInstrument.getByLabel("Instrument name", { exact: true }).fill("  Synthetic Orbitrap E2E  ");
  await newInstrument.getByLabel("Model", { exact: true }).fill("Synthetic HRMS");
  await newInstrument.getByLabel("Act as (demo)").selectOption("example-owner");
  await newInstrument.getByRole("button", { name: "Add instrument", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Instrument added.", slow);
  const instruments = page.getByRole("table", { name: "Instruments" });
  await expect(instruments.getByRole("row").filter({ hasText: "Synthetic Orbitrap E2E" })).toContainText("Synthetic HRMS");

  // A second instrument is a new profile.
  await page.getByRole("link", { name: "Add profile", exact: true }).click();
  const newProfile = page.getByRole("region", { name: "New profile", exact: true });
  await newProfile.getByLabel("Profile name", { exact: true }).fill("Synthetic Orbitrap profile E2E");
  await newProfile.getByLabel("Instrument", { exact: true }).selectOption({ label: "Synthetic Orbitrap E2E" });
  await newProfile.getByLabel("Software", { exact: true }).fill("Synthetic acquisition software");
  await newProfile.getByLabel("Act as (demo)").selectOption("example-reviewer-a");
  await newProfile.getByRole("button", { name: "Add profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile added.", slow);
  await page.getByRole("navigation", { name: "Instrument profiles" }).getByRole("link", { name: "Synthetic Orbitrap profile E2E" }).click();
  const card = page.getByRole("region", { name: "Synthetic Orbitrap profile E2E", exact: true });
  await expect(card.getByText("inactive", { exact: true })).toBeVisible(slow);
  await expect(card.getByRole("table", { name: "Profile settings" }).getByRole("row").filter({ hasText: "Software" })).toContainText("Synthetic acquisition software");

  // Its own rules, then make it active.
  const rules = page.getByRole("region", { name: "Blank and QC rules", exact: true });
  await rules.getByLabel("Blanks at the start", { exact: true }).fill("3");
  await rules.getByLabel("Pooled QC every (samples; 0 for none)", { exact: true }).fill("5");
  await rules.getByLabel("QC thresholds", { exact: true }).fill("CV 25 %");
  await rules.getByRole("button", { name: "Save rules", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Blank and QC rules saved.", slow);
  await page.getByRole("navigation", { name: "Instrument profiles" }).getByRole("link", { name: "Synthetic Orbitrap profile E2E" }).click();
  await expect(page.getByRole("region", { name: "Blank and QC rules", exact: true }).getByLabel("QC thresholds", { exact: true })).toHaveValue("CV 25 %", slow);
  await page.getByRole("region", { name: "Synthetic Orbitrap profile E2E", exact: true }).getByRole("button", { name: "Make active", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profile made active.", slow);
  await expect(page.getByRole("region", { name: "Synthetic Orbitrap profile E2E", exact: true }).getByText("active", { exact: true })).toBeVisible();

  // A new panel starts on the shown profile's instrument.
  await page.getByRole("link", { name: "Add panel", exact: true }).click();
  const newPanel = page.getByRole("region", { name: "New panel", exact: true });
  await expect(newPanel.getByLabel("Instrument", { exact: true })).toHaveValue(/.+/, slow);
  await newPanel.getByLabel("Panel name", { exact: true }).fill("Synthetic oxylipins E2E");
  await expect(newPanel.getByLabel("Instrument", { exact: true }).locator("option:checked")).toHaveText("Synthetic Orbitrap E2E");
  await newPanel.getByLabel("LC method", { exact: true }).fill("C18, 12 min");
  await newPanel.getByLabel("ISTD kits", { exact: true }).fill("Synthetic kit M, Synthetic kit M, Synthetic kit N");
  await newPanel.getByLabel("Dataset type", { exact: true }).selectOption("mediators");
  await newPanel.getByLabel("Act as (demo)").selectOption("example-reviewer-a");
  await newPanel.getByRole("button", { name: "Add panel", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Panel added.", slow);
  const row = page.getByRole("table", { name: "Panels" }).getByRole("row").filter({ hasText: "Synthetic oxylipins E2E" });
  await expect(row).toContainText("Synthetic kit M · Synthetic kit N");
  await expect(row).toContainText("Lipid mediators");

  // Batch builder's form only shows once a sample is registered: e2e/batch.spec.ts checks it pre-fills the active
  // profile's rules (the example profile's 4 blanks, 5 blanks after every 4 samples, no interval QC).

  await openServiceStep(page);
  await expect(page.getByLabel("Panel", { exact: true }).locator("option", { hasText: "Synthetic oxylipins E2E" })).toHaveCount(1, slow);

  // A used panel keeps its dataset type (it is on the other profile's instrument now).
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

  await openServiceStep(page);
  await expect(page.getByLabel("Panel", { exact: true }).locator("option", { hasText: "Panel A · broad lipidome" })).toHaveCount(1, slow);
  await expect(page.getByLabel("Panel", { exact: true }).locator("option", { hasText: "Synthetic oxylipins E2E" })).toHaveCount(0);

  // 0039: its panel is archived, but the active profile still points at the instrument, so it cannot be archived.
  await page.goto("/admin/instruments-panels");
  await page.getByRole("link", { name: "Edit Synthetic Orbitrap E2E", exact: true }).click();
  const instrumentEdit = page.getByRole("region", { name: "Edit Synthetic Orbitrap E2E", exact: true });
  await expect(instrumentEdit.getByText('Profile "Synthetic Orbitrap profile E2E" uses this instrument. Archive or move the profile first.')).toBeVisible(slow);
  await expect(instrumentEdit.getByRole("button", { name: "Archive instrument" })).toHaveCount(0);
});

test("Instruments & panels fits a 390 px phone, with an edit form open and archived rows shown", async ({ page }) => {
  await page.setViewportSize(phone);
  for (const path of ["/admin/instruments-panels", "/admin/instruments-panels?archived=1&panel=Panel%20A%20%C2%B7%20broad%20lipidome", "/admin/instruments-panels?instrument=demo-instrument-qqq",
    "/admin/instruments-panels?profile=demo-profile-qqq"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Instruments & panels", exact: true })).toBeVisible(slow);
    expect(await fits(page), path).toBeLessThanOrEqual(390);
  }
});
