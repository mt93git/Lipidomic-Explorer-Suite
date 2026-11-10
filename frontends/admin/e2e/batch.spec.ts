import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The happy path of wave 3's batch screens, in demo mode: register three samples of an order (the demo starts with no
// registered samples), pick them in the batch builder, preview the sequence and plate map, save the planned batch,
// download its sequence CSV, mark it exported, mark it acquired, and find the order at Acquired on the pipeline.
// Dev-server compiles happen on first visit, so the route-change waits are generous.
const slow = { timeout: 60_000 };
const metadataSheet = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm",
  "Ctrl_1\tControl\tWildType\t1\tP01\t0h",
  "Ctrl_2\tControl\tWildType\t2\tP02\t0h",
  "Trt_1\tTreated\tWildType\t1\tP03\t24h",
].join("\n");

test("pick the samples of a Registered order, preview, save, download, mark exported and acquired", async ({ page }) => {
  test.setTimeout(300_000);
  const nav = page.getByRole("navigation", { name: "Admin navigation" });

  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);

  // Arrange: ORD042 arrives and its three samples are registered, so the order reads Registered.
  await page.goto("/admin/receive-shipment?order=ORD042");
  await page.getByLabel("Carrier").fill("FedEx");
  await page.getByRole("radio", { name: /^Intact and cold/ }).check();
  await page.getByLabel("Boxes").fill("1");
  await page.getByRole("button", { name: "Record arrival" }).click();
  await expect(page).toHaveURL(/\/admin\/sample-registry\?order=ORD042&received=/, slow);
  await page.getByLabel("Paste from Excel").fill(metadataSheet);
  await page.getByRole("button", { name: "Add rows" }).click();
  await page.getByRole("button", { name: "Register 3 samples" }).click();
  await expect(page).toHaveURL(/\/admin\/sample-registry\?order=ORD042&saved=3$/, slow);

  // Builder: ORD042's samples are listed; select them all through the order link, set the rules and preview.
  await page.goto("/admin/batch-builder");
  await expect(page.getByRole("heading", { level: 1, name: "Batch builder" })).toBeVisible(slow);
  await page.getByRole("link", { name: "Select all of ORD042" }).click();
  for (const name of ["Ctrl_1", "Ctrl_2", "Trt_1"]) await expect(page.getByRole("checkbox", { name: new RegExp(`^${name}\\b`) })).toBeChecked();
  await page.getByLabel("Panel", { exact: true }).selectOption({ label: "Panel B · sphingolipids" });
  await page.getByLabel("Blanks at start").fill("1");
  await page.getByLabel("Pooled QC every").fill("0");
  await page.getByLabel("Seed").fill("e2e-seed");
  await page.getByLabel("Minutes per injection").fill("10");
  await page.getByRole("button", { name: "Preview sequence" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "5 injections · 50 min" })).toBeVisible(slow);
  const preview = page.getByRole("table", { name: "Sequence preview" });
  await expect(preview.getByRole("row")).toHaveCount(6); // header, 1 blank, 3 samples, 1 QC at the end
  await expect(preview.getByRole("cell", { name: "Blank_001", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "QC_001", exact: true })).toBeVisible();
  // Unknown injections are named by the sample code, never by the client's FullName (which is only shown beside it).
  for (const code of ["ORD042-S001", "ORD042-S002", "ORD042-S003"]) await expect(preview.getByRole("cell", { name: code, exact: true })).toBeVisible();
  for (const name of ["Ctrl_1", "Ctrl_2", "Trt_1"]) await expect(preview.getByRole("cell", { name: new RegExp(`^${name} · `) })).toBeVisible();
  await expect(page.getByRole("table", { name: "Plate 1 map" }).getByRole("cell", { name: /^A1: Blank_001, injection 1$/ })).toBeVisible();

  // Save: the batch page opens as planned, with the orders In batch.
  await page.getByRole("button", { name: "Save planned batch" }).click();
  await expect(page).toHaveURL(/\/admin\/batch-run\/B\d{4}-\d{3,}\?saved=1$/, slow);
  const batch = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByRole("status").filter({ hasText: `Batch ${batch} saved as planned.` })).toBeVisible(slow);
  await expect(page.getByRole("button", { name: "Mark acquired" })).toBeDisabled();

  // Download the sequence CSV (the generic layout) and check what the instrument operator would open.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download sequence CSV" }).click()]);
  expect(download.suggestedFilename()).toBe(`${batch}-sequence.csv`);
  const lines = readFileSync((await download.path())!, "utf8").split("\r\n");
  expect(lines[0]).toBe("seq,sample_type,sample_name,client_id,aliquot_id,plate,vial");
  expect(lines).toHaveLength(7); // header, five injections, trailing CRLF
  expect(lines.filter(line => /,Unknown,ORD042-S00[123],/.test(line))).toHaveLength(3);
  expect(lines.join("\n")).not.toMatch(/Ctrl_|Trt_/); // no client-written text in the sequence
  expect(lines[1]).toMatch(/^1,Blank,Blank_001,,,Plate 1,A1$/);

  // The bench sheet is where FullName lives, next to the lab-generated name.
  const [sheet] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download bench sheet CSV" }).click()]);
  expect(sheet.suggestedFilename()).toBe(`${batch}-bench-sheet.csv`);
  const bench = readFileSync((await sheet.path())!, "utf8").split("\r\n");
  expect(bench[0]).toBe("plate,vial,seq,sample_type,sample_name,FullName,client_id,aliquot_id");
  expect(bench.filter(line => /,Unknown,ORD042-S00\d,(Ctrl_1|Ctrl_2|Trt_1),/.test(line))).toHaveLength(3);

  // Mark exported: the version is frozen with its hash and the button goes away.
  await page.getByRole("button", { name: "Mark exported" }).click();
  await expect(page).toHaveURL(/\?exported=1$/, slow);
  await expect(page.getByRole("status").filter({ hasText: "Sequence exported." })).toBeVisible(slow);
  await expect(page.getByRole("button", { name: "Mark exported" })).toHaveCount(0);

  // Mark acquired: the orders reach Acquired.
  await page.getByRole("button", { name: "Mark acquired" }).click();
  await expect(page).toHaveURL(/\?acquired=1$/, slow);
  await expect(page.getByRole("status").filter({ hasText: "Batch acquired." })).toBeVisible(slow);

  await nav.getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByRole("region", { name: "Acquired", exact: true }).getByRole("article", { name: "ORD042" })).toBeVisible(slow);
  await expect(page.getByRole("region", { name: "Registered", exact: true }).getByRole("article", { name: "ORD042" })).toHaveCount(0);
});
