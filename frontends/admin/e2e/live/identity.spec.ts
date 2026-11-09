import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Identity E2E (docs/admin/admin-identity-e2e.md): the shared Admin identity in Nexo (docs/integration/admin-identity.md)
// and Nexo's store per client (docs/integration/nexo-store-scope.md), with real GoTrue tokens of two synthetic client
// members (one per client) and the simulated lab staff, against the deployed Admin and Nexo staging stacks. Skipped
// unless ADMIN_E2E_IDENTITY=1; then playwright.config.ts runs only this spec, against ADMIN_PILOT_BASE_URL (one origin
// serving /admin, /nexo-staging and /nexo-staging/api), and starts no dev server.
//   ADMIN_IDENTITY_CREDENTIALS  the file written by e2e/live/identity-seed.mjs (the two members, their datasets)
//   ADMIN_PILOT_CREDENTIALS     the file written by e2e/live/pilot-seed.mjs (lab staff: Stephania (simulated))
//   ADMIN_IDENTITY_AUTH_URL     GoTrue of the Admin stack (e.g. <supabase url>/auth/v1)
//   ADMIN_IDENTITY_ANON_KEY     its anon key
// Nexo staging runs with LIPIDOMIC_ADMIN_REQUIRE_USER=1 and Admin staging with NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1.
// Three serial groups: the dataset API by token, the checkpoint store per client (it deletes every checkpoint it
// saves), then the browser through Admin's session. Screenshots go to e2e/live/identity-evidence/ (git-ignored).
const env = process.env;
test.skip(env.ADMIN_E2E_IDENTITY !== "1",
  "Identity E2E: set ADMIN_E2E_IDENTITY=1, ADMIN_PILOT_BASE_URL, ADMIN_IDENTITY_CREDENTIALS, ADMIN_PILOT_CREDENTIALS, ADMIN_IDENTITY_AUTH_URL and ADMIN_IDENTITY_ANON_KEY");

type Person = { email: string; password: string };
type Member = Person & { name: string; userId: string; clientId: string; datasetId: string; order: string; version: number };
type Run = { alice: Member; bob: Member; staff: Person };
let loaded: Run | undefined;
function identityRun(): Run {
  if (loaded) return loaded;
  const unset = ["ADMIN_PILOT_BASE_URL", "ADMIN_IDENTITY_AUTH_URL", "ADMIN_IDENTITY_ANON_KEY"].filter(name => !env[name]);
  if (unset.length) throw new Error(`Set ${unset.join(", ")}`);
  const read = (name: string, seed: string) => {
    const file = env[name];
    if (!file || !existsSync(file)) throw new Error(`Run node e2e/live/${seed} first with ${name} set (no ${file ?? "file named"})`);
    return JSON.parse(readFileSync(file, "utf8"));
  };
  const members = read("ADMIN_IDENTITY_CREDENTIALS", "identity-seed.mjs") as { alice: Member; bob: Member };
  const { steph } = read("ADMIN_PILOT_CREDENTIALS", "pilot-seed.mjs") as { steph: Person };
  loaded = { alice: members.alice, bob: members.bob, staff: steph };
  return loaded;
}

const api = "/nexo-staging/api/v1";
const nexoApp = "/nexo-staging/";
const slow = { timeout: 90_000 };
const evidence = join(__dirname, "identity-evidence");
async function shot(page: Page, name: string) {
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, name) });
}

// GoTrue password grant: the member's own access token, as Admin's session holds it. Cached for the worker's run.
const tokens = new Map<string, string>();
async function token(request: APIRequestContext, who: Person) {
  const cached = tokens.get(who.email);
  if (cached) return cached;
  const res = await request.post(`${env.ADMIN_IDENTITY_AUTH_URL!.replace(/\/+$/, "")}/token?grant_type=password`, {
    headers: { apikey: env.ADMIN_IDENTITY_ANON_KEY! }, data: { email: who.email, password: who.password },
  });
  if (!res.ok()) throw new Error(`sign in ${who.email}: ${res.status()}`);
  const accessToken = (await res.json()).access_token as string;
  tokens.set(who.email, accessToken);
  return accessToken;
}

