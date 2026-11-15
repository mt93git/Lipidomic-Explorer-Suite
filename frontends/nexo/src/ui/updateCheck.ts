// New-version bar (UpdateBar): the deploy builds the page with VITE_BUILD_COMMIT and publishes deploy-status.json
// ({ state, commit }) at the client's root. Without a build commit (local dev, tests, mock mode) the check is off.
export const firstCheckMs = 10_000, checkEveryMs = 120_000;
/** The commit a deploy status names, only when its state is "deployed"; null for anything else. */
export function deployedCommit(status: unknown): string | null {
  if (!status || typeof status !== 'object') return null;
  const { state, commit } = status as { state?: unknown; commit?: unknown };
  return state === 'deployed' && typeof commit === 'string' && commit !== '' ? commit : null;
}
/** The deployed commit to announce: not the page's own, not the one the user closed; null when off or nothing newer. */
export function updateToShow(build: string | undefined, status: unknown, dismissed: string | null): string | null {
  const commit = deployedCommit(status);
  return build && commit && commit !== build && commit !== dismissed ? commit : null;
}
/** Asks for the deploy status 10 s after start, every 2 minutes and when the tab is visible again; reports each
 *  "deployed" status. Any other answer or failure is ignored silently. Returns the function that stops it. */
export function watchDeploys(build: string | undefined, url: string, report: (status: unknown) => void): () => void {
  if (!build) return () => {};
  let live = true, every: ReturnType<typeof setInterval> | undefined;
  const check = () => void fetch(url, { cache: 'no-store' }).then(r => r.status === 200 ? r.json() : null)
    .then(status => { if (live && deployedCommit(status)) report(status); }).catch(() => {});
  const visible = () => { if (document.visibilityState === 'visible') check(); };
  const first = setTimeout(() => { check(); every = setInterval(check, checkEveryMs); }, firstCheckMs);
  document.addEventListener('visibilitychange', visible);
  return () => { live = false; clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', visible); };
}
