// Global teardown also runs after failed pilot steps. Setup captures this run's marker: the title of the order the
// pilot creates in New order (or, from an older seed, the order's code). Everything the run created through the
// screens is found from that order and archived, never deleted: its released dataset is withdrawn (withdraw_dataset),
// then the batch it planned (injections, versions, batch, as db/admin/test/staging.integration.mjs's 0016 block), the
// aliquots create_batch recorded, and last the order, which is the retry marker in the database: a failed attempt
// leaves it live, and the lookups do not filter on archived_at, so a retry finds the rest again. The fixed
// client/panel/personas and the evidence screenshots stay. Admin rows use a persona token, never a service key.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RUN_CODE, RUN_TITLE } from "./pilot-setup.mjs";

const REASON = "E2E pilot run finished";
async function call(url, init) {
  const res = await fetch(url, init);
  // Report status only: an auth service response must not leak credentials into the run's output.
  if (!res.ok) throw new Error(`pilot teardown: ${init.method ?? "GET"} ${new URL(url).pathname}: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const list = ids => `in.(${ids.join(",")})`;
const unique = values => [...new Set(values.filter(Boolean))];

export default async function teardown() {
  const env = process.env;
  if (env.ADMIN_E2E_PILOT !== "1") return;
  const file = env.ADMIN_PILOT_CREDENTIALS;
  if (!file || !existsSync(file)) return;
  const run = JSON.parse(readFileSync(file, "utf8"));
  const title = RUN_TITLE.test(env.ADMIN_PILOT_RUN_ORDER_TITLE ?? "") ? env.ADMIN_PILOT_RUN_ORDER_TITLE : null;
  const code = !title && RUN_CODE.test(env.ADMIN_PILOT_RUN_ORDER_CODE ?? "") ? env.ADMIN_PILOT_RUN_ORDER_CODE : null;
  if (!title && !code) return;
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const auth = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
  const rest = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Stephania (simulated) is an eligible signer under the pilot policy and an Owner able to archive the run's rows.
  const session = await call(`${auth}/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: run.steph.email, password: run.steph.password }),
  });
  if (!session?.access_token) throw new Error("pilot teardown: sign-in returned no token");
  const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Accept-Profile": "admin", "Content-Profile": "admin",
    "Content-Type": "application/json", Prefer: "return=representation" };
  const api = (path, init = {}) => call(`${rest}/${path}`, { ...init, headers });
  const archive = path => api(`${path}&archived_at=is.null`, {
    method: "PATCH", body: JSON.stringify({ archived_at: new Date().toISOString(), archived_reason: REASON }),
  });

  const selector = title ? `title=eq.${encodeURIComponent(title)}` : `code=eq.${code}`;
  const orders = await api(`order?select=id,code&${selector}&archived_at=is.null`);
  if (!Array.isArray(orders)) throw new Error("pilot teardown: order selection not confirmed; retry marker kept");
  const orderIds = orders.map(order => order.id);
  if (orderIds.length) {
    for (const dataset of await api(`dataset?select=id&order_id=${list(orderIds)}&status=eq.released`)) {
      await api("rpc/withdraw_dataset", { method: "POST", body: JSON.stringify({ p_dataset_id: dataset.id, p_reason: REASON }) });
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
      // The pilot batch holds only this order's samples; a batch shared with another order is left for a person.
      const own = new Set(aliquotIds);
      const foreign = (await api(`injection?select=aliquot_id&batch_version_id=${list(versionIds)}`)).filter(row => row.aliquot_id && !own.has(row.aliquot_id));
      if (foreign.length) throw new Error(`pilot teardown: the run's batch also holds ${foreign.length} injection(s) of another order; nothing archived, retry marker kept`);
      if (openVersionIds.length) await archive(`injection?batch_version_id=${list(openVersionIds)}`);
      await archive(`batch_version?batch_id=${list(batchIds)}`);
      await archive(`batch?id=${list(batchIds)}`);
    }
    if (aliquotIds.length) await archive(`aliquot?id=${list(aliquotIds)}`);
    const archived = await archive(`order?id=${list(orderIds)}`);
    if (!Array.isArray(archived) || !orderIds.every(id => archived.some(row => row.id === id && row.archived_at))) {
      throw new Error("pilot teardown: order archive not confirmed; retry marker kept");
    }
    console.log(`pilot teardown: archived ${orders.map(order => order.code).join(", ")} with ${batchIds.length} batch(es) and ${aliquotIds.length} aliquot(s)`);
  } else {
    console.log("pilot teardown: the run created no order; nothing to archive");
  }
  const current = JSON.parse(readFileSync(file, "utf8"));
  const key = title ? "orderTitle" : "orderCode";
  if (current[key] === (title ?? code)) {
    delete current[key];
    writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  }
}
