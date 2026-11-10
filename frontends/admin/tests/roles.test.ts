// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { allows, clientRoles, labRoleKey, permissions } from "@/lib/roles";

// The roles a 0002 helper lets through, read from the SQL: the role lists in its body, plus the helpers it calls.
// is_client_member admits every client role (membership only).
const helpersSql = readFileSync(fileURLToPath(new URL("../../../db/admin/migrations/0002_helpers.sql", import.meta.url)), "utf8");
const bodies = new Map(helpersSql.split("CREATE FUNCTION admin.").slice(1).map(chunk => [chunk.slice(0, chunk.indexOf("(")), chunk.slice(chunk.indexOf("AS $$"))]));
function rolesOf(helper: string): string[] {
  const body = bodies.get(helper);
  if (!body) throw new Error(`no helper ${helper} in 0002_helpers.sql`);
  const listed = [...body.matchAll(/IN \(([^)]*)\)/g)].flatMap(match => [...match[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
  const called = [...body.matchAll(/admin\.([a-z_]+)\(/g)].map(match => match[1]).filter(name => name !== helper);
  const inherited = called.flatMap(name => name === "is_client_member" ? [...clientRoles] : ["lab_role", "client_role"].includes(name) ? [] : rolesOf(name));
  return [...new Set([...listed, ...inherited])].sort();
}

test("every matrix row tied to a role helper lists exactly the roles that helper admits", () => {
  const tied = permissions.filter(row => bodies.has(row.rule));
  expect(tied.map(row => row.rule).sort()).toEqual(["can_read_client", "is_lab_manager", "is_lab_manager", "is_lab_staff", "is_lab_writer", "is_lab_writer"]);
  for (const row of tied) expect([...row.roles].sort(), row.key).toEqual(rolesOf(row.rule));
});

// The functions the app calls for an action, at their latest definition across the migrations, with the bodies of the
// admin helpers they call: the row's rule must be the check that actually guards them (security review finding 6).
const migrationsDir = fileURLToPath(new URL("../../../db/admin/migrations/", import.meta.url));
const allSql = readdirSync(migrationsDir).filter(name => name.endsWith(".sql")).sort().map(name => readFileSync(migrationsDir + name, "utf8")).join("\n");
function latestBody(fn: string): string {
  const chunks = allSql.split(/CREATE (?:OR REPLACE )?FUNCTION admin\./).slice(1).filter(chunk => chunk.startsWith(`${fn}(`));
  if (!chunks.length) throw new Error(`no function admin.${fn} in the migrations`);
  const last = chunks[chunks.length - 1];
  const start = last.indexOf("$$");
  return last.slice(start, last.indexOf("$$", start + 2));
}
function guardedBody(fn: string, seen = new Set<string>()): string {
  seen.add(fn);
  const body = latestBody(fn);
  const called = [...body.matchAll(/admin\.([a-z_]+)\(/g)].map(match => match[1]).filter(name => !seen.has(name) && allSql.includes(`FUNCTION admin.${name}(`));
  return [body, ...called.map(name => guardedBody(name, seen))].join("\n");
}
const guards: Record<string, RegExp> = {
  is_lab_writer: /admin\.(require_lab_writer|is_lab_writer)\(/,
  is_lab_manager: /admin\.is_lab_manager\(\)/,
  lab_owner: /admin\.lab_role\(auth\.uid\(\)\) IS DISTINCT FROM 'owner'/,
};

test("each action row names the functions the app calls for it, and the row's rule is what guards them", () => {
  const withRpcs = permissions.filter(row => row.rpcs?.length);
  expect(withRpcs.map(row => row.key).sort()).toEqual(["invite_client", "invite_lab", "manage_clients", "release_policy", "run_lab", "submit"]);
  for (const row of withRpcs) {
    for (const fn of row.rpcs ?? []) expect(guardedBody(fn), `${row.key}: ${fn}`).toMatch(guards[row.rule]);
  }
  // Opening orders, receiving shipments and registering samples: require_lab_writer, so lab staff only.
  const submit = permissions.find(row => row.key === "submit")!;
  expect(submit.rpcs).toEqual(["create_order", "receive_shipment", "register_samples"]);
  expect([...submit.roles].sort()).toEqual(rolesOf("is_lab_writer"));
  for (const role of ["client_admin", "requester", "viewer", "member"]) expect(allows("submit", role), role).toBe(false);
});

test("Owner-only rows and the people rules the demo uses", () => {
  for (const row of permissions.filter(item => item.rule === "lab_owner")) expect(row.roles, row.key).toEqual(["owner"]);
  expect(allows("invite_lab", "owner")).toBe(true);
  expect(allows("invite_lab", "admin")).toBe(false);
  expect(allows("invite_client", "admin")).toBe(true);
  expect(allows("invite_client", "operator")).toBe(false);
  expect(allows("invite_client", "client_admin")).toBe(false);
  expect(allows("invite_client", null)).toBe(false);
  expect(() => allows("fly", "owner")).toThrow(/Unknown permission/);
  expect(labRoleKey("Owner")).toBe("owner");
  expect(labRoleKey("Requester")).toBeNull();
});
