import { describe, expect, it, vi, beforeEach } from 'vitest';
const api = vi.hoisted(() => ({
  openSession: vi.fn(), confirmDesign: vi.fn(async () => ({})), createCard: vi.fn(async () => ({})), updateCard: vi.fn(async () => ({})), replayHeldEdits: vi.fn(async () => {}),
  replayActions: vi.fn(async (..._args: unknown[]) => ({replayed:['runAnalysis'], failed:[] as string[], pressed:['runAnalysis'], settled:true})),
}));
vi.mock('../api', async () => { const s = await import('../api/session'); return { ...api, isSessionLost: s.isSessionLost, SessionLostError: s.SessionLostError }; });
import { reopenSession, changedInputs } from './sessionRecovery';
import { SessionLostError } from '../api/session';
const plot = (id: string, instance?: {id?: string; instanceId?: string; source: string; inputs?: Record<string, unknown>}) => ({kind:'plot', id, label:id, x:0, y:0, width:1, height:1, instance}) as never;
describe('reopenSession', () => {
  beforeEach(() => Object.values(api).forEach(f => f.mockClear()));
  it('reopens the checkpoint, confirms the design again, replays held edits and puts every card back', async () => {
    api.openSession.mockResolvedValue({sessionId:'s2', canvas:{nodes:[plot('n1',{id:'tcinstance_a', source:'src_a', inputs:{x:1, y:2}})]}});
    const next = await reopenSession('s1', {checkpoint:'ck', design:{allowed:true, unit:'Sample', type:'independent', confirmed:true},
      nodes:[plot('n1',{id:'tcinstance_a', source:'src_a', inputs:{x:1, y:3}}), plot('n2',{instanceId:'tcinstance_b', source:'src_b', inputs:{z:4}}), plot('results_dashboard-plot_pca')],
      nexoInputs:id => id === 'n2' ? {customCol_Control:'#aa3300'} : id === 'results_dashboard-plot_pca' ? {top_n:10} : undefined});
    expect(next).toBe('s2');
    expect(api.openSession).toHaveBeenCalledWith('ck');
    expect(api.confirmDesign).toHaveBeenCalledWith('s2', 'Sample', 'independent');
    expect(api.replayHeldEdits).toHaveBeenCalledWith('s1', 's2');
    expect(api.updateCard).toHaveBeenCalledWith('s2', 'tcinstance_a', {y:3});
    expect(api.createCard).toHaveBeenCalledWith('s2', 'src_b', {z:4}, 'tcinstance_b');
    expect(api.updateCard).toHaveBeenCalledWith('s2', 'tcinstance_b', {customCol_Control:'#aa3300'});
    expect(api.updateCard).toHaveBeenCalledWith('s2', 'tcinstance_v0_pca', {top_n:10});
    expect(api.createCard).toHaveBeenCalledTimes(1);
  });
  it('does not confirm an unconfirmed design; a card error is not fatal, a new loss is', async () => {
    api.openSession.mockResolvedValue({sessionId:'s2', canvas:{nodes:[]}});
    api.createCard.mockRejectedValueOnce(new Error('Unknown source'));
    await expect(reopenSession('s1', {checkpoint:'ck', design:{allowed:false, unit:null, type:null, confirmed:false}, nodes:[plot('n1',{instanceId:'i1', source:'bad'})], nexoInputs:() => undefined})).resolves.toBe('s2');
    expect(api.confirmDesign).not.toHaveBeenCalled();
    api.createCard.mockRejectedValueOnce(new SessionLostError());
    await expect(reopenSession('s1', {checkpoint:'ck', design:undefined, nodes:[plot('n1',{instanceId:'i1', source:'a'})], nexoInputs:() => undefined})).rejects.toBeInstanceOf(SessionLostError);
  });
  it('replays the recorded module presses on the reopened session, after the card and its member inputs (b07 F3)', async () => {
    const order: string[] = [];
    api.openSession.mockResolvedValue({sessionId:'s2', canvas:{nodes:[]}});
    api.createCard.mockImplementationOnce(async () => { order.push('create'); return {}; });
    api.updateCard.mockImplementationOnce(async () => { order.push('member'); return {}; });
    api.replayActions.mockImplementationOnce(async (...args: unknown[]) => { order.push('replay'); expect(args).toEqual(['s2', 'tcinstance_s', ['runAnalysis']]); return {replayed:['runAnalysis'], failed:[], pressed:['runAnalysis'], settled:true}; });
    await reopenSession('s1', {checkpoint:'ck', design:undefined, nodes:[plot('n1',{instanceId:'tcinstance_s', source:'structural_tab-summaryPlot'}), plot('n2',{instanceId:'tcinstance_t', source:'x'})],
      nexoInputs:id => id === 'n1' ? {gridLog2fcThresh:1} : undefined, nexoActions:id => id === 'n1' ? ['runAnalysis'] : []});
    expect(order).toEqual(['create', 'member', 'replay']);
    expect(api.replayActions).toHaveBeenCalledTimes(1);
    api.replayActions.mockRejectedValueOnce(new SessionLostError());
    await expect(reopenSession('s1', {checkpoint:'ck', design:undefined, nodes:[plot('n1',{instanceId:'tcinstance_s', source:'a'})], nexoInputs:() => undefined, nexoActions:() => ['runAnalysis']})).rejects.toBeInstanceOf(SessionLostError);
  });
  it('fails without a checkpoint to reopen', async () => {
    await expect(reopenSession('s1', {checkpoint:null, design:undefined, nodes:[], nexoInputs:() => undefined})).rejects.toBeInstanceOf(SessionLostError);
    expect(changedInputs({a:1, b:[1]}, {a:1, b:[2]})).toEqual({b:[1]});
  });
});
