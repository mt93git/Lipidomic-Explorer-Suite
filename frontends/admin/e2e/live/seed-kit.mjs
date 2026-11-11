// The GoTrue / PostgREST helpers of a seed, as e2e/live/pilot-seed.mjs uses them (the pilot seed keeps its own copy:
// it is verified on staging and its tests pin it). Never prints a key, password or TOTP secret.
import { randomBytes } from "node:crypto";
import { totp, totpStep } from "./totp.mjs";

export function createSeedKit(env, prefix) {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const authUrl = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
  const restUrl = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const stop = message => { console.error(`${prefix}: ${message}`); process.exit(1); };

  async function call(url, { key = service, token, method = "GET", body, headers = {} } = {}) {
    const res = await fetch(url, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const detail = typeof data === "object" && data ? data.message ?? data.msg ?? data.error_description ?? data.error ?? "" : String(data);
      const hint = res.status === 401 || res.status === 403 || /permission denied/i.test(String(detail))
        ? " (the service role needs USAGE on schema admin and SELECT, INSERT on admin.lab_staff, panel; SELECT on release_policy, shipping_instructions)" : "";
      throw new Error(`${method} ${url.replace(base, "")}: ${res.status} ${detail}${hint}`);
    }
    return data;
  }
  const auth = (path, init) => call(`${authUrl}${path}`, init);
  const rest = (path, init = {}) => call(`${restUrl}/${path}`, {
    ...init, headers: { "Accept-Profile": "admin", "Content-Profile": "admin", Prefer: "return=representation", ...init.headers },
  });
  // 32 random URL-safe characters plus one of each class, for stacks with a strength policy.
  const password = () => `${randomBytes(24).toString("base64url")}Aa1!`;

  // GoTrue admin API: find the persona by email (create it when missing), set its new password and display name.
  async function ensureUser({ email, name }, secret) {
    for (let page = 1; ; page++) {
      const { users = [] } = await auth(`/admin/users?page=${page}&per_page=200`);
      const found = users.find(user => user.email?.toLowerCase() === email);
      if (found) {
        await auth(`/admin/users/${found.id}`, { method: "PUT", body: { password: secret, email_confirm: true, user_metadata: { display_name: name } } });
        return found.id;
      }
      if (users.length < 200) break;
    }
    const created = await auth("/admin/users", { method: "POST", body: { email, password: secret, email_confirm: true, user_metadata: { display_name: name } } });
    return created.id;
  }

  // admin.lab_staff (user_id is unique): insert when missing; an existing row is used only as it is.
  async function ensureStaff(userId, { email, name, role }) {
    const [found] = await rest(`lab_staff?select=role,display_name,archived_at&user_id=eq.${userId}`);
    if (!found) return rest("lab_staff", { method: "POST", body: { user_id: userId, role, display_name: name } });
    if (found.archived_at) stop(`the lab_staff row of ${email} is archived; the seed never restores rows. Restore it by hand.`);
    if (found.role !== role) stop(`the lab_staff row of ${email} has role ${found.role}, not ${role}; the seed never changes rows. Fix it by hand.`);
    if (found.display_name !== name) console.log(`${prefix}: note: ${email} is shown as "${found.display_name ?? email}" (left unchanged)`);
  }

  // A fresh verified TOTP factor (the persona's old factors are removed first). Returns the secret and the 30-second
  // step its code was used in.
  async function enrollTotp(userId, email, secret) {
    for (const factor of (await auth(`/admin/users/${userId}/factors`)) ?? []) {
      await auth(`/admin/users/${userId}/factors/${factor.id}`, { method: "DELETE" });
    }
    const session = await auth("/token?grant_type=password", { key: anon, method: "POST", body: { email, password: secret } });
    const user = { key: anon, token: session.access_token };
    const factor = await auth("/factors", { ...user, method: "POST", body: { factor_type: "totp", friendly_name: "admin-journey" } });
    const challenge = await auth(`/factors/${factor.id}/challenge`, { ...user, method: "POST", body: {} });
    const verifiedAt = Date.now();
    await auth(`/factors/${factor.id}/verify`, { ...user, method: "POST", body: { challenge_id: challenge.id, code: totp(factor.totp.secret, verifiedAt) } });
    return { totpSecret: factor.totp.secret, totpStep: totpStep(verifiedAt) };
  }

  // The panel New order and the batch builder choose (admin.panel has no screen yet).
  async function ensurePanel(name) {
    const [found] = await rest(`panel?select=id,archived_at&name=eq.${encodeURIComponent(name)}`);
    if (found?.archived_at) stop(`the panel "${name}" is archived; the seed never restores rows. Restore it by hand.`);
    return found ?? (await rest("panel", { method: "POST", body: { name, dataset_type: "global", lc_method: "Synthetic LC method (pilot simulation)" } }))[0];
  }

  return { auth, rest, password, ensureUser, ensureStaff, enrollTotp, ensurePanel, stop };
}
