import { expect, test } from "@playwright/test";

// GET /admin/api/session-token (docs/integration/admin-identity.md) through the real dev server and middleware.
// Demo mode has no GoTrue session, so a same-origin call from the signed-in example workspace is 401 signed_out; a
// cross-origin call is 403 before the session is read. Every answer carries Cache-Control: no-store.
const slow = { timeout: 60_000 };

test("a same-origin fetch from the example workspace is 401 signed_out (no Admin account in demo mode), never cached", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  const answer = await page.evaluate(async () => {
    const response = await fetch("/admin/api/session-token", { credentials: "include" });
    return { status: response.status, cacheControl: response.headers.get("cache-control"), body: await response.json() };
  });
  expect(answer).toEqual({ status: 401, cacheControl: "no-store", body: { error: "signed_out" } });
});

test("a cross-origin request is 403 cross_origin, never cached", async ({ request }) => {
  test.setTimeout(180_000);
  const cases: Record<string, string>[] = [{ "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" }, { Origin: "https://evil.example" }, { "Sec-Fetch-Site": "same-site" }];
  for (const headers of cases) {
    const response = await request.get("/admin/api/session-token", { headers, timeout: 120_000 });
    expect(response.status(), JSON.stringify(headers)).toBe(403);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({ error: "cross_origin" });
  }
});
