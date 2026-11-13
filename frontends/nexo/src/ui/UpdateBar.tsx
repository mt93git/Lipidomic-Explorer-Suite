import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { strings as s } from './strings';
import { updateToShow, watchDeploys } from './updateCheck';
import './updateBar.css';
// A thin bar at the top of the page when a newer Nexo is deployed: Reload, or × to hide it until another deploy.
// The page never reloads by itself. The status region stays mounted so a screen reader hears the bar when it appears.
export function UpdateBar({ build, url = `${import.meta.env.BASE_URL}deploy-status.json` }: { build: string | undefined; url?: string }) {
  const [status, setStatus] = useState<unknown>(null), [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => watchDeploys(build, url, setStatus), [build, url]);
  if (!build) return null;
  const commit = updateToShow(build, status, dismissed);
  return <div className="update-bar-region" role="status">{commit && <div className="update-bar"><span>{s.newVersion}</span>
    <button type="button" onClick={() => window.location.reload()}>{s.reloadPage}</button>
    <button type="button" className="update-bar-close" aria-label={s.closeUpdateNotice} onClick={() => setDismissed(commit)}>{s.close}</button></div>}</div>;
}
/** Mounts the bar once, above the app, when the page was built with a commit (VITE_BUILD_COMMIT); otherwise nothing. */
export function mountUpdateBar(build = import.meta.env.VITE_BUILD_COMMIT as string | undefined) {
  if (!build) return;
  const host = document.createElement('div'); document.body.prepend(host);
  createRoot(host).render(<UpdateBar build={build}/>);
}
