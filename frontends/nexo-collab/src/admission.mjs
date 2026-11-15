// Admission (docs/integration/nexo-collab-plan.md 2.1 "Collab messages" and "Protected document fields", 2.3 limits),
// with the project role of src/roles.mjs (Phase 5 as cut). An incoming Y update is applied to a shadow copy of the
// document first; the whole update is refused when the role may not write a changed path (Viewer: none, Commenter: only
// under `comments`), when a changed path is protected, or when the result exceeds a limit. A refusal is Hocuspocus'
// own read-only answer (SyncStatus false, nothing applied) preceded by a stateless {type: 'refused', reason, paths}.
import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { can } from './roles.mjs';

const MiB = 1024 ** 2;
// Server-written fields. A changed path is protected when it agrees with a pattern over their common length: a write at
// or under the pattern, or one that replaces or deletes what holds it (a whole node, nodes.n1.instance, nexo.nodes.n1).
// nexo.nodes.*.inputs is protected whole: without the card schema the sidecar cannot tell computed controls apart.
// A node's instance id and source name the R card its intents reach (commits.mjs), so they are the server's too.
const PROTECTED = ['meta.*', 'renderState.*', 'nodes.*.instance.inputs', 'nodes.*.instance.id', 'nodes.*.instance.instanceId',
  'nodes.*.instance.source', 'nodes.*.statistics.result',
  'nodes.*.statistics.applied', 'nodes.*.finished', 'nexo.nodes.*.actions', 'nexo.nodes.*.inputs', 'nexo.design', 'activity'].map(p => p.split('.'));
const ROOTS = ['canvas', 'nodes', 'document', 'tabs', 'nexo', 'comments', 'renderState', 'meta'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  !(value instanceof Y.AbstractType);
const isProtected = path => PROTECTED.some(pattern =>
  pattern.slice(0, path.length).every((segment, i) => segment === '*' || segment === path[i]));

// Paths changed when `path` goes from `before` to `after` (undefined = absent); plain JSON objects (statistics, a
// nexo.nodes entry, meta.session) are compared key by key so that, e.g., a presentation change is not a result change.
function changed(path, before, after, out) {
  const keys = isObject(after) && (before === undefined || isObject(before))
    ? new Set([...Object.keys(before ?? {}), ...Object.keys(after)]) : null;
  if (!keys?.size) { out.push(path); return; }
  for (const key of keys) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after[key])) changed([...path, key], before?.[key], after[key], out);
  }
}

// 2.3: nodes ≤ 40, tabs ≤ 20, document items ≤ 80, each snapshot ≤ 4 MiB, Team JSON ≤ 24 MiB less a 5 % margin (R
// canonicalises differently), Nexo member ≤ 2 MiB. 2.3 names none for comments, renderState, meta or other roots, so the
// encoded document (`bytes`, state plus update) has one total bound of 32 MiB. Returns the first limit exceeded.
// commits.mjs checks a card it is about to create with it as well.
export function exceeded(doc, bytes) {
  const team = Object.fromEntries(['canvas', 'nodes', 'document', 'tabs'].map(name => [name, doc.getMap(name).toJSON()]));
  const nodes = Object.values(team.nodes);
  if (nodes.length > 40) return 'nodes';
  if ((team.tabs.tabs?.length ?? 0) > 20) return 'tabs';
  if ((team.document.items?.length ?? 0) > 80) return 'items';
  if (nodes.some(n => typeof n?.finished?.url === 'string' && Buffer.byteLength(n.finished.url) > 4 * MiB)) {
    return 'snapshotBytes';
  }
  if (Buffer.byteLength(JSON.stringify(team)) > 0.95 * 24 * MiB) return 'teamBytes';
  if (Buffer.byteLength(JSON.stringify(doc.getMap('nexo').toJSON())) > 2 * MiB) return 'nexoBytes';
  if (bytes > 32 * MiB) return 'totalBytes';
  return null;
}

