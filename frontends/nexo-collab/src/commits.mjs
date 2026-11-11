// Science commits (docs/integration/nexo-collab-plan.md 2.2, as cut in "Phases 3–7 as cut"): a person's stateless
// {type:'intent', intentId, kind, target:{nodeId?}, payload, baseRevision} is checked against the role, then runs on the
// engine's per-project queue: R is called with the service identity and X-Nexo-Intent (R answers a repeat from its
// 10-minute store, so a timeout is re-asked once with the same id), and the settled values are written into the document
// in one transaction with origin 'server' together with meta.engineRevision and meta.lastChange. The sender gets
// {type:'intent-result', intentId, revision} or {type:'refused', intentId, reason}.
import * as Y from 'yjs';
import { can } from './roles.mjs';
import { exceeded } from './admission.mjs';

const LAB_ONLY = new Set(['finish', 'editFigure', 'confirmBaseline']); // D2
const NOT_HERE = new Set(['save', 'restore']); // the versions task registers them
const ON_NODE = new Set(['inputs', 'action', 'parkCard', 'applyViolin', 'confirmBaseline', 'finish', 'editFigure']);
const registered = new Map();

/** Plugs in a kind this file does not run: fn(context) as the kinds below; it may return the writes to commit (with a
 *  `label` for the activity entry). */
export function register(kind, fn) { registered.set(kind, fn); }

/** Appends {at, actor, displayName, kind, nodeId?, label?} to the document's activity feed (never exported, admission
 *  refuses client writes), keeping the last 200. The caller owns the server transaction. */
export function logActivity(doc, entry) {
  const activity = doc.getArray('activity');
  activity.push([{ at: Date.now(), ...entry }]);
  if (activity.length > 200) activity.delete(0, activity.length - 200);
}

const refusal = reason => Object.assign(new Error(reason), { reason });
// Controls Team's module computes at run time live in Nexo's member (frontends/nexo/src/state/computed.ts isComputedId).
const computed = id => /^(customCol|customShape|sel|case_bucket)_.+$/.test(id) || id === 'bqcSamples' || id === 'gridLog2fcThresh';

function nexoNode(doc, nodeId) {
  const nexo = doc.getMap('nexo');
  if (!nexo.has('nodes')) nexo.set('nodes', new Y.Map());
  if (!nexo.get('nodes').has(nodeId)) nexo.get('nodes').set(nodeId, new Y.Map());
  return nexo.get('nodes').get(nodeId);
}
// Team's hidden control that records a confirmed reference group (R takes it as an ordinary input, statistics.R
// api_group_comparison): only confirmBaseline, lab staff only, may reach it.
const confirmation = inputs => {
  if (Object.keys(inputs ?? {}).some(key => key.endsWith('gc_baseline_confirmation'))) throw refusal('protected_input');
};
// The R card a Team node answers to (checkpoint cards carry instance.id, cards added in a session instance.instanceId).
const instanceOf = node => node?.get('instance')?.get('id') ?? node?.get('instance')?.get('instanceId');
// The client's rule (frontends/nexo/src/api/instance.ts cardInstanceId): a node with no instance is a legacy dashboard
// card (tcinstance_v0_<output>) or a family's fixed view (tcinstance_fixed_<id>, nexo-api/cards.R api_card_fixed_id).
export function cardInstanceId(id, node) {
  const legacy = /^results_dashboard-plot_(pca|violin|dist|comp|heat)$/.exec(id);
  const fixed = /^[a-z][a-z0-9_]*-[A-Za-z][A-Za-z0-9_]*$/.test(id) && !id.startsWith('tcinstance_') ? `tcinstance_fixed_${id.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}` : undefined;
  return instanceOf(node) ?? (legacy ? `tcinstance_v0_${legacy[1]}` : fixed ?? id);
}
const cardPath = ({ instance }) => {
  if (typeof instance !== 'string' || !instance) throw refusal('unknown_card');
  return `/cards/${encodeURIComponent(instance)}`;
};

// The Team node for `node` (schema.ts nodeMap) with instance `inputs`.
function teamNode(node, inputs) {
  const map = new Y.Map();
  for (const key of ['kind', 'id', 'x', 'y', 'width', 'height', 'visual', 'color']) if (node[key] !== undefined) map.set(key, node[key]);
  map.set('label', new Y.Text(node.label ?? ''));
  map.set('instance', new Y.Map([['id', node.instance.id], ['source', node.instance.source], ['inputs', new Y.Map(Object.entries(inputs))]]));
  return map;
}

