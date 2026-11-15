// @vitest-environment node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checks, parseSciexTxt } from "@lipidomic/admin-ingest";
import { toSequenceCsv } from "../src/lib/batch/csv";
import { datasetPaths as appDatasetPaths, matchSamples as appMatchSamples } from "../src/lib/release";
import {
  BOX_COLUMNS, BOX_ROWS, CLIENTS, ORDERS, POINTS, STAFF, archivedClientName, batchInjections, datasetPaths, deliverablePath, demoDeliverable,
  demoSamples, formatPlan, isDemoName, runningStatuses, sharedBatchInjections, matchSamples, matchesOrder, nextSteps, orderRequest, policyChange, sequenceCsv, slotName, slotOffsets,
  stepsFor, syntheticResults,
} from "../e2e/live/demo-plan.mjs";

// The showcase seed's plan (e2e/live/demo-plan.mjs): names, where each order is parked, the steps that take it there,
// what an existing order still needs (idempotency) and the synthetic files. The seed itself runs only --dry-run here.
const root = join(__dirname, "..");
const fixture = readFileSync(join(root, "e2e/fixtures/sciex-synthetic.txt"), "utf8");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("names", () => {
  it("has three synthetic clients, each with one requester on the reserved test domain", () => {
    expect(CLIENTS.map(client => client.name)).toEqual(["Harbor Lipid Lab (demo)", "Cedar Cardio Group (demo)", "Atlas Nutrition Core (demo)"]);
    for (const client of CLIENTS) {
      expect(isDemoName(client.name)).toBe(true);
      expect(isDemoName(client.member.name)).toBe(true);
      expect(client.member.email).toBe(`${client.key}.demo@admin-staging.test`);
    }
  });

  it("has a lab admin who acts and a second eligible signer, both synthetic", () => {
    expect(STAFF.staff).toEqual({ email: "demo.staff@admin-staging.test", name: "Demo Staff (demo)", role: "admin" });
    expect(STAFF.approver.email).toBe("demo.approver@admin-staging.test");
    expect(["owner", "admin"]).toContain(STAFF.approver.role);
    expect(isDemoName(STAFF.approver.name)).toBe(true);
  });

  it("titles every order with (demo), unique, 4-12 samples of plasma, serum or liver tissue", () => {
    expect(ORDERS.length).toBe(12);
    expect(new Set(ORDERS.map(order => order.title)).size).toBe(ORDERS.length);
    for (const order of ORDERS) {
      expect(isDemoName(order.title)).toBe(true);
      expect(order.samples).toBeGreaterThanOrEqual(4);
      expect(order.samples).toBeLessThanOrEqual(12);
      expect(["Plasma", "Serum", "Liver tissue"]).toContain(order.matrix);
      expect(CLIENTS.some(client => client.key === order.client)).toBe(true);
    }
    expect(isDemoName("Harbor Lipid Lab")).toBe(false);
  });

  it("names samples per order, synthetic and unique, in two alternating groups", () => {
    for (const order of ORDERS) {
      const samples = demoSamples(order);
      expect(samples).toHaveLength(order.samples);
      expect(new Set(samples.map(sample => sample.full_name)).size).toBe(order.samples);
      expect(new Set(samples.map(sample => sample.group1_term))).toEqual(new Set(order.groups));
      expect(samples.every(sample => sample.matrix === order.matrix)).toBe(true);
    }
    expect(demoSamples(ORDERS[3]).slice(0, 2).map(sample => sample.full_name)).toEqual(["HL-PL-01", "HL-PL-02"]);
    expect(demoSamples(ORDERS[3])).toEqual(demoSamples(ORDERS[3])); // deterministic
  });

  it("sends request_order the order's own title, matrix and sample count", () => {
    expect(orderRequest(ORDERS[0])).toMatchObject({ p_title: ORDERS[0].title, p_matrix: "Plasma", p_expected_samples: 6, p_billing_ref: "DEMO-0001" });
  });
});