// Comments (Phase 6 as cut): a Y.Map per entry in 'comments' with its replies in a Y.Array of plain objects. Any Editor
// adds an entry or a reply, resolves and votes (its own key only); only the author changes or deletes the rest of an
// entry, and nobody removes someone else's reply (the entry's author may remove only its own). Returns the changed
// paths not allowed; pushes onto `stamps` the entries and replies to stamp with the connection's identity once applied.
function commentPaths(document, shadow, paths, userId, stamps) {
  const out = [];
  for (const id of new Set(paths.filter(p => p[0] === 'comments' && p.length > 1).map(p => p[1]))) {
    const own = paths.filter(p => p[0] === 'comments' && p[1] === id), entry = shadow.getMap('comments').get(id);
    if (entry !== undefined && !(entry instanceof Y.Map && entry.get('replies') instanceof Y.Array &&
      entry.get('replies').toArray().every(isObject))) { out.push(...own); continue; }
    const prior = document.getMap('comments').get(id), after = entry?.toJSON();
    const before = prior instanceof Y.Map ? prior.toJSON() : undefined; // anything else is not a comment: replaceable
    const mine = !before || before.author === userId, old = before?.replies ?? [], added = [], lost = [];
    let next = 0; // each reply after the update is a surviving old one (in order) or an added one
    for (const [position, reply] of (after?.replies ?? []).entries()) {
      const at = old.findIndex((o, i) => i >= next && JSON.stringify(o) === JSON.stringify(reply));
      if (at < 0) { added.push({ at: position, json: JSON.stringify(reply) }); continue; }
      lost.push(...old.slice(next, at)); next = at + 1;
    }
    lost.push(...old.slice(next));
    // Every reply by someone else survives, the thread author's update included (so a thread holding one stays).
    const taken = lost.some(reply => !mine || reply?.author !== userId);
    // Votes (UX-A4): a Y.Map keyed by userId; anyone who may comment sets (true) or deletes only their own key.
    const was = before?.votes ?? {}, now = after?.votes ?? {};
    const voted = !!after && (entry.get('votes') !== undefined && !(entry.get('votes') instanceof Y.Map) ||
      Object.keys({ ...was, ...now }).some(key => was[key] !== now[key] && (key !== userId || ![true, undefined].includes(now[key]))));
    out.push(...own.filter(p => p.length < 3 ? !mine || taken || voted : p[2] === 'replies' ? taken : p[2] === 'votes' ? voted
      : !mine && p[2] !== 'resolved'));
    if (after) stamps.push({ id, entry: mine, replies: added });
  }
  return out;
}

// Applied stamps (author, displayName and kind: staff | client), written by the server (origin 'server') right after the update they belong to. A reply is stamped by
// its position in the update's result, only those the update added, and only if it is still there unchanged.
function stamp(document, stamps, { userId, displayName, kind }) {
  document.transact(() => {
    for (const { id, entry, replies } of stamps) {
      const comment = document.getMap('comments').get(id);
      if (!(comment instanceof Y.Map)) continue;
      if (entry && comment.get('author') !== userId) comment.set('author', userId);
      if (entry && comment.get('displayName') !== displayName) comment.set('displayName', displayName);
      if (entry && comment.get('kind') !== kind) comment.set('kind', kind);
      const list = comment.get('replies');
      for (const { at, json } of replies) {
        const reply = list.get(at);
        if (JSON.stringify(reply) !== json || (reply.author === userId && reply.displayName === displayName && reply.kind === kind)) continue;
        list.delete(at, 1); list.insert(at, [{ ...reply, author: userId, displayName, kind }]);
      }
    }
  }, 'server');
}

/** Why `update` from a connection with `role` (and `userId`) may not be applied to `document`: {reason, paths}, or null;
 *  comment stamps for an accepted update go onto `stamps`; `serverSeeds` when the sidecar has an engine. */
