import { adminHeaders } from './adminToken';
import type { DatasetSettings } from './types';
/** ENTRY-8: a flagged sample decided on the shared board. Exclude = Team's outlierTreatments {sample: "remove"}. */
export type BoardDecision = { sample: string; choice: 'keep' | 'exclude' | 'undecided'; reason?: string };
/** PUT <collab>/projects/<id>/decisions; answers the board's settings as written. Throws with the sidecar's reason. */
export async function putDecision(projectId: string, decision: BoardDecision, signal?: AbortSignal): Promise<DatasetSettings> {
  const url = new URL(import.meta.env.VITE_COLLAB_URL as string, location.href); url.protocol = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
  url.pathname = `${url.pathname.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}/decisions`;
  const response = await fetch(url.href, { method: 'PUT', signal, body: JSON.stringify(decision),
    headers: { ...await adminHeaders(signal, true), 'Content-Type': 'application/json' } });
  const value = await response.json().catch(() => ({})) as { settings?: DatasetSettings; error?: string };
  if (!response.ok) throw new Error(value.error ?? `Request failed (${response.status})`);
  return value.settings as DatasetSettings;
}
