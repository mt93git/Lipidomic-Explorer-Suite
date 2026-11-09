import { statusLabels, type CardStatus } from './cardView';
/** What a plot card shows right now (cards.ts cardShown): its badge state, the message in its body, and its run need. */
export interface CardShown { state: CardStatus; message: string; need?: string }
export const COULD_NOT_DRAW = 'Could not draw this plot';
/** Chart audit b04 F3 / b10 item 5: the Inspector status line says what the card says (one source of truth, the card's
 *  badge state from cards.ts); the form's own status (the last PATCH) only fills in where the card has nothing to add. */
export function inspectorStatus(card: CardShown | undefined, form: string): string {
  if (!card) return form;
  if (card.need) return card.need;
  switch (card.state) {
    case 'error': return card.message ? `${COULD_NOT_DRAW}. ${card.message}` : form !== statusLabels.current ? form : COULD_NOT_DRAW;
    case 'updating': case 'finishing': return statusLabels.updating;
    case 'waiting': case 'pending': case 'needs-data': return statusLabels[card.state];
    default: return form === statusLabels.updating ? form : statusLabels[card.state];
  }
}
