import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

// Forgotten password (decision 4) in demo mode: Sign in → Forgot your password? → the neutral sent message and the
// demo's link (no email is sent) → a new password → Sign in with the notice; the same link a second time is expired.
// ADMIN_E2E_SCREENSHOTS=1 also saves the screens at 1440 and 390 px to docs/admin/password-reset/ (synthetic data).
const slow = { timeout: 60_000 };
const shots = process.env.ADMIN_E2E_SCREENSHOTS === "1";
const sizes = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } } as const;
const password = "example password 2026";

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.addStyleTag({ content: "nextjs-portal, .skip-link { display: none !important; }" });
  for (const [width, size] of Object.entries(sizes)) {
    await page.setViewportSize(size);
    await page.screenshot({ path: resolve(`../../docs/admin/password-reset/${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize(sizes[1440]);
}

test("a person resets a forgotten password with a single-use link", async ({ page }) => {
  await page.setViewportSize(sizes[1440]);
  await page.goto("/admin/sign-in");
  const forgot = page.getByRole("link", { name: "Forgot your password?" });
  await expect(forgot).toBeVisible(slow);
  await shot(page, "01-sign-in-link");
  await forgot.click();

  await expect(page.getByRole("heading", { level: 1, name: "Forgot your password?" })).toBeVisible(slow);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter a valid email address, like name@example.org.")).toBeVisible(slow);
  await page.getByLabel("Email").fill("kai@cedar.example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check your email." })).toBeVisible(slow);
  await expect(page.locator("main").getByRole("status")).toHaveText("If that email has an account, a reset link is on its way. It works once, for one hour.");
  await shot(page, "02-forgot-sent");

  const link = page.getByRole("link", { name: "Open the reset link →" });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/admin\/reset-password\?token_hash=example-[0-9a-f-]{36}&type=recovery$/);
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose a new password." })).toBeVisible(slow);
  await shot(page, "03-reset-form");

  // A typo does not use up the link.
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Repeat new password").fill(`${password}!`);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("The two passwords do not match.", slow);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Repeat new password").fill(password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/admin\/sign-in\?reset=done$/, slow);
  await expect(page.locator("main").getByRole("status")).toHaveText("Password changed. Sign in with your new password.");

  // The same link again: used, so expired, with the way back.
  await page.goto(href as string);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Repeat new password").fill(password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "This reset link no longer works." })).toBeVisible(slow);
  await shot(page, "04-reset-expired");
  await page.getByRole("link", { name: "Ask for a new link" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Forgot your password?" })).toBeVisible(slow);
});
