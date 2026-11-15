// Chart audit b04 F3 / b10 open item 5: the Inspector status line followed the last PATCH (200, "Up to date") while the
// card showed a render error, a run need or an update in flight. It now follows what the card itself shows.
import { describe, expect, it } from 'vitest';
import { inspectorStatus } from './inspectorStatus';
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
describe('Inspector status follows the card', () => {
  it('a card in render error: "Could not draw this plot" and the card message, even after a 200 PATCH', () => {
    expect(inspectorStatus({ state: 'error', message: 'Request failed (500)' }, 'Up to date')).toBe('Could not draw this plot. Request failed (500)');
  });
  it('a card in error with no body message (a failed PATCH) keeps the form message', () => {
    expect(inspectorStatus({ state: 'error', message: '' }, 'Update failed')).toBe('Update failed');
    expect(inspectorStatus({ state: 'error', message: '' }, 'Up to date')).toBe('Could not draw this plot');
  });
  it('a run need names the need (also when the read-only card shows it as a message)', () => {
    expect(inspectorStatus({ state: 'waiting', message: 'Needs Generate Analysis. The time points…', need: 'Needs Generate Analysis' }, 'Up to date')).toBe('Needs Generate Analysis');
    expect(inspectorStatus({ state: 'error', message: 'Needs Generate Analysis. The time points…', need: 'Needs Generate Analysis' }, 'Up to date')).toBe('Needs Generate Analysis');
  });
  it('waiting without a run need says Needs settings; updating says Updating…', () => {
    expect(inspectorStatus({ state: 'waiting', message: '' }, 'Up to date')).toBe('Needs settings');
    expect(inspectorStatus({ state: 'updating', message: '' }, 'Up to date')).toBe('Updating…');
    expect(inspectorStatus({ state: 'pending', message: '' }, 'Up to date')).toBe('Changes pending');
  });
  it('a current card: Up to date, except while a PATCH is in flight', () => {
    expect(inspectorStatus({ state: 'current', message: '' }, 'Up to date')).toBe('Up to date');
    expect(inspectorStatus({ state: 'current', message: '' }, 'Updating…')).toBe('Updating…');
    expect(inspectorStatus(undefined, 'Up to date')).toBe('Up to date');
  });
  it('one source of truth: the Inspector reads the card through the handle, no second state machine', () => {
    const inspector = readFileSync(new URL('./ui/Inspector/Inspector.tsx', import.meta.url), 'utf8');
    expect(inspector).toMatch(/inspectorStatus\(handle\.cardShown\?\.\(node\.id\)/);
    const cards = readFileSync(new URL('./cards.ts', import.meta.url), 'utf8');
    expect(cards).toMatch(/nexo-card-status/);
  });
});
