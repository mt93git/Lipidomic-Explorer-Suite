/** Row 11 (nexo-canvas-redesign-review.md): the one authoritative mapping from a plot card's real state to what the card shows.
 *  cards.ts owns the state machine (syncStatus/setStatus); this file only says how each state looks and what it offers.
 *  Wording is the existing wording: tests and the inspector status share these labels. */
export type CardStatus = 'current' | 'updating' | 'pending' | 'needs-data' | 'waiting' | 'error' | 'finishing' | 'finished' | 'finished-stale';
export const CARD_STATES: readonly CardStatus[] = ['current', 'updating', 'pending', 'needs-data', 'waiting', 'error', 'finishing', 'finished', 'finished-stale'];
export const statusLabels: Record<CardStatus, string> = {
  current: 'Up to date', updating: 'Updating…', pending: 'Changes pending', 'needs-data': 'Needs data',
  waiting: 'Needs settings', error: 'Could not update', finishing: 'Finishing…', finished: 'Finished', 'finished-stale': 'Finished · out of date'
};
/** Colour family of the header dot and of a message body (card_status.css pairs; every pair is AAA, tokens.test.ts). */
export type Tone = 'info' | 'amber' | 'red' | 'green';
/** skeleton: neutral shimmer, never fabricated bars or results. plot: the live or frozen figure. message: the module's text (error, needs settings).
 *  confirm: the reference-group confirmation prompt (its wording stays in cards.ts). snapshot: the finished figure. */
export type Body = 'skeleton' | 'plot' | 'message' | 'confirm' | 'snapshot';
export type ViewAction = 'design' | 'review' | 'data' | 'edit';
export interface CardView { tone: Tone; body: Body; label: string; action: { label: string; action: ViewAction } | null; busy: boolean }
export interface ViewContext {
  /** The study design gate is up: settings and errors route to Study design, not Data & settings. */
  designRequired?: boolean;
  /** The Group comparison card is waiting for its reference group (the .gc-confirm prompt is in the body). */
  confirming?: boolean;
  /** An image, live plot or network is in the body. */
  drawn?: boolean;
}
const STUDY_DESIGN = 'Study design', DATA = 'Data & settings', REVIEW = 'Review', EDIT_FIGURE = 'Edit figure';
export function cardView(state: CardStatus, ctx: ViewContext = {}): CardView {
  const label = statusLabels[state];
  const settings = { label: ctx.designRequired ? STUDY_DESIGN : DATA, action: ctx.designRequired ? 'design' as const : 'data' as const };
  switch (state) {
    case 'current': return { tone: 'green', body: ctx.drawn ? 'plot' : 'message', label, action: null, busy: false };
    case 'updating': return { tone: 'info', body: ctx.drawn ? 'plot' : 'skeleton', label, action: null, busy: true };
    case 'finishing': return { tone: 'info', body: ctx.drawn ? 'plot' : 'skeleton', label, action: null, busy: true };
    case 'pending': return { tone: 'amber', body: ctx.drawn ? 'plot' : 'message', label, action: { label: REVIEW, action: 'review' }, busy: false };
    case 'needs-data': return { tone: 'amber', body: ctx.drawn ? 'plot' : 'message', label, action: { label: REVIEW, action: 'review' }, busy: false };
    case 'waiting': return { tone: 'amber', body: ctx.confirming ? 'confirm' : ctx.drawn ? 'plot' : 'message', label, action: settings, busy: false };
    case 'error': return { tone: 'red', body: 'message', label, action: settings, busy: false };
    case 'finished': return { tone: 'green', body: 'snapshot', label, action: null, busy: false };
    case 'finished-stale': return { tone: 'amber', body: 'snapshot', label, action: { label: EDIT_FIGURE, action: 'edit' }, busy: false };
  }
}
