// New-version bar: whether a deployed Nexo is newer than the page (build commit vs deploy-status.json), and when the
// page asks (10 s after load, every 2 minutes, and when the tab is visible again). Off without a build commit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deployedCommit, updateToShow, watchDeploys } from './updateCheck';
const BUILD = '1111111111111111111111111111111111111111', NEWER = '2222222222222222222222222222222222222222', LATER = '3333333333333333333333333333333333333333';
const deployed = (commit: string) => ({ state: 'deployed', commit });
describe('updateToShow', () => {
  it('a deployed commit other than the build is shown', () => {
    expect(updateToShow(BUILD, deployed(NEWER), null)).toBe(NEWER);
    expect(updateToShow(BUILD, { ...deployed(NEWER), checks: [] }, null)).toBe(NEWER);
  });
  it('off without a build commit', () => {
    expect(updateToShow('', deployed(NEWER), null)).toBeNull();
    expect(updateToShow(undefined, deployed(NEWER), null)).toBeNull();
  });
  it('the same commit is not shown', () => { expect(updateToShow(BUILD, deployed(BUILD), null)).toBeNull(); });
  it('only state "deployed" counts', () => {
    for (const state of ['deploying', 'failed', 'rolled-back', '', undefined]) expect(updateToShow(BUILD, { state, commit: NEWER }, null)).toBeNull();
  });
  it('a status without a usable commit is ignored', () => {
    for (const status of [null, undefined, 'deployed', 42, [], {}, { state: 'deployed' }, { state: 'deployed', commit: '' }, { state: 'deployed', commit: 7 }])
      expect(updateToShow(BUILD, status, null)).toBeNull();
  });
  it('a dismissed commit stays hidden; a later deployed commit shows again', () => {
    expect(updateToShow(BUILD, deployed(NEWER), NEWER)).toBeNull();
    expect(updateToShow(BUILD, deployed(LATER), NEWER)).toBe(LATER);
  });
  it('deployedCommit names the commit of a deployed status only', () => {
    expect(deployedCommit(deployed(NEWER))).toBe(NEWER);
    expect(deployedCommit({ state: 'failed', commit: NEWER })).toBeNull();
  });
});
describe('watchDeploys', () => {
  const URL_ = '/nexo/deploy-status.json';
  let listeners: Set<() => void>, page: { visibilityState: string; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
  let fetcher: ReturnType<typeof vi.fn>, console_: ReturnType<typeof vi.spyOn>[];
  const respond = (body: string, status = 200) => fetcher.mockImplementation(async () => new Response(body, { status }));
  beforeEach(() => {
    vi.useFakeTimers(); listeners = new Set();
    page = { visibilityState: 'visible', addEventListener: (t, f) => { if (t === 'visibilitychange') listeners.add(f); }, removeEventListener: (t, f) => { if (t === 'visibilitychange') listeners.delete(f); } };
    vi.stubGlobal('document', page);
    fetcher = vi.fn(); respond(JSON.stringify(deployed(NEWER))); vi.stubGlobal('fetch', fetcher);
    console_ = (['error', 'warn', 'log'] as const).map(level => vi.spyOn(console, level));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('off without a build commit: no request, no listener', async () => {
    for (const build of ['', undefined]) {
      const report = vi.fn(), stop = watchDeploys(build, URL_, report);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      listeners.forEach(f => f());
      expect(fetcher).not.toHaveBeenCalled(); expect(listeners.size).toBe(0); expect(report).not.toHaveBeenCalled();
      stop();
    }
  });
  it('asks 10 s after load, then every 2 minutes, never from the cache', async () => {
    const report = vi.fn(); watchDeploys(BUILD, URL_, report);
    await vi.advanceTimersByTimeAsync(9_999); expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(URL_, expect.objectContaining({ cache: 'no-store' }));
    expect(report).toHaveBeenCalledWith(deployed(NEWER));
    await vi.advanceTimersByTimeAsync(119_999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('asks again when the tab becomes visible, not while it is hidden', async () => {
    watchDeploys(BUILD, URL_, vi.fn());
    page.visibilityState = 'hidden'; listeners.forEach(f => f()); await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).not.toHaveBeenCalled();
    page.visibilityState = 'visible'; listeners.forEach(f => f()); await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('another state, a non-200, bad JSON or a network error: nothing reported, nothing logged', async () => {
    const report = vi.fn(); watchDeploys(BUILD, URL_, report);
    const answers = [() => respond(JSON.stringify({ state: 'deploying', commit: NEWER })), () => respond(JSON.stringify(deployed(NEWER)), 404),
      () => respond(JSON.stringify(deployed(NEWER)), 500), () => respond('{not json'), () => fetcher.mockImplementation(async () => { throw new TypeError('Failed to fetch'); })];
    for (const answer of answers) { answer(); listeners.forEach(f => f()); await vi.advanceTimersByTimeAsync(0); }
    expect(fetcher).toHaveBeenCalledTimes(answers.length);
    expect(report).not.toHaveBeenCalled();
    for (const spy of console_) expect(spy).not.toHaveBeenCalled();
  });
  it('stop ends the timers and the listener, and drops an answer still on its way', async () => {
    let answer: (r: Response) => void = () => {};
    fetcher.mockImplementation(() => new Promise<Response>(resolve => { answer = resolve; }));
    const report = vi.fn(), stop = watchDeploys(BUILD, URL_, report);
    await vi.advanceTimersByTimeAsync(10_000); expect(fetcher).toHaveBeenCalledTimes(1);
    stop(); answer(new Response(JSON.stringify(deployed(NEWER)))); await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(listeners.size).toBe(0); expect(report).not.toHaveBeenCalled();
  });
});
