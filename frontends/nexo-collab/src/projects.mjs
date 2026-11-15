import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import { can } from './roles.mjs';
import { identity } from './admission.mjs';
import { logActivity, unapplyAll } from './commits.mjs';
const fail = (status, reason) => { throw Object.assign(new Error(reason), { status, reason }); };
const ROLES = ['owner', 'editor', 'commenter', 'viewer'];
const CHOICES = ['keep', 'exclude', 'undecided'];
// ENTRY-7: lab staff, or a member of the workspace's client when that client has members_prepare on.
const prepares = (who, workspace) => who.staff || who.rows.some(row =>
  row.caller_view === 'client' && workspace === `nexo-client-${row.client_id.toLowerCase()}` && row.members_prepare === true);
// ENTRY-8: `settings` with `sample` decided. Team's model is outlierTreatments (sample → "remove"; Team re-prepares with
// it); outlierDecisions is the board's record of who decided what (C3), one row per sample.
const removed = (settings, sample) => settings.outlierTreatments?.[sample] === 'remove';
function decided({ outlierTreatments, ...settings }, { sample, choice, reason }, by) {
  const { [sample]: _, ...treatments } = outlierTreatments ?? {};
  if (choice === 'exclude') treatments[sample] = 'remove';
  const rows = [...(settings.outlierDecisions ?? []).filter(d => d.sample !== sample), { sample, choice, ...(reason && { reason }), ...by, at: Date.now() }];
  // A project from before outlierTreatments (C3 until 2026-11-10) left an excluded sample out of `samples`: every decided
  // sample is chosen again, one still excluded by Team's treatment (the client's rule, CheckScreen excluding).
  const back = rows.filter(d => !settings.samples.includes(d.sample));
  for (const d of back) if (d.choice === 'exclude') treatments[d.sample] = 'remove';
  return { ...settings, ...(back.length && { samples: [...settings.samples, ...back.map(d => d.sample)] }),
    ...(Object.keys(treatments).length && { outlierTreatments: treatments }), outlierDecisions: rows };
}
// The samples Team prepares: a decision that changes them prepares the board again.
const prepared = settings => settings.samples.filter(x => !removed(settings, x)).sort().join();
const known = (settings, sample) => settings.samples.includes(sample) || (settings.outlierDecisions ?? []).some(d => d.sample === sample);
const said = (settings, { sample, choice }) => choice === 'exclude' ? `excluded ${sample}`
  : removed(settings, sample) || !settings.samples.includes(sample) ? `undid the exclusion of ${sample}` : choice === 'keep' ? `kept ${sample}` : `undid the decision on ${sample}`;

async function json(request, invalid) {
  let text = '';
  for await (const chunk of request) { text += chunk; if (text.length > 16384) fail(413, 'body_too_large'); }
  try { return JSON.parse(text); } catch { fail(400, invalid); }
}

