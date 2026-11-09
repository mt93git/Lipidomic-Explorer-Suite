import { afterEach, describe, expect, it } from 'vitest';
import { decideMode, initReadOnly, isReadOnly, readOnlyReason } from './readonly';
const desktop = { width: 1440, coarse: false }, phone = { width: 390, coarse: true };
describe('read-only mode decision', () => {
  afterEach(() => initReadOnly({ search: '', ...desktop }));
  it('edits on a computer and views on a phone', () => {
    expect(decideMode({ search: '', ...desktop })).toEqual({ readOnly: false, reason: null });
    expect(decideMode({ search: '', ...phone })).toEqual({ readOnly: true, reason: 'device' });
  });
  it('needs both a narrow viewport and a coarse pointer', () => {
    expect(decideMode({ search: '', width: 480, coarse: true }).readOnly).toBe(true);
    expect(decideMode({ search: '', width: 481, coarse: true }).readOnly).toBe(false);
    expect(decideMode({ search: '', width: 390, coarse: false }).readOnly).toBe(false);
  });
  it('lets the link choose: ?mode=view forces view, ?mode=edit forces edit', () => {
    expect(decideMode({ search: '?checkpoint=a&mode=view', ...desktop })).toEqual({ readOnly: true, reason: 'link' });
    expect(decideMode({ search: '?mode=edit', ...phone })).toEqual({ readOnly: false, reason: null });
    expect(decideMode({ search: '?mode=other', ...phone })).toEqual({ readOnly: true, reason: 'device' });
  });
  it('keeps the decision made at load until initialised again', () => {
    expect(isReadOnly()).toBe(false);
    initReadOnly({ search: '', ...phone });
    expect(isReadOnly()).toBe(true); expect(readOnlyReason()).toBe('device');
    initReadOnly({ search: '?mode=edit', ...phone });
    expect(isReadOnly()).toBe(false); expect(readOnlyReason()).toBe(null);
  });
});
