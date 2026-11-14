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
  expect(tied.map(row => row.rule).sort()).toEqual(["can_read_client", "is_lab_manager", "is_lab_manager", "is_lab_manager", "is_lab_manager", "is_lab_manager", "is_lab_manager", "is_lab_manager", "is_lab_manager", "is_lab_manager", "is_lab_staff", "is_lab_writer", "is_lab_writer", "is_lab_writer", "is_lab_writer", "is_lab_writer", "is_lab_writer"]);
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
  client_requester: /FROM admin\.client_member\s+WHERE user_id = auth\.uid\(\) AND client_id = p_client_id AND archived_at IS NULL\s+AND role IN \('client_admin', 'requester'\)/,
  signed_in: /IF auth\.uid\(\) IS NULL THEN/,
};

test("each action row names the functions the app calls for it, and the row's rule is what guards them", () => {
  const withRpcs = permissions.filter(row => row.rpcs?.length);
  expect(withRpcs.map(row => row.key).sort()).toEqual(["answer_access", "answer_request", "deliverables", "instruments_panels", "invite_client", "invite_lab", "manage_clients", "members_prepare", "nexo_access", "notification_prefs", "notification_rules", "qc_review", "release_policy", "request_order", "run_lab", "shipping_instructions", "storage", "submit"]);
  for (const row of withRpcs) {
    for (const fn of row.rpcs ?? []) expect(guardedBody(fn), `${row.key}: ${fn}`).toMatch(guards[row.rule]);
  }
  // Opening orders, receiving shipments and registering samples: require_lab_writer, so lab staff only.
  const submit = permissions.find(row => row.key === "submit")!;
  expect(submit.rpcs).toEqual(["create_order", "receive_shipment", "register_samples"]);
  expect([...submit.roles].sort()).toEqual(rolesOf("is_lab_writer"));
  for (const role of ["client_admin", "requester", "viewer", "member"]) expect(allows("submit", role), role).toBe(false);
});

test("F2 rows: client admins and requesters request, any lab writer answers, Owner and Admin set the shipping text", () => {
  expect(permissions.find(row => row.key === "request_order")?.roles).toEqual(["client_admin", "requester"]);
  for (const role of ["viewer", "owner", "admin", "operator", "member"]) expect(allows("request_order", role), role).toBe(false);
  // A client role must not be able to answer its own request, and the request_order guard names exactly those two roles.
  expect([...permissions.find(row => row.key === "answer_request")!.roles].sort()).toEqual(rolesOf("is_lab_writer"));
  expect(latestBody("request_order")).toMatch(/role IN \('client_admin', 'requester'\)/);
  expect(latestBody("receive_shipment")).toMatch(/Accept the request first/);
  expect(allows("shipping_instructions", "operator")).toBe(false);
});

