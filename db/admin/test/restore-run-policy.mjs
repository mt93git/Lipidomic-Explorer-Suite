// sql runs as postgres. release_policy permits UPDATE of both archive fields and audits it (0005).
export async function restoreRunPolicy({ priorSigners, priorRequired, restore, sql, runUserIds }) {
  if (priorSigners) {
    const ids = priorSigners.replace(/[{}]/g, '').split(',').filter(Boolean);
    const res = await restore(ids, Number(priorRequired));
    if (!res.ok) throw new Error('release policy restoration failed');
    return;
  }
  // Only retire policies set by this run, never a concurrent user's policy.
  if (runUserIds.length) {
    const literals = runUserIds.map(id => "'" + id.replaceAll("'", "''") + "'").join(',');
    await sql(`update admin.release_policy set archived_at = now(), archived_reason = 'staging test: restore implicit default'
      where archived_at is null and set_by in (${literals})`);
  }
  if (String(await sql('select count(*) from admin.release_policy where archived_at is null')) !== '0') {
    throw new Error('release policy default restoration not confirmed: a policy remains live');
  }
}
