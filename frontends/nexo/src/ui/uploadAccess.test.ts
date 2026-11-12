import { describe, expect, it } from 'vitest';
import { datasetUploadAllowed, uploadAllowed } from './uploadAccess';
// nexo-store-scope.md: a client member never sees Upload ZIP (the API answers 403 staff_only); staff see it as today.
describe('uploadAllowed', () => {
  it('hides Upload ZIP from a client member', () => { expect(uploadAllowed('client', false)).toBe(false); });
  it('shows it to staff, and without an Admin view (signed out, no Admin on the host, not asked yet) as today', () => {
    expect(uploadAllowed('staff', false)).toBe(true);
    expect(uploadAllowed(null, false)).toBe(true);
  });
  it('never shows it read-only', () => { expect(uploadAllowed('staff', true)).toBe(false); });
});
// C5: the Excel upload (POST /datasets/upload) is for lab staff and for a client member whose client has members_prepare.
describe('datasetUploadAllowed', () => {
  it('shows it to lab staff', () => { expect(datasetUploadAllowed('staff', false, false)).toBe(true); });
  it('shows it to a client member whose client prepares, hides it otherwise', () => {
    expect(datasetUploadAllowed('client', true, false)).toBe(true);
    expect(datasetUploadAllowed('client', false, false)).toBe(false);
  });
  it('hides it without an Admin view and read-only', () => {
    expect(datasetUploadAllowed(null, true, false)).toBe(false);
    expect(datasetUploadAllowed('staff', false, true)).toBe(false);
  });
});
