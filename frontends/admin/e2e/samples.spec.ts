import { expect, test } from "@playwright/test";

// The happy path of wave 2's samples flow, in demo mode: sign in as demo lab staff, receive the shipment of an
// order at Request, register three samples by pasting the Metadata sheet, see their codes, and find the order
// in the Registered column. Dev-server compiles happen on first visit, so the route-change waits are generous.
const slow = { timeout: 60_000 };
const metadataSheet = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm",
  "Ctrl_1\tControl\tWildType\t1\tP01\t0h",
  "Ctrl_2\tControl\tWildType\t2\tP02\t0h",
  "Trt_1\tTreated\tWildType\t1\tP03\t24h",
].join("\n");

test("receive a shipment, register three samples by paste, see their codes and the order at Registered", async ({ page }) => {
  test.setTimeout(240_000);
  const nav = page.getByRole("navigation", { name: "Admin navigation" });

  // baseURL ends in /admin without a trailing slash, so a path starting with "/" must carry the basePath itself.
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  await expect(page.getByRole("region", { name: "Request", exact: true }).getByRole("article", { name: "ORD042" })).toBeVisible(slow);

  await nav.getByRole("link", { name: "Receive shipment" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Receive shipment" })).toBeVisible(slow);
  await page.getByLabel("Order", { exact: true }).selectOption({ label: "ORD042 · Example Cedar · Example lipid panel · feasibility" });
  await expect(page).toHaveURL(/\/receive-shipment\?order=ORD042$/, slow);
  await page.getByLabel("Carrier").fill("FedEx");
  await page.getByLabel("Tracking number").fill("7489 0000 0001");
  await page.getByRole("radio", { name: /^Intact and cold/ }).check();
  await page.getByLabel("Boxes").fill("1");
  await page.getByLabel("Notes").fill("Dry ice present on arrival.");
  await page.getByRole("button", { name: "Record arrival" }).click();

  await expect(page).toHaveURL(/\/admin\/sample-registry\?order=ORD042&received=/, slow);
  await expect(page.getByText(/Shipment recorded for ORD042 · FedEx 7489 0000 0001 · 1 box · intact and cold/)).toBeVisible(slow);

  await page.getByLabel("Paste from Excel").fill(metadataSheet);
  await page.getByRole("button", { name: "Add rows" }).click();
  const grid = page.getByRole("table", { name: "Samples to register" });
  await expect(grid.getByRole("row")).toHaveCount(4);
  await expect(page.getByLabel("Row 3 FullName")).toHaveValue("Trt_1");
  await page.getByRole("button", { name: "Register 3 samples" }).click();

  await expect(page).toHaveURL(/\/admin\/sample-registry\?order=ORD042&saved=3$/, slow);
  await expect(page.getByText(/3 samples registered\. ORD042 is now Registered/)).toBeVisible(slow);
  const registered = page.getByRole("table", { name: "Registered samples" });
  for (const code of ["ORD042-S001", "ORD042-S002", "ORD042-S003"]) await expect(registered.getByText(code, { exact: true })).toBeVisible();
  await expect(registered.getByRole("row")).toHaveCount(4);

  await nav.getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByRole("region", { name: "Registered", exact: true }).getByRole("article", { name: "ORD042" })).toBeVisible(slow);
  await expect(page.getByRole("region", { name: "Request", exact: true }).getByRole("article", { name: "ORD042" })).toHaveCount(0);
});
