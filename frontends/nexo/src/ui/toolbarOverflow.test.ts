import { expect, it } from 'vitest';
import { overflowGroups } from './toolbarOverflow';
it('collapses cumulative Team fit groups at four thresholds', () => {
  for (const [width, groups] of [[901, []], [900, ['arrange']], [720, ['arrange','history']], [600, ['arrange','history','export']], [420, ['arrange','history','export','add']]] as const) {
    expect(overflowGroups(width)).toEqual(groups);
    if (width !== 901) expect(overflowGroups(width + 1)).toEqual(groups.slice(0, -1));
  }
});
it('collapses further levels when the tab strip needs room, never fewer than Team, then the two Nexo levels', () => {
  expect(overflowGroups(1200, 1)).toEqual(['arrange']);
  expect(overflowGroups(820, 2)).toEqual(['arrange', 'history', 'export']);
  expect(overflowGroups(600, 1)).toEqual(['arrange', 'history', 'export', 'add']);
  expect(overflowGroups(420, 9)).toEqual(['arrange', 'history', 'export', 'add', 'analysis', 'figure']);
  expect(overflowGroups(700, 0)).toEqual(overflowGroups(700));
});
