import { expect, it, onTestFinished, vi } from 'vitest';
import * as Y from 'yjs';
import { intentChannel } from './intents';

// A fake provider: the sidecar's answers arrive as 'stateless' events (Hocuspocus receiveStateless).
function fakeProvider(revision = 7) {
  const document = new Y.Doc(), sent: Record<string, unknown>[] = [];
  document.getMap('meta').set('engineRevision', revision);
  let listener: (data: { payload: string }) => void = () => {};
  return { document, sent, answer: (message: object) => listener({ payload: JSON.stringify(message) }),
    sendStateless: (payload: string) => { sent.push(JSON.parse(payload)); },
    on: (_event: 'stateless', fn: typeof listener) => { listener = fn; } };
}

it('an intent is sent once with its kind, target, payload and the engine revision, and resolves on its result', async () => {
  const provider = fakeProvider(), send = intentChannel(provider, vi.fn());
  const result = send('inputs', { nodeId: 'n1' }, { inputs: { lipid: 'PC 34:1' } });
  expect(provider.sent).toHaveLength(1);
  const [message] = provider.sent;
  expect(message).toMatchObject({ type: 'intent', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { lipid: 'PC 34:1' } }, baseRevision: 7 });
  expect(message.intentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  provider.answer({ type: 'intent-result', intentId: 'someone-else', revision: 8 });
  provider.answer({ type: 'intent-result', intentId: message.intentId, revision: 8 });
  await expect(result).resolves.toEqual({ intentId: message.intentId, revision: 8 });
});

it('a refused intent rejects and shows its sentence, not its code', async () => {
  const provider = fakeProvider(), toast = vi.fn(), send = intentChannel(provider, toast);
  const result = send('finish', { nodeId: 'n1' }, { finished: { url: 'data:,' } });
  provider.answer({ type: 'refused', intentId: provider.sent[0].intentId, reason: 'lab_only' });
  await expect(result).rejects.toThrow('Only lab staff can finish a plot, edit a figure or confirm a baseline.');
  expect(toast).toHaveBeenCalledExactlyOnceWith('Only lab staff can finish a plot, edit a figure or confirm a baseline.');
});

// UX review 2, group 5: the form that showed the refused value goes back to the board's values (DataTab reloads on
// nexo-inputs-restored).
it('a refused intent on a card reloads that card\'s form', async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { dispatchEvent });
  try {
    const provider = fakeProvider(), send = intentChannel(provider, vi.fn());
    const result = send('inputs', { nodeId: 'n1' }, { inputs: { lipid: 'PC 34:1' } });
    provider.answer({ type: 'refused', intentId: provider.sent[0].intentId, reason: 'engine_not_ready' });
    await expect(result).rejects.toThrow('This change was not applied. Try again.');
    expect(dispatchEvent).toHaveBeenCalledOnce();
    const [event] = dispatchEvent.mock.calls[0];
    expect(event.type).toBe('nexo-inputs-restored'); expect(event.detail).toBe('n1');
  } finally { vi.unstubAllGlobals(); }
});

// "Undo mine" (product owner, 2026-11-10, UX review 2 question 3): after my own settled inputs intent, Undo sends a new inputs
// intent with my previous values for exactly the fields I changed, only if the board still holds my values for them.
function board(provider: ReturnType<typeof fakeProvider>, inputs: Record<string, unknown>) {
  provider.document.getMap('nodes').set('n1', new Y.Map([['instance', new Y.Map([['inputs', new Y.Map(Object.entries(inputs))]])]]));
}
// The sidecar's settled commit (commits.mjs): the values and meta.lastChange in one transaction.
function settle(provider: ReturnType<typeof fakeProvider>, inputs: Record<string, unknown>, displayName: string) {
  provider.document.transact(() => {
    const map = (provider.document.getMap('nodes').get('n1') as Y.Map<Y.Map<Y.Map<unknown>>>).get('instance')!.get('inputs')!;
    for (const [key, value] of Object.entries(inputs)) map.set(key, value);
    const meta = provider.document.getMap('meta'), revision = (meta.get('engineRevision') as number) + 1;
    meta.set('engineRevision', revision);
    meta.set('lastChange', { nodeId: 'n1', actor: displayName, displayName, kind: 'inputs', revision });
  }, 'server');
}
async function mine(provider: ReturnType<typeof fakeProvider>, send: ReturnType<typeof intentChannel>) {
  const result = send('inputs', { nodeId: 'n1' }, { inputs: { violin_lipid: 'PC 34:1' } });
  settle(provider, { violin_lipid: 'PC 34:1', top_n: 9 }, 'Alex Synthetic');
  provider.answer({ type: 'intent-result', intentId: provider.sent[0].intentId, revision: 8 });
  await result;
}

