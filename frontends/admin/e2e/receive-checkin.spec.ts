import { expect, test, type Page } from "@playwright/test";

// Receive shipment tube by tube, in demo mode: ORD051 (Example Harbor, 36 tubes) already arrived. Scan the tubes,
// mark two hemolyzed, leave two missing, see an unknown label refused, see Confirm receipt refused without a note,
// confirm with the note, and read the note as the example client on their order. CHECKIN_SHOT=<file.png> saves the
// check-in screen just before confirming (the prototype comparison); nothing is written otherwise.
const slow = { timeout: 60_000 };
const code = (n: number) => `ORD051-S${String(n).padStart(3, "0")}`;
const NOTE = "S020 and S036 missing from box, courier contacted.";

async function scan(page: Page, label: string, condition = "intact") {
  const input = page.getByLabel("Scan or type the tube label");
  if (condition !== "intact") await page.getByRole("radio", { name: condition, exact: true }).check();
  await input.fill(label);
  await input.press("Enter");
}

test("check tubes in one by one, refuse unknown labels, confirm with a discrepancy note the client reads", async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);

  await page.goto("/admin/receive-shipment");
  await page.getByRole("list", { name: "Shipments waiting for the tube check-in" }).getByRole("link", { name: /ORD051/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Receive shipment · ORD051" })).toBeVisible(slow);
  await expect(page.locator(".page-heading p")).toContainText(/^Example Harbor · shipment 1 of 1 · arrived /);
  const tiles = page.getByRole("list", { name: "Shipment summary" });
  await expect(tiles.getByRole("listitem")).toHaveText(["36tubes expected", "0checked in", "0hemolyzed", "−80 °Cno box recorded yet"]);
  const table = page.getByRole("table", { name: "Tubes on the manifest" });
  await expect(table.getByText("missing", { exact: true })).toHaveCount(36);

  // An unknown label and a tube of another order are refused, with the reason.
  await scan(page, "ORD051-S099");
  await expect(page.locator("main").getByRole("alert")).toHaveText("Unknown tube label ORD051-S099: it is not on the manifest of ORD051.");
  await scan(page, "ORD044-S001");
  await expect(page.locator("main").getByRole("alert")).toHaveText("Tube ORD044-S001 belongs to order ORD044, not to ORD051.");

  // The first tube sets the box and position; the next position is filled in after each scan.
  await page.getByLabel("Box", { exact: true }).fill("B12");
  await page.getByLabel("Position", { exact: true }).fill("a1");
  for (let n = 1; n <= 35; n++) {
    if (n === 20) continue;
    await scan(page, n === 1 ? "syn-01-D0" : code(n), n === 10 || n === 34 ? "hemolyzed" : "intact");
    await expect(page.getByRole("status").filter({ hasText: "checked in." })).toHaveText(`${code(n)} checked in.`, slow);
    // Ready for the next scan: the label is empty and focused.
    await expect(page.getByLabel("Scan or type the tube label")).toBeFocused();
    await expect(page.getByLabel("Scan or type the tube label")).toHaveValue("");
  }
  await expect(page.getByLabel("Position", { exact: true })).toHaveValue("D8");
  await expect(tiles.getByRole("listitem")).toHaveText(["36tubes expected", "34checked in", "2hemolyzed", "−80 °Cstored in Box B12"]);
  const row = (n: number) => table.getByRole("row").filter({ hasText: code(n) });
  await expect(row(34)).toContainText("hemolyzed");
  await expect(row(35)).toContainText("B12 · D7");
  await expect(row(36)).toContainText("missing");
  await expect(row(20)).toContainText("missing");

  // Confirm receipt without a note is refused; the explanation names what differs.
  const note = page.getByRole("textbox", { name: "Discrepancy note" });
  await expect(note).toHaveAccessibleDescription("2 tubes listed on the manifest were not in the box; 2 hemolyzed on arrival. Receipt can be confirmed with a note; the client is told automatically.");
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("write a discrepancy note");
  await expect(note).toBeFocused();
  await note.fill(NOTE);
  await page.getByLabel("Scan or type the tube label").fill("ORD051-S037");
  if (process.env.CHECKIN_SHOT) {
    await table.evaluate(element => { const scroller = element.parentElement!; scroller.scrollTop = scroller.scrollHeight; });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: process.env.CHECKIN_SHOT });
  }
  await page.getByLabel("Scan or type the tube label").fill("");

  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page).toHaveURL(/\/admin\/receive-shipment\?order=ORD051&shipment=.+&confirmed=1$/, slow);
  await expect(page.getByRole("status").filter({ hasText: "Receipt confirmed." })).toContainText("34 tubes checked in, 2 missing, 2 damaged");
  await expect(page.getByLabel("Scan or type the tube label")).toHaveCount(0);

  // The order's history has the note; Print labels lists the manifest.
  await page.goto("/admin/orders/ORD051");
  await expect(page.locator("main")).toContainText(`Receipt confirmed · 2 missing, 2 damaged · note: ${NOTE}`, slow);
  await page.goto("/admin/receive-shipment/labels?order=ORD051");
  await expect(page.getByRole("list", { name: "Tube labels" }).getByRole("listitem")).toHaveCount(36, slow);
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();

  // The client is told: the note is on their order.
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter as an example client" }).click();
  await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
  await page.getByRole("button", { name: /Example Harbor/ }).click();
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
  await page.goto("/admin/orders/ORD051");
  const receipt = page.getByRole("region", { name: "Discrepancy on arrival" });
  await expect(receipt).toContainText("2 tubes on your manifest were not in the shipment", slow);
  await expect(receipt).toContainText(`Note from the lab. ${NOTE}`);
});
