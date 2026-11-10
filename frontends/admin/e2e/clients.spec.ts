import { expect, test } from "@playwright/test";

// Round 1 demo happy path: Owner creates, Admin edits billing, list reflects the change.
test("create a client, edit its billing method and find it in the list", async ({ page }) => {
  const slow = { timeout: 60_000 };
  await page.goto("/admin/clients");
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible(slow);
  const form = page.getByRole("region", { name: "New client", exact: true });
  await form.getByLabel("Client name", { exact: true }).fill("Synthetic Wave 3 Lab");
  await form.getByLabel("Kind", { exact: true }).selectOption("pi_lab");
  await form.getByLabel("Billing method", { exact: true }).selectOption("charge_code");
  await form.getByLabel("Act as (demo)").selectOption("example-owner");
  await form.getByRole("button", { name: "Create client", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Wave 3 Lab", exact: true })).toBeVisible(slow);
  const details = page.getByRole("region", { name: "Edit client", exact: true });
  await details.getByLabel("Billing method", { exact: true }).selectOption("po");
  await details.getByLabel("Act as (demo)").selectOption("example-reviewer-a");
  await details.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Client details saved", slow);
  await page.getByRole("link", { name: "Back to clients", exact: true }).click();
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Synthetic Wave 3 Lab", exact: true }) });
  await expect(row).toContainText("Purchase order", slow);
  await expect(row.getByRole("cell", { name: "0", exact: true })).toHaveCount(2);
});
