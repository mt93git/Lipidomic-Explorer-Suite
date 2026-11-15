// The collaboration sidecar (docs/integration/nexo-collab-plan.md, Phase 0): Hocuspocus on loopback, one Yjs document
// per project persisted in SQLite, the Admin verifier on connect, admission of updates and awareness (Phase 2, cut),
// and GET <path>/health.
// Run: COLLAB_PORT, COLLAB_DB, ADMIN_REST_URL, ADMIN_ANON_KEY (and optionally COLLAB_PATH, default /collab) from the
// environment (see collab.env.example); a failed start (migration included) exits non-zero. With NEXO_API_URL and
// NEXO_SERVICE_SECRET a project document's first connection opens its R session (src/engine.mjs) and its last one stops
// the lease, and src/versions.mjs autosaves connected projects; without them the board works and R is never called.
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { openDatabase } from './db.mjs';
import { createAuth } from './auth.mjs';
import { admission, identity } from './admission.mjs';
import { watchExpiry } from './expiry.mjs';
import { createProjects } from './projects.mjs';
import { createEngine } from './engine.mjs';
import { createCommits } from './commits.mjs';
import { createRoles, can } from './roles.mjs';
import { createVersions } from './versions.mjs';

export async function start({ port, dbPath, restUrl, anonKey, path = '/collab', migrationsDir, apiUrl, serviceSecret, revalidateEvery }) {
  const engine = apiUrl && serviceSecret ? createEngine({ apiUrl, secret: serviceSecret }) : null;
  const { db, migrations } = openDatabase(dbPath, migrationsDir);
  db.exec('PRAGMA journal_mode = WAL');
  const auth = createAuth({ restUrl, anonKey, db });
  const roles = createRoles(db);
  const commits = engine ? createCommits({ engine, auth, roles }) : null;
  const connections = new Map();
  // A role written by PUT/DELETE members reaches that person's open connections at once.
  const changed = (project, userId) => {
    for (const { connection } of connections.values()) {
      if (connection.document.name === project && connection.context.userId === userId) roles.tell(connection);
    }
  };
  // A board decision (projects.mjs) changes the live document, loaded for the call when nobody has it open.
  const edit = async (name, fn) => {
    const direct = await server.hocuspocus.openDirectConnection(name);
    try { return await fn(direct.document); } finally { await direct.disconnect(); }
  };
  const projects = createProjects({ db, auth, roles, restUrl, anonKey, changed, engine, edit, online: id => {
    const entry = [...connections.values()].find(({ connection }) => connection.document.name === id);
    return entry ? [...entry.connection.document.awareness.getStates().values()] : [];
  } });
  const versions = engine && createVersions({ db, engine,
    connected: () => new Set([...connections.values()].map(entry => entry.project).filter(Boolean)) });
  const load = db.prepare('SELECT data FROM documents WHERE name = ?');
  const save = db.prepare(`INSERT INTO documents (name, data, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT (name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  const server = new Server({
    address: '127.0.0.1', port, quiet: true, stopOnSignals: false,
    async onAuthenticate(data) {
      const caller = await auth.onAuthenticate(data);
      const member = identity(caller, data.token, roles.effectiveRole(data.documentName, caller));
      data.connectionConfig.readOnly = member.role === 'viewer';
      return { ...caller, identity: member, token: data.token, serverSeeds: !!engine };
    },
    async connected({ connection, context, documentName, socketId }) {
      // Each revalidation rebuilds who the connection is (Admin may have changed staff or clients) before further writes.
      const revalidate = async () => {
        const caller = await auth.onAuthenticate({ token: context.token, documentName });
        const before = connection.context.identity;
        const member = identity(caller, context.token, roles.effectiveRole(documentName, caller));
        Object.assign(connection.context, caller, { identity: member });
        connection.readOnly = member.role === 'viewer';
        if (member.role !== before.role || member.kind !== before.kind) roles.tell(connection);
      };
      const stop = watchExpiry({ token: context.token, close: event => connection.webSocket.close(event.code, event.reason),
        revalidate, every: revalidateEvery });
      roles.tell(connection);
      // Only a document with an origin (written by POST /collab/projects) has an R session to open.
      const meta = connection.document.getMap('meta');
      const project = engine && meta.has('origin') ? meta.get('project') : null;
      if (project) engine.connect(connection.document, context.userId)
        .catch(e => console.warn(JSON.stringify({ engine: e.code ?? e.message, project })));
      connections.set(`${socketId}:${documentName}`, { stop, project, connection });
    },
    async onDisconnect({ socketId, documentName }) {
      const key = `${socketId}:${documentName}`, entry = connections.get(key);
      if (!entry) return;
      entry.stop(); connections.delete(key);
      if (entry.project) engine.disconnect(entry.project);
    },
    // A science intent (src/commits.mjs) answers the sender when R has; never hold Hocuspocus while it runs. Phase 6 as
    // cut: a {type: 'summon', from} from someone who may edit the board goes to the project's other connections.
    async onStateless(data) {
      const { connection, document, payload } = data;
      let message;
      try { message = JSON.parse(payload); } catch { return; }
      if (message?.type === 'summon') {
        if (can(connection.context.identity.role, 'board')) {
          document.broadcastStateless(JSON.stringify({ type: 'summon', from: message.from }), other => other !== connection);
        }
        return;
      }
      void commits?.(data);
    },
    async onRequest({ request, response }) {
      const pathname = new URL(request.url, 'http://x').pathname;
      if (pathname === `${path}/projects` || pathname.startsWith(`${path}/projects/`)) {
        await projects(request, response, pathname.slice(`${path}/projects/`.length));
        throw null;
      }
      if (request.method !== 'GET' || new URL(request.url, 'http://x').pathname !== `${path}/health`) return;
      response.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ok: true, sqlite: true, migrations, admin: auth.admin() }));
      throw null; // handled: stop Hocuspocus' default answer
    },
    extensions: [admission, new Database({
      fetch: async ({ documentName }) => load.get(documentName)?.data ?? null,
      store: async ({ documentName, state }) => { save.run(documentName, state); },
    })],
  });
  try { await server.listen(); } catch (e) { db.close(); throw e; }
  const base = `127.0.0.1:${server.address.port}`;
  return {
    httpUrl: `http://${base}`,
    wsUrl: `ws://${base}`,
    /** Journeys without R: change a project's document as the sidecar does (`fn(doc)` in one transaction). */
    async write(documentName, fn) {
      const direct = await server.hocuspocus.openDirectConnection(documentName);
      try { await direct.transact(fn); } finally { await direct.disconnect(); }
    },
    async close() {
      for (const { stop } of connections.values()) stop();
      connections.clear(); versions?.close(); engine?.close(); await server.destroy(); db.close();
    },
  };
}

if (process.argv[1] === import.meta.filename) {
  const env = process.env;
  const missing = ['COLLAB_PORT', 'COLLAB_DB', 'ADMIN_REST_URL', 'ADMIN_ANON_KEY'].filter(k => !env[k]);
  if (missing.length) { console.error(`nexo-collab: missing ${missing.join(', ')}`); process.exit(1); }
  if (!env.NEXO_API_URL || !env.NEXO_SERVICE_SECRET) console.warn('nexo-collab: NEXO_API_URL or NEXO_SERVICE_SECRET unset; R sessions are not opened');
  start({ port: Number(env.COLLAB_PORT), dbPath: env.COLLAB_DB, restUrl: env.ADMIN_REST_URL, anonKey: env.ADMIN_ANON_KEY,
    path: env.COLLAB_PATH || undefined, apiUrl: env.NEXO_API_URL, serviceSecret: env.NEXO_SERVICE_SECRET })
    .then(collab => {
      console.log(`nexo-collab listening on ${collab.httpUrl}`);
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => collab.close().then(() => process.exit(0)));
    })
    .catch(e => { console.error(`nexo-collab failed to start: ${e.message}`); process.exit(1); });
}
