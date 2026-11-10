#!/usr/bin/env node
// One-off cleanup of test leftovers on the Admin staging stack. Dry run by default (prints what it would do); --apply
// acts. Nothing is deleted: rows are retired with archived_at and archived_reason, and a released dataset is withdrawn
// through admin.withdraw_dataset (0008: a released version is never archived through the archive columns).
//
// What it takes:
//   - clients named "<run id> Client A|B" by test/staging.integration.mjs (run id "it" + base-36 time), with every
//     order and dataset of theirs;
//   - orders that e2e/live/seed.mjs created under the fixed "E2E Live Client A|B" ("E2E live [own ]YYYY-MM-DD HH:MM")
//     and their datasets. The two E2E Live clients, the test users and memberships are fixtures and stay.
// An order or client that still holds a released dataset the account could not withdraw stays live (reported).
//
// It refuses to run unless NEXT_PUBLIC_SUPABASE_URL (the target, as for the seeds) is exactly the staging gateway
// named in ADMIN_STAGING_GATEWAY_URL; GoTrue and PostgREST are reached only under that gateway (/auth/v1, /rest/v1).
// Admin rows use a lab owner or admin token (ADMIN_CLEANUP_EMAIL, ADMIN_CLEANUP_PASSWORD) and RLS decides;
// Withdrawing needs that person to be an eligible signer under the current release policy. Never prints secrets.
// Optional --retire-users also archives memberships (through admin.archive_member: lab staff rows need the lab Owner's
// token) and bans only <it run>-<label>@example.test users.
// It requires SUPABASE_SERVICE_ROLE_KEY from env for the GoTrue admin API only (listing and banning), never admin rows.
//
//   ADMIN_STAGING_GATEWAY_URL=https://… NEXT_PUBLIC_SUPABASE_URL=https://… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     ADMIN_CLEANUP_EMAIL=… ADMIN_CLEANUP_PASSWORD=… node db/admin/test/archive-staging-test-data.mjs [--apply] [--retire-users]
import { BAN_DURATION, retireThrowawayUsers, throwawayUsers } from './retire-users.mjs';
import { pathToFileURL } from 'node:url';

export const RUN_CLIENT = /^it[0-9a-z]{7,9} Client [AB]$/;
export const LIVE_CLIENTS = ['E2E Live Client A', 'E2E Live Client B'];
export const LIVE_ORDER = /^E2E live (own )?\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const REASON = 'staging test leftover (archive-staging-test-data.mjs)';

const normalized = (url) => { const u = new URL(url); return `${u.origin}${u.pathname.replace(/\/+$/, '')}`; };
const origin = (url) => { try { return new URL(url).origin; } catch { return 'an invalid URL'; } };

export function assertStagingTarget(target, staging) {
  if (!staging?.trim()) throw new Error('ADMIN_STAGING_GATEWAY_URL is not set: name the staging gateway; this script runs nowhere else');
  if (!target?.trim()) throw new Error('NEXT_PUBLIC_SUPABASE_URL (the target) is not set');
  let same = false;
  try { same = normalized(target) === normalized(staging); } catch { same = false; }
  if (!same) throw new Error(`the target ${origin(target)} is not the staging gateway ${origin(staging)}; nothing was done`);
}

export function plan({ clients, orders, datasets }) {
  const archiveClients = clients.filter(c => RUN_CLIENT.test(c.name));
  const run = new Set(archiveClients.map(c => c.id));
  const live = new Set(clients.filter(c => LIVE_CLIENTS.includes(c.name)).map(c => c.id));
  const archiveOrders = orders.filter(o => run.has(o.client_id) || (live.has(o.client_id) && LIVE_ORDER.test(o.title ?? '')));
  const ids = new Set(archiveOrders.map(o => o.id));
  const mine = datasets.filter(d => ids.has(d.order_id) && !d.archived_at);
  return { withdraw: mine.filter(d => d.status === 'released'), archiveDatasets: mine.filter(d => d.status !== 'released'), archiveOrders, archiveClients };
}

