/** Keep a cancelled request from inserting a card even if the server finishes later. */
export async function completeQueuedAdd<T>(request: Promise<T>, signal: AbortSignal | undefined, insert: (result: T, position?: { x: number; y: number }) => void, position?: { x: number; y: number }) {
  // Capture at drop time; a later camera move, drag or queued completion must not change this request.
  const dropped = position && { ...position };
  const result = await request;
  if (!signal?.aborted) { if (dropped) insert(result, dropped); else insert(result); }
}
