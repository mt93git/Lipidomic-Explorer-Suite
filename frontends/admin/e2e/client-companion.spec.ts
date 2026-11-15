import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

// The neutrophil companion in the client zone, demo mode, at 1440 and 390 px: docked on Sign in (tips only), the
// first-visit entrance, docked in the client top bar (outside the phone Menu), taken out with Client home's tip, dragged
// (on a phone it snaps to a corner) and still there after a reload, the chat (demo mode has no token, so it shows the
// guide's failure text), and Dock putting it back in the bar.
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
    const dock = page.getByRole("button", { name: "Neutrophil guide: take it out of the bar" });

    const out = page.getByRole("button", { name: /^Neutrophil guide: Enter shows a tip/ });

    // Signed out: docked at the top bar's right end, out with a tip on click, no chat, back with Dock.
    await page.goto("/admin/sign-in");
    await expect(dock).toBeVisible(slow);
    await shot(page, `sign-in-${width}`);
    await hydrated(page);
    await dock.click();
    const signInTip = page.getByRole("group", { name: "Sign in" });
    await expect(signInTip).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat with the neutrophil guide" })).toHaveCount(0);
    await signInTip.getByRole("button", { name: "Put the guide back in the top bar" }).click();
    await expect(dock).toBeVisible();

    // The first signed-in screen: the entrance with its welcome, then the flight to the dock.
    await page.getByRole("button", { name: "Enter as an example client" }).click();
    await expect(page).toHaveURL(/\/admin\/choose-client$/, slow);
    await expect(page.getByText("Hi, I'm your lab guide", { exact: true })).toBeVisible(slow);
    await shot(page, `entrance-${width}`);
    await expect(dock).toBeVisible({ timeout: 15_000 });

    // Client home: docked in the client top bar (on a phone next to Menu, not inside it), with the screen's one-time tip.
    await page.getByRole("button", { name: /Example Cedar/ }).click();
    await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
    await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
    const bar = page.locator("header.topbar");
    await expect(bar.getByRole("button", { name: "Neutrophil guide: take it out of the bar" })).toBeVisible();
    if (width === 390) await expect(bar.getByRole("button", { name: /^Menu/ })).toBeVisible();
    await expect(page.locator("#topbar-menu").getByRole("button", { name: "Neutrophil guide: take it out of the bar" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Your orders" }).filter({ hasText: "Released datasets are listed under Datasets." })).toBeVisible();
    await shot(page, `docked-${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    // Taken out with the screen's tip; it stays out (no flight home after a few seconds).
    await dock.click();
    const tip = page.getByRole("group", { name: "Your orders" });
    await expect(tip).toBeVisible();
    await inViewport(page, tip);
    await shot(page, `reinvoked-${width}`);
    await page.waitForTimeout(6_000);
    await expect(out).toBeVisible();
    await expect(dock).toBeHidden();

    // Dragged across the screen: it stays where it is dropped (a phone snaps it to the nearest corner), also after a reload.
    const from = (await out.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Toward the right: in dev, Next's indicator sits in the bottom-left corner and would take the clicks.
    await page.mouse.move(width * 0.8, height * 0.6, { steps: 12 });
    await page.mouse.up();
    const dropped = (await out.boundingBox())!;
    expect(dropped.x).toBeGreaterThan(width / 2);
    expect(dropped.y).toBeGreaterThan(height / 2 - from.height);
    await inViewport(page, out);
    await shot(page, `dragged-${width}`);
    await page.reload();
    await expect(out).toBeVisible(slow);
    expect((await out.boundingBox())!.x).toBeCloseTo(dropped.x, 0);

    // The chat: demo mode has no session token, so the guide's failure text.
    await hydrated(page);
    await out.click();
    await page.getByRole("group", { name: "Your orders" }).getByRole("button", { name: "Chat with the neutrophil guide" }).click();
    const panel = page.getByRole("region", { name: "Chat with the neutrophil guide" });
    await expect(panel).toBeVisible();
    await panel.getByRole("textbox", { name: "Question for the guide" }).fill("How do I download my results?");
    await panel.getByRole("button", { name: "Send" }).click();
    await expect(panel.getByText("The guide could not answer just now. Try again in a moment.")).toBeVisible(slow);
    await inViewport(page, panel);
    await expect(out).toBeVisible(); // the chat leaves it where it was
    await shot(page, `chat-${width}`);

    // Dock puts it back in the bar.
    await panel.getByRole("button", { name: "Close the guide chat" }).click();
    await out.click();
    await page.getByRole("group", { name: "Your orders" }).getByRole("button", { name: "Put the guide back in the top bar" }).click();
    await expect(dock).toBeVisible();
    await context.close();
  });
}
