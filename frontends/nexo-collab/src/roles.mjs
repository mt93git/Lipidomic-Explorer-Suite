// Project roles (docs/integration/nexo-collab-plan.md, Phase 5 as cut): one table (migrations/004_members.sql), one
// matrix. Effective role = the members row, else owner for projects.created_by, else lab staff editor, else client
// member commenter (D8). Finish, Edit figure and confirmBaseline stay lab-staff only whatever the role (commits.mjs).
const MATRIX = {
  owner: ['board', 'comments', 'intent', 'restore', 'share'],
  editor: ['board', 'comments', 'intent'],
  commenter: ['comments'],
  viewer: [],
};

/** Whether `role` may do `action`: board (Y updates outside comments), comments, intent, restore, share. */
export const can = (role, action) => MATRIX[role]?.includes(action) ?? false;

export function createRoles(db) {
  const row = db.prepare('SELECT role FROM members WHERE project = ? AND user_id = ?');
  const creator = db.prepare('SELECT created_by FROM projects WHERE id = ?');
  const rows = db.prepare('SELECT user_id, role FROM members WHERE project = ? ORDER BY rowid');
  const upsert = db.prepare('INSERT INTO members (project, user_id, role) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET role = excluded.role');
  const remove = db.prepare('DELETE FROM members WHERE project = ? AND user_id = ?');
  const effectiveRole = (project, { userId, staff }) => row.get(project, userId)?.role ??
    (userId && creator.get(project)?.created_by === userId ? 'owner' : staff ? 'editor' : 'commenter');
  return {
    /** The role of `caller` ({userId, staff}) in `project`. */
    effectiveRole,
    /** [{userId, role}]: the creator (owner unless a row says otherwise) first, then the rows. */
    members(project) {
      const list = rows.all(project).map(r => ({ userId: r.user_id, role: r.role }));
      const owner = creator.get(project)?.created_by;
      return owner && !list.some(m => m.userId === owner) ? [{ userId: owner, role: 'owner' }, ...list] : list;
    },
    /** Writes `userId`'s row in `project`; a null role removes it (back to the default). */
    set(project, userId, role) { if (role) upsert.run(project, userId, role); else remove.run(project, userId); },
    /** Re-reads a Hocuspocus connection's role into its identity and readOnly, and sends it {type:'role', role, canShare}. */
    tell(connection) {
      const { identity, staff } = connection.context;
      identity.role = effectiveRole(connection.document.name, connection.context);
      connection.readOnly = identity.role === 'viewer';
      connection.sendStateless(JSON.stringify({ type: 'role', role: identity.role, canShare: staff || can(identity.role, 'share') }));
    },
  };
}
