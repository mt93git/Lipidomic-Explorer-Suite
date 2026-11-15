// Global teardown of the golden journey; it also runs after a failed run. Everything the run created through the
// screens is archived, never deleted, with Stephania's token (an Owner), never the service key:
//   the client's orders (the released dataset withdrawn first, then its batch, versions and injections, the aliquots,
//   last the order: the same walk as pilot-teardown.mjs), the client lab's memberships (archive_member) and pending
//   invitations (revoke_invitation), the client (archive_client), the shipping text if the run wrote it, and the release
//   policy put back as it was recorded by journey-setup.mjs.
// The access request stays as approved history; Dana's and Lee's sign-in accounts stay (their memberships are archived,
// so they see nothing). The run id in the credential file is the retry marker: it is removed only when every part
// succeeded, so a re-run finds the rest again (each lookup tolerates already-archived rows).
//   ADMIN_E2E_JOURNEY=1 ADMIN_JOURNEY_RUN_ID=<runId from the file> node -e 'import("./e2e/live/journey-teardown.mjs").then(m => m.default())'
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { REASON, RUN_ID, runNames, SHIPPING_TEXT } from "./journey-run.mjs";

async function call(url, init) {
  const res = await fetch(url, init);
  // Report status only: an auth service response must not leak credentials into the run's output.
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${new URL(url).pathname}: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const list = ids => `in.(${ids.join(",")})`;
const unique = values => [...new Set(values.filter(Boolean))];
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);