// 2.3 limits on the document as `change(shadow)` would leave it, checked before R is asked (admission sees only Y
// updates): refused with the name of the limit exceeded.
function bound(doc, change) {
  const shadow = new Y.Doc();
  Y.applyUpdate(shadow, Y.encodeStateAsUpdate(doc));
  change(shadow);
  const limit = exceeded(shadow, Y.encodeStateAsUpdate(shadow).byteLength);
  shadow.destroy();
  if (limit) throw refusal(limit);
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// The payload shapes the kinds below read, checked before R is asked; a kind not listed reads nothing it could trip on.
const VALID = {
  inputs: p => object(p.inputs),
  action: p => Array.isArray(p.actions) && (p.inputs === undefined || object(p.inputs)),
  createCard: ({ node }) => object(node) && typeof node.id === 'string' && object(node.instance) &&
    typeof node.instance.id === 'string' && typeof node.instance.source === 'string' &&
    (node.instance.inputs === undefined || object(node.instance.inputs)),
  analysis: p => object(p.inputs),
  cohort: p => Array.isArray(p.lipids),
  applyViolin: p => object(p.settings),
  confirmBaseline: p => typeof p.confirmationToken === 'string',
};

// A comparison as Team saves it, [a, b], from R's canonical [a, b] or the client's {a, b} (statistics/settings.ts pairs).
const pair = p => Array.isArray(p) ? [p[0], p[1]] : [p?.a, p?.b];

// The client has no presentation-only rule (canvas.ts recheckStatistics asks R after every input change), so a science
// change drops the applied statistics it may invalidate: a card's inputs its own, cohort, design and analysis every card's.
// The person re-applies them; meta.lastChange, written in the same commit, says who changed them.
function unapply(node) {
  const statistics = node.get('statistics');
  return () => { if (statistics?.applied) node.set('statistics', { ...statistics, applied: null, result: null }); };
}
export function unapplyAll(doc) {
  const writes = [...doc.getMap('nodes').values()].filter(node => node instanceof Y.Map).map(unapply);
  return () => writes.forEach(write => write());
}

// The writes of `sent` inputs with every input R settled (answer.inputs): Team's in the node's instance, computed controls and a
// node without instance in Nexo's member.
function settle(doc, nodeId, sent, answer) {
  const node = doc.getMap('nodes').get(nodeId), instance = node.get('instance');
  const settled = Object.entries({ ...sent, ...answer.inputs }); // R's whole baseline: dependent controls, explicit nulls
  const team = instance ? settled.filter(([key]) => !computed(key)) : [];
  const extra = Object.fromEntries(settled.filter(([key]) => !instance || computed(key)));
  const fixed = { ...doc.getMap('nexo').get('nodes')?.get(nodeId)?.get('inputs'), ...extra };
  const unapplied = unapply(node);
  return () => {
    unapplied();
    if (team.length && !instance.has('inputs')) instance.set('inputs', new Y.Map());
    for (const [key, value] of team) instance.get('inputs').set(key, value);
    if (Object.keys(extra).length) nexoNode(doc, nodeId).set('inputs', fixed);
  };
}

// Each kind calls R through `call(path under the session, body, method)` and returns the writes for the commit, built
// from values computed beforehand so that nothing can throw half-way through the transaction.
const kinds = {
  async inputs(context) {
    const { doc, call, nodeId, payload } = context;
    confirmation(payload.inputs);
    const answer = await call(cardPath(context), { inputs: payload.inputs }, 'PATCH');
    return settle(doc, nodeId, payload.inputs, answer);
  },
  // With payload.inputs (the client sends the changed controls with the button, as the direct route did) both go to R
  // in one PATCH and the settled inputs are committed with the actions.
  async action(context) {
    const { doc, call, nodeId, payload } = context;
    if (payload.inputs) confirmation(payload.inputs);
    const actions = [...doc.getMap('nexo').get('nodes')?.get(nodeId)?.get('actions') ?? [], ...payload.actions];
    bound(doc, shadow => nexoNode(shadow, nodeId).set('actions', actions));
    const answer = await call(cardPath(context), { inputs: payload.inputs, actions: payload.actions }, 'PATCH'); // JSON drops undefined
    const inputs = payload.inputs ? settle(doc, nodeId, payload.inputs, answer) : () => {};
    return () => { inputs(); nexoNode(doc, nodeId).set('actions', actions); };
  },
  // payload.node: the Team node the person placed (schema.ts nodeMap); the server writes it with the settled inputs.
  async createCard({ doc, call, nodeId, payload: { node } }) {
    const sent = node.instance.inputs ?? {};
    confirmation(sent);
    if (nodeId !== node.id) throw refusal('target_mismatch');
    if (doc.getMap('nodes').has(node.id)) throw refusal('node_exists');
    if ([...doc.getMap('nodes').values()].some(n => instanceOf(n) === node.instance.id)) throw refusal('instance_exists');
    bound(doc, shadow => shadow.getMap('nodes').set(node.id, teamNode(node, sent)));
    const answer = await call('/cards', { instanceId: node.instance.id, source: node.instance.source, inputs: sent });
    // R's whole settled baseline, computed controls in Nexo's member as the inputs kind writes them.
    const settled = Object.entries({ ...sent, ...answer.inputs });
    const map = teamNode(node, Object.fromEntries(settled.filter(([key]) => !computed(key))));
    const extra = Object.fromEntries(settled.filter(([key]) => computed(key)));
    return () => {
      doc.getMap('nodes').set(node.id, map);
      if (Object.keys(extra).length) nexoNode(doc, node.id).set('inputs', extra);
    };
  },
  async parkCard(context) {
    const { doc, call, nodeId } = context;
    await call(cardPath(context), undefined, 'DELETE');
    return () => { doc.getMap('nodes').delete(nodeId); doc.getMap('nexo').get('nodes')?.delete(nodeId); };
  },
  // Global settings: meta holds the body engine.mjs recovery re-sends; nexo.design is what a checkpoint saves.
  async design({ doc, call, payload: { unit, type } }) {
    const answer = await call('/design', { unit, type, confirm: true });
    const unapplied = unapplyAll(doc);
    return () => {
      unapplied();
      doc.getMap('meta').set('design', { unit, type, confirmed: answer.confirmed === true });
      doc.getMap('nexo').set('design', { unit, type });
    };
  },
  async analysis({ doc, call, payload }) {
    await call('/analysis', { inputs: payload.inputs }, 'PATCH');
    const meta = doc.getMap('meta'), inputs = { ...meta.get('analysis')?.inputs, ...payload.inputs }, unapplied = unapplyAll(doc);
    return () => { unapplied(); meta.set('analysis', { inputs }); };
  },
  async cohort({ doc, call, payload }) {
    const answer = await call('/cohort', { lipids: payload.lipids }, 'PUT');
    const unapplied = unapplyAll(doc);
    return () => { unapplied(); doc.getMap('meta').set('cohort', { lipids: answer.lipids }); };
  },
  async palette({ doc, call, payload }) {
    const answer = await call('/palette', payload, 'PATCH');
    return () => doc.getMap('meta').set('palette', { restore: answer.state });
  },
  // As StatisticsTab.tsx saves an applied result: Team's confirmed settings with comparisons as pairs.
  async applyViolin(context) {
    const { doc, call, nodeId, payload } = context;
    const reply = await call(`${cardPath(context)}/statistics/violin`, { mode: 'apply', settings: payload.settings });
    if (reply.status !== 'ok' || !reply.result) throw refusal(reply.reason ?? reply.status);
    const applied = reply.settings ?? payload.settings, node = doc.getMap('nodes').get(nodeId);
    const statistics = { version: '1', presentation: payload.presentation ?? node.get('statistics')?.presentation,
      applied: { ...applied, comparisons: (applied.comparisons ?? []).map(pair) }, result: reply.result };
    return () => node.set('statistics', statistics);
  },
  // The token confirms the reference group R showed at baseRevision: refused once the engine moved past it, and
  // unless R took it (a stale token gets requiresConfirmation back, statistics.R api_group_comparison).
  async confirmBaseline(context) {
    if (!(context.baseRevision >= (context.doc.getMap('meta').get('engineRevision') ?? 0))) throw refusal('stale');
    const answer = await context.call(`${cardPath(context)}/group-comparison/confirm`, { confirmationToken: context.payload.confirmationToken });
    if (answer.requiresConfirmation === true) throw refusal('requires_confirmation');
  },
  // No R call; the snapshot's only check is the 2.3 limit (admission.mjs snapshotBytes).
  async finish({ doc, nodeId, payload: { finished } }) {
    const node = doc.getMap('nodes').get(nodeId);
    if (typeof finished?.url !== 'string' || Buffer.byteLength(finished.url) > 4 * 1024 ** 2) throw refusal('snapshotBytes');
    return () => node.set('finished', finished);
  },
  async editFigure({ doc, nodeId }) {
    const node = doc.getMap('nodes').get(nodeId);
    return () => node.set('finished', null);
  },
};

// Whether `who` ({role, kind}) may send an intent of `kind` (plan Phase 5 as cut; D2 for the lab-only kinds).
function permit(who, kind) {
  if (!can(who.role, 'intent')) throw refusal(who.role);
  if (kind === 'restore' && !can(who.role, 'restore') && who.kind !== 'staff') throw refusal('owner_only');
  if (LAB_ONLY.has(kind) && who.kind !== 'staff') throw refusal('lab_only');
}
const expired = token => {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000 <= Date.now(); } catch { return false; }
};

