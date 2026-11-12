"use client";

import { useEffect, useState } from "react";
import { CHECK_EVERY_MS, FIRST_CHECK_MS, deployedCommit, readDeployStatus, updateNoticeConfig, updateToAnnounce } from "@/lib/update-notice";
import styles from "./update-notice.module.css";

const fromBuild = updateNoticeConfig({
  NEXT_PUBLIC_BUILD_COMMIT: process.env.NEXT_PUBLIC_BUILD_COMMIT,
  NEXT_PUBLIC_DEPLOY_STATUS_PATH: process.env.NEXT_PUBLIC_DEPLOY_STATUS_PATH,
});

type Props = { buildCommit?: string; statusPath?: string; reload?: () => void };

// Mounted once in the root layout: a bar at the top of every page when a newer Admin has been deployed. It never
// reloads by itself; closing it hides it for that deployed commit only.
export default function UpdateNotice({
  buildCommit = fromBuild?.buildCommit ?? "",
  statusPath = fromBuild?.statusPath ?? "",
  reload = () => window.location.reload(),
}: Props) {
  const config = updateNoticeConfig({ NEXT_PUBLIC_BUILD_COMMIT: buildCommit, NEXT_PUBLIC_DEPLOY_STATUS_PATH: statusPath });
  // The last status that said "deployed"; other states and failed reads leave it as it is.
  const [deployed, setDeployed] = useState<unknown>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const path = config?.statusPath ?? "";

  useEffect(() => {
    if (!path) return;
    let active = true;
    const check = async () => {
      const status = await readDeployStatus(path);
      if (active && deployedCommit(status)) setDeployed(status);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    let every: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      void check();
      every = setInterval(() => void check(), CHECK_EVERY_MS);
    }, FIRST_CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path]);

  if (!config) return null;
  const commit = updateToAnnounce(config.buildCommit, deployed, dismissed);
  return (
    <div role="status">
      {commit && (
        <div className={styles.bar}>
          <span>A new version of Admin is available. Reload to update.</span>
          <button type="button" className={styles.reload} onClick={() => reload()}>Reload</button>
          <button type="button" className={styles.close} aria-label="Close the update notice" onClick={() => setDismissed(commit)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
