// Synthetic users only. No GoTrue or staging connection.
import { describe, expect, test, vi } from 'vitest';
import { throwawayUsers, retireThrowawayUsers } from './retire-users.mjs';

const users = [{ id: 'u1', email: 'itabc123-operator@example.test' }, { id: 'u2', email: 'itabc123-b-member@example.test' }];
describe('throwaway user retirement', () => {
  test('matches only an it run id and a label at exactly example.test', () => {
    expect(throwawayUsers([...users, ...[
      'it-owner@example.test', 'ITabc-owner@example.test', 'itabc-@example.test', 'itabc-owner@other.test',
      'itabc-owner@example.test.evil', 'steph.sim@admin-staging.test', 'owner@example.test', 'xxitabc-owner@example.test',
    ].map(email => ({ id: email, email }))])).toEqual(users);
  });
  test('archives both kinds of membership before banning, and ignores other users', async () => {
    const calls = [];
    await retireThrowawayUsers([...users, { id: 'real', email: 'owner@example.test' }], {
      archive: async (table, ids) => calls.push([table, ids]), ban: async id => calls.push(['ban', id]),
    });
    expect(calls).toEqual([['client_member', ['u1']], ['lab_staff', ['u1']], ['ban', 'u1'], ['client_member', ['u2']], ['lab_staff', ['u2']], ['ban', 'u2']]);
  });
  test('keeps users with failed membership archives unbanned and continues on failure and reports failure without leaking response details', async () => {
    const archive = vi.fn().mockRejectedValueOnce(new Error('secret')).mockResolvedValueOnce(null);
    const ban = vi.fn().mockResolvedValue(null);
    await expect(retireThrowawayUsers(users, { archive, ban })).rejects.toThrow(/^user retirement failed: u1 client_member archive$/);
    expect(archive).toHaveBeenCalledTimes(4);
    expect(ban).toHaveBeenCalledExactlyOnceWith('u2');
  });
  test('does nothing when no throwaway users were created', async () => {
    const archive = vi.fn(); const ban = vi.fn();
    await retireThrowawayUsers([], { archive, ban });
    expect(archive).not.toHaveBeenCalled(); expect(ban).not.toHaveBeenCalled();
  });
});
