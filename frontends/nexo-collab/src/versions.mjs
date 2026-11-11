// Versions as cut (plan "Phases 3–7 as cut", Phase 4): a row in the sidecar's SQLite per checkpoint R stores for the
// project. `save {name?}` and `restore {versionId}` are intents run by src/commits.mjs (one transaction with origin
// 'server' that also writes meta.engineRevision and meta.lastChange). Every 5 minutes each connected project is
// autosaved on the engine's queue when meta.engineRevision changed since its last version; 20 autosave rows are kept.
import { randomUUID } from 'node:crypto';
import { register, logActivity } from './commits.mjs';
import { teamCanvas, nexoOf, replaceBoard } from './board.mjs';

export function createVersions({ db, engine, connected }) {
  const last = db.prepare('SELECT revision FROM versions WHERE project = ? ORDER BY rowid DESC LIMIT 1');
  const prune = db.prepare(`DELETE FROM versions WHERE project = ? AND kind = 'autosave' AND id NOT IN
    (SELECT id FROM versions WHERE project = ? AND kind = 'autosave' ORDER BY rowid DESC LIMIT 20)`);
  const find = db.prepare('SELECT checkpoint_id, kind, name FROM versions WHERE project = ? AND id = ?');
  const insert = db.prepare(`INSERT INTO versions (project, id, kind, name, checkpoint_id, actor, display_name, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  /** Saves the document's board with `call` (a path under the project's R session) as a collab checkpoint, writes its row
   * with the revision R answered the checkpoint with. */
  async function save(doc, call, kind, name, identity) {
    const meta = doc.getMap('meta'), project = meta.get('project');
    const checkpoint = await call('/checkpoints', {
      label: name ?? kind, collab: true, canvas: { token: `collab-${randomUUID()}`, state: teamCanvas(doc) }, nexo: nexoOf(doc),
    });
    const id = randomUUID();
    insert.run(project, id, kind, name ?? null, checkpoint.id, identity?.userId ?? null, identity?.displayName ?? null,
      engine.revision(project) ?? null);
    if (kind === 'autosave') prune.run(project, project);
    return id;
  }
  register('save', async ({ doc, call, payload, identity }) => {
    await save(doc, call, 'named', payload?.name, identity);
    return Object.assign(() => doc.getMap('meta').set('savedAt', Date.now()), { label: payload?.name });
  });
  // Restore: a before-restore version of the current board, R reopened from the chosen checkpoint (the commit then
  // writes that session's revision), the board and the recovery baseline replaced from R's open answer. Undo = restore meta.restoredFrom.beforeRestoreId.
  register('restore', async ({ doc, call, engine: unscoped, payload, identity }) => {
    const meta = doc.getMap('meta'), project = meta.get('project');
    const version = find.get(project, payload?.versionId ?? '');
    if (!version) throw Object.assign(new Error('unknown_version'), { reason: 'unknown_version' });
    const beforeRestoreId = await save(doc, call, 'before-restore', null, identity);
    const opened = await unscoped('/sessions', { checkpointId: version.checkpoint_id, collab: { workspace: meta.get('workspace'), project } });
    if (!opened) throw Object.assign(new Error('engine_unavailable'), { reason: 'engine_unavailable' });
    await engine.transfer(project, opened.sessionId);
    return Object.assign(() => {
      replaceBoard(doc, opened.canvas, opened.nexo);
      meta.set('session', { id: opened.sessionId, generation: opened.generation });
      meta.set('engineStatus', 'ready');
      // Recovery (engine.mjs open) reopens the restored checkpoint, which already holds its analysis, cohort and palette.
      meta.set('origin', { checkpointId: version.checkpoint_id });
      const design = opened.design;
      if (design) meta.set('design', { unit: design.unit, type: design.type, confirmed: design.confirmed === true });
      else meta.delete('design');
      for (const key of ['analysis', 'cohort', 'palette']) meta.delete(key);
      meta.set('savedAt', Date.now());
      meta.set('restoredFrom', { versionId: payload.versionId, beforeRestoreId, by: identity.userId, displayName: identity.displayName, at: Date.now() });
    }, { label: version.name ?? version.kind });
  });
  const timer = setInterval(() => {
    for (const project of connected()) {
      engine.run(project, async ({ doc, call }) => {
        const meta = doc.getMap('meta'), session = meta.get('session');
        if (!session || meta.get('engineRevision') === last.get(project)?.revision) return;
        await save(doc, (path, body) => call(`/sessions/${encodeURIComponent(session.id)}${path}`, body), 'autosave');
        doc.transact(() => {
          meta.set('engineRevision', engine.revision(project)); meta.set('savedAt', Date.now());
          logActivity(doc, { actor: null, displayName: null, kind: 'autosave' });
        }, 'server');
      }).catch(e => console.warn(JSON.stringify({ autosave: e.code ?? e.message, project })));
    }
  }, 300_000);
  return { close() { clearInterval(timer); } };
}