type Answer = { status: number; body: Record<string, unknown> & { error?: string } | null };
async function call(request: APIRequestContext, method: string, path: string, bearer: string | null,
  body?: { data?: unknown; multipart?: Record<string, { name: string; mimeType: string; buffer: Buffer }> }): Promise<Answer> {
  const res = await request.fetch(`${api}${path}`, { method, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, ...body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON: the status says enough */ }
  return { status: res.status(), body: json };
}
const openDataset = (request: APIRequestContext, datasetId: string, bearer: string | null, settings?: Record<string, unknown>) =>
  call(request, "POST", "/datasets/sessions", bearer, { data: { adminDatasetId: datasetId, ...(settings ? { settings } : {}) } });
const brief = (answer: Answer) => `${answer.status} ${JSON.stringify(answer.body).slice(0, 200)}`;

test.describe("API: Nexo opens an Admin dataset as the caller", () => {
  test.describe.configure({ mode: "serial" });

  // An authorized caller gets Team's preparation choices (422): the dataset was found for this user and downloaded.
  const authorized = (answer: Answer, what: string) => {
    expect.soft(answer.status, `${what}: ${brief(answer)}`).toBe(422);
    expect.soft(answer.body?.reason, what).toBe("preparation_choices_required");
  };
  const notFound = (answer: Answer, what: string) => {
    expect.soft(answer.status, `${what}: ${brief(answer)}`).toBe(404);
    expect.soft(answer.body?.error, what).toBe("dataset_not_found");
  };

  test("each member opens its own client's dataset and gets 404 for the other client's", async ({ request }) => {
    test.setTimeout(300_000);
    const { alice, bob } = identityRun();
    const ta = await token(request, alice), tb = await token(request, bob);
    authorized(await openDataset(request, alice.datasetId, ta), `alice opens ${alice.order} (her client)`);
    notFound(await openDataset(request, bob.datasetId, ta), `alice opens ${bob.order} (other client)`);
    authorized(await openDataset(request, bob.datasetId, tb), `bob opens ${bob.order} (his client)`);
    notFound(await openDataset(request, alice.datasetId, tb), `bob opens ${alice.order} (other client)`);
  });

  test("lab staff open both datasets", async ({ request }) => {
    test.setTimeout(300_000);
    const { alice, bob, staff } = identityRun();
    const ts = await token(request, staff);
    authorized(await openDataset(request, alice.datasetId, ts), `staff opens ${alice.order}`);
    authorized(await openDataset(request, bob.datasetId, ts), `staff opens ${bob.order}`);
  });

  test("no token and a forged token are 401 admin_auth_required", async ({ request }) => {
    const { alice } = identityRun();
    const forged = `${(await token(request, alice)).slice(0, -4)}AAAA`;
    for (const [what, bearer] of [["no token", null], ["forged token", forged]] as const) {
      const answer = await openDataset(request, alice.datasetId, bearer);
      expect.soft(answer.status, `${what}: ${brief(answer)}`).toBe(401);
      expect.soft(answer.body?.error, what).toBe("admin_auth_required");
    }
  });
});

test.describe("API: Nexo's checkpoint store per client", () => {
  test.describe.configure({ mode: "serial" });
  const runId = Date.now().toString(36);
  type Saver = { who: Person; datasetId: string; clientId: string | null };
  const savers = (): Record<"alice" | "bob" | "staff", Saver> => {
    const { alice, bob, staff } = identityRun();
    return {
      alice: { who: alice, datasetId: alice.datasetId, clientId: alice.clientId },
      bob: { who: bob, datasetId: bob.datasetId, clientId: bob.clientId },
      staff: { who: staff, datasetId: bob.datasetId, clientId: null },
    };
  };
  // Checkpoints saved by this run and not yet deleted, by saver: the cleanup test deletes them, afterAll retries.
  const saved: Partial<Record<"alice" | "bob" | "staff", string>> = {};
  const id = (name: keyof typeof saved) => {
    const value = saved[name];
    if (!value) throw new Error(`${name} saved no checkpoint: the first test of this group did not run or failed`);
    return value;
  };
  const list = async (request: APIRequestContext, bearer: string) => {
    const answer = await call(request, "GET", "/checkpoints", bearer);
    const body = answer.body as unknown;
    const records = (Array.isArray(body) ? body : (answer.body?.checkpoints ?? [])) as { id: string; clientId?: string }[];
    return { status: answer.status, records };
  };

  test.afterAll(async ({ playwright }) => {
    const left = Object.entries(saved);
    if (!left.length) return;
    const request = await playwright.request.newContext({ baseURL: env.ADMIN_PILOT_BASE_URL });
    const people = savers();
    for (const [name, checkpoint] of left) {
      const answer = await call(request, "DELETE", `/checkpoints/${checkpoint}`, await token(request, people[name as keyof typeof saved].who));
      console.log(`identity cleanup: ${name}'s checkpoint ${checkpoint.slice(0, 8)}: ${answer.status}`);
    }
    await request.dispose();
  });

  test("each opens its dataset session and saves a checkpoint into its own workspace", async ({ request }) => {
    test.setTimeout(600_000);
    for (const [name, p] of Object.entries(savers()) as [keyof typeof saved, Saver][]) {
      const bearer = await token(request, p.who);
      const first = await openDataset(request, p.datasetId, bearer);
      const missing = (first.body?.missing ?? []) as { name: string; teamControlDefault: unknown }[];
      const open = await openDataset(request, p.datasetId, bearer, Object.fromEntries(missing.map(m => [m.name, m.teamControlDefault])));
      expect(open.status, `${name} opens its dataset session: ${first.status}/${brief(open)}`).toBe(200);
      const sessionId = open.body?.sessionId as string;
      const state = open.body?.canvas ?? (await call(request, "GET", `/sessions/${sessionId}/canvas`, bearer)).body?.state;
      const save = await call(request, "POST", `/sessions/${sessionId}/checkpoints`, bearer,
        { data: { label: `identity-e2e-${name}-${runId}`, canvas: { token: `identity-e2e-${name}`, state } } });
      expect(save.status, `${name} saves a checkpoint: ${brief(save)}`).toBe(200);
      saved[name] = save.body?.id as string;
      if (p.clientId) expect(save.body?.clientId, `${name}'s checkpoint is in its client workspace`).toBe(p.clientId);
      else expect(save.body?.clientId, "staff's checkpoint is in the staff workspace").toBeFalsy();
    }
  });

  test("each list shows its own checkpoint and none of the others'", async ({ request }) => {
    const people = savers();
    for (const name of ["alice", "bob", "staff"] as const) {
      const { status, records } = await list(request, await token(request, people[name].who));
      const ids = records.map(record => record.id);
      expect.soft(status, `${name} lists checkpoints`).toBe(200);
      expect.soft(ids, `${name} lists its own checkpoint`).toContain(id(name));
      for (const other of (["alice", "bob", "staff"] as const).filter(o => o !== name)) {
        expect.soft(ids, `${name} does not list ${other}'s checkpoint`).not.toContain(id(other));
      }
      const client = people[name].clientId;
      if (client) expect.soft(records.filter(record => record.clientId !== client).map(record => record.clientId), `${name}'s list carries only its client`).toEqual([]);
    }
  });

  test("a member cannot download, delete or restore another client's or the staff's checkpoint (404), and restores its own", async ({ request }) => {
    test.setTimeout(300_000);
    const people = savers();
    const ta = await token(request, people.alice.who), tb = await token(request, people.bob.who);
    for (const [what, method, path] of [["download", "GET", (c: string) => `/checkpoints/${c}/download`], ["delete", "DELETE", (c: string) => `/checkpoints/${c}`]] as const) {
      for (const target of ["bob", "staff"] as const) {
        const answer = await call(request, method, path(id(target)), ta);
        expect.soft(answer.status, `alice cannot ${what} ${target}'s checkpoint`).toBe(404);
      }
    }
    const steal = await call(request, "POST", "/sessions", ta, { data: { checkpointId: id("bob") } });
    expect.soft(steal.status, "alice cannot restore bob's checkpoint").toBe(404);
    const peek = await call(request, "GET", `/checkpoints/${id("alice")}/download`, tb);
    expect.soft(peek.status, "bob cannot download alice's checkpoint").toBe(404);
    const mine = await call(request, "POST", "/sessions", ta, { data: { checkpointId: id("alice") } });
    expect.soft(mine.status, `alice restores her own checkpoint: ${brief(mine)}`).toBe(200);
  });

  test("a member cannot upload a ZIP or a workbook (403 staff_only)", async ({ request }) => {
    const tb = await token(request, savers().bob.who);
    // An empty ZIP (end-of-central-directory record only): refused before it is read.
    const file = { name: "x.zip", mimeType: "application/zip", buffer: Buffer.concat([Buffer.from("PK\u0005\u0006", "binary"), Buffer.alloc(18)]) };
    for (const [what, path] of [["a ZIP", "/checkpoints"], ["a workbook", "/datasets/sessions"]] as const) {
      const answer = await call(request, "POST", path, tb, { multipart: { file } });
      expect.soft(answer.status, `a member cannot upload ${what}: ${brief(answer)}`).toBe(403);
      expect.soft(answer.body?.error, `a member cannot upload ${what}`).toBe("staff_only");
    }
  });

  test("no token: the checkpoint list is 401", async ({ request }) => {
    const answer = await call(request, "GET", "/checkpoints", null);
    expect(answer.status, brief(answer)).toBe(401);
  });

  test("each deletes its own checkpoint (cleanup)", async ({ request }) => {
    const people = savers();
    for (const name of ["alice", "bob", "staff"] as const) {
      const answer = await call(request, "DELETE", `/checkpoints/${id(name)}`, await token(request, people[name].who));
      expect.soft(answer.status, `${name} deletes its own checkpoint`).toBe(200);
      if (answer.status === 200) delete saved[name];
    }
  });
});

test.describe("Browser: Nexo opens datasets with the Admin session", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1440, height: 900 } });
  const prepare = (nexo: Page) => nexo.getByRole("dialog", { name: "Prepare dataset", exact: true });
  const notAvailable = "This dataset is not available to Nexo";

  for (const [key, otherKey] of [["alice", "bob"], ["bob", "alice"]] as const) {
    test(`${key} opens only their own client's dataset in Nexo, through Admin`, async ({ page }) => {
      test.setTimeout(420_000);
      const run = identityRun(), who = run[key], other = run[otherKey];
      const sessionTokens: number[] = [];
      page.context().on("response", response => { if (response.url().includes("/admin/api/session-token")) sessionTokens.push(response.status()); });

      await test.step(`${key} signs in to Admin as a client member`, async () => {
        await page.goto("/admin/sign-in");
        await page.getByLabel("Email").fill(who.email);
        await page.getByLabel("Password").fill(who.password);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page).not.toHaveURL(/sign-in/, slow);
      });

      const nexo = await test.step(`${key} sees Open in Nexo on ${who.order} and Nexo opens it with the Admin session`, async () => {
        await page.goto(`/admin/orders/${who.order}`);
        const link = page.getByRole("link", { name: "Open in Nexo" });
        await expect(link).toHaveAttribute("href", new RegExp(`dataset=${who.datasetId}$`), slow);
        const popup = page.waitForEvent("popup");
        await link.click();
        const opened = await popup;
        await expect(prepare(opened)).toBeVisible(slow);
        await prepare(opened).getByRole("button", { name: "Open dataset", exact: true }).click();
        await expect(opened).toHaveTitle(`${who.order} · v${who.version}`, { timeout: 180_000 });
        await shot(opened, `${key}-1-own-dataset.png`);
        expect(sessionTokens, "Nexo fetched the Admin session token").toContain(200);
        return opened;
      });

      await test.step(`${key} cannot open the other client's dataset (${other.order}) in Nexo`, async () => {
        await nexo.goto(`${nexoApp}?dataset=${other.datasetId}`);
        await expect(nexo.getByText(notAvailable)).toBeVisible(slow);
        await expect(prepare(nexo)).toHaveCount(0);
        // Store per client: a member's refusal page offers no ZIP upload (docs/integration/nexo-store-scope.md).
        await expect(nexo.getByLabel("Upload ZIP", { exact: true })).toHaveCount(0);
        await shot(nexo, `${key}-2-other-client-refused.png`);
      });

      await test.step(`${key} gets no Open in Nexo for ${other.order} in Admin`, async () => {
        await page.goto(`/admin/orders/${other.order}`);
        await expect(page.getByRole("link", { name: "Open in Nexo" })).toHaveCount(0, slow);
        await shot(page, `${key}-3-admin-other-order.png`);
      });
    });
  }

  test("signed out: Nexo asks to sign in to Admin and opens nothing", async ({ page }) => {
    const { alice } = identityRun();
    await page.goto(`${nexoApp}?dataset=${alice.datasetId}`);
    const signIn = page.getByRole("link", { name: "Sign in to Admin" });
    await expect(signIn).toBeVisible(slow);
    await expect(signIn).toHaveAttribute("href", /^\/admin\/sign-in\?next=/);
    await expect(prepare(page)).toHaveCount(0);
    await shot(page, "signed-out.png");
  });
});
