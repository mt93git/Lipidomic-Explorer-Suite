import { expect, test } from "@playwright/test";

// Account emails (0029) in demo mode, which sends nothing: People shows who has not signed in yet (Last active: never)
// and offers a lab Owner or Admin "Remind" (the activation email, a19); the result (here: not emailed, the example workspace) stays under the
// button and lands in the Notifications send log; an invitation says whether it was emailed. The /activate page (the
// activation email's link) is the reset page's mechanism with welcome words. Everything fits a 390 px phone.
const slow = { timeout: 60_000 };
const phone = { width: 390, height: 844 };
const password = "example password 2026";

test("People: last active, Remind by an Owner (not an Operator), the invitation's email note, the log", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/admin/people");
  const people = page.getByRole("table", { name: "People" });
  await expect(people).toBeVisible(slow);
  const requester = people.getByRole("row").filter({ hasText: "Demo Requester" });
  await expect(requester).toContainText("never");
  await expect(people.getByRole("row").filter({ hasText: "Demo Client Admin" })).not.toContainText("never");
  await expect(people.getByRole("row").filter({ hasText: "Demo Client Admin" }).getByRole("button", { name: /^Remind/ })).toHaveCount(0);

  const activation = requester.getByRole("form", { name: "Activation email for Demo Requester" });
  await activation.getByLabel("Act as (demo)").selectOption("example-staff"); // the Operator
  await activation.getByRole("button", { name: "Remind Demo Requester" }).click();
  await expect(activation.getByRole("alert")).toHaveText("Only a lab Owner or Admin can send activation emails.", slow);
  await activation.getByLabel("Act as (demo)").selectOption("example-owner");
  await activation.getByRole("button", { name: "Remind Demo Requester" }).click();
  await expect(activation.getByRole("status")).toHaveText("Not emailed: the example workspace sends no email.", slow);

  const invite = page.getByRole("region", { name: "Invite", exact: true });
  await invite.getByLabel("Email", { exact: true }).fill("synthetic.activation@example.test");
  await invite.getByLabel("Role", { exact: true }).selectOption("client:viewer");
  await invite.getByLabel("Act as (demo)").selectOption("example-owner");
  await invite.getByRole("button", { name: "Send invitation" }).click();
  const notice = page.getByRole("status").filter({ hasText: "Invitation link for synthetic.activation@example.test" });
  await expect(notice).toContainText("Not emailed: the example workspace sends no email. Copy it now and send it yourself", slow);

  await page.setViewportSize(phone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "/admin/people").toBeLessThanOrEqual(390);

  await page.goto("/admin/notifications");
  const log = page.getByRole("table", { name: "Recent sends" });
  await expect(log.getByRole("row").filter({ hasText: "Activation email" })).toContainText("requester@example.test", slow);
  await expect(log.getByRole("row").filter({ hasText: "Activation email" })).toContainText("Skipped");
  await expect(log.getByRole("row").filter({ hasText: "Invitation" })).toContainText("synthetic.activation@example.test");
});

test("Activate: the welcome page sets a password with the recovery link and sign-in says what comes next; fits 390 px", async ({ page }) => {
  // The demo's single-use recovery link (from Forgot password), opened on /activate as the activation email would.
  await page.goto("/admin/forgot-password");
  await page.getByLabel("Email").fill("requester@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  const href = await page.getByRole("link", { name: "Open the reset link →" }).getAttribute("href", slow);
  const activate = (href as string).replace("/reset-password?", "/activate?");

  await page.setViewportSize(phone);
  await page.goto(activate);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Lipidomics · Choose your password" })).toBeVisible(slow);
  await expect(page.getByLabel("Two-step code")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "/admin/activate").toBeLessThanOrEqual(390);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Repeat password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Choose password" }).click();
  await expect(page).toHaveURL(/\/admin\/sign-in\?activated=done$/, slow);
  await expect(page.locator("main").getByRole("status")).toContainText("Password chosen. Sign in with your email and the new password.");

  await page.goto(activate);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Repeat password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Choose password" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "This activation link no longer works." })).toBeVisible(slow);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "/admin/activate expired").toBeLessThanOrEqual(390);
});
