import { expect, it, vi } from 'vitest';
import { completeQueuedAdd } from './queuedAdd';
it('cancels queued insertion even when the server completes after cancellation', async () => {
  const controller = new AbortController(), insert = vi.fn();
  let finish!: (id: string) => void;
  const work = completeQueuedAdd(new Promise<string>(resolve => { finish = resolve; }), controller.signal, insert);
  controller.abort(); finish('late card'); await work;
  expect(insert).not.toHaveBeenCalled();
});
it('inserts a completed addition once', async () => {
  const insert = vi.fn(); await completeQueuedAdd(Promise.resolve('card'), undefined, insert);
  expect(insert).toHaveBeenCalledExactlyOnceWith('card');
});
it('keeps each drop point through queued completion, independently of later drags', async () => {
  let finish!: (id: string) => void;
  const position = { x: 640, y: 380 }, insert = vi.fn();
  const work = completeQueuedAdd(new Promise<string>(resolve => { finish = resolve; }), undefined, insert, position);
  position.x = 900;
  await completeQueuedAdd(Promise.resolve('second'), undefined, insert, { x: 70, y: 80 });
  finish('first'); await work;
  expect(insert.mock.calls).toEqual([['second', { x: 70, y: 80 }], ['first', { x: 640, y: 380 }]]);
});
