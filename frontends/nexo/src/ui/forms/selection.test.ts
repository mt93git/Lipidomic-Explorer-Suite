import { describe, expect, it } from 'vitest';
import { readSelection, writeSelection } from './selection';
const choices = ['Control', 'Treatment', 'Vehicle'];
describe("Team's dashboard selection tokens (www/team/js/dashboard_selection.js)", () => {
  it('__ALL__ means the defaults when there are any, otherwise every choice', () => {
    expect(readSelection('__ALL__', choices, ['Control', 'Treatment'])).toEqual(['Control', 'Treatment']);
    expect(readSelection('__ALL__', choices)).toEqual(choices);
  });
  it('__EVERY__ means every choice; a JSON array keeps choice order and drops unknown values', () => {
    expect(readSelection('__EVERY__', choices, ['Control'])).toEqual(choices);
    expect(readSelection('["Vehicle","Control","Other"]', choices)).toEqual(['Control', 'Vehicle']);
    expect(readSelection('not json', choices)).toEqual([]);
  });
  it('writing every choice uses the all token; anything else is a JSON array in choice order', () => {
    expect(writeSelection(choices, choices, '__EVERY__')).toBe('__EVERY__');
    expect(writeSelection(['Treatment', 'Control', 'Vehicle'], choices)).toBe('__ALL__');
    expect(writeSelection(['Vehicle', 'Control'], choices)).toBe('["Control","Vehicle"]');
    expect(writeSelection([], choices)).toBe('[]');
  });
});
