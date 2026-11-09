import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SessionLostError, isSessionLost, liveSession, resetSessions, setSessionRecovery, withSession } from './session';

const lost409 = () => Object.assign(new Error('Session is no longer usable; reopen the checkpoint.'), { status: 409, code: 'session_lost' });
const lost404 = () => Object.assign(new Error('Unknown session.'), { status: 404, code: 'not_found' });

describe('session recovery (api.ts single place)', () => {
  beforeEach(() => resetSessions());

  it('knows a lost session from the API answers, and not an unknown card', () => {
    expect(isSessionLost(lost409())).toBe(true);
    expect(isSessionLost(lost404())).toBe(true);
    expect(isSessionLost(Object.assign(new Error('Unknown card.'), { status: 404, code: 'not_found' }))).toBe(false);
    expect(isSessionLost(Object.assign(new Error('busy'), { status: 409, code: 'conflict' }))).toBe(false);
    expect(isSessionLost(new Error('Unknown session.'))).toBe(false);
  });

  it('reopens once, aliases the old id to the live one and retries the failed request once', async () => {
    const hook = vi.fn(async (lost: string) => { expect(lost).toBe('s1'); return 's2'; });
    setSessionRecovery(hook);
    const seen: string[] = [];
    const value = await withSession('s1', async live => { seen.push(live); if (live === 's1') throw lost409(); return 'ok'; });
    expect(value).toBe('ok');
    expect(seen).toEqual(['s1', 's2']);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(liveSession('s1')).toBe('s2');
    // Later requests go straight to the live id.
    await withSession('s1', async live => { seen.push(live); });
    expect(seen).toEqual(['s1', 's2', 's2']);
  });

  it('shares one in-flight recovery between every failing request', async () => {
    let release!: (id: string) => void;
    const hook = vi.fn(() => new Promise<string>(r => { release = r; }));
    setSessionRecovery(hook);
    const run = (live: string) => live === 's1' ? Promise.reject(lost404()) : Promise.resolve(live);
    const all = Promise.all([withSession('s1', run), withSession('s1', run), withSession('s1', run)]);
    await new Promise(r => setTimeout(r, 0));
    expect(hook).toHaveBeenCalledTimes(1);
    release('s2');
    expect(await all).toEqual(['s2', 's2', 's2']);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('a request that failed on the old id after recovery finished retries on the live id without reopening again', async () => {
    const hook = vi.fn(async () => 's2');
    setSessionRecovery(hook);
    let lateReject!: (e: Error) => void;
    const late = withSession('s1', live => live === 's1' ? new Promise<string>((_, reject) => { lateReject = reject; }) : Promise.resolve(live));
    await withSession('s1', async live => { if (live === 's1') throw lost409(); return live; });
    lateReject(lost409());
    expect(await late).toBe('s2');
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('throws SessionLostError when the retried request is lost again (no loop)', async () => {
    const hook = vi.fn(async () => 's2');
    setSessionRecovery(hook);
    const run = vi.fn(async () => { throw lost409(); });
    await expect(withSession('s1', run)).rejects.toBeInstanceOf(SessionLostError);
    expect(run).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('throws SessionLostError when recovery fails, and later requests fail at once without a request', async () => {
    const hook = vi.fn(async () => { throw new Error('Unknown checkpoint.'); });
    setSessionRecovery(hook);
    const run = vi.fn(async (live: string) => { if (live === 's1') throw lost409(); return live; });
    const error = await withSession('s1', run).catch(e => e);
    expect(error).toBeInstanceOf(SessionLostError);
    expect((error as SessionLostError).retryable).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    await expect(withSession('s1', run)).rejects.toBeInstanceOf(SessionLostError);
    expect(run).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('without a recovery hook a lost session is a SessionLostError', async () => {
    await expect(withSession('s1', async () => { throw lost404(); })).rejects.toBeInstanceOf(SessionLostError);
  });

  it("the recovery's own requests on the new session never start a nested recovery", async () => {
    const hook = vi.fn(async () => { await withSession('s2', async () => { throw lost409(); }); return 's2'; });
    setSessionRecovery(hook);
    await expect(withSession('s1', async () => { throw lost409(); })).rejects.toBeInstanceOf(SessionLostError);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('other errors pass through untouched', async () => {
    const hook = vi.fn(async () => 's2'); setSessionRecovery(hook);
    const error = new Error('Unknown card.');
    await expect(withSession('s1', async () => { throw error; })).rejects.toBe(error);
    expect(hook).not.toHaveBeenCalled();
  });

  it('a second loss of the reopened session reopens again (once per loss) and keeps the first id pointing at the newest', async () => {
    const ids = ['s2', 's3']; const hook = vi.fn(async () => ids.shift()!);
    setSessionRecovery(hook);
    await withSession('s1', async live => { if (live === 's1') throw lost409(); });
    await withSession('s1', async live => { if (live === 's2') throw lost404(); });
    expect(liveSession('s1')).toBe('s3');
    expect(liveSession('s2')).toBe('s3');
    expect(hook).toHaveBeenCalledTimes(2);
  });
});
