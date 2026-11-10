import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

// Request access (F3) in demo mode, in one browser (one demo store, seeded with two waiting requests from Kai Sample
// and Robin Example): a person asks on the public form linked from Sign in, the lab sees the counter next to People,
// approves into a new client with the role it picks and gets the 7-day invitation link; another request is declined.
// ADMIN_E2E_SCREENSHOTS=1 also saves the screens to docs/admin/client-portal-f3/ (synthetic data).
const slow = { timeout: 60_000 };
const shots = process.env.ADMIN_E2E_SCREENSHOTS === "1";
const desktop = { width: 1280, height: 900 };
const phone = { width: 390, height: 844 };

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.addStyleTag({ content: "nextjs-portal, .skip-link { display: none !important; }" }); // the off-screen skip link shows in full-page captures
  await page.screenshot({ path: resolve(`../../docs/admin/client-portal-f3/${name}.png`), fullPage: true });
}
const nav = (page: Page) => page.getByRole("navigation", { name: "Admin navigation" });
async function enterLab(page: Page) {
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
}
async function openPeople(page: Page, waiting: number) {
  await expect(nav(page).getByRole("link", { name: `People ${waiting} access requests waiting` })).toBeVisible(slow);
  await nav(page).getByRole("link", { name: /^People/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible(slow);
  const section = page.getByRole("region", { name: "Access requests" });
  await expect(section.getByText(`${waiting} waiting`)).toBeVisible();
  return section;
}

test("request access from Sign in, then the lab approves into a new client with a chosen role and copies the link", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/admin/sign-in");
  await page.getByRole("link", { name: "Request access →" }).click();
  await expect(page).toHaveURL(/\/admin\/request-access$/, slow);
  await expect(page.getByRole("heading", { level: 1, name: "Request access." })).toBeVisible(slow);

  // Every problem named, nothing sent.
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "3 fields need attention." })).toBeVisible(slow);
  await page.goto("/admin/request-access");

  await page.getByLabel("Full name").fill("Ada Example");
  await page.getByLabel("Work email").fill("ada@birch.example.test");
  await page.getByLabel("Organisation or lab").fill("Example Birch");
  await page.getByLabel("Type").selectOption("company");
  await page.getByLabel("What would you like to measure?").fill("About 30 serum samples on the broad lipidome panel, from February.");
  await shot(page, "request-access-desktop");
  await page.setViewportSize(phone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await shot(page, "request-access-390");
  await page.setViewportSize(desktop);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Request received." })).toBeVisible(slow);
  await expect(page.getByRole("status")).toContainText("the lab will write to ada@birch.example.test");
  await expect(page.getByText("AR-0013")).toBeVisible();
  await shot(page, "request-sent-desktop");

  // The same email again: already waiting, without saying anything about accounts.
  await page.goto("/admin/request-access");
  await page.getByLabel("Full name").fill("Ada Example");
  await page.getByLabel("Work email").fill("ADA@birch.example.test");
  await page.getByLabel("Organisation or lab").fill("Example Birch");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Request already received." })).toBeVisible(slow);
  await page.getByRole("link", { name: "Back to sign in" }).click();

  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  const section = await openPeople(page, 3);
  const row = section.getByRole("row").filter({ hasText: "ada@birch.example.test" });
  await expect(row).toContainText("not a client yet");
  await expect(row).toContainText("About 30 serum samples");
  await shot(page, "people-access-requests-desktop");

  await row.getByRole("button", { name: "Review Ada Example" }).click();
  const approve = section.getByRole("form", { name: "Approve Ada Example" });
  await expect(approve.getByRole("radio", { name: /A new client/ })).toBeChecked();
  await expect(approve.getByLabel("Client name")).toHaveValue("Example Birch");
  await expect(approve.getByLabel("Kind")).toHaveValue("company");
  await expect(approve.getByLabel("Role")).toHaveValue("client_admin"); // a new client's first person
  await approve.getByRole("radio", { name: /An existing client/ }).check();
  await expect(approve.getByLabel("Role")).toHaveValue("requester"); // joining an existing client
  await approve.getByRole("radio", { name: /A new client/ }).check();
  await expect(approve.getByLabel("Role")).toHaveValue("client_admin");
  await approve.getByLabel("Role").selectOption("requester"); // the lab's own choice sticks
  await shot(page, "approve-dialog-desktop");
  await approve.getByRole("button", { name: "Approve and create invitation link" }).click();

  const notice = section.getByRole("status").filter({ hasText: "Invitation link for ada@birch.example.test (AR-0013)." });
  await expect(notice).toBeVisible(slow);
  const link = await notice.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/admin\/invite\/[0-9a-f]{64}$/);
  await expect(section.getByText("2 waiting")).toBeVisible(slow);
  await expect(nav(page).getByRole("link", { name: "People 2 access requests waiting" })).toBeVisible(slow);
  await expect(page.getByRole("table", { name: "Pending invitations" })).toContainText("Requester at Example Birch");
  await shot(page, "invitation-link-desktop");

  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Join as Requester at Example Birch." })).toBeVisible(slow);
  await expect(page.getByText("This invitation is for")).toContainText("ada@birch.example.test");
});

test("the lab declines a request with an internal reason", async ({ page }) => {
  await page.setViewportSize(desktop);
  await enterLab(page);
  const section = await openPeople(page, 2);
  const row = section.getByRole("row").filter({ hasText: "kai@cedar.example.test" });
  await expect(row).toContainText("matches a client");
  await row.getByRole("button", { name: "Review Kai Sample" }).click();
  const approve = section.getByRole("form", { name: "Approve Kai Sample" });
  await expect(approve.getByRole("radio", { name: /An existing client/ })).toBeChecked();
  await expect(approve.getByLabel("Client", { exact: true })).toHaveValue("example-cedar");
  await expect(approve.getByLabel("Role")).toHaveValue("requester");
  await approve.getByRole("button", { name: "Decline…" }).click();
  const decline = section.getByRole("form", { name: "Decline Kai Sample" });
  await decline.getByLabel("Reason").fill("Asked the PI first: Example Cedar adds its own people through the lab.");
  await shot(page, "decline-desktop");
  await decline.getByRole("button", { name: "Decline request" }).click();
  await expect(section.getByRole("status").filter({ hasText: "Request AR-0011 declined." })).toBeVisible(slow);
  await expect(section.getByRole("row").filter({ hasText: "kai@cedar.example.test" })).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "People 1 access requests waiting" })).toBeVisible(slow);
});
