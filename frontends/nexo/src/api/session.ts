// A lost API session (evicted, closed or unknown after a restart) is reopened once per loss, in one place.
// The app keeps the session id it was given; every session route is sent with the live id from the alias table.
// A request that fails because its session is gone waits for one shared recovery and is retried once; if the
// recovery fails, or the retry is lost again, it throws SessionLostError (never a retry loop).

/** The API answers 409 {error:"session_lost"} (evicted/closed) or 404 {error:"not_found",message:"Unknown session."}. */
export function isSessionLost(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string } | null;
  if (!e || typeof e !== 'object') return false;
  if (e.status === 409 && e.code === 'session_lost') return true;
  return e.status === 404 && e.code === 'not_found' && e.message === 'Unknown session.';
}

export class SessionLostError extends Error {
  readonly name = 'SessionLostError';
  /** Autosave and other callers must not retry: only a reload (or a new recovery after a new loss) helps. */
  readonly retryable = false;
  constructor(message = 'The analysis session was lost and could not be reopened. Reload the page to continue.') { super(message); }
}

export type SessionRecovery = (lostId: string) => Promise<string>;
let recovery: SessionRecovery | null = null;
const aliases = new Map<string, string>();
const failed = new Set<string>();
let inFlight: { lost: string; promise: Promise<string> } | null = null;

/** Registered by the app (it knows the checkpoint and the canvas): reopen, put the work back, answer the new id. */
export function setSessionRecovery(hook: SessionRecovery | null) { recovery = hook; }
/** The live id for the id the app was given (itself when never reopened). */
export function liveSession(id: string): string { return aliases.get(id) ?? id; }
export function resetSessions() { aliases.clear(); failed.clear(); inFlight = null; recovery = null; }

async function recover(lost: string): Promise<string> {
  if (inFlight?.lost === lost) return inFlight.promise;
  // A request sent with an id that was already replaced: retry on the live one.
  const current = aliases.get(lost);
  if (current && current !== lost) return current;
  // Another recovery is populating a new session (its own requests): fail them, never nest.
  if (inFlight || !recovery || failed.has(lost)) throw new SessionLostError();
  const hook = recovery;
  const promise = (async () => {
    try {
      const next = await hook(lost);
      aliases.set(lost, next);
      for (const [from, to] of aliases) if (to === lost) aliases.set(from, next);
      return next;
    } catch (error) {
      failed.add(lost);
      throw error instanceof SessionLostError ? error : new SessionLostError();
    } finally { inFlight = null; }
  })();
  inFlight = { lost, promise };
  return promise;
}

/** Small fixes item 4: the user's Reopen after a recovery failed: forget the failure and run the recovery once more. */
export async function reopenLostSession(id: string): Promise<string> {
  const live = liveSession(id); failed.delete(live);
  return recover(live);
}
/** Run a session route with the live id; on a lost session, recover once and retry once. */
export async function withSession<T>(id: string, run: (live: string, attempt: number) => Promise<T>): Promise<T> {
  const live = liveSession(id);
  if (failed.has(live)) throw new SessionLostError();
  try { return await run(live, 0); }
  catch (error) {
    if (!isSessionLost(error)) throw error;
    const next = await recover(live);
    try { return await run(next, 1); }
    catch (again) { throw isSessionLost(again) ? new SessionLostError() : again; }
  }
}
