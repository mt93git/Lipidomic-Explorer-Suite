import { describe, expect, it } from 'vitest';
import { cardView, CARD_STATES, statusLabels } from './cardView';
// Row 11 (nexo-canvas-redesign-review.md): one authoritative mapping from a card's real state to what it shows.
describe('cardView', () => {
  it('covers every card state exactly once', () => {
    expect([...CARD_STATES].sort()).toEqual(['current', 'error', 'finished', 'finished-stale', 'finishing', 'needs-data', 'pending', 'updating', 'waiting']);
    for (const state of CARD_STATES) expect(cardView(state).label).toBe(statusLabels[state]);
  });
  it('keeps the existing wording of every state', () => {
    expect(statusLabels).toEqual({ current: 'Up to date', updating: 'Updating…', pending: 'Changes pending', 'needs-data': 'Needs data',
      waiting: 'Needs settings', error: 'Could not update', finishing: 'Finishing…', finished: 'Finished', 'finished-stale': 'Finished · out of date' });
  });
  it('loading shows a neutral skeleton until something is drawn, then the plot while it updates', () => {
    expect(cardView('updating')).toMatchObject({ tone: 'info', body: 'skeleton', busy: true, action: null });
    expect(cardView('updating', { drawn: true })).toMatchObject({ tone: 'info', body: 'plot', busy: true, action: null });
    expect(cardView('finishing', { drawn: true })).toMatchObject({ tone: 'info', body: 'plot', busy: true, action: null });
  });
  it('an error shows the module message in the body and offers Data & settings, or Study design when the design gate is up', () => {
    expect(cardView('error')).toMatchObject({ tone: 'red', body: 'message', busy: false, action: { label: 'Data & settings', action: 'data' } });
    expect(cardView('error', { designRequired: true }).action).toEqual({ label: 'Study design', action: 'design' });
  });
  it('needs settings and needs confirmation stay distinct', () => {
    expect(cardView('waiting')).toMatchObject({ tone: 'amber', body: 'message', action: { label: 'Data & settings', action: 'data' } });
    expect(cardView('waiting', { confirming: true })).toMatchObject({ tone: 'amber', body: 'confirm', action: { label: 'Data & settings', action: 'data' } });
    expect(cardView('waiting', { designRequired: true }).action).toEqual({ label: 'Study design', action: 'design' });
    expect(cardView('needs-data', { drawn: true })).toMatchObject({ tone: 'amber', body: 'plot', action: { label: 'Review', action: 'review' } });
    expect(cardView('pending', { drawn: true })).toMatchObject({ tone: 'amber', body: 'plot', action: { label: 'Review', action: 'review' } });
  });
  it('finished keeps its snapshot; stale offers Edit figure', () => {
    expect(cardView('finished')).toMatchObject({ tone: 'green', body: 'snapshot', busy: false, action: null });
    expect(cardView('finished-stale')).toMatchObject({ tone: 'amber', body: 'snapshot', busy: false, action: { label: 'Edit figure', action: 'edit' } });
    expect(cardView('current', { drawn: true })).toMatchObject({ tone: 'green', body: 'plot', busy: false, action: null });
  });
  it('never fabricates a plot: nothing drawn and not loading is a message, not a skeleton', () => {
    for (const state of ['current', 'pending', 'needs-data'] as const) expect(cardView(state).body).toBe('message');
  });
});
