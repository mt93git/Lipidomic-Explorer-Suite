import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

// The read-only client portal in demo mode, as the example client user (Requester at Example Cedar, Viewer at
// Example Harbor): choose Example Cedar, read Client home, open an order, and be refused a lab screen.
// ADMIN_E2E_SCREENSHOTS=1 also saves the screens, desktop and 390 px, to docs/admin/client-portal-f1/ (synthetic data).
const slow = { timeout: 60_000 };
const shots = process.env.ADMIN_E2E_SCREENSHOTS === "1";
// The dev server's own indicator is not part of the app.
async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve(`../../docs/admin/client-portal-f1/${name}.png`), fullPage: true });
}
async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("the example client follows its orders and cannot open lab screens", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter as an example client" }).click();
  await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
  await page.getByRole("button", { name: /Example Cedar/ }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);

  // Client home: the client's own orders at their client steps; no lab navigation.
  await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  await expect(nav.getByRole("link")).toHaveText([/Home$/, /Request an order$/]);
  const orders = page.getByRole("region", { name: "Orders" });
  await expect(orders.getByRole("listitem").filter({ hasText: "ORD042" })).toContainText("Accepted · send your samples");
  await expect(orders.getByRole("listitem").filter({ hasText: "ORD044" })).toContainText("In analysis · step 4 of 6");
  await expect(orders).not.toContainText("ORD041"); // Example Atlas
  await expect(page.getByRole("region", { name: "Datasets" })).toContainText("ORD040");
  await expect(page.locator("main")).not.toContainText(/B2026-/);
  await shot(page, "client-home-desktop");

  // The order: six steps with dates, where it is now, its sample count; no lab jargon.
  await orders.getByRole("link", { name: "ORD044" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/ORD044$/, slow);
  await expect(page.getByRole("heading", { level: 1, name: "ORD044" })).toBeVisible(slow);
  const steps = page.getByRole("list", { name: "Order progress" }).getByRole("listitem");
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(2)).toContainText("Samples received");
  await expect(steps.nth(3)).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("heading", { level: 2, name: "In analysis" })).toBeVisible();
  await expect(page.getByText("32 registered · 32 expected")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/gate|batch|B2026-|Demo Operator|Demo Analyst/i);
  await shot(page, "client-order-desktop");

  // Phone width: both screens fit, the steps listed down.
  await page.setViewportSize({ width: 390, height: 844 });
  await noSidewaysScroll(page);
  await shot(page, "client-order-390");
  await page.goto("/admin/client/home");
  await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
  await noSidewaysScroll(page);
  await shot(page, "client-home-390");
  await page.goto("/admin/orders/ORD040");
  await expect(page.getByRole("heading", { level: 2, name: "Released" })).toBeVisible(slow);
  await expect(page.getByText(/^Dataset v1 · Nov 5, 2026$/)).toBeVisible();
  await noSidewaysScroll(page);
  await shot(page, "client-order-released-390");

  // Lab screens and another client's order are refused on the server.
  for (const lab of ["/admin/pipeline", "/admin/new-order", "/admin/people", "/admin/release"]) {
    await page.goto(lab);
    await expect(page, lab).toHaveURL(/\/admin\/client\/home$/, slow);
  }
  await page.goto("/admin/orders/ORD041"); // Example Atlas
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible(slow);
});