export async function main(env = process.env, args = process.argv.slice(2)) {
  const apply = args.includes('--apply');
  const retireUsers = args.includes('--retire-users');
  assertStagingTarget(env.NEXT_PUBLIC_SUPABASE_URL, env.ADMIN_STAGING_GATEWAY_URL);
  const missing = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ADMIN_CLEANUP_EMAIL', 'ADMIN_CLEANUP_PASSWORD'].filter(name => !env[name]?.trim());
  if (retireUsers && !env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) throw new Error(`missing environment: ${missing.join(', ')}`);

  const base = normalized(env.ADMIN_STAGING_GATEWAY_URL);
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  async function call(path, init = {}) {
    const res = await fetch(`${base}${path}`, init);
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok && path.startsWith('/auth/v1/admin/')) throw new Error(`GoTrue admin API: ${res.status}`);
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: ${res.status} ${typeof data === 'object' && data ? data.message ?? data.msg ?? data.error ?? '' : String(data)}`);
    return data;
  }
  const session = await call('/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_CLEANUP_EMAIL, password: env.ADMIN_CLEANUP_PASSWORD }) });
  const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'Accept-Profile': 'admin', 'Content-Profile': 'admin',
    'Content-Type': 'application/json', Prefer: 'return=representation' };
  const rest = (path, init = {}) => call(`/rest/v1/${path}`, { ...init, headers });
  const inChunks = async (ids, query) => {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) out.push(...await query(ids.slice(i, i + 100).join(',')));
    return out;
  };

  // Only these GoTrue admin endpoints use the service key; admin schema reads/writes keep the signed-in token.
  const authAdmin = (path, init = {}) => call(`/auth/v1/admin/users${path}`, { ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' } });
  const users = [];
  if (retireUsers) {
    for (let page = 1; ; page++) {
      const { users: batch = [] } = await authAdmin(`?page=${page}&per_page=200`);
      users.push(...throwawayUsers(batch));
      if (batch.length < 200) break;
    }
  }

  const clients = (await rest('client?select=id,name&archived_at=is.null'))
    .filter(c => RUN_CLIENT.test(c.name) || LIVE_CLIENTS.includes(c.name));
  const orders = await inChunks(clients.map(c => c.id), ids => rest(`order?select=id,code,title,client_id&archived_at=is.null&client_id=in.(${ids})`));
  const datasets = await inChunks(orders.map(o => o.id), ids => rest(`dataset?select=id,order_id,status,version,archived_at&archived_at=is.null&order_id=in.(${ids})`));
  const todo = plan({ clients, orders, datasets });
  const code = new Map(orders.map(o => [o.id, o.code]));
  console.log(`archive-staging: ${apply ? 'applying' : 'dry run (pass --apply to act)'} on ${origin(base)}`);
  console.log(`  withdraw ${todo.withdraw.length} released dataset(s): ${todo.withdraw.map(d => `${code.get(d.order_id)} v${d.version}`).join(', ') || '-'}`);
  console.log(`  archive ${todo.archiveDatasets.length} other dataset(s), ${todo.archiveOrders.length} order(s): ${todo.archiveOrders.map(o => o.code).join(', ') || '-'}`);
  console.log(`  archive ${todo.archiveClients.length} client(s): ${todo.archiveClients.map(c => c.name).join(', ') || '-'}`);
  if (retireUsers) console.log(`  retire ${users.length} throwaway user(s) (archive memberships and ban; no auth deletion)`);
  if (!apply) return;

  const blocked = new Set(); // orders that still hold a released dataset
  for (const d of todo.withdraw) {
    try { await rest('rpc/withdraw_dataset', { method: 'POST', body: JSON.stringify({ p_dataset_id: d.id, p_reason: REASON }) }); } catch (error) {
      blocked.add(d.order_id);
      console.log(`  kept ${code.get(d.order_id)} v${d.version} released: ${error.message}`);
    }
  }
  const archived = JSON.stringify({ archived_at: new Date().toISOString(), archived_reason: REASON });
  const patch = (table, ids) => inChunks(ids, chunk => rest(`${table}?id=in.(${chunk})&archived_at=is.null`, { method: 'PATCH', body: archived }));
  const orderIds = todo.archiveOrders.filter(o => !blocked.has(o.id)).map(o => o.id);
  const blockedClients = new Set(todo.archiveOrders.filter(o => blocked.has(o.id)).map(o => o.client_id));
  const results = {
    datasets: await patch('dataset', todo.archiveDatasets.map(d => d.id)),
    orders: await patch('order', orderIds),
    clients: await patch('client', todo.archiveClients.filter(c => !blockedClients.has(c.id)).map(c => c.id)),
  };
  console.log(`archive-staging: withdrew ${todo.withdraw.length - blocked.size}, archived ${results.datasets.length} dataset(s), ${results.orders.length} order(s), ${results.clients.length} client(s)`);
  // 0015: memberships are archived through admin.archive_member only (lab staff need an Owner token), then re-read.
  if (retireUsers) await retireThrowawayUsers(users, {
    archive: async (table, ids) => {
      const query = `${table}?user_id=in.(${ids.join(',')})&archived_at=is.null&select=id`;
      for (const row of await rest(query)) {
        await rest('rpc/archive_member', { method: 'POST', body: JSON.stringify({ p_kind: table, p_id: row.id, p_reason: REASON }) });
      }
      if ((await rest(query)).length) throw new Error('membership archive not confirmed');
    },
    ban: id => authAdmin(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ban_duration: BAN_DURATION }) }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`archive-staging: ${error.message}`); process.exit(1); });
}
