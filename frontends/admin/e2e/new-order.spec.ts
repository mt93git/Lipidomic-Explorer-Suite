import { expect, test } from "@playwright/test";

// The happy path of New order, in demo mode: sign in as demo lab staff, open New order from the pipeline, create an
// order, see its code with the next steps, and find it on the pipeline at Request. Dev-server compiles happen on first
// visit, so the route-change waits are generous.
const slow = { timeout: 60_000 };

test("create an order and see it on the pipeline at Request", async ({ page }) => {
  test.setTimeout(240_000);
  // baseURL ends in /admin without a trailing slash, so a path starting with "/" must carry the basePath itself.
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);

  await page.getByRole("link", { name: "+ New order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible(slow);
  await page.getByLabel("Client", { exact: true }).selectOption({ label: "Example Harbor" });
  await page.getByLabel("Panel", { exact: true }).selectOption({ label: "Panel C · sterols & CE" });
  await page.getByLabel("Title", { exact: true }).fill("Synthetic sterol series · E2E");
  await page.getByLabel("Matrix", { exact: true }).fill("Plasma");
  await page.getByLabel("Expected samples", { exact: true }).fill("16");
  await page.getByLabel("Billing reference", { exact: true }).fill("PO-SYN-0001");
  await page.getByLabel("Notes", { exact: true }).fill("Synthetic order for the demo.");
  await page.getByRole("button", { name: "Create order" }).click();

  await expect(page).toHaveURL(/\/admin\/new-order\?created=ORD\d{3,}$/, slow);
  const code = new URL(page.url()).searchParams.get("created")!;
  const notice = page.getByRole("status").filter({ hasText: `Order ${code} created.` });
  await expect(notice).toBeVisible(slow);
  await expect(notice.getByRole("link", { name: "Receive shipment →" })).toHaveAttribute("href", `/admin/receive-shipment?order=${code}`);
  await expect(notice.getByRole("link", { name: "Open order →" })).toHaveAttribute("href", `/admin/orders/${code}`);

  await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByRole("region", { name: "Request", exact: true }).getByRole("article", { name: code })).toBeVisible(slow);
});

// The app checks the form, not the browser: an empty submit shows the error summary, marks the fields and puts the
// focus on the first invalid control. The optional text fields use the reading font, not the code font.
test("an incomplete order is explained by the error summary, with the focus on the first invalid field", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  await page.goto("/admin/new-order");
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible(slow);

  const readingFont = await page.locator("body").evaluate(body => getComputedStyle(body).fontFamily);
  for (const label of ["Billing reference", "Notes"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveCSS("font-family", readingFont);
  }

  await page.getByLabel("Expected samples", { exact: true }).fill("-3");
  await page.getByRole("button", { name: "Create order" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "4 fields need attention." });
  await expect(summary).toBeVisible(slow);
  await expect(summary.getByRole("link")).toHaveText(["Client", "Panel", "Title", "Expected samples"]);
  await expect(page.getByLabel("Client", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Title", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a whole number, 0 or more")).toBeVisible();
  await expect(page.getByLabel("Expected samples", { exact: true })).toHaveValue("-3");
});