describe("plan: order → stage", () => {
  it("parks at least one order at each point, and says why Extracted is Registered", () => {
    const points = new Set(ORDERS.map(order => order.point));
    for (const point of Object.keys(POINTS)) expect(points).toContain(point);
    const extracted = ORDERS.find(order => order.wanted === "extracted")!;
    expect(extracted.point).toBe("registered");
    expect(extracted.note).toMatch(/no admin RPC moves an order to Extracted/);
  });

  it("takes each order through the RPC steps in pipeline order", () => {
    expect(stepsFor("pending")).toEqual(["request"]);
    expect(stepsFor("accepted")).toEqual(["request", "accept"]);
    expect(stepsFor("registered")).toEqual(["request", "accept", "receive", "register"]);
    expect(stepsFor("in_batch")).toEqual(["request", "accept", "receive", "register", "batch", "store"]);
    expect(stepsFor("acquired").slice(-2)).toEqual(["export", "acquire"]);
    expect(stepsFor("excel_built").slice(-3)).toEqual(["results", "build", "sign_prepared"]); // at most one signature
    expect(stepsFor("released").slice(-4)).toEqual(["sign_prepared", "sign_approved", "release", "deliverable"]);
    expect(stepsFor("declined")).toEqual(["request", "decline"]);
    expect(() => stepsFor("extracted")).toThrow(/unknown point/);
  });
});

describe("idempotency", () => {
  it("a missing order needs every step; one already at its point needs none", () => {
    expect(nextSteps("released", { exists: false })).toEqual(stepsFor("released"));
    expect(nextSteps("pending", { exists: true, review: "pending", stage: "request" })).toEqual([]);
    expect(nextSteps("accepted", { exists: true, review: "accepted", stage: "request" })).toEqual([]);
    expect(nextSteps("registered", { exists: true, review: "accepted", stage: "registered" })).toEqual([]);
    expect(nextSteps("in_batch", { exists: true, review: "accepted", stage: "in_batch", unplacedAliquots: 0 })).toEqual([]);
    expect(nextSteps("excel_built", { exists: true, review: "accepted", stage: "excel_built", unplacedAliquots: 0, signedBy: ["staff"] })).toEqual([]);
    expect(nextSteps("released", { exists: true, review: "accepted", stage: "released", unplacedAliquots: 0, deliverables: 1 })).toEqual([]);
    expect(nextSteps("declined", { exists: true, review: "declined", stage: "request" })).toEqual([]);
  });

  it("a run that stopped half way resumes where it stopped", () => {
    expect(nextSteps("released", { exists: true, review: "pending", stage: "request" })).toEqual(stepsFor("released").slice(1));
    expect(nextSteps("acquired", { exists: true, review: "accepted", stage: "in_batch", unplacedAliquots: 3 })).toEqual(["store", "export", "acquire"]);
    expect(nextSteps("released", { exists: true, review: "accepted", stage: "excel_built", unplacedAliquots: 0, signedBy: ["staff"] }))
      .toEqual(["sign_approved", "release", "deliverable"]);
    expect(nextSteps("released", { exists: true, review: "accepted", stage: "released", unplacedAliquots: 0, deliverables: 0 })).toEqual(["deliverable"]);
  });

  it("an order moved past its point by hand is left alone", () => {
    expect(nextSteps("registered", { exists: true, review: "accepted", stage: "acquired" })).toEqual([]);
  });

  it("finds an order by its client and title: a live one, or a declined one for the declined slot", () => {
    const declined = ORDERS.find(order => order.point === "declined")!;
    const live = ORDERS[1];
    const row = (over: object) => ({ client_id: "c1", title: live.title, archived_at: null, review: "accepted", ...over });
    expect(matchesOrder(live, "c1", row({}))).toBe(true);
    expect(matchesOrder(live, "c2", row({}))).toBe(false);
    expect(matchesOrder(live, "c1", row({ archived_at: "2026-11-13T10:00:00Z" }))).toBe(false); // archived by --reset
    expect(matchesOrder(declined, "c1", row({ title: declined.title, review: "declined", archived_at: "2026-11-13T10:00:00Z" }))).toBe(true);
  });
});

describe("storage slots", () => {
  it("gives each batched order its own fixed slots in the 9 × 9 demo box", () => {
    const offsets = slotOffsets();
    const batched = ORDERS.filter(order => ["in_batch", "acquired", "excel_built", "released", "running"].includes(order.point));
    expect(Object.keys(offsets)).toEqual(batched.map(order => order.key));
    const slots = batched.flatMap(order => Array.from({ length: order.samples }, (_, i) => slotName(offsets[order.key] + i)));
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots.length).toBeLessThanOrEqual(BOX_ROWS.length * BOX_COLUMNS);
    expect([slotName(0), slotName(8), slotName(9)]).toEqual(["A1", "A9", "B1"]);
  });
});

