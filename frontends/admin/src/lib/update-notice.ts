// "A new version of Admin is available": the deploy sets NEXT_PUBLIC_BUILD_COMMIT (this build's commit) and
// NEXT_PUBLIC_DEPLOY_STATUS_PATH (a same-origin path to Nexo's deploy-status.json; Nexo and Admin deploy together).
// Either one empty or unset (local dev, demo, tests) turns the notice off.

export const FIRST_CHECK_MS = 10_000;
export const CHECK_EVERY_MS = 120_000;

export type UpdateNoticeConfig = { buildCommit: string; statusPath: string };

export function updateNoticeConfig(env: { NEXT_PUBLIC_BUILD_COMMIT?: string; NEXT_PUBLIC_DEPLOY_STATUS_PATH?: string }): UpdateNoticeConfig | null {
  const buildCommit = env.NEXT_PUBLIC_BUILD_COMMIT?.trim() ?? "";
  const statusPath = env.NEXT_PUBLIC_DEPLOY_STATUS_PATH?.trim() ?? "";
  return buildCommit && statusPath ? { buildCommit, statusPath } : null;
}

// The deployed commit to tell the user about, or null: only state "deployed", a commit other than this build's, and
// not the one the user already closed the notice for.
export function updateToAnnounce(buildCommit: string, status: unknown, dismissedCommit: string | null): string | null {
  if (!status || typeof status !== "object") return null;
  const { state, commit } = status as { state?: unknown; commit?: unknown };
  if (state !== "deployed" || typeof commit !== "string" || !commit) return null;
  return commit === buildCommit || commit === dismissedCommit ? null : commit;
}

// The status file's JSON, or null for a non-200, bad JSON or a network error.
export async function readDeployStatus(path: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  try {
    const response = await fetcher(path, { cache: "no-store" });
    if (response.status !== 200) return null;
    return await response.json();
  } catch {
    return null;
  }
}
