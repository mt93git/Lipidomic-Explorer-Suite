/** Team Canvas "run" needs (www/team/js/canvas_catalog.js, kind 'run'): views a module builds only on request. Until the
 *  module's button is pressed the API refuses the render (422, a silent req() in Team), so the card names the step and
 *  offers the button, with Team's wording. */
export interface RunNeed { button: string; action: string; status: string; reason: string }
/** The API's message when the module's req() stops the render (frontends/nexo-api/cards.R api_card_render). */
export const UNAVAILABLE_INPUTS = 'The plot inputs are unavailable for this session.';
const generate: RunNeed = {
  button: 'submit_longitudinal_btn', action: 'Generate analysis', status: 'Needs Generate Analysis',
  reason: 'The time points are there. Time courses are built only on request: choose “Generate analysis” on this card (the module’s “Generate Analysis”, also in Data & settings).'
};
const byOutput: Record<string, RunNeed> = {
  macroclass_plot: generate, subclass_plot: generate, index_plot: generate, struct_plot: generate, allmetrics_plot: generate
};
/** FIX-PROD-H 1: a refusal (422) that carries the module's own sentence (Team's BQC placeholder); not a silent req() stop. */
export function refusalMessage(error: unknown): string | undefined {
  const e = error as { status?: unknown; message?: unknown; note?: unknown } | null;
  return e?.status === 422 && typeof e.message === 'string' && (e.message !== UNAVAILABLE_INPUTS || e.note === true) ? e.message : undefined;
}
/** NEXO-P9 1: a 4xx render is the server's answer for that render key (inputs, size, revision), not a transient failure:
 *  it is kept in `refused` and not asked again. 5xx, 503 (api.ts retries it, honouring Retry-After) and network failures are. */
export function renderOnce<T>(refused: Map<string, unknown>, key: string, render: () => Promise<T>): Promise<T> {
  if (refused.has(key)) return Promise.reject(refused.get(key));
  return render().catch(error => {
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) refused.set(key, error);
    throw error;
  });
}
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
/** NEXO-P2 (www/team/js/card_status.js autoRun): the structural views compute only on a button press. Once the comparison is
 *  ready the card presses that button itself, once per card and step. Species' second step ("Load species plot") waits until
 *  the shift list exists, because the plot draws the shifts selected there (the first four are preselected). */
const autoSteps: Record<string, string[]> = {'structural_tab-summaryPlot': ['runAnalysis'], 'structural_tab-speciesPlotPlot': ['runAnalysis', 'updateSpecies']};
export function autoRunStep(source: string, ready: boolean, pressed: readonly string[], inputs: Record<string, unknown>): string | undefined {
  if (!ready || !/^structural_tab-/.test(source)) return undefined;
  const step = autoSteps[source]?.find(button => !pressed.includes(button));
  const shifts = inputs.selectedDetails;
  if (step === 'updateSpecies' && (shifts == null || shifts === '' || (Array.isArray(shifts) && !shifts.length))) return undefined;
  return step;
}
const autoRan = new Set<string>();
/** True the first time for a card and step ("<session>/<instance>|<button>"). */
export function claimAutoRun(key: string): boolean { if (autoRan.has(key)) return false; autoRan.add(key); return true; }