describe("batch and results", () => {
  const samples = demoSamples(ORDERS[6]).map((sample, i) => ({ ...sample, id: uuid(i + 1), sample_code: `ORD042-S${String(i + 1).padStart(3, "0")}` }));
  const planned = batchInjections(samples);

  it("plans one blank, the samples by code, one QC at the end", () => {
    expect(planned).toHaveLength(samples.length + 2);
    expect(planned.map(row => row.seq)).toEqual(planned.map((_, i) => i + 1));
    expect(planned[0]).toMatchObject({ sample_type: "Blank", sample_name: "Blank_001" });
    expect(planned.at(-1)).toMatchObject({ sample_type: "Quality Control", sample_name: "QC_001" });
    expect(planned.filter(row => row.sample_type === "Unknown").map(row => row.sample_name)).toEqual(samples.map(sample => sample.sample_code));
    expect(new Set(planned.map(row => row.vial)).size).toBe(planned.length);
  });

  it("hashes the sequence CSV exactly as the app writes it", () => {
    const rows = planned.map((row, i) => ({ seq: row.seq, sample_type: row.sample_type, sample_name: row.sample_name, FullName: null,
      client_id: row.sample_type === "Unknown" ? uuid(900) : null, aliquot_id: row.sample_type === "Unknown" ? uuid(500 + i) : null, plate: row.plate, vial: row.vial }));
    expect(sequenceCsv(rows)).toBe(toSequenceCsv(rows));
  });

  it("writes a results TXT the ingest package reads: every injection, Unknowns named by code, no stop check", () => {
    const text = syntheticResults(fixture, planned);
    const parsed = parseSciexTxt(text);
    expect(parsed.samples.map(sample => sample.name)).toEqual(planned.map(row => row.sample_name));
    expect(parsed.samples.filter(sample => sample.type === "Unknown").map(sample => sample.name)).toEqual(samples.map(sample => sample.sample_code));
    expect(checks(parsed).filter(check => check.status === "stop")).toEqual([]);
    expect(syntheticResults(fixture, planned)).toBe(text); // deterministic
    // Column 1 is the blank; the 4th Unknown (column 5) reuses the 1st Unknown's fixture column (column 2), scaled by 7 %.
    const row = text.split("\n").find(line => line.startsWith("Synthetic lipid 2\t"))!.split("\t");
    expect(Number(row[2])).toBeGreaterThan(0);
    expect(Number(row[5])).toBeCloseTo(Number(row[2]) * 1.07, 5);
  });

  it("matches the export to the registry and names the dataset files as the app does", () => {
    const registry = samples.map(sample => ({ code: sample.sample_code, full_name: sample.full_name, group1_term: sample.group1_term, group2_term: sample.group2_term,
      replicate_term: sample.replicate_term, patient_term: sample.patient_term, time_point_term: sample.time_point_term }));
    const names = [...samples.map(sample => sample.sample_code), "ORD999-S001"];
    expect(matchSamples(names, registry)).toEqual(appMatchSamples(names, registry));
    const digests = { full: "a".repeat(64), analysis: "b".repeat(64), companion: "c".repeat(64) };
    expect(datasetPaths(uuid(7), "ORD042", digests)).toEqual(appDatasetPaths(uuid(7), "ORD042", digests));
  });

  it("gives the released order a small CSV deliverable at the path add_deliverable computes", () => {
    const item = demoDeliverable(ORDERS[8]);
    expect(item).toMatchObject({ kind: "table", contentType: "text/csv", fileName: "lipid-class-summary-demo.csv" });
    expect(item.fileName).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
    expect(isDemoName(item.title)).toBe(true);
    expect(item.text).toMatch(/not a measurement/);
    expect(deliverablePath(uuid(7), "ORD042", "d".repeat(64), item.fileName)).toBe(`${uuid(7)}/ORD042/deliverables/${"d".repeat(64)}/${item.fileName}`);
  });
});

