import type { CardSchema } from '../../api';
/** Which colour note the Data tab shows: the session palette's, the card's own colours (Steph review 4b), or none
 *  when the module's own per-group pickers are right there in the form (cellular organization polar map). */
export function paletteNoteKind(schema: Pick<CardSchema, 'sessionPalette' | 'controls'>, follows: boolean): 'follows' | 'own' | null {
  if (schema.controls.some(c => /^customCol_/.test(c.id))) return null;
  return follows ? 'follows' : 'own';
}
