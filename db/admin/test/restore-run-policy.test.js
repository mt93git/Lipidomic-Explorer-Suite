import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { as, freshDb, U } from './helpers.js';
import { restoreRunPolicy } from './restore-run-policy.mjs';
import { retireThrowawayUsers } from './retire-users.mjs';

let db;
beforeAll(async () => { db = await freshDb(); });
afterAll(async () => { await db?.close(); });
describe('integration policy teardown', () => {
  test('restores the implicit default through audited postgres archival', async () => {
    await as(db, null);
    await db.query("update admin.release_policy set archived_at = now(), archived_reason = 'synthetic setup' where archived_at is null");
    await as(db, U.owner);
    await db.query('select admin.set_release_policy($1, 2)', [[U.owner, U.admin]]);
    await as(db, null);
    const before = (await db.query("select * from admin.audit_event where entity = 'release_policy' and action = 'UPDATE'")).rows.length;
    const sql = async text => (await db.query(text)).rows.map(row => Object.values(row).join('|')).join('\n');
    await restoreRunPolicy({ sql, runUserIds: [U.owner], priorSigners: '', restore: vi.fn() });
    expect((await db.query('select * from admin.release_policy where archived_at is null')).rows).toEqual([]);
    expect((await db.query('select admin.required_signatures() as n')).rows[0].n).toBe(2);
    expect((await db.query("select * from admin.audit_event where entity = 'release_policy' and action = 'UPDATE'")).rows).toHaveLength(before + 1);
  });
  test('restores a prior explicit policy and rejects an unsuccessful restoration', async () => {
    const restore = vi.fn().mockResolvedValue({ ok: true });
    await restoreRunPolicy({ priorSigners: '{a,b}', priorRequired: '2', restore });
    expect(restore).toHaveBeenCalledWith(['a', 'b'], 2);
    restore.mockResolvedValue({ ok: false });
    await expect(restoreRunPolicy({ priorSigners: '{a,b}', priorRequired: '2', restore })).rejects.toThrow(/restoration/);
  });
  test('fails when default restoration leaves a live policy', async () => {
    await expect(restoreRunPolicy({ sql: vi.fn().mockResolvedValue('1'), runUserIds: [], priorSigners: '' })).rejects.toThrow(/default/);
  });
  test('does not archive or ban a user still named in the restored policy', async () => {
    const archive = vi.fn(); const ban = vi.fn();
    await expect(retireThrowawayUsers([{ id: U.owner, email: 'itabc-owner@example.test' }], {
      beforeRetire: async () => { throw new Error('still named in live policy'); }, archive, ban,
    })).rejects.toThrow(/live policy/);
    expect(archive).not.toHaveBeenCalled();
    expect(ban).not.toHaveBeenCalled();
  });
});
