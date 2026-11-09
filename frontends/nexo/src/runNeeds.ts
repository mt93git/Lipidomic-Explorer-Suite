/** Team Canvas "run" needs (www/team/js/canvas_catalog.js, kind 'run'): views a module builds only on request. Until the
 *  module's button is pressed the API refuses the render (422, a silent req() in Team), so the card names the step and
 *  offers the button, with Team's wording. */
export interface RunNeed { button: string; action: string; status: string; reason: string }
/** The API's message when the module's req() stops the render (R/frontends/api/cards.R api_card_render). */
export const UNAVAILABLE_INPUTS = 'The plot inputs are unavailable for this session.';
const generate: RunNeed = {
  button: 'submit_longitudinal_btn', action: 'Generate analysis', status: 'Needs Generate Analysis',
  reason: 'The time points are there. Time courses are built only on request: choose “Generate analysis” on this card (the module’s “Generate Analysis”, also in Data & settings).'
};
const byOutput: Record<string, RunNeed> = {
  macroclass_plot: generate, subclass_plot: generate, index_plot: generate, struct_plot: generate, allmetrics_plot: generate
};
export function runNeedFor(nodeId: string, message: string): RunNeed | undefined {
  if (message !== UNAVAILABLE_INPUTS) return undefined;
  const output = nodeId.match(/-([A-Za-z0-9_]+)$/)?.[1];
  return output ? byOutput[output] : undefined;
}
/** Chart audit b10 check 11: once a card has shown its run need, Nexo does not ask for its render again (each try is a
 *  422 the browser logs) until the module's button is pressed: the card shows the need from here. Keyed per card
 *  instance ("<session>/<instance>"); any PATCH that presses a run-need button clears it (api.ts updateCard). */
const waiting = new Set<string>();
export const runNeedKey = (sessionId: string, instance: string) => `${sessionId}/${instance}`;
export const runNeedWaiting = (key: string) => waiting.has(key);
export const markRunNeed = (key: string) => { waiting.add(key); };
/** b10 open item 3: a card created on this page has not had its module button pressed, so a view with a run need is gated
 *  from its create answer, before its first render (no 422 logged for a fresh time-course card). */
export function markNewCardRunNeed(key: string, nodeId: string) {
  const output = nodeId.match(/-([A-Za-z0-9_]+)$/)?.[1];
  if (output && byOutput[output]) waiting.add(key);
}
export function clearRunNeedIfPressed(key: string, actions: unknown) {
  if (Array.isArray(actions) && actions.some(a => Object.values(byOutput).some(n => n.button === a))) waiting.delete(key);
}
