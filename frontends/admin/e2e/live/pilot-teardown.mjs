// Global teardown also runs after failed pilot steps. Setup captures this run's order;
// the fixed client/personas and the evidence screenshots stay. Admin rows use a persona token, never a service key.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const REASON = "E2E pilot run finished";
async function call(url, init) {
  const res = await fetch(url, init);
  // Report status only: an auth service response must not leak credentials into the run's output.
  if (!res.ok) throw new Error(`pilot teardown: ${init.method ?? "GET"} ${new URL(url).pathname}: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function teardown() {
  const env = process.env;
  if (env.ADMIN_E2E_PILOT !== "1") return;
  const file = env.ADMIN_PILOT_CREDENTIALS;
  if (!file || !existsSync(file)) return;
  const run = JSON.parse(readFileSync(file, "utf8"));
  const orderCode = env.ADMIN_PILOT_RUN_ORDER_CODE;
  if (!/^ORD\d{3,}$/.test(orderCode ?? "")) return;
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const auth = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
  const rest = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Stephania (simulated) is an eligible signer under the pilot policy and an Owner able to archive the order.
  const session = await call(`${auth}/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: run.steph.email, password: run.steph.password }),
  });
  if (!session?.access_token) throw new Error("pilot teardown: sign-in returned no token");
  const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Accept-Profile": "admin", "Content-Profile": "admin",
    "Content-Type": "application/json", Prefer: "return=representation" };
  const api = (path, init = {}) => call(`${rest}/${path}`, { ...init, headers });
  const orders = await api(`order?select=id&code=eq.${orderCode}&archived_at=is.null`);
  if (!Array.isArray(orders) || orders.length !== 1) throw new Error("pilot teardown: order selection not confirmed; retry marker kept");
  for (const order of orders) {
    const datasets = await api(`dataset?select=id&order_id=eq.${order.id}&status=eq.released`);
    for (const dataset of datasets) await api("rpc/withdraw_dataset", {
      method: "POST", body: JSON.stringify({ p_dataset_id: dataset.id, p_reason: REASON }),
    });
    const archived = await api(`order?id=eq.${order.id}&archived_at=is.null`, {
      method: "PATCH", body: JSON.stringify({ archived_at: new Date().toISOString(), archived_reason: REASON }),
    });
    if (!Array.isArray(archived) || !archived.some(row => row.id === order.id && row.archived_at)) {
      throw new Error("pilot teardown: order archive not confirmed; retry marker kept");
    }
  }
  const current = JSON.parse(readFileSync(file, "utf8"));
  if (current.orderCode === orderCode) {
    delete current.orderCode;
    writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  }
  console.log(`pilot teardown: archived ${orders.length} run order(s)`);
}
