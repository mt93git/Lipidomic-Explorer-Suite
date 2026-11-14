import { expect, test, type Page } from "@playwright/test";

// New order as a four-step wizard, in demo mode: sign in as demo lab staff, walk Client → Service → Sample list →
// Review & quote, save a draft and resume it, place the order and find it on the pipeline at Request. Dev-server
// compiles happen on first visit, so the route-change waits are generous.
const slow = { timeout: 60_000 };

async function enter(page: Page) {
  // baseURL ends in /admin without a trailing slash, so a path starting with "/" must carry the basePath itself.
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
}

test("walk the four steps, save a draft, resume it, place the order and see it on the pipeline at Request", async ({ page }) => {
  test.setTimeout(240_000);
  await enter(page);
  await page.getByRole("link", { name: "+ New order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible(slow);
  await expect(page.getByText("Step 1 of 4. Orders can be placed by lab staff or by the client's Requester.")).toBeVisible();

  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: "Example Harbor" });
  await page.getByLabel("Order title").fill("Synthetic sterol series · E2E");
  await page.getByRole("button", { name: "Next: service" }).click();

  await page.getByLabel("Panel", { exact: true }).selectOption({ label: "Panel C · sterols & CE" });
  await page.getByLabel("Sample matrix").selectOption("Plasma");
  await page.getByLabel("Number of samples").fill("16");
  await page.getByLabel("Study design").selectOption("Groups");
  await page.getByLabel("Billing", { exact: true }).selectOption({ label: "Purchase order" });
  await page.getByLabel("Billing reference").fill("PO-SYN-0001");
  await page.getByLabel("Notes for the lab").fill("Synthetic order for the demo.");
  const estimate = page.getByRole("region", { name: "Estimate" });
  await expect(estimate).toContainText("Panel C · sterols & CE, 16 samples");
  await expect(estimate).toContainText("not set");
  await expect(estimate).toContainText("included");
  // The active profile's rules (demo: 4 blanks at start, 5 after every 4 samples, QC at the end): 16 + 4 + 15 + 1.
  await expect(estimate).toContainText("4 blanks at start, 15 between samples and 1 pooled QC, by the active profile's rules");
  await expect(estimate).toContainText("36 injections × 12 min");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved at" })).toBeVisible(slow);
  await expect(page).toHaveURL(/\/admin\/new-order\?draft=/);
  await page.reload();
  await expect(page.getByText(/Resuming a saved draft/)).toBeVisible(slow);
  await expect(page.getByLabel("Number of samples")).toHaveValue("16");

  await page.getByRole("button", { name: "Next: sample list" }).click();
  await expect(page.getByRole("link", { name: "Download template" })).toHaveAttribute("download", "sample-list-template.csv");
  await page.getByLabel("Paste the sample list (optional)").fill("FullName\tGroup1Term\nS01\tControl\nS02\tTreated");
  await expect(page.getByText("2 samples read")).toBeVisible();
  await page.getByRole("button", { name: "Next: review & quote" }).click();
  await expect(page.getByRole("region", { name: "Review & quote" })).toContainText("Purchase order · PO-SYN-0001");

  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/admin\/new-order\?created=ORD\d{3,}$/, slow);
  const code = new URL(page.url()).searchParams.get("created")!;
  const notice = page.getByRole("status").filter({ hasText: `Order ${code} placed.` });
  await expect(notice).toBeVisible(slow);
  await expect(notice.getByRole("link", { name: "Receive shipment →" })).toHaveAttribute("href", `/admin/receive-shipment?order=${code}`);
  await expect(page.getByRole("region", { name: "Saved drafts" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByRole("region", { name: "Request", exact: true }).getByRole("article", { name: code })).toBeVisible(slow);
});

// Next checks the step being left: an empty step 1 marks both fields and puts the focus on the first; the optional text
// fields use the reading font, not the code font.
test("Next on an empty step explains what is missing, with the focus on the first field", async ({ page }) => {
  test.setTimeout(240_000);
  await enter(page);
  await page.goto("/admin/new-order");
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible(slow);
  await page.getByRole("button", { name: "Next: service" }).click();
  await expect(page.getByText("Choose a client", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a title", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Client", exact: true })).toBeFocused();
  await expect(page.getByLabel("Order title")).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: "Example Harbor" });
  await page.getByLabel("Order title").fill("Synthetic");
  await page.getByRole("button", { name: "Next: service" }).click();
  const readingFont = await page.locator("body").evaluate(body => getComputedStyle(body).fontFamily);
  for (const label of ["Billing reference", "Notes for the lab"]) await expect(page.getByLabel(label, { exact: true })).toHaveCSS("font-family", readingFont);
  await page.getByLabel("Number of samples").fill("-3");
  await page.getByRole("button", { name: "Next: sample list" }).click();
  await expect(page.getByText("Choose a panel", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a whole number, 0 or more", { exact: true })).toBeVisible();
});