describe("release policy", () => {
  const demo = [uuid(1), uuid(2)];
  it("leaves a policy alone when the demo two may already sign and release", () => {
    expect(policyChange(null, demo)).toBeNull();
    expect(policyChange({ eligible_signers: [], required_signatures: 2 }, demo)).toBeNull();
    expect(policyChange({ eligible_signers: [uuid(9), ...demo], required_signatures: 2 }, demo)).toBeNull();
  });
  it("otherwise adds the demo two at 2 signatures, keeping the named signers", () => {
    expect(policyChange({ eligible_signers: [uuid(8), uuid(9)], required_signatures: 2 }, demo))
      .toEqual({ eligible_signers: [uuid(8), uuid(9), ...demo], required_signatures: 2 });
    expect(policyChange({ eligible_signers: [uuid(8), uuid(9), uuid(1)], required_signatures: 3 }, demo))
      .toEqual({ eligible_signers: [uuid(8), uuid(9), uuid(1), uuid(2)], required_signatures: 2 });
    expect(policyChange({ eligible_signers: [], required_signatures: 3 }, demo)).toEqual({ eligible_signers: [], required_signatures: 2 });
  });
});

describe("reset", () => {
  it("renames an archived client so the next run can create it again (client names are unique)", () => {
    const name = archivedClientName("Harbor Lipid Lab (demo)", new Date("2026-11-13T09:05:00Z"));
    expect(name).toBe("Harbor Lipid Lab (demo, archived 20261113-0905)");
    expect(isDemoName(name)).toBe(false);
  });
});

describe("the seed script", () => {
  const run = (args: string[], env: Record<string, string> = {}) => new Promise<{ code: number | null; out: string }>(done => {
    const child = spawn(process.execPath, ["e2e/live/demo-seed.mjs", ...args], { cwd: root, env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env } });
    let out = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { out += chunk; });
    child.on("close", code => done({ code, out }));
  });

  it("--dry-run prints the plan with no environment and touches nothing", async () => {
    const { code, out } = await run(["--dry-run"]);
    expect(code).toBe(0);
    expect(out).toBe(`${formatPlan()}\n`);
    for (const order of ORDERS) expect(out).toContain(order.title);
    expect(out).toContain("asked: extracted");
    expect(out).not.toMatch(/password|token|key/i);
  });

  it("--dry-run --reset prints what a reset archives", async () => {
    const { code, out } = await run(["--dry-run", "--reset"]);
    expect(code).toBe(0);
    expect(out).toContain("Nothing is deleted");
  });

  it("refuses to run without its environment or with an unknown argument", async () => {
    const missing = await run([]);
    expect(missing.code).toBe(2);
    expect(missing.out).toContain("missing environment: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_DEMO_CREDENTIALS");
    const bogus = await run(["--force"]);
    expect(bogus.code).toBe(2);
    expect(bogus.out).toContain("unknown argument --force");
  });
});

describe("shared running batch", () => {
  const running = ORDERS.filter(order => order.point === "running");
  const group = (order: (typeof ORDERS)[number], code: string) => demoSamples(order).map((_, i) => ({ id: uuid(100 * running.indexOf(order) + i + 1), sample_code: `${code}-S${String(i + 1).padStart(3, "0")}` }));

  it("puts two clients' orders in one batch, interleaved, with a pooled QC every 6 samples and at the end", () => {
    expect(new Set(running.map(order => order.client)).size).toBe(2);
    expect(stepsFor("running").at(-1)).toBe("register");
    const injections = sharedBatchInjections([group(running[0], "ORD701"), group(running[1], "ORD702")]);
    expect(injections[0]).toMatchObject({ seq: 1, sample_type: "Blank", vial: "A1" });
    expect(injections.slice(1, 4).map(row => row.sample_name)).toEqual(["ORD701-S001", "ORD702-S001", "ORD701-S002"]);
    expect(injections[7]).toMatchObject({ sample_type: "Quality Control", sample_name: "QC_001" });
    expect(injections.at(-1)).toMatchObject({ sample_type: "Quality Control" });
    expect(injections.filter(row => row.sample_type === "Unknown")).toHaveLength(running[0].samples + running[1].samples);
    expect(injections[8].vial).toBe("A2"); // down the columns
    expect(new Set(injections.map(row => row.vial)).size).toBe(injections.length);
  });

  it("records about half the run: acquired, one sample failed, the rest left planned", () => {
    const injections = sharedBatchInjections([group(running[0], "ORD701"), group(running[1], "ORD702")]);
    const rows = runningStatuses(injections);
    expect(rows.length).toBe(Math.floor(injections.length * 0.55));
    expect(rows.filter(row => row.status === "failed")).toHaveLength(1);
    expect(rows.filter(row => row.status === "acquired")).toHaveLength(rows.length - 1);
    expect(injections.find(row => row.sample_name === rows.find(r => r.status === "failed")!.sample_name)?.sample_type).toBe("Unknown");
  });
});
