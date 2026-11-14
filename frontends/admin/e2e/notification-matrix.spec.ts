import { expect, test, type Page } from "@playwright/test";

// The Notifications matrix (0036) in demo mode: who hears about what, by email. The example workspace's lab view
// edits it (in this browser only): a check mark, the lab staff of a row, the results check's delay. A recorded
// shipment then writes skipped rows to the demo send log for the people the row names. Fits a 390 px phone.
// SHOT_DIR (optional): where to save the desktop capture used for the prototype side-by-side.
const slow = { timeout: 60_000 };
const desktop = { width: 1600, height: 900 };
const phone = { width: 390, height: 844 };
const matrix = (page: Page) => page.getByRole("table", { name: "Who hears about what, by email" });
const row = (page: Page, kind: string) => matrix(page).locator(`tr[data-kind="${kind}"]`);
// What each cell shows: its text without the screen-reader words and the closed editors.
const cells = async (page: Page) => matrix(page).locator("tbody tr").evaluateAll(rows => rows.map(tr => [...tr.querySelectorAll("th, td")].map(cell => {
  const copy = cell.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".sr-only, details form").forEach(node => node.remove());
  return copy.textContent!.replace(/\s+/g, " ").trim();
})));

test("the lab edits who hears about what; a shipment emails the people its row names", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(desktop);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  await page.goto("/admin/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible(slow);
  await expect(page.getByText("Who hears about what, by email.")).toBeVisible();
  await expect(matrix(page).getByRole("columnheader")).toHaveText(["Event", "Lab staff", "Client admin", "Requester"]);
  expect((await cells(page)).slice(0, 5)).toEqual([
    ["Shipment received", "Admin", "✓", "✓"],
    ["Gate failed", "owner of the step", "—", "—"],
    ["Batch acquired", "Operator", "—", "✓"],
    ["No results TXT 3 days after acquisition", "Operator, Admin", "—", "—"],
    ["Dataset released", "Operator", "✓", "✓"],
  ]);
  await expect(page.getByText("Emails go out only for these events; nothing is sent without one.")).toBeVisible();
  if (process.env.SHOT_DIR) {
    await page.locator(".page-heading").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.SHOT_DIR}/built-notifications.png`, fullPage: false });
  }

  // A check mark: the requester no longer hears about a shipment.
  await row(page, "shipment_received").getByTestId("shipment_received-requester").click();
  await expect(page.getByRole("status").filter({ hasText: "Shipment received: saved." })).toBeVisible(slow);
  await expect(row(page, "shipment_received").getByTestId("shipment_received-requester")).toHaveAttribute("aria-pressed", "false");

  // The lab staff of a row: Admins hear about an acquired batch too.
  await row(page, "batch_acquired").getByTestId("batch_acquired-lab").click();
  await row(page, "batch_acquired").getByRole("checkbox", { name: "Admin" }).check();
  await row(page, "batch_acquired").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Batch acquired: saved." })).toBeVisible(slow);
  await expect(row(page, "batch_acquired").getByTestId("batch_acquired-lab")).toContainText("Operator, Admin");

  // The results check's delay.
  await page.getByTestId("results_missing-days").click();
  const delay = row(page, "results_missing").getByRole("form", { name: "Days after acquisition", exact: true });
  await delay.getByRole("spinbutton", { name: "Days after acquisition" }).fill("5");
  await delay.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "No results TXT 5 days after acquisition: saved." })).toBeVisible(slow);
  expect((await cells(page))[3][0]).toBe("No results TXT 5 days after acquisition");
  await expect(delay).toBeHidden();

  await page.setViewportSize(phone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.setViewportSize(desktop);

  // A shipment arrives thawed: "Shipment received" for the lab's Admins and the client's admins (the requester cell
  // is off now), and "Gate failed" for the owner of the step (who recorded it). The demo sends nothing: rows skipped.
  await page.goto("/admin/receive-shipment?order=ORD042");
  await page.getByLabel("Carrier").fill("FedEx");
  await page.getByRole("radio", { name: /^Thawed/ }).check();
  await page.getByLabel("Boxes").fill("1");
  await page.getByRole("button", { name: "Record arrival" }).click();
  await expect(page).toHaveURL(/\/admin\/sample-registry\?order=ORD042&received=/, slow);
  await page.goto("/admin/notifications");
  const log = page.getByRole("table", { name: "Recent sends" }).getByRole("row");
  await expect(log.filter({ hasText: "A shipment is received" }).first()).toBeVisible(slow);
  await expect(log.filter({ hasText: "A shipment is received" }).first()).toContainText("Example workspace: no email is sent");
  await expect(log.filter({ hasText: "A gate fails" })).toHaveCount(1);
});
