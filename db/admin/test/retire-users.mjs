// Shared by the integration teardown and the opt-in leftover cleanup. Never delete auth actors.
export const BAN_DURATION = '876000h';
const RUN_EMAIL = /^it[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*@example\.test$/;
export const throwawayUsers = users => users.filter(user => RUN_EMAIL.test(user.email ?? ''));

export async function retireThrowawayUsers(users, { archive, ban, beforeRetire = async () => {} }) {
  const mine = throwawayUsers(users);
  if (!mine.length) return;
  const failures = [];
  for (const user of mine) {
    try { await beforeRetire(user.id); } catch {
      failures.push(`${user.id} still named in live policy or policy check failed`);
      continue;
    }
    let archived = true;
    for (const table of ['client_member', 'lab_staff']) {
      try { await archive(table, [user.id]); } catch { archived = false; failures.push(`${user.id} ${table} archive`); }
    }
    if (!archived) continue;
    try { await ban(user.id); } catch { failures.push(`${user.id} user ban`); }
  }
  if (failures.length) throw new Error(`user retirement failed: ${failures.join(', ')}`);
}
