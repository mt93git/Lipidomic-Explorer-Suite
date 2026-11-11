import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

// Client order requests (F2) in demo mode, in one browser (one demo store): the example client (Requester at Example
// Cedar) requests an order, the lab sees it in Pipeline and accepts or declines it on the order, and the client reads
// the answer: Accepted with the lab's shipping instructions, or Declined with the lab's reason.
// ADMIN_E2E_SCREENSHOTS=1 also saves the screens to docs/admin/client-portal-f2/ (synthetic data).
const slow = { timeout: 60_000 };
const shots = process.env.ADMIN_E2E_SCREENSHOTS === "1";
const desktop = { width: 1280, height: 900 };
const phone = { width: 390, height: 844 };
const SHIPPING = "Ship on dry ice, Monday to Wednesday only, to the Example Lab receiving desk.\nEmail the tracking number to lab@example.test.";

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve(`../../docs/admin/client-portal-f2/${name}.png`), fullPage: true });
}
async function both(page: Page, name: string) {
  await shot(page, `${name}-desktop`);
  await page.setViewportSize(phone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await shot(page, `${name}-390`);
  await page.setViewportSize(desktop);
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

// The example client sends a request and is back on Client home with its code. Returns the code.
async function requestOrder(page: Page, screens = false): Promise<string> {
  await page.setViewportSize(desktop);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter as an example client" }).click();
  await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
  await page.getByRole("button", { name: /Example Cedar/ }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
  await page.getByRole("link", { name: "+ Request an order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Request an order" })).toBeVisible(slow);
  await expect(page.getByLabel("Requesting for")).toHaveValue("Example Cedar");
  await page.getByLabel("Panel", { exact: true }).selectOption({ label: "Panel A · broad lipidome" });
  await page.getByLabel("Title", { exact: true }).fill("Plasma lipidome · diet study");
  await page.getByLabel("Matrix", { exact: true }).fill("Plasma");
  await page.getByLabel("Expected samples", { exact: true }).fill("24");
  await page.getByLabel("Notes", { exact: true }).fill("Two diets, 12 animals each, EDTA plasma, 50 µL per tube. We can ship the week of Nov 16.");
  if (screens) await both(page, "request-form");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home\?requested=ORD\d{3,}$/, slow);
  const code = new URL(page.url()).searchParams.get("requested")!;
  await expect(page.getByRole("status").filter({ hasText: `Request ${code} sent.` })).toBeVisible(slow);
  await expect(page.getByRole("region", { name: "Orders" }).getByRole("listitem").filter({ hasText: code })).toContainText("Requested · waiting for the lab's review");
  return code;
}

test("request → the lab accepts → the client sees Accepted with the shipping instructions", async ({ page }) => {
  test.setTimeout(300_000);
  const code = await requestOrder(page, true);

  // The client's order while it waits.
  await page.getByRole("region", { name: "Orders" }).getByRole("link", { name: code }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Waiting for the lab" })).toBeVisible(slow);
  await expect(page.getByText(/Do not ship samples yet/)).toBeVisible();
  await both(page, "client-order-pending");

  // The lab sets its shipping instructions (Organization), then finds the request in Pipeline.
  await asLab(page);
  await page.goto("/admin/shipping-instructions");
  await page.getByLabel("Instructions clients read").fill(SHIPPING);
  await page.getByRole("button", { name: "Save instructions" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Shipping instructions saved." })).toBeVisible(slow);

  await page.goto("/admin/pipeline");
  const notice = page.getByRole("status", { name: "Client requests" });
  await expect(notice).toContainText("1 client request is waiting for an answer.", slow);
  await expect(notice).toContainText(`${code} · Example Cedar`);
  const card = page.getByRole("region", { name: "Request", exact: true }).getByRole("article", { name: code });
  await expect(card).toContainText("Client request · needs an answer");
  await shot(page, "pipeline-notice-desktop");

  // A pending request cannot be received.
  await page.goto("/admin/receive-shipment");
  await expect(page.getByRole("list", { name: "Orders waiting to arrive" })).not.toContainText(code, slow);

  await page.goto("/admin/pipeline");
  await page.getByRole("status", { name: "Client requests" }).getByRole("link", { name: `Review ${code} →` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${code}$`), slow);
  await expect(page.getByRole("heading", { level: 2, name: "Accept this request?" })).toBeVisible(slow);
  await expect(page.getByText(/Two diets, 12 animals each/)).toBeVisible();
  await shot(page, "accept-decline-panel-desktop");
  await page.getByRole("button", { name: "Accept request" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${code}\\?answered=accepted$`), slow);
  await expect(page.getByRole("status").filter({ hasText: "Request accepted." })).toBeVisible(slow);
  await expect(page.getByRole("heading", { level: 2, name: "Accept this request?" })).toHaveCount(0);

  // Now it can arrive, and the client sees Accepted with the lab's text.
  await page.goto("/admin/receive-shipment");
  await expect(page.getByRole("list", { name: "Orders waiting to arrive" })).toContainText(code, slow);
  await asClient(page);
  await expect(page.getByRole("region", { name: "Orders" }).getByRole("listitem").filter({ hasText: code })).toContainText("Accepted · send your samples");
  await page.goto(`/admin/orders/${code}`);
  await expect(page.getByRole("heading", { level: 2, name: "Send your samples" })).toBeVisible(slow);
  const shipping = page.getByRole("note", { name: "Shipping instructions" });
  await expect(shipping).toContainText("Ship on dry ice, Monday to Wednesday only");
  await expect(shipping).toContainText("Email the tracking number to lab@example.test.");
  await expect(page.getByText(/ship as agreed/)).toHaveCount(0);
  await both(page, "client-order-accepted");
});

test("request → the lab declines with a reason → the client sees the reason", async ({ page }) => {
  test.setTimeout(300_000);
  const code = await requestOrder(page);
  await asLab(page);
  await page.goto(`/admin/orders/${code}`);
  await expect(page.getByRole("heading", { level: 2, name: "Accept this request?" })).toBeVisible(slow);

  // No reason: refused next to the field, nothing changes.
  await page.getByRole("button", { name: "Decline request" }).click();
  await expect(page.getByText("Write the reason. The client reads it on the order.")).toBeVisible(slow);
  await page.getByLabel("Or decline, with a reason").fill("The custom MRM list needs a method we cannot run before March. Write to us and we will plan it.");
  await page.getByRole("button", { name: "Decline request" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/pipeline\\?declined=${code}$`), slow);
  await expect(page.getByRole("status").filter({ hasText: `Request ${code} declined.` })).toBeVisible(slow);
  await expect(page.getByRole("article", { name: code })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Client requests" })).toHaveCount(0);

  await asClient(page);
  const row = page.getByRole("region", { name: "Orders" }).getByRole("listitem").filter({ hasText: code });
  await expect(row).toContainText("Declined by the lab");
  await row.getByRole("link", { name: code }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Declined by the lab" })).toBeVisible(slow);
  await expect(page.getByText(/cannot run before March/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Order progress" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request another order →" })).toBeVisible();
  await both(page, "client-order-declined");
});