export function refusal(document, update, role, userId, stamps = [], serverSeeds = false) {
  const state = Y.encodeStateAsUpdate(document);
  const shadow = new Y.Doc();
  Y.applyUpdate(shadow, state);
  const paths = [];
  for (const name of ROOTS) {
    shadow.getMap(name).observeDeep(events => {
      for (const event of events) {
        const at = [name, ...event.path];
        if (!(event.target instanceof Y.Map)) { paths.push(at); continue; }
        for (const [key, { action, oldValue }] of event.changes.keys) {
          changed([...at, key], action === 'add' ? undefined : oldValue,
            action === 'delete' ? undefined : event.target.get(key), paths);
        }
      }
    });
  }
  // The activity feed (a Y.Array the sidecar appends to, commits.mjs logActivity) is the server's, even in a seed.
  shadow.getArray('activity').observe(() => paths.push(['activity']));
  // A document with nothing but server meta (POST /collab/projects writes project, workspace and origin) takes the first
  // opener's seed (provider.ts, origin init), protected fields included, except the meta the server already wrote; unless
  // the sidecar seeds it from R (`serverSeeds`: an engine and an origin, engine.mjs open), then no exemption.
  const seeding = !(serverSeeds && document.getMap('meta').has('origin')) &&
    ROOTS.every(name => name === 'meta' || !document.getMap(name).size);
  const written = document.getMap('meta').size > 0;
  Y.applyUpdate(shadow, update);
  const dotted = list => list.map(path => path.join('.'));
  try {
    if (!paths.length) return null;
    if (!can(role, 'comments')) return { reason: role, paths: dotted(paths) };
    const outside = can(role, 'board') ? [] : paths.filter(path => path[0] !== 'comments');
    if (outside.length) return { reason: role, paths: dotted(outside) };
    const forbidden = paths.filter(path => isProtected(path) && (!seeding || path[0] === 'activity' || (written && path[0] === 'meta')));
    if (forbidden.length) return { reason: 'protected', paths: dotted(forbidden) };
    const limit = exceeded(shadow, state.byteLength + update.byteLength);
    if (limit) return { reason: limit, paths: dotted(paths) };
    const comments = commentPaths(document, shadow, paths, userId, stamps);
    return comments.length ? { reason: 'comment', paths: dotted(comments) } : null;
  } finally {
    shadow.destroy();
  }
}

/** The awareness identity of an authenticated caller with its project `role`; displayName the one Admin's nexo_people
 *  gives the caller (auth.mjs), else the token's claim when Admin put one there. */
export function identity(caller, token, role) {
  let claimed = null;
  try { claimed = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).displayName; } catch { /* not a JWT */ }
  const hue = parseInt(createHash('sha256').update(String(caller.userId)).digest('hex').slice(0, 8), 16) % 360;
  return {
    userId: caller.userId,
    displayName: caller.displayName ?? (typeof claimed === 'string' && claimed.trim() ? claimed : caller.staff ? 'Lab staff' : 'Member'),
    kind: caller.staff ? 'staff' : 'client',
    role,
    colour: `hsl(${hue} 65% 45%)`,
  };
}

/** Hocuspocus extension: refuses updates in beforeSync, stamps identity in beforeHandleAwareness. The connection context
 *  carries `identity` (set in onAuthenticate). */
const pending = new WeakMap(); // connection → comment stamps of the update being applied
export const admission = {
  async beforeSync({ connection, document, type, payload }) {
    if (type === 0) return; // sync step 1 is a state vector, not an update
    const { role, userId } = connection.context.identity, stamps = [];
    const refused = refusal(document, payload, role, userId, stamps, connection.context.serverSeeds);
    if (!refused) { if (stamps.length) pending.set(connection, stamps); return; }
    connection.sendStateless(JSON.stringify({ type: 'refused', ...refused }));
    connection.readOnly = true; // for this message only: Hocuspocus answers SyncStatus false and applies nothing
  },
  async afterHandleMessage({ connection, document }) {
    connection.readOnly = connection.context.identity.role === 'viewer';
    const stamps = pending.get(connection);
    if (stamps) { pending.delete(connection); stamp(document, stamps, connection.context.identity); }
  },
  async beforeHandleAwareness({ connection, states }) {
    if (!connection) return;
    for (const state of states.values()) if (state) Object.assign(state, connection.context.identity);
  },
};
