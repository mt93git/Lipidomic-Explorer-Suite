import { describe, expect, it } from 'vitest';
import { bodyStatus } from './cardStatus';
describe('bodyStatus', () => {
  const base = { rendering: 0, text: '', drawn: false, confirming: false, restoringText: 'Restoring Feature distributions…' };
  it('a card waiting for its first image while it restores is updating, not an error', () => {
    expect(bodyStatus({ ...base, text: 'Restoring Feature distributions…' })).toBe('updating');
  });
  it('keeps the other states', () => {
    expect(bodyStatus({ ...base, rendering: 1, text: 'anything' })).toBe('updating');
    expect(bodyStatus({ ...base, text: 'Loading figure…' })).toBe('updating');
    expect(bodyStatus({ ...base, drawn: true })).toBe('current');
    expect(bodyStatus({ ...base, confirming: true, text: 'Confirm baseline' })).toBe('waiting');
    expect(bodyStatus({ ...base, text: "Couldn't bring back Feature distributions." })).toBe('error');
    expect(bodyStatus({ ...base, text: 'Snapshot unavailable' })).toBeUndefined();
    expect(bodyStatus(base)).toBeUndefined();
  });
});
