import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

// The neutrophil companion in the client zone, demo mode, at 1440 and 390 px: docked on Sign in (tips only), the
// first-visit entrance, docked in the client top bar (outside the phone Menu), brought out with Client home's tip, and
// the chat (demo mode has no token, so it shows the guide's failure text).
// ADMIN_E2E_SCREENSHOTS=1 also saves the screens to docs/admin/client-companion/ (synthetic data).
const slow = { timeout: 60_000 };
const shots = process.env.ADMIN_E2E_SCREENSHOTS === "1";
async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve(`../../docs/admin/client-companion/${name}.png`) });
}
// The dock is server-rendered: on a cold dev server a click can land before React has hydrated it.
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const dock = document.querySelector('button[aria-label^="Neutrophil guide"]');
    return !!dock && Object.keys(dock).some(key => key.startsWith("__reactProps"));
  }, undefined, slow);
}
async function inViewport(page: Page, selector: ReturnType<Page["locator"]>) {
  const box = (await selector.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
}

for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  test(`the client companion at ${width} px`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const dock = page.getByRole("button", { name: "Neutrophil guide: show a tip for this screen" });

    // Signed out: docked at the top bar's right end, a tip on click, no chat.
    await page.goto("/admin/sign-in");
    await expect(dock).toBeVisible(slow);
    await shot(page, `sign-in-${width}`);
    await hydrated(page);
    await dock.click();
    await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat with the neutrophil guide" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The first signed-in screen: the entrance with its welcome, then the flight to the dock.
    await page.getByRole("button", { name: "Enter as an example client" }).click();
    await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
    await expect(page.getByText("Hi, I'm your lab guide")).toBeVisible(slow);
    await shot(page, `entrance-${width}`);
    await expect(dock).toBeVisible({ timeout: 15_000 });

    // Client home: docked in the client top bar (on a phone next to Menu, not inside it), with the screen's one-time tip.
    await page.getByRole("button", { name: /Example Cedar/ }).click();
    await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
    await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
    const bar = page.locator("header.topbar");
    await expect(bar.getByRole("button", { name: "Neutrophil guide: show a tip for this screen" })).toBeVisible();
    if (width === 390) await expect(bar.getByRole("button", { name: /^Menu/ })).toBeVisible();
    await expect(page.locator("#topbar-menu").getByRole("button", { name: "Neutrophil guide: show a tip for this screen" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Released datasets are listed under Datasets." })).toBeVisible();
    await shot(page, `docked-${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // Brought out big with the screen's tip.
    await dock.click();
    const tip = page.getByRole("dialog", { name: "Your orders" });
    await expect(tip).toBeVisible();
    await inViewport(page, tip);
    await shot(page, `reinvoked-${width}`);

    // The chat: demo mode has no session token, so the guide's failure text.
    await tip.getByRole("button", { name: "Chat with the neutrophil guide" }).click();
    const panel = page.getByRole("region", { name: "Chat with the neutrophil guide" });
    await expect(panel).toBeVisible();
    await panel.getByRole("textbox", { name: "Question for the guide" }).fill("How do I download my results?");
    await panel.getByRole("button", { name: "Send" }).click();
    await expect(panel.getByText("The guide could not answer just now. Try again in a moment.")).toBeVisible(slow);
    await inViewport(page, panel);
    await expect(dock).toBeVisible(); // back in the bar once the tip's flight has landed
    await shot(page, `chat-${width}`);
    await context.close();
  });
}
