import { updateCard, type CardSchema, type Inputs, type SchemaControl } from '../../api';
import { sanitizeModalHtml } from './modalHtml';
export type ModuleDialog = { title: string; html: string };
/** The form's controls plus the module's buttons, each in its tab section (after that tab's controls). */
/** Inputs Team keeps out of sight (display:none) and fills itself: the group comparison's confirmation token is set by
 * the card's "Confirm reference group" (R/frontends/team/group_comparison.R), never typed. */
const HIDDEN_INPUTS = new Set(['gc_baseline_confirmation']);
export function formControls(schema: CardSchema): SchemaControl[] {
  const controls = schema.controls.filter(c => c.type !== 'action' && !c.hidden && !HIDDEN_INPUTS.has(c.id));
  const buttons = (schema.actionControls ?? []).map((a): SchemaControl => ({id: a.id, type: 'action', label: a.label, group: a.tab ?? undefined}));
  const order: string[] = [];
  for (const c of [...controls, ...buttons]) if (!order.includes(c.group ?? '')) order.push(c.group ?? '');
  return order.flatMap(group => [...controls, ...buttons].filter(c => (c.group ?? '') === group));
}
/** Press a module button (as Team's live module UI does): the action alone, then the card takes the new inputs. */
export async function pressAction(sessionId: string, instanceId: string, id: string, onUpdated: (inputs: Inputs) => Promise<void>): Promise<ModuleDialog | undefined> {
  const result = await updateCard(sessionId, instanceId, {}, [id]);
  await onUpdated(result.inputs);
  return result.modal ? {title: result.modal.title, html: sanitizeModalHtml(result.modal.html)} : undefined;
}
/** A module button can make Team's renderUI build new controls ("Select Shifts to Visualize:" after "Initiate Structural
 * Analysis", chart audit b07 F4): the initial values of the controls the form does not hold yet. */
export function addedControlValues(schema: CardSchema, held: Inputs): Inputs {
  return Object.fromEntries(schema.controls.filter(c => c.type !== 'action' && !(c.id in held)).map(c => [c.id,
    c.value ?? c.default ?? (c.multiple || c.type === 'multiselect' || c.type === 'checkboxgroup' ? [] : c.type === 'boolean' ? false : '')] as [string, Inputs[string]]));
}