// Who the sender is now, right before its intent runs: the socket is open, the token unexpired and, with the server's
// `auth` and `roles`, still within Admin scope (auth's 60 s cache) with the role roles.mjs gives it today.
async function current({ webSocket, context }, project, workspace, { auth, roles }) {
  if (webSocket?.readyState >= 2) throw refusal('connection_closed'); // CLOSING or CLOSED
  if (expired(context.token)) throw refusal('token_expired');
  if (!auth) return context.identity;
  const who = await auth.caller(context.token);
  auth.allow(who, workspace);
  return { ...context.identity, role: roles.effectiveRole(project, who), kind: who.staff ? 'staff' : 'client' };
}

export function createCommits({ engine, auth, roles }) {
  // project + intentId → {at, revision} of each committed intent for R's 10-minute retry window: a repeat is answered
  // from here without calling R or writing the document (or a version row) again.
  const done = new Map();
  /** Hocuspocus onStateless; other stateless messages are left alone. */
  return async function onStateless({ connection, document, payload }) {
    let message;
    try { message = JSON.parse(payload); } catch { return; }
    if (message?.type !== 'intent' || typeof message.intentId !== 'string') return;
    const { intentId, kind, target, payload: body = {}, baseRevision } = message;
    const nodeId = target?.nodeId ?? null;
    const identity = connection.context.identity;
    const send = value => connection.sendStateless(JSON.stringify({ ...value, intentId }));
    try {
      permit(identity, kind);
      if (!object(body) || VALID[kind]?.(body) === false) throw refusal('invalid_payload');
      const run = registered.get(kind) ?? (Object.hasOwn(kinds, kind) ? kinds[kind] : null);
      if (!run) throw refusal(NOT_HERE.has(kind) ? 'not_here' : 'unknown_kind');
      const revision = await engine.run(document.getMap('meta').get('project'), async ({ doc, call, revision }) => {
        const meta = doc.getMap('meta');
        permit(await current(connection, meta.get('project'), meta.get('workspace'), { auth, roles }), kind);
        const key = JSON.stringify([meta.get('project'), intentId]);
        for (const [k, { at }] of done) if (Date.now() - at >= 600_000) done.delete(k);
        if (done.has(key)) return done.get(key).revision;
        if (ON_NODE.has(kind) && !doc.getMap('nodes').has(nodeId)) throw refusal('unknown_node');
        const ask = async (path, value, method) => {
          const session = meta.get('session');
          if (!session) throw refusal('engine_not_ready');
          const once = () => call(`/sessions/${encodeURIComponent(session.id)}${path}`, value, method,
            { intent: intentId, actor: identity.userId });
          const answer = await once().catch(e => { if (e.status === 504 || e.name === 'TimeoutError') return once(); throw e; });
          if (answer === null) throw refusal('engine_unavailable');
          return answer;
        };
        // Always the document node's own card; payload.instance is never read (Astra #7).
        const node = doc.getMap('nodes').get(nodeId);
        const instance = node ? cardInstanceId(nodeId, node) : undefined;
        // `engine` reaches R outside the session path (restore opens a new session), same intent and actor.
        const unscoped = (path, value, method) => call(path, value, method, { intent: intentId, actor: identity.userId });
        const writes = await run({ doc, call: ask, engine: unscoped, nodeId, instance, payload: body, identity, baseRevision });
        const n = revision();
        const before = node?.get('label')?.toString();
        doc.transact(() => {
          writes?.();
          meta.set('engineRevision', n);
          meta.set('lastChange', { nodeId, actor: identity.userId, displayName: identity.displayName, kind, revision: n });
          // The card's label as the commit leaves it (createCard) or as it was (parkCard).
          const label = writes?.label ?? doc.getMap('nodes').get(nodeId)?.get('label')?.toString() ?? before;
          logActivity(doc, { actor: identity.userId, displayName: identity.displayName, kind, ...(nodeId ? { nodeId } : {}), ...(label ? { label } : {}) });
        }, 'server');
        done.set(key, { at: Date.now(), revision: n });
        return n;
      });
      send({ type: 'intent-result', revision });
    } catch (e) {
      send({ type: 'refused', reason: e.code === 'session_lost' ? 'the engine restarted; please redo' : e.reason ?? e.message });
      // Recover now rather than at the next 60 s lease: the engine's renewal reopens a lost session (engine.mjs renew).
      if (e.code === 'session_lost') void engine.renew(document.getMap('meta').get('project')).catch(() => {});
    }
  };
}
