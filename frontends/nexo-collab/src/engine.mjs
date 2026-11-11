import { serviceToken } from './service.mjs';
import { replaceBoard } from './board.mjs';
import { cardInstanceId } from './commits.mjs';

const BUSY_DEADLINE = 60_000;

/** One promise chain and lease timer per project. The document's persisted meta supplies the origin, never a client. */
export function createEngine({ apiUrl = process.env.NEXO_API_URL, secret = process.env.NEXO_SERVICE_SECRET } = {}) {
  const base = new URL(apiUrl);
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(base.hostname)) throw new Error('NEXO_API_URL must be loopback HTTP');
  const projects = new Map();
  let closed = false;
  const write = (state, values) => state.doc.transact(() => {
    for (const [key, value] of Object.entries(values)) state.doc.getMap('meta').set(key, value);
  }, 'server');
  function queue(state, run) {
    const next = state.tail.then(run);
    state.tail = next.catch(() => {});
    return next;
  }
  // `intent` adds X-Nexo-Intent (R answers a repeat from its 10-minute store); `actor` names who the change is for.
  async function call(state, path, body, method = 'POST', { intent, actor = state.actor } = {}) {
    const meta = state.doc.getMap('meta'), started = Date.now();
    for (;;) {
      if (closed) throw new Error('Engine closed');
      const response = await fetch(`${base.href.replace(/\/$/, '')}/api/v1${path}`, {
        method, signal: AbortSignal.timeout(180_000),
        headers: { 'Content-Type': 'application/json', 'X-Nexo-Service-Token': serviceToken({
          workspace: meta.get('workspace'), project: meta.get('project'), actor, secret,
        }), ...(intent ? { 'X-Nexo-Intent': intent } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = await response.json();
      const failure = () => Object.assign(new Error(value.message ?? value.error), { status: response.status, code: value.error });
      // capacity: no worker for the project yet; busy: R's api_exclusive held by another request, retried with the
      // same intent id until BUSY_DEADLINE after the first ask.
      if (response.status === 503 && (value.error === 'capacity' || value.error === 'busy')) {
        const raw = response.headers.get('Retry-After');
        const seconds = Number(raw);
        const delay = raw !== null && Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(raw) - Date.now()) || 1000;
        if (value.error === 'busy' && Date.now() + delay > started + BUSY_DEADLINE) throw failure();
        if (value.error === 'capacity') write(state, { engineStatus: 'waiting' });
        if (!state.connections) return null;
        await new Promise(resolve => { state.wake = resolve; state.retry = setTimeout(resolve, delay); });
        state.wake = null; clearTimeout(state.retry);
        if (!state.connections) return null;
        continue;
      }
      if (!response.ok) throw failure();
      // Only a finite revision is kept: the header first, else the body's (never NaN from a header sent twice, "3, 3").
      const header = Number(response.headers.get('X-Nexo-Engine-Revision') ?? NaN);
      const revision = Number.isFinite(header) ? header : value.engineRevision;
      if (Number.isFinite(revision)) state.revision = revision;
      return value;
    }
  }
  // connections 0 releases the session (R's lease is live only while connections + inFlight > 0).
  const lease = (state, id, connections = state.connections) =>
    call(state, `/sessions/${encodeURIComponent(id)}/lease`, { connections, inFlight: 0 });
  async function open(state, settings) {
    const meta = state.doc.getMap('meta'), origin = meta.get('origin');
    if (!origin || !meta.get('workspace') || !meta.get('project')) throw new Error('Project meta origin, workspace and project are required');
    const collab = { workspace: meta.get('workspace'), project: meta.get('project') };
    const checkpointId = origin.checkpointId;
    const body = checkpointId ? { checkpointId, collab } : {
      ...(origin.adminDatasetId ? { adminDatasetId: origin.adminDatasetId } : { datasetId: origin.datasetId }), settings: settings ?? origin.settings, collab,
    };
    const opened = await call(state, checkpointId ? '/sessions' : '/datasets/sessions', body);
    if (!opened) return;
    const prefix = `/sessions/${encodeURIComponent(opened.sessionId)}`;
    // A design confirmed on the board, else the one confirmed on Prepare (a dataset's settings), else a checkpoint's.
    const design = meta.get('design') ?? origin.settings?.design ?? state.doc.getMap('nexo').get('design');
    if (design?.confirmed) await call(state, `${prefix}/design`, { unit: design.unit, type: design.type, confirm: true });
    for (const [key, method] of [['analysis', 'PATCH'], ['cohort', 'PUT'], ['palette', 'PATCH']]) {
      if (meta.has(key)) await call(state, `${prefix}/${key}`, meta.get(key), method);
    }
    const nexo = state.doc.getMap('nexo').toJSON(), nodes = state.doc.getMap('nodes');
    for (const [id, { instance }] of Object.entries(nodes.toJSON())) {
      // A fixed dashboard card (no instance) exists in every session: only its Nexo inputs and actions are replayed.
      const instanceId = cardInstanceId(id, nodes.get(id));
      if (instance) await call(state, `${prefix}/cards`, { instanceId, source: instance.source, inputs: instance.inputs ?? {} });
      const extra = nexo.nodes?.[id];
      if (extra?.inputs && Object.keys(extra.inputs).length) await call(state, `${prefix}/cards/${encodeURIComponent(instanceId)}`, { inputs: extra.inputs }, 'PATCH');
      if (extra?.actions?.length) await call(state, `${prefix}/cards/${encodeURIComponent(instanceId)}/replay`, { actions: extra.actions });
    }
    await lease(state, opened.sessionId);
    // An unseeded board (no canvas.version, as client seedDoc) takes R's open answer, with the session, in one transaction.
    state.doc.transact(() => {
      if (opened.canvas && !state.doc.getMap('canvas').has('version')) {
        replaceBoard(state.doc, opened.canvas, opened.nexo ?? { version: 1, nodes: {} });
      }
      write(state, { session: { id: opened.sessionId, generation: opened.generation }, engineRevision: state.revision, engineStatus: 'ready', engineQueue: state.queued ?? 0 }); // a crash may have left a count
    }, 'server');
  }
  // A preparation change (projects.mjs decisions): a session prepared with `settings`, the board replayed onto it as
  // recovery does, then the old session released. The caller writes meta.origin.settings once this has succeeded.
  async function reopen(state, settings) {
    const meta = state.doc.getMap('meta'), old = meta.get('session');
    await open(state, settings);
    if (!meta.get('session') || meta.get('session').id === old?.id) throw Object.assign(new Error('engine_unavailable'), { code: 'engine_unavailable' });
    const revision = state.revision; // the release answers the old session's revision
    if (old) await lease(state, old.id, 0).catch(() => {});
    state.revision = revision;
  }
  async function renew(state) {
    if (!state.connections || closed) return;
    const session = state.doc.getMap('meta').get('session');
    if (!session) return open(state);
    try {
      const result = await lease(state, session.id);
      if (result?.generation && result.generation !== session.generation) await open(state);
    } catch (error) {
      if (error.status === 409 && error.code === 'session_lost') await open(state);
      else throw error;
    }
  }
  return {
    connect(doc, actor) {
      const project = doc.getMap('meta').get('project');
      let state = projects.get(project);
      if (!state) { state = { doc, actor, connections: 0, tail: Promise.resolve() }; projects.set(project, state); }
      state.doc = doc; state.actor = actor; state.connections++;
      if (!state.timer) state.timer = setInterval(() => { void queue(state, () => renew(state)).catch(() => write(state, { engineStatus: 'error' })); }, 60_000);
      return queue(state, () => renew(state));
    },
    disconnect(project) {
      const state = projects.get(project); if (!state) return;
      state.connections = Math.max(0, state.connections - 1);
      if (!state.connections) { clearInterval(state.timer); state.timer = null; state.wake?.(); }
    },
    renew(project) { const state = projects.get(project); return queue(state, () => renew(state)); },
    /** Runs fn({doc, call, revision, reopen(settings)}) on the project's queue, after every earlier open, renewal and intent. The number
     *  of these jobs waiting or running is meta.engineQueue (the client's "Engine busy · N queued"). */
    run(project, fn) {
      const state = projects.get(project);
      if (!state) return Promise.reject(Object.assign(new Error('engine_not_ready'), { code: 'engine_not_ready' }));
      const count = n => { state.queued = n; write(state, { engineQueue: n }); };
      count((state.queued ?? 0) + 1);
      return queue(state, () => fn({ doc: state.doc, revision: () => state.revision, reopen: settings => reopen(state, settings),
        call: (path, body, method, options) => call(state, path, body, method, options) })).finally(() => count(state.queued - 1));
    },
    /** Inside run(): leases the session a restore opened, then releases the one meta.session still names. */
    async transfer(project, sessionId) {
      const state = projects.get(project), old = state.doc.getMap('meta').get('session');
      await lease(state, sessionId);
      const revision = state.revision; // the release answers the old session's revision, not the new one's
      if (old && old.id !== sessionId) await lease(state, old.id, 0).catch(() => {});
      state.revision = revision;
    },
    /** The revision R last answered for the project (a header or the body's engineRevision). */
    revision(project) { return projects.get(project)?.revision; },
    idle(project) { return projects.get(project)?.tail ?? Promise.resolve(); },
    close() {
      closed = true;
      for (const state of projects.values()) { clearInterval(state.timer); state.wake?.(); }
    },
  };
}
