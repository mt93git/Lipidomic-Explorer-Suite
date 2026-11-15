// NEXO-P6 item 3: Team's FLA "Functional ratio distributions" draws its significance brackets (R/modules/10_fla_module.R,
// current_violin_plot) only once the study design allows inference (utils_stats.R guided_local_p_value). On a restored
// board the card has no design gate, so it drew before the design was confirmed and kept that image: no brackets, y
// ranges without their room. Confirming the design changes the science of every card, as an analysis change does, so
// every card's render key changes (cards.ts redraws on onAnalysisChange).
import { afterEach, expect, it, vi } from 'vitest';
import checkpoints from './mock/checkpoints.json';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

it('confirming the study design redraws every card', async () => {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {}); vi.resetModules();
  const { openSession, confirmDesign } = await import('./api');
  const { analysisGeneration, onAnalysisChange } = await import('./analysisGeneration');
  const session = await openSession(checkpoints[0].id);
  const redraw = vi.fn(); onAnalysisChange(session.sessionId, redraw);
  const before = analysisGeneration(session.sessionId);
  await confirmDesign(session.sessionId, 'Animal', 'independent');
  expect([analysisGeneration(session.sessionId) - before, redraw.mock.calls.length]).toEqual([1, 1]);
});
