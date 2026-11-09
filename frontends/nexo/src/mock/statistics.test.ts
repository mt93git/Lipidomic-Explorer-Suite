import { describe, expect, it } from 'vitest';
import { mockViolinStatistics } from './statistics';
import { sanitizeStatistics } from '../state/validate-support';
import { DEFAULT_PRESENTATION } from '../statistics/settings';

// Pilot simulation, step 11: in the mock, saving after applying violin statistics failed with
// "Invalid saved violin statistics." because the mock's fingerprints were not 64-hex (the server's are sha256).
describe('mock violin statistics', () => {
  it('apply replies save as valid canvas statistics, for every test', async () => {
    for (const [test, effect] of [['welch', 'hedges_g'], ['wilcoxon', 'cliffs_delta']] as const) {
      const settings = { test, correction: 'BH' as const, scope: 'displayed' as const, comparisons: [{ a: 'Control', b: 'Case' }], effect };
      const reply = await mockViolinStatistics('tcinstance_x', { mode: 'apply', settings } as never, 'mock-data:PC(16:0/18:1)');
      const saved = { version: '1', presentation: { ...DEFAULT_PRESENTATION, hidden: [] }, applied: { ...settings, comparisons: [['Control', 'Case']] }, result: reply.result };
      expect(() => sanitizeStatistics(saved), test).not.toThrow();
    }
  });
  it('keeps fingerprints that follow the data: same input, same print; another lipid, another print', async () => {
    const settings = { test: 'welch' as const, correction: 'holm' as const, scope: 'displayed' as const, comparisons: [{ a: 'Control', b: 'Case' }], effect: 'none' as const };
    const one = await mockViolinStatistics('i', { mode: 'apply', settings } as never, 'mock-data:A');
    const again = await mockViolinStatistics('i', { mode: 'apply', settings } as never, 'mock-data:A');
    const other = await mockViolinStatistics('i', { mode: 'apply', settings } as never, 'mock-data:B');
    expect(one.dataFingerprint).toBe(again.dataFingerprint);
    expect(one.dataFingerprint).not.toBe(other.dataFingerprint);
    expect(one.result?.dataFingerprint).toBe(one.dataFingerprint);
  });
});
