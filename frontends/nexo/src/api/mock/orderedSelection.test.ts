import { afterEach, expect, it, vi } from 'vitest';
import checkpoints from '../../mock/checkpoints.json';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
it('exposes an ordered synthetic schema and records the exact patch hierarchy', async () => {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {}); vi.resetModules();
  const {openSession, createCard, getCardSchema, updateCard} = await import('../../api');
  const {isOrderedMultiSelect} = await import('../../ui/forms/schemaForm');
  const {mockCounters} = await import('../../mock/schema');
  const session = await openSession(checkpoints[0].id);
  const card = await createCard(session.sessionId, 'logratio_tab-logratioPlot', {}, 'ordered-test');
  const control = (await getCardSchema(session.sessionId, card.instanceId)).controls.find(isOrderedMultiSelect)!;
  expect(control).toBeDefined();
  const next = ['Time', 'Condition'];
  expect((await updateCard(session.sessionId, card.instanceId, {[control.id]: next})).inputs[control.id]).toEqual(next);
  expect(mockCounters.cardPatches.at(-1)?.body).toEqual({inputs: {[control.id]: next}, actions: []});
});
