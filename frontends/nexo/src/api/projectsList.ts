import { adminHeaders } from './adminToken';
import { mockProjects } from '../mock/entry';
type Person = { userId: string; displayName: string | null };
/** A project the caller may open (C4, GET /collab/projects), newest updatedAt first. */
export interface ProjectRow { projectId: string; workspace: string; origin: { kind: 'dataset' | 'checkpoint'; id: string }; createdBy: Person; createdAt: string; updatedAt: string; online: Person[] }
/** The caller's projects; null without collaboration (VITE_COLLAB_URL unset or ?collab=0). Throws when the sidecar fails. */
export async function listProjects(signal?: AbortSignal): Promise<ProjectRow[] | null> {
  if (import.meta.env.VITE_API_MOCK === '1') { await adminHeaders(signal); return mockProjects(); }
  const base = import.meta.env.VITE_COLLAB_URL as string | undefined;
  if (!base || new URLSearchParams(location.search).get('collab') === '0') return null;
  const url = new URL(base, location.href); url.protocol = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
  url.pathname = `${url.pathname.replace(/\/$/, '')}/projects`;
  const response = await fetch(url.href, { headers: await adminHeaders(signal, true), signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return ((await response.json()) as { projects: ProjectRow[] }).projects;
}
