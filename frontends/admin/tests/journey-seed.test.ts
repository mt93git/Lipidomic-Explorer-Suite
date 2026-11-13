// @vitest-environment node
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUN_ID } from "../e2e/live/journey-run.mjs";

// The journey seed runs as the coordinator runs it (node e2e/live/journey-seed.mjs) against a stand-in GoTrue and
// PostgREST that records every request.
let server: Server;
let origin: string;
let dir: string;
let requests: string[];
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "journey-seed-"));
  requests = [];
  server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url?.split("?")[0]}`);
    const path = req.url?.split("?")[0] ?? "";
    const send = (body: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
    if (path === "/auth/v1/admin/users" && req.method === "GET") return send({ users: [] });
    if (path === "/auth/v1/admin/users" && req.method === "POST") return send({ id: `user-${requests.length}` });
    if (path.endsWith("/factors") && path.includes("/admin/")) return send([]);
    if (path === "/auth/v1/token") return send({ access_token: "token" });
    if (path === "/auth/v1/factors") return send({ id: "factor", totp: { secret: "JBSWY3DPEHPK3PXP" } });
    if (path.endsWith("/challenge")) return send({ id: "challenge" });
    if (path.endsWith("/verify")) return send({});
    if (path === "/rest/v1/lab_staff" || path === "/rest/v1/panel") return send(req.method === "GET" ? [] : [{ id: "row" }]);
    res.statusCode = 404; send({ message: `unexpected ${req.method} ${path}` });
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise(done => server.close(done)); rmSync(dir, { recursive: true, force: true }); });

function seed(file: string) {
  return new Promise<{ code: number | null; out: string }>(done => {
    const child = spawn(process.execPath, ["e2e/live/journey-seed.mjs"], { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key-secret", ADMIN_JOURNEY_CREDENTIALS: file, ADMIN_E2E_AUTH_URL: "", ADMIN_E2E_REST_URL: "" } });
    let out = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { out += chunk; });
    child.on("close", code => done({ code, out }));
  });
}

describe("journey seed", () => {
  it("creates only the staff personas with no TOTP factor (no panel: the spec adds the run's on Instruments & panels), writes a mode-600 file with the run, and prints no secret", async () => {
    const file = join(dir, "credentials.json");
    const { code, out } = await seed(file);
    expect(code, out).toBe(0);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const run = JSON.parse(readFileSync(file, "utf8"));
    expect(run.runId).toMatch(RUN_ID);
    expect(run.clientName).toBe(`Northwind Lipid Lab (synthetic) ${run.runId}`);
    expect(run.steph).toMatchObject({ email: "steph.sim@admin-staging.test" });
    // Two-step sign-in is off: no persona gets a TOTP factor.
    expect(run.steph.totpSecret).toBeUndefined();
    expect(requests.filter(request => request === "POST /auth/v1/factors")).toEqual([]);
    expect(run.paula).toMatchObject({ email: "paula.sim@admin-staging.test" });
    expect(run.dana.email).toBe(`dana.sim+${run.runId}@admin-staging.test`);
    expect(run.lee.email).toBe(`lee.sim+${run.runId}@admin-staging.test`);
    for (const secret of [run.steph.password, run.paula.password, run.dana.password, run.lee.password, "service-key-secret", "anon-key"]) expect(out).not.toContain(secret);
    // The client lab, its people and the order are left to the screens.
    expect(requests.filter(request => /\/(client|order|client_member|invitation|access_request)$/.test(request))).toEqual([]);
    expect(run.panelName).toBeUndefined();
    expect(requests.filter(request => /\/(panel|instrument)$/.test(request))).toEqual([]);
  });

  it("refuses to reseed over a run whose cleanup has not succeeded, and reseeds once the marker is gone", async () => {
    const file = join(dir, "credentials.json");
    writeFileSync(file, JSON.stringify({ runId: "20261110-2244-3fa9" }), { mode: 0o600 });
    const refused = await seed(file);
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/cleanup has not succeeded/);
    expect(requests).toEqual([]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ runId: "20261110-2244-3fa9" });
    writeFileSync(file, JSON.stringify({ steph: {} }), { mode: 0o600 });
    expect((await seed(file)).code).toBe(0);
  });
});
