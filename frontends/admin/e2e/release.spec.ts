import { expect, test } from "@playwright/test";

// The happy path of the release side, in demo mode: enter the demo as lab staff, build a dataset for an order
// at Processed, sign as two different demo people, release, see the Team project id, and find the order in the
// pipeline's Released list. Open in Nexo (<NEXT_PUBLIC_NEXO_URL>/?dataset=<id>, set in playwright.config.ts) appears
// on the released, current version (release page, Datasets, order detail) and disappears once it is withdrawn.
// Dev-server compiles happen on first visit, so the route-change waits are generous.
const slow = { timeout: 60_000 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("build a dataset for an order at Processed, sign as two demo people, release, see the Team project and the order at Released", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);

  await page.goto("/admin/release");
  await expect(page.getByRole("heading", { level: 1, name: "Release" })).toBeVisible(slow);
  await page.getByRole("row", { name: /ORD048/ }).getByRole("button", { name: "Build dataset v1" }).click();
  await expect(page).toHaveURL(/\/admin\/release\/[0-9a-f-]{36}\?built=1$/, slow);
  await expect(page.getByRole("heading", { level: 1, name: "ORD048 · Dataset v1" })).toBeVisible(slow);
  const datasetId = new URL(page.url()).pathname.split("/").at(-1)!;
  const nexoHref = `${process.env.NEXT_PUBLIC_NEXO_URL!.replace(/\/+$/, "")}/?dataset=${datasetId}`;
  await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveCount(0);
  const files = page.getByRole("table", { name: "Files of this version" });
  await expect(files.getByRole("row")).toHaveCount(4);
  await expect(files.getByText("Abundance, Metadata", { exact: true })).toBeVisible();
  await expect(files.getByText("Internal_Standards, QC_Injections, Provenance", { exact: true })).toBeVisible();
  await expect(files.getByText(/^[0-9a-f]{64}$/)).toHaveCount(3);
  await expect(page.getByText("0 of 2 required signatures")).toBeVisible();
  // The action comes first: the strip says where the version is, the "Your turn" card holds the one action.
  await expect(page.getByRole("list", { name: "Release progress" }).getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");
  const turn = page.getByRole("region", { name: /^Your turn/ });
  await expect(turn.getByRole("heading", { name: "Sign this version" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Release dataset" })).toHaveCount(0);

  // Form controls by role and accessible name: a <label> wrapping a <select> also carries the options' text.
  await page.getByRole("combobox", { name: /^Sign as/ }).selectOption({ label: "Demo Reviewer A · Admin" });
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("reviewed");
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Reviewed the synthetic export.");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page).toHaveURL(/\?signed=1$/, slow);
  await expect(page.getByText("1 of 2 required signatures")).toBeVisible(slow);
  await expect(page.getByRole("list", { name: "Signatures" })).toContainText("Demo Reviewer A · Reviewed · Reviewed the synthetic export.");
  await expect(page.getByRole("button", { name: "Release dataset" })).toHaveCount(0);

  await page.getByRole("combobox", { name: /^Sign as/ }).selectOption({ label: "Demo Reviewer B · Admin" });
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("approved");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page.getByText("2 of 2 required signatures")).toBeVisible(slow);
  await expect(page.getByRole("list", { name: "Signatures" })).toContainText("Demo Reviewer B · Approved");
  await expect(turn.getByRole("heading", { name: "Release this version" })).toBeVisible();
  await expect(turn.getByRole("button", { name: "Release dataset" })).toBeEnabled();

  await page.getByRole("combobox", { name: /^Release as/ }).selectOption({ label: "Demo Reviewer B · Admin" });
  await page.getByRole("button", { name: "Release dataset" }).click();
  await expect(page).toHaveURL(/\?released=1$/, slow);
  await expect(page.getByRole("status")).toContainText("Dataset v1 released. ORD048 is now Released", slow);
  const project = page.getByRole("region", { name: "Team project" });
  await expect(project).toContainText("ORD048 Example processing review");
  await expect(project.getByText(UUID)).toBeVisible();
  await expect(project.getByRole("link", { name: "Open in Nexo" })).toHaveAttribute("href", nexoHref);
  await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();

  await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByRole("region", { name: "Released", exact: true }).getByRole("link", { name: "ORD048" })).toBeVisible(slow);
  await expect(page.getByRole("region", { name: "Processed", exact: true }).getByRole("article", { name: "ORD048" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Datasets" }).click();
  await expect(page.getByRole("table", { name: "Dataset versions" })).toContainText("ORD048", slow);
  await expect(page.getByRole("table", { name: "Dataset versions" })).toContainText("Released");
  await expect(page.getByRole("row", { name: /ORD048/ }).getByRole("link", { name: "Open in Nexo" })).toHaveAttribute("href", nexoHref);

  await page.goto("/admin/orders/ORD048");
  await expect(page.getByRole("heading", { level: 2, name: "Release complete" })).toBeVisible(slow);
  await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveAttribute("href", nexoHref);

  // Withdrawn: no version is current, so no link anywhere.
  await page.goto(`/admin/release/${datasetId}`);
  await page.getByRole("textbox", { name: "Reason" }).fill("Synthetic: wrong metadata.");
  await page.getByRole("button", { name: "Withdraw" }).click();
  await expect(page).toHaveURL(/\?withdrawn=1$/, slow);
  await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveCount(0);
  await page.goto("/admin/orders/ORD048");
  await expect(page.getByRole("heading", { level: 2, name: "Released, then withdrawn" })).toBeVisible(slow);
  await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveCount(0);
});