export default async function teardown() {
  const env = process.env;
  if (env.ADMIN_E2E_JOURNEY !== "1") return;
  const file = env.ADMIN_JOURNEY_CREDENTIALS;
  if (!file || !existsSync(file)) return;
  const runId = RUN_ID.test(env.ADMIN_JOURNEY_RUN_ID ?? "") ? env.ADMIN_JOURNEY_RUN_ID : null;
  if (!runId) return;
  const run = JSON.parse(readFileSync(file, "utf8"));
  const { clientName } = runNames(runId);
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const auth = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
  const rest = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const session = await call(`${auth}/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: run.steph.email, password: run.steph.password }),
  });
  if (!session?.access_token) throw new Error("journey teardown: sign-in returned no token");
  const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Accept-Profile": "admin", "Content-Profile": "admin",
    "Content-Type": "application/json", Prefer: "return=representation" };
  const api = (path, init = {}) => call(`${rest}/${path}`, { ...init, headers });
  const rpc = (name, body) => api(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  const archive = path => api(`${path}&archived_at=is.null`, {
    method: "PATCH", body: JSON.stringify({ archived_at: new Date().toISOString(), archived_reason: REASON }),
  });
  const failures = [];
  const part = async (name, work) => {
    try { return await work(); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
  };

  const clients = await part("client lookup", () => api(`client?select=id,archived_at&name=eq.${encodeURIComponent(clientName)}`));
  const client = Array.isArray(clients) ? clients[0] : undefined;
  if (client) {
    // The client's orders, as pilot-teardown.mjs archives its order: dataset withdrawn, batch, aliquots, then the order.
    const ordersDone = await part("orders", async () => {
      const orders = await api(`order?select=id,code&client_id=eq.${client.id}&archived_at=is.null`);
      if (!Array.isArray(orders)) throw new Error("order selection not confirmed");
      const orderIds = orders.map(order => order.id);
      if (!orderIds.length) return true;
      for (const dataset of await api(`dataset?select=id&order_id=${list(orderIds)}&status=eq.released`)) {
        await rpc("withdraw_dataset", { p_dataset_id: dataset.id, p_reason: REASON });
      }
      const sampleIds = unique((await api(`sample?select=id&order_id=${list(orderIds)}`)).map(row => row.id));
      const aliquotIds = sampleIds.length ? unique((await api(`aliquot?select=id&sample_id=${list(sampleIds)}`)).map(row => row.id)) : [];
      const runVersions = aliquotIds.length ? unique((await api(`injection?select=batch_version_id&aliquot_id=${list(aliquotIds)}`)).map(row => row.batch_version_id)) : [];
      const batchIds = runVersions.length ? unique((await api(`batch_version?select=batch_id&id=${list(runVersions)}`)).map(row => row.batch_id)) : [];
      if (batchIds.length) {
        const versions = await api(`batch_version?select=id,exported_at&batch_id=${list(batchIds)}`);
        const versionIds = unique(versions.map(row => row.id));
        // An exported version's injections are frozen (0016 refuses archiving them); archiving the version covers them.
        const openVersionIds = unique(versions.filter(row => !row.exported_at).map(row => row.id));
        const own = new Set(aliquotIds);
        const foreign = (await api(`injection?select=aliquot_id&batch_version_id=${list(versionIds)}`)).filter(row => row.aliquot_id && !own.has(row.aliquot_id));
        if (foreign.length) throw new Error(`the run's batch also holds ${foreign.length} injection(s) of another order; nothing archived`);
        if (openVersionIds.length) await archive(`injection?batch_version_id=${list(openVersionIds)}`);
        await archive(`batch_version?batch_id=${list(batchIds)}`);
        await archive(`batch?id=${list(batchIds)}`);
      }
      if (aliquotIds.length) await archive(`aliquot?id=${list(aliquotIds)}`);
      const archived = await archive(`order?id=${list(orderIds)}`);
      if (!Array.isArray(archived) || !orderIds.every(id => archived.some(row => row.id === id && row.archived_at))) throw new Error("order archive not confirmed");
      console.log(`journey teardown: archived ${orders.map(order => order.code).join(", ")} with ${batchIds.length} batch(es) and ${aliquotIds.length} aliquot(s)`);
      return true;
    });
    await part("members", async () => {
      for (const member of await api(`client_member?select=id&client_id=eq.${client.id}&archived_at=is.null`)) {
        await rpc("archive_member", { p_kind: "client_member", p_id: member.id, p_reason: REASON });
      }
    });
    await part("invitations", async () => {
      for (const invitation of await api(`invitation?select=id&client_id=eq.${client.id}&accepted_at=is.null&revoked_at=is.null`)) {
        await rpc("revoke_invitation", { p_invitation_id: invitation.id });
      }
    });
    // archive_client refuses while an open order is left: only after the orders are archived.
    if (ordersDone && !client.archived_at) await part("client", () => rpc("archive_client", { p_client_id: client.id, p_reason: REASON }));
    else if (!ordersDone) failures.push("client: not archived because its orders are not");
  } else if (Array.isArray(clients)) {
    console.log("journey teardown: the run created no client lab; nothing to archive there");
  }

  // The shipping text, only if it is still the one this run wrote.
  await part("shipping instructions", async () => {
    const [current] = await api("shipping_instructions?select=body&archived_at=is.null");
    if (current?.body?.trim() !== SHIPPING_TEXT) return;
    if (!("previousShipping" in run)) throw new Error("the previous text was not recorded (journey-setup.mjs)");
    await rpc("set_shipping_instructions", { p_body: run.previousShipping ?? "" });
  });

  // The release policy, only if it is still the journey's (Paula and Stephania, 2): a policy someone else set meanwhile stays.
  await part("release policy", async () => {
    const [current] = await api("release_policy?select=eligible_signers,required_signatures&archived_at=is.null");
    const mine = [run.paula.userId, run.steph.userId];
    if (!current || current.required_signatures !== 2 || !sameSet(current.eligible_signers, mine)) return;
    if (!("previousPolicy" in run)) throw new Error("the previous policy was not recorded (journey-setup.mjs)");
    // No policy row before means any Owner or Admin signs, 2 signatures: an empty signer list says the same.
    const before = run.previousPolicy ?? { eligible_signers: [], required_signatures: 2 };
    if (sameSet(before.eligible_signers, current.eligible_signers) && before.required_signatures === current.required_signatures) return;
    await rpc("set_release_policy", { p_eligible_signers: before.eligible_signers, p_required_signatures: before.required_signatures });
  });

  if (failures.length) throw new Error(`journey teardown: ${failures.join("; ")}; retry marker kept`);
  const current = JSON.parse(readFileSync(file, "utf8"));
  if (current.runId === runId) {
    delete current.runId; delete current.previousPolicy; delete current.previousShipping;
    writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  }
}
