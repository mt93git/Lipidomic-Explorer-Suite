import { expect, test, type Page } from "@playwright/test";

// Notifications (0028; switches for every event since 0036) in demo mode, in one browser (one demo store). The lab view and the client view each turn their
// own email switches off and on; the four events write rows to the demo send log (the demo never sends: every row is
// skipped, the Operator's own turned-off kind first), which the lab view reads. Both views fit a 390 px phone.
const slow = { timeout: 60_000 };
const desktop = { width: 1280, height: 900 };
const phone = { width: 390, height: 844 };
const nav = (page: Page) => page.getByRole("navigation", { name: "Admin navigation" });

async function fitsPhone(page: Page) {
  await page.setViewportSize(phone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.setViewportSize(desktop);
}
async function enterLab(page: Page) {
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
}
async function openNotifications(page: Page) {
  await nav(page).getByRole("link", { name: "Notifications" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible(slow);
}
const switchOf = (page: Page, label: string) => page.getByRole("form", { name: label });
const logRows = (page: Page) => page.getByRole("table", { name: "Recent sends" }).getByRole("row");

test("the lab's switches and send log; a client's switches; every event leaves skipped rows", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(desktop);
  await enterLab(page);
  await openNotifications(page);
  // 0036: a switch per event (the matrix decides who is emailed; each person may still turn one off).
  await expect(page.getByRole("region", { name: "Lab work" }).getByRole("form")).toHaveCount(8);
  const access = switchOf(page, "Someone requests access");
  await expect(access.getByText("On", { exact: true })).toBeVisible();
  await expect(switchOf(page, "A client requests an order").getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent sends" }).getByText("No emails yet.")).toBeVisible();

  // The Operator turns access requests off for themselves.
  await access.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Someone requests access: off." })).toBeVisible(slow);
  await expect(switchOf(page, "Someone requests access").getByText("Off", { exact: true })).toBeVisible();
  await fitsPhone(page);

  // Someone asks for access on the public page: one row per lab Owner, Admin and Operator.
  await page.goto("/admin/request-access");
  await page.getByLabel("Full name").fill("Noa Example");
  await page.getByLabel("Work email").fill("noa@alder.example.test");
  await page.getByLabel("Organisation or lab").fill("Example Alder");
  await page.getByLabel("Type").selectOption("pi_lab");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Request received." })).toBeVisible(slow);
  await page.goto("/admin/notifications");
  await expect(logRows(page)).toHaveCount(5, slow); // header + 4 lab people
  const operatorRow = logRows(page).filter({ hasText: "staff@example.test" });
  await expect(operatorRow).toContainText("Someone requests access");
  await expect(operatorRow).toContainText("Skipped");
  await expect(operatorRow).toContainText("Turned off by the recipient");
  await expect(logRows(page).filter({ hasText: "owner@example.test" })).toContainText("Example workspace: no email is sent");
  await fitsPhone(page);

  // The example client (Requester at Example Cedar) has the client kinds, no log, and a Notifications item.
  await page.getByRole("form", { name: "Example view" }).getByRole("button", { name: "Client" }).click();
  await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
  await page.getByRole("button", { name: /Example Cedar/ }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
  await openNotifications(page);
  await expect(page.getByRole("region", { name: "Your orders and datasets" }).getByRole("form")).toHaveCount(7);
  await expect(page.getByRole("table", { name: "Who hears about what, by email" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Recent sends" })).toHaveCount(0);
  await switchOf(page, "A dataset is released").getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("status").filter({ hasText: "A dataset is released: off." })).toBeVisible(slow);
  await switchOf(page, "A dataset is released").getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("status").filter({ hasText: "A dataset is released: on." })).toBeVisible(slow);
  await expect(switchOf(page, "My order request is answered").getByText("On", { exact: true })).toBeVisible();
  await fitsPhone(page);

  // The client requests an order (the lab is told), the lab accepts it (the client is told).
  await page.goto("/admin/client/request-order");
  await page.getByLabel("Title", { exact: true }).fill("Serum lipidome · pilot");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home\?requested=ORD\d{3,}$/, slow);
  const code = new URL(page.url()).searchParams.get("requested")!;
  await page.getByRole("form", { name: "Example view" }).getByRole("button", { name: "Lab staff" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  await page.goto(`/admin/orders/${code}`);
  await page.getByRole("button", { name: "Accept request" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Request accepted." })).toBeVisible(slow);

  await page.goto("/admin/notifications");
  const answered = logRows(page).filter({ hasText: "My order request is answered" });
  await expect(answered).toHaveCount(1, slow);
  await expect(answered).toContainText("rowan@cedar.example.test");
  await expect(answered).toContainText(code);
  const requested = logRows(page).filter({ hasText: "A client requests an order" });
  await expect(requested).toHaveCount(4);
  await expect(requested.filter({ hasText: "staff@example.test" })).toContainText("Example workspace: no email is sent");
  await fitsPhone(page);
});