test("F3 row: only a lab Owner or Admin answers access requests; nobody signed in submits them (the app server does)", () => {
  expect([...permissions.find(row => row.key === "answer_access")!.roles].sort()).toEqual(rolesOf("is_lab_manager"));
  for (const role of ["operator", "member", "client_admin", "requester", "viewer"]) expect(allows("answer_access", role), role).toBe(false);
  expect(guardedBody("approve_access_request")).toMatch(/admin\.create_invitation\(/);
  expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION admin\.submit_access_request\(text, text, text, text, text\) TO service_role;/);
  expect(allSql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*submit_access_request[^;]*TO[^;]*(anon|authenticated)/);
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

test("0024 row: only a lab Owner or Admin lets a client's members prepare in Nexo, and only while Nexo access is on", () => {
  const row = permissions.find(item => item.key === "members_prepare")!;
  expect(row).toMatchObject({ area: "Clients and people", rule: "is_lab_manager", rpcs: ["set_client_members_prepare"] });
  expect([...row.roles].sort()).toEqual(rolesOf("is_lab_manager"));
  expect(row.note).toMatch(/Needs Nexo access on; off by default/);
  for (const role of ["operator", "member", "client_admin", "requester", "viewer"]) expect(allows("members_prepare", role), role).toBe(false);
  expect(latestBody("set_client_members_prepare")).toMatch(/IF p_enabled AND NOT c\.nexo_access THEN/);
});

test("0026 row: only a lab Owner or Admin adds, edits and archives instruments and panels; the archive and dataset type rules", () => {
  const row = permissions.find(item => item.key === "instruments_panels")!;
  expect(row).toMatchObject({ area: "Lab administration", rule: "is_lab_manager" });
  expect(row.rpcs).toEqual(["create_instrument", "update_instrument", "archive_instrument", "create_panel", "update_panel", "archive_panel"]);
  expect([...row.roles].sort()).toEqual(rolesOf("is_lab_manager"));
  for (const role of ["operator", "member", "client_admin", "requester", "viewer"]) expect(allows("instruments_panels", role), role).toBe(false);
  expect(latestBody("archive_instrument")).toMatch(/FROM admin\.panel WHERE instrument_id = p_id AND archived_at IS NULL/);
  expect(latestBody("update_panel")).toMatch(/p_dataset_type <> p\.dataset_type\s+AND \(EXISTS \(SELECT 1 FROM admin\."order" WHERE panel_id = p_id\) OR EXISTS \(SELECT 1 FROM admin\.batch WHERE panel_id = p_id\)\)/);
  // The rows change only through those functions (no direct write grant is left for the app role).
  expect(allSql).toMatch(/REVOKE INSERT, UPDATE ON admin\.instrument, admin\.panel FROM authenticated;/);
});

test("0025 row: any lab writer places, moves and removes aliquots; client roles and lab members do not", () => {
  const row = permissions.find(item => item.key === "storage")!;
  expect(row).toMatchObject({ area: "Lab work", rule: "is_lab_writer", rpcs: ["place_aliquot", "move_aliquot", "remove_aliquot"] });
  expect([...row.roles].sort()).toEqual(rolesOf("is_lab_writer"));
  for (const role of ["member", "client_admin", "requester", "viewer"]) expect(allows("storage", role), role).toBe(false);
  // A move archives the old placement as 'moved' before the new one; removing needs a reason; nobody writes box_position directly.
  expect(latestBody("move_aliquot")).toMatch(/archived_reason = 'moved'[\s\S]*INSERT INTO admin\.box_position/);
  expect(latestBody("remove_aliquot")).toMatch(/IF v_reason IS NULL/);
  expect(allSql).toMatch(/REVOKE INSERT, UPDATE ON admin\.box_position FROM authenticated;/);
  // The two reads the screen uses are for lab staff only.
  for (const fn of ["storage_boxes", "storage_aliquots"]) expect(latestBody(fn), fn).toMatch(/IF NOT admin\.is_lab_staff\(auth\.uid\(\)\) THEN/);
});

test("0027 row: any lab writer records QC decisions; client roles and a lab member read them at most", () => {
  const row = permissions.find(item => item.key === "qc_review")!;
  expect(row).toMatchObject({ area: "Lab work", rule: "is_lab_writer", rpcs: ["add_exclusion", "withdraw_exclusion", "mark_qc_checked"] });
  expect([...row.roles].sort()).toEqual(rolesOf("is_lab_writer"));
  for (const role of ["member", "client_admin", "requester", "viewer"]) expect(allows("qc_review", role), role).toBe(false);
  // The stage rules the row's note relies on: exclusions only at processed or qc_checked, the mark only from processed,
  // and the build does not read exclusions (hooks never change science).
  expect(guardedBody("add_exclusion")).toMatch(/o\.stage NOT IN \('processed', 'qc_checked'\)/);
  expect(guardedBody("withdraw_exclusion")).toMatch(/o\.stage NOT IN \('processed', 'qc_checked'\)/);
  expect(latestBody("mark_qc_checked")).toMatch(/IF o\.stage <> 'processed' THEN/);
  expect(guardedBody("build_dataset")).not.toMatch(/exclusion/);
  expect(row.note).toMatch(/keeps every sample's data/);
});

test("0028 rows: everyone signed in sets only their own email switches; only a lab Owner or Admin reads the send log", () => {
  const prefs = permissions.find(item => item.key === "notification_prefs")!;
  expect(prefs).toMatchObject({ rule: "signed_in", rpcs: ["set_my_notification_pref"] });
  expect(latestBody("set_my_notification_pref")).toMatch(/INSERT INTO admin\.notification_pref AS f \(user_id, kind, enabled\) VALUES \(auth\.uid\(\), p_kind, p_enabled\)/);
  for (const role of ["owner", "admin", "operator", "client_admin", "requester", "viewer"]) expect(allows("notification_prefs", role), role).toBe(true);
  const log = permissions.find(item => item.key === "notification_log")!;
  expect([...log.roles].sort()).toEqual(rolesOf("is_lab_manager"));
  expect(allSql).toMatch(/CREATE POLICY notification_log_read ON admin\.notification_log FOR SELECT TO authenticated USING \(admin\.is_lab_manager\(\)\);/);
  expect(allSql).toMatch(/GRANT INSERT ON admin\.notification_log TO service_role;/);
  expect(allSql).not.toMatch(/GRANT [^;]*INSERT[^;]*ON admin\.notification_log TO [^;]*(anon|authenticated)/);
  for (const role of ["operator", "member", "client_admin", "requester", "viewer"]) expect(allows("notification_log", role), role).toBe(false);
});
