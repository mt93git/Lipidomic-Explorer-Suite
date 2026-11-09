import { describe, expect, it } from 'vitest';
import { uploadAllowed } from './uploadAccess';
// nexo-store-scope.md: a client member never sees Upload ZIP (the API answers 403 staff_only); staff see it as today.
describe('uploadAllowed', () => {
  it('hides Upload ZIP from a client member', () => { expect(uploadAllowed('client', false)).toBe(false); });
  it('shows it to staff, and without an Admin view (signed out, no Admin on the host, not asked yet) as today', () => {
    expect(uploadAllowed('staff', false)).toBe(true);
    expect(uploadAllowed(null, false)).toBe(true);
  });
  it('never shows it read-only', () => { expect(uploadAllowed('staff', true)).toBe(false); });
});
