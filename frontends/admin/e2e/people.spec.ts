import { expect, test } from "@playwright/test";

// Round 2 demo happy path: the Owner invites a client member and copies the link; the invitee opens it, sets a
// password and sees "Sign in →"; the new person is listed in People. Demo mode: a random token, no account, no key.
const slow = { timeout: 60_000 };

test("invite a client member, accept with a password and find them in People", async ({ page, context }) => {
  test.setTimeout(240_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/admin/people");
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible(slow);

  const invite = page.getByRole("region", { name: "Invite", exact: true });
  await invite.getByLabel("Email", { exact: true }).fill("synthetic.invitee@example.test");
  await invite.getByLabel("Role", { exact: true }).selectOption("client:requester");
  await invite.getByLabel("Client", { exact: true }).selectOption({ label: "Example Cedar" });
  await invite.getByLabel("Act as (demo)").selectOption("example-owner");
  await invite.getByRole("button", { name: "Send invitation" }).click();

  const notice = page.getByRole("status").filter({ hasText: "Invitation link for synthetic.invitee@example.test" });
  await expect(notice).toBeVisible(slow);
  await notice.getByRole("button", { name: "Copy link" }).click();
  await expect(notice.getByRole("button", { name: "Copied" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/admin\/invite\/[0-9a-f]{64}$/);
  await expect(notice.getByLabel("Invitation link")).toHaveValue(link);
  const pending = page.getByRole("table", { name: "Pending invitations" });
  await expect(pending.getByRole("row").filter({ hasText: "synthetic.invitee@example.test" })).toContainText("Requester at Example Cedar", slow);

  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Join as Requester at Example Cedar." })).toBeVisible(slow);
  await page.getByLabel("Password", { exact: true }).fill("synthetic passphrase 42");
  await page.getByLabel("Repeat password", { exact: true }).fill("synthetic passphrase 42");
  await page.getByRole("button", { name: "Set password and join" }).click();
  await expect(page.getByText("Your account is ready.")).toBeVisible(slow);
  await expect(page.getByRole("link", { name: "Sign in →" })).toHaveAttribute("href", "/admin/sign-in");

  await page.goto("/admin/people");
  const row = page.getByRole("table", { name: "People" }).getByRole("row").filter({ hasText: "synthetic.invitee@example.test" });
  await expect(row).toContainText("Requester", slow);
  await expect(row).toContainText("Example Cedar");
  await expect(page.getByRole("table", { name: "Pending invitations" })).toHaveCount(0);

  // The link works once.
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "This invitation link is not valid." })).toBeVisible(slow);
});