// Routes under <path>/projects/ (`id` is the rest of the path); GET <path>/projects?dataset=<id> finds a dataset's
// project. Members (Phase 5 as cut): GET <id>/members, PUT|DELETE <id>/members/<userId>; `changed(project, userId)` is told after a role is written.
// ENTRY-8: PUT <id>/decisions {sample, choice, reason?} through `edit(id, fn(doc))` (the live document) and, when the
// sample's treatment changes, `engine` (R re-prepares on the project's queue before the settings are written).
export function createProjects({ db, auth, roles, restUrl, anonKey, changed = () => {}, online = () => [], engine = null, edit }) {
  const find = db.prepare('SELECT * FROM projects WHERE id = ?');
  const dataset = db.prepare("SELECT id FROM projects WHERE workspace = ? AND origin_kind = 'dataset' AND origin_id = ?");
  const all = db.prepare('SELECT p.*, COALESCE(d.updated_at, p.created_at) AS updated_at FROM projects p LEFT JOIN documents d ON d.name = p.id ORDER BY updated_at DESC, p.rowid DESC');
  const byDataset = db.prepare("SELECT * FROM projects WHERE origin_kind = 'dataset' AND origin_id = ? ORDER BY rowid DESC");
  const versions = db.prepare(`SELECT id, kind, name, checkpoint_id AS checkpointId, actor,
    display_name AS displayName, created_at AS createdAt, revision
    FROM versions WHERE project = ? ORDER BY rowid DESC`);
  const stored = db.prepare('SELECT data FROM documents WHERE name = ?');
  // A dataset's preparation settings, from the document's meta.origin (written once, below): a joiner opens with them.
  const settingsOf = id => {
    const data = stored.get(id)?.data;
    if (!data) return undefined;
    const doc = new Y.Doc(); Y.applyUpdate(doc, data);
    const settings = doc.getMap('meta').get('origin')?.settings; doc.destroy();
    return settings;
  };
  const document = db.prepare("INSERT INTO documents (name, data, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT DO NOTHING");

  // admin.nexo_people(p_client_id) with the caller's own token: lab staff and active members of that client, no e-mail.
  async function people(token, clientId) {
    let response;
    try {
      response = await fetch(`${restUrl.replace(/\/+$/, '')}/rpc/nexo_people`, {
        method: 'POST', body: JSON.stringify({ p_client_id: clientId }), signal: AbortSignal.timeout(10_000),
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Profile': 'admin',
          'Accept-Profile': 'admin', 'Content-Type': 'application/json' },
      });
    } catch { fail(503, 'admin_unavailable'); }
    if (response.status === 401) fail(401, 'admin_auth_required');
    const rows = response.ok ? await response.json().catch(() => null) : null;
    if (!Array.isArray(rows)) fail(503, 'admin_unavailable');
    // Admin says 'member' for a client member (0017); Nexo's word, as on the board (awareness kind), is 'client'.
    return rows.map(r => ({ userId: r.user_id, displayName: r.display_name, kind: r.kind === 'member' ? 'client' : r.kind }));
  }

  // Who created `row` (C4): the name Admin's directory gives for the row's client, else the one stored at creation, else
  // the caller's own when it is the caller. `names` keeps one directory call per client within a request; a directory
  // that cannot answer only loses the name (a joiner still joins).
  async function creator(row, who, token, names = new Map()) {
    const client = /^nexo-client-(.+)$/.exec(row.workspace)?.[1];
    if (client && !names.has(client)) names.set(client, people(token, client).catch(e => { if (e.reason === 'admin_auth_required') throw e; return []; }));
    const person = (client ? await names.get(client) : []).find(p => p.userId === row.created_by);
    return { userId: row.created_by, displayName: person?.displayName ?? row.created_by_name ?? (row.created_by === who.userId ? identity(who, token).displayName : null) };
  }

  return async function projects(request, response, path) {
    try {
      const token = request.headers['x-nexo-admin-token'];
      const who = await auth.caller(token);
      const [id, members, userId, extra] = path.split('/');
      const project = () => {
        const row = find.get(id);
        if (!row) fail(404, 'unknown_project');
        auth.allow(who, row.workspace);
        return row;
      };
      let value;
      if (request.method === 'POST' && !path) {
        const { workspace, origin, settings } = await json(request, 'invalid_project') ?? {};
        if (typeof workspace !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(workspace) ||
            !['dataset', 'checkpoint'].includes(origin?.kind) || typeof origin.id !== 'string' || !origin.id || origin.id.length > 512 ||
            (settings !== undefined && (settings === null || typeof settings !== 'object' || Array.isArray(settings)))) fail(400, 'invalid_project');
        auth.allow(who, workspace);
        const existing = origin.kind === 'dataset' && dataset.get(workspace, origin.id);
        if (existing) {
          response.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ projectId: existing.id }));
          return;
        }
        if (origin.kind === 'dataset' && !prepares(who, workspace)) fail(403, 'lab_prepares');
        // These synchronous SQLite operations cannot interleave; the unique index also protects other processes.
        const projectId = randomUUID();
        const created = db.prepare("INSERT INTO projects (id, workspace, origin_kind, origin_id, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
          .run(projectId, workspace, origin.kind, origin.id, who.userId, identity(who, token).displayName).changes;
        // The new document's meta, in the shape engine.mjs open() reads; a dataset's preparation settings live only here.
        if (created) {
          const doc = new Y.Doc();
          doc.transact(() => {
            const meta = doc.getMap('meta');
            meta.set('project', projectId); meta.set('workspace', workspace);
            meta.set('origin', origin.kind === 'checkpoint' ? { checkpointId: origin.id } : { adminDatasetId: origin.id, ...(settings && { settings }) });
          }, 'server');
          document.run(projectId, Y.encodeStateAsUpdate(doc));
          doc.destroy();
        }
        value = { projectId: origin.kind === 'dataset' ? dataset.get(workspace, origin.id).id : projectId };
      } else if (request.method === 'GET' && !path) {
        // ?dataset=<Admin dataset id>: the newest of its projects this caller may open (FIX-G12: the bare Admin link
        // joins the shared board). A row outside the caller's scope is never revealed: 404 as for none.
        const params = new URL(request.url, 'http://x').searchParams;
        if (!params.has('dataset') && !params.toString()) {
          const rows = all.all().filter(r => { try { auth.allow(who, r.workspace); return true; } catch { return false; } });
          const names = new Map();
          value = { projects: await Promise.all(rows.map(async row => {
            const states = online(row.id).filter(person => person?.userId).map(({ userId, displayName }) => ({ userId, displayName }));
            return { projectId: row.id, workspace: row.workspace, origin: row.origin_kind ? { kind: row.origin_kind, id: row.origin_id } : null,
              createdBy: await creator(row, who, token, names),
              createdAt: row.created_at, updatedAt: row.updated_at, online: [...new Map(states.map(person => [person.userId, person])).values()] };
          })) };
        } else {
        const origin = params.get('dataset');
        const row = origin && byDataset.all(origin).find(r => { try { auth.allow(who, r.workspace); return true; } catch { return false; } });
        if (!row) fail(404, 'unknown_project');
        const settings = settingsOf(row.id);
        value = { projectId: row.id, workspace: row.workspace, ...(settings && { settings }), createdBy: await creator(row, who, token) };
        }
      } else if (request.method === 'GET' && id && members === undefined) {
        const row = project();
        const settings = row.origin_kind === 'dataset' ? settingsOf(row.id) : undefined;
        value = { projectId: row.id, workspace: row.workspace, origin: row.origin_kind ? { kind: row.origin_kind, id: row.origin_id } : null, ...(settings && { settings }),
          createdBy: await creator(row, who, token) };
      } else if (request.method === 'GET' && id && members === 'versions' && userId === undefined) {
        value = versions.all(project().id);
      } else if (request.method === 'GET' && id && members === 'members' && userId === undefined) {
        // A lab-only workspace has no client, so nobody to list beyond the members (the Share dialog reads `workspace`).
        const { workspace } = project(), client = /^nexo-client-(.+)$/.exec(workspace)?.[1];
        const list = client ? await people(token, client) : [];
        // The caller is named even where Admin lists nobody (a lab-only workspace): from its own token, as on the board.
        const me = identity(who, token);
        const named = new Map([[who.userId, me], ...list.map(person => [person.userId, person])]);
        value = { workspace, members: roles.members(id).map(({ userId: user, role }) =>
          ({ userId: user, displayName: named.get(user)?.displayName ?? null, kind: named.get(user)?.kind ?? null, role })), people: list };
      } else if (['PUT', 'DELETE'].includes(request.method) && id && members === 'members' && userId && extra === undefined) {
        project();
        if (!who.staff && !can(roles.effectiveRole(id, who), 'share')) fail(403, 'forbidden_role');
        const role = request.method === 'PUT' ? (await json(request, 'invalid_role'))?.role : null;
        if (request.method === 'PUT' && !ROLES.includes(role)) fail(400, 'invalid_role');
        roles.set(id, userId, role);
        changed(id, userId);
        value = { userId, role };
      } else if (request.method === 'PUT' && id && members === 'decisions' && userId === undefined) {
        const row = project();
        if (!prepares(who, row.workspace)) fail(403, 'lab_prepares');
        if (!who.staff && !can(roles.effectiveRole(id, who), 'intent')) fail(403, 'forbidden_role');
        const { sample, choice, reason } = await json(request, 'invalid_decision') ?? {};
        if (!CHOICES.includes(choice) || (reason !== undefined && (typeof reason !== 'string' || reason.length > 500))) fail(400, 'invalid_decision');
        const change = { sample, choice, reason: reason?.trim() }, me = identity(who, token), by = { by: who.userId, displayName: me.displayName };
        value = await edit(id, async doc => {
          const meta = doc.getMap('meta'), settings = () => meta.get('origin')?.settings;
          if (!meta.get('origin')?.adminDatasetId || !settings()) fail(409, 'not_prepared_here');
          if (!Array.isArray(settings().samples) || !known(settings(), sample)) fail(400, 'invalid_decision');
          // Read again inside the transaction: another person's decision may have landed while R re-prepared.
          const write = () => doc.transact(() => {
            const before = settings(), next = decided(before, change, by);
            meta.set('origin', { ...meta.get('origin'), settings: next });
            if (removed(before, sample) !== removed(next, sample)) unapplyAll(doc)();
            logActivity(doc, { actor: who.userId, displayName: me.displayName, kind: 'decision', label: said(before, change) });
          }, 'server');
          if (!engine || prepared(settings()) === prepared(decided(settings(), change, by))) write();
          else await engine.run(id, async ({ reopen }) => { await reopen(decided(settings(), change, by)); write(); })
            .catch(e => fail(503, e.code === 'engine_not_ready' ? e.code : 'engine_unavailable'));
          return { settings: settings() };
        });
      } else fail(405, 'method_not_allowed');
      response.writeHead(request.method === 'POST' ? 201 : 200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
    } catch (e) {
      const status = e.status ?? ({ forbidden_scope: 403, admin_auth_required: 401, admin_unavailable: 503 }[e.reason]) ?? 500;
      response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.reason ?? 'internal_error' }));
    }
  };
}
