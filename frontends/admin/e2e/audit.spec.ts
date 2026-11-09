import { expect, test } from "@playwright/test";

// The audit log in demo mode: the demo release policy is there from the start; a release done through the screens
// appears with its signer, can be found by entity and order code (filters in the URL), and expands to the changed
// fields only. A client view gets the staff screens' refusal. Dev-server compiles happen on first visit.
const slow = { timeout: 60_000 };

test("the audit log shows a release by its signer, filtered by entity and order, with the changed fields", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);

  await page.goto("/admin/audit-log");
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible(slow);
  const events = page.getByRole("table", { name: "Audit events" });
  const policy = events.getByRole("row").filter({ hasText: /Release policy changed: 2 of Demo Reviewer A, Demo Reviewer B/ });
  await expect(policy).toContainText("Demo Lab Owner");

  // Release ORD048 the way release.spec.ts does: build, two demo signers, release.
  await page.goto("/admin/release");
  await page.getByRole("row", { name: /ORD048/ }).getByRole("button", { name: "Build dataset v1" }).click();
  await expect(page).toHaveURL(/\/admin\/release\/[0-9a-f-]{36}\?built=1$/, slow);
  for (const [person, role] of [["Demo Reviewer A", "reviewed"], ["Demo Reviewer B", "approved"]]) {
    await page.getByRole("combobox", { name: /^Sign as/ }).selectOption({ label: `${person} · Admin` });
    await page.getByRole("combobox", { name: "Role", exact: true }).selectOption(role);
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await expect(page.getByRole("list", { name: "Signatures" })).toContainText(person, slow);
  }
  await page.getByRole("combobox", { name: /^Release as/ }).selectOption({ label: "Demo Reviewer B · Admin" });
  await page.getByRole("button", { name: "Release dataset" }).click();
  await expect(page).toHaveURL(/\?released=1$/, slow);

  await page.goto("/admin/audit-log");
  await expect(events.getByRole("row").filter({ hasText: /Signature added to ORD048 v1 \(Approved\)/ })).toContainText("Demo Reviewer B", slow);
  await page.getByRole("combobox", { name: "Entity" }).selectOption({ label: "Dataset" });
  await page.getByRole("textbox", { name: "Order code" }).fill("ord048");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/\/admin\/audit-log\?entity=dataset&order=ORD048$/, slow);
  await expect(events.getByRole("row")).toHaveCount(3); // header, released, built
  const released = events.getByRole("row").filter({ hasText: /Dataset ORD048 v1 released/ });
  await expect(released).toContainText("Demo Reviewer B");
  await expect(events.getByRole("row").filter({ hasText: /Release policy/ })).toHaveCount(0);

  const changes = released.getByRole("group");
  await expect(changes.getByText("Status", { exact: true })).toBeHidden();
  await released.getByText("Dataset ORD048 v1 released").click();
  await expect(changes.getByText("Status", { exact: true })).toBeVisible();
  await expect(changes).toContainText("built → released");
  await expect(changes).not.toContainText("{");

  // Another order: nothing; the filters stay in the URL.
  await page.goto("/admin/audit-log?order=ORD041");
  await expect(page.getByText("No events match these filters.")).toBeVisible(slow);
  await expect(page.getByRole("textbox", { name: "Order code" })).toHaveValue("ORD041");

  // A client view gets the staff screens' refusal (sent to the client side).
  await page.context().addCookies([{ name: "le-admin-demo-view", value: "client", url: "http://127.0.0.1:3110/admin" }]);
  await page.goto("/admin/audit-log");
  await expect(page).toHaveURL(/\/admin\/(client\/home|choose-client)$/, slow);
});