it('Undo after my settled inputs intent sends my previous values for the fields I changed', async () => {
  const provider = fakeProvider(), send = intentChannel(provider, vi.fn());
  board(provider, { violin_lipid: 'PC 32:0', top_n: 5 });
  await mine(provider, send);
  void send.undo();
  expect(provider.sent).toHaveLength(2);
  expect(provider.sent[1]).toMatchObject({ type: 'intent', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { violin_lipid: 'PC 32:0' } } });
});

it('Undo reads my values once my commit reaches the board, even after its intent-result', async () => {
  const provider = fakeProvider(), toast = vi.fn(), send = intentChannel(provider, toast);
  board(provider, { violin_lipid: 'PC 32:0' });
  const result = send('inputs', { nodeId: 'n1' }, { inputs: { violin_lipid: 'PC 34:1' } });
  provider.answer({ type: 'intent-result', intentId: provider.sent[0].intentId, revision: 8 });
  await new Promise(resolve => setTimeout(resolve, 0)); // the update is the socket's next message
  settle(provider, { violin_lipid: 'PC 34:1' }, 'Alex Synthetic');
  await result;
  void send.undo();
  expect(toast).not.toHaveBeenCalled();
  expect(provider.sent[1]).toMatchObject({ kind: 'inputs', payload: { inputs: { violin_lipid: 'PC 32:0' } } });
});

it('Undo sends nothing and names who changed the field after me', async () => {
  const provider = fakeProvider(), toast = vi.fn(), send = intentChannel(provider, toast);
  board(provider, { violin_lipid: 'PC 32:0' });
  await mine(provider, send);
  settle(provider, { violin_lipid: 'PC 36:2' }, 'Blair Synthetic');
  void send.undo();
  expect(provider.sent).toHaveLength(1);
  expect(toast).toHaveBeenCalledExactlyOnceWith('Blair Synthetic changed violin lipid after you; nothing was undone.');
});

it('Undo is offered once my inputs intent settles and not after it is used', async () => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  onTestFinished(() => { vi.unstubAllGlobals(); });
  const provider = fakeProvider(), changed = vi.fn(), send = intentChannel(provider, vi.fn(), changed);
  board(provider, { violin_lipid: 'PC 32:0' });
  await mine(provider, send);
  expect(changed).toHaveBeenLastCalledWith(true);
  const undone = send.undo();
  expect(changed).toHaveBeenLastCalledWith(false);
  // The undo's own commit is not mine to undo again (no redo).
  settle(provider, { violin_lipid: 'PC 32:0' }, 'Alex Synthetic');
  provider.answer({ type: 'intent-result', intentId: provider.sent[1].intentId, revision: 9 });
  await undone;
  expect(changed).toHaveBeenLastCalledWith(false);
  void send.undo();
  expect(provider.sent).toHaveLength(2);
});

it('my open form reloads once my Undo settles', async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { dispatchEvent });
  onTestFinished(() => { vi.unstubAllGlobals(); });
  const provider = fakeProvider(), send = intentChannel(provider, vi.fn());
  board(provider, { violin_lipid: 'PC 32:0' });
  await mine(provider, send);
  const undone = send.undo();
  settle(provider, { violin_lipid: 'PC 32:0' }, 'Alex Synthetic');
  provider.answer({ type: 'intent-result', intentId: provider.sent[1].intentId, revision: 9 });
  await undone;
  expect(dispatchEvent).toHaveBeenCalledOnce();
  const [event] = dispatchEvent.mock.calls[0];
  expect(event.type).toBe('nexo-inputs-restored'); expect(event.detail).toBe('n1');
});
