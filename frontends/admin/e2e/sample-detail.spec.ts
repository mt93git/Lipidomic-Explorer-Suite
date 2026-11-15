import { expect, test } from "@playwright/test";

// A registered sample's detail page in demo mode: register two samples of ORD043 (already Received), open one from the
// registry's list of saved samples, and see its identity and its history. The demo has no aliquots or injections, so
// those sections say so. Dev-server compiles happen on first visit, so the route-change waits are generous.
const slow = { timeout: 60_000 };
const metadataSheet = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm\tClient sample ID\tMatrix\tVolume",
  "Ctrl_1\tControl\tWildType\t1\tP01\t0h\tTUBE-17\tPlasma\t50",
  "Trt_1\tTreated\tWildType\t1\tP03\t24h\tTUBE-18\tPlasma\t45",
].join("\n");

test("open a sample from the registry and see its identity and its history", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);

  await page.goto("/admin/sample-registry?order=ORD043");
  await page.getByLabel("Paste from Excel").fill(metadataSheet);
  await page.getByRole("button", { name: "Add rows" }).click();
  await page.getByRole("button", { name: "Save 2 valid rows" }).click();
  await expect(page).toHaveURL(/\/admin\/sample-registry\?order=ORD043&saved=2$/, slow);

  await page.getByRole("table", { name: "Registered samples" }).getByRole("link", { name: "ORD043-S001" }).click();
  await expect(page).toHaveURL(/\/admin\/samples\/ORD043-S001$/, slow);
  await expect(page.getByRole("heading", { level: 1, name: "ORD043-S001" })).toBeVisible(slow);

  const identity = page.getByRole("region", { name: "Sample", exact: true });
  for (const [label, value] of [["FullName", "Ctrl_1"], ["Group1Term", "Control"], ["Client sample ID", "TUBE-17"], ["Matrix", "Plasma"], ["Volume (µL)", "50"]]) {
    await expect(identity.locator(".fact-row").filter({ has: page.getByText(label, { exact: true }) })).toContainText(value);
  }
  await expect(page.getByRole("region", { name: "Order", exact: true }).getByRole("link", { name: "ORD043" })).toHaveAttribute("href", /\/orders\/ORD043$/);
  await expect(page.getByText("No shipment is linked to this sample.")).toBeVisible();
  await expect(page.getByText("No aliquots yet.")).toBeVisible();
  await expect(page.getByText("Not in any batch yet.")).toBeVisible();

  const history = page.getByRole("list", { name: "Sample history" });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("Sample ORD043-S001 registered");
  await expect(history).toContainText("Demo Operator");

  // A code that does not exist is a plain not-found page.
  await page.goto("/admin/samples/ORD043-S099");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible(slow);
});
