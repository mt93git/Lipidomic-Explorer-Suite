import { describe, expect, it } from 'vitest';
import { clearRunNeedIfPressed, markRunNeed, runNeedKey, runNeedWaiting } from './runNeeds';
describe('run-need gate (b10 check 11)', () => {
  it('a card that showed its run need waits until a PATCH presses the module button', () => {
    const key = runNeedKey('s1', 'tcinstance_aaaaaaaaaaaa');
    expect(runNeedWaiting(key)).toBe(false);
    markRunNeed(key); expect(runNeedWaiting(key)).toBe(true);
    clearRunNeedIfPressed(key, ['btn_add_case']); expect(runNeedWaiting(key)).toBe(true);
    clearRunNeedIfPressed(key, {}); expect(runNeedWaiting(key)).toBe(true);
    expect(runNeedWaiting(runNeedKey('s1', 'tcinstance_bbbbbbbbbbbb'))).toBe(false);
    clearRunNeedIfPressed(key, ['submit_longitudinal_btn']); expect(runNeedWaiting(key)).toBe(false);
  });
});
