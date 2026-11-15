// The Admin verifier (docs/integration/nexo-collab-plan.md 2.1, connect). The client's token is the GoTrue access token
// Nexo already fetches (frontends/nexo/src/api/adminToken.ts); its scope comes from admin.nexo_caller() through
// PostgREST exactly as frontends/nexo-api/datasets.R api_admin_caller does, cached 60 s (never past the token's exp) by the token's sha256.
// The token itself is never kept or logged.
import { createHash } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const refused = reason => Object.assign(new Error(reason), { reason });

// frontends/nexo-api/storage.R api_scope_allow: lab staff may use any workspace; anyone else (a client member, or a
// caller without rows) only nexo-client-<client id> of its clients.
const allows = (caller, workspace) => caller.staff || caller.clients.some(id => workspace === `nexo-client-${id}`);

export function createAuth({ restUrl, anonKey, db, log = console.warn }) {
  const cache = new Map();
  let admin = 'unknown';
  const project = db.prepare('SELECT workspace FROM projects WHERE id = ?');

  // The caller's own display name from admin.nexo_people (lab staff are listed whatever the client, a member under its
  // client), or null: production tokens carry no name (FIX-PROD-E). Never an e-mail; a failure only loses the name.
  async function named(token, who) {
    try {
      const response = await fetch(`${restUrl.replace(/\/+$/, '')}/rpc/nexo_people`, {
        method: 'POST', body: JSON.stringify({ p_client_id: who.staff ? null : who.clients[0] ?? null }), signal: AbortSignal.timeout(10_000),
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Profile': 'admin',
          'Accept-Profile': 'admin', 'Content-Type': 'application/json' },
      });
      const rows = response.ok ? await response.json() : [];
      const name = Array.isArray(rows) ? rows.find(r => r?.user_id === who.userId)?.display_name : null;
      return typeof name === 'string' && name.trim() ? name : null;
    } catch { return null; }
  }

  // { userId, staff, clients, displayName } for the token, or throws: 'admin_auth_required' (Admin says 401) or 'admin_unavailable'.
  async function caller(token) {
    if (typeof token !== 'string' || !/^\S+$/.test(token)) throw refused('admin_auth_required');
    const now = Date.now();
    // Never past the JWT's exp (decoded as commits.mjs expired() does; an opaque token has none).
    let exp = Infinity;
    try { const { exp: s } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); if (Number.isFinite(s)) exp = s * 1000; } catch { /* not a JWT */ }
    if (exp <= now) throw refused('admin_auth_required');
    for (const [key, entry] of cache) if (now >= entry.until) cache.delete(key);
    const key = createHash('sha256').update(token).digest('hex');
    if (cache.has(key)) return cache.get(key).caller;
    let response;
    try {
      response = await fetch(`${restUrl.replace(/\/+$/, '')}/rpc/nexo_caller`, {
        method: 'POST', body: '{}', signal: AbortSignal.timeout(10_000),
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Profile': 'admin',
          'Accept-Profile': 'admin', 'Content-Type': 'application/json' },
      });
    } catch { admin = 'unreachable'; throw refused('admin_unavailable'); }
    if (response.status === 401) { admin = 'reachable'; throw refused('admin_auth_required'); }
    const rows = response.ok ? await response.json().catch(() => null) : null;
    if (!Array.isArray(rows) || !rows.every(r => r?.caller_view === 'staff' ||
        (r?.caller_view === 'client' && typeof r.client_id === 'string' && uuid.test(r.client_id.toLowerCase())))) {
      admin = 'unreachable';
      throw refused('admin_unavailable');
    }
    admin = 'reachable';
    const answer = { userId: rows[0]?.caller ?? null, staff: rows.some(r => r.caller_view === 'staff'),
      rows, clients: [...new Set(rows.filter(r => r.caller_view === 'client').map(r => r.client_id.toLowerCase()))] };
    answer.displayName = await named(token, answer);
    cache.set(key, { until: Math.min(now + 60_000, exp), caller: answer });
    return answer;
  }

  return {
    caller,
    allow(who, workspace) { if (!allows(who, workspace)) throw refused('forbidden_scope'); },
    /** Last nexo_caller result: 'reachable', 'unreachable', or 'unknown' before the first call. */
    admin: () => admin,
    /** Hocuspocus onAuthenticate: the document name is a project id; connect only within the caller's scope. */
    async onAuthenticate({ token, documentName }) {
      let who = null;
      try {
        if (typeof token !== 'string' || !/^\S+$/.test(token)) throw refused('admin_auth_required');
        who = await caller(token);
        const row = project.get(documentName);
        if (!row) throw refused('unknown_project');
        if (!allows(who, row.workspace)) throw refused('forbidden_scope');
        return { userId: who.userId, staff: who.staff, displayName: who.displayName, workspace: row.workspace };
      } catch (e) {
        log(JSON.stringify({ refused: e.reason ?? 'error', project: documentName, user: who?.userId ?? null }));
        throw e;
      }
    },
  };
}
