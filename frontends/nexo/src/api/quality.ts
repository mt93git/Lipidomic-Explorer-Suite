import { adminHeaders } from './adminToken';
import { mockQuality } from '../mock/entry';
/** Team's quality answers on the prepared data (C3, GET /api/v1/sessions/<id>/quality). */
export interface Quality {
  pca: { sample: string; group: string; pc1: number; pc2: number; distance: number; flagged: boolean }[];
  limit: number; variance: [number, number];
  spread: { sample: string; group: string; median: number; q1: number; q3: number }[];
  missing: { sample: string; missing: number; of: number }[];
}
export async function getQuality(sessionId: string, signal?: AbortSignal): Promise<Quality> {
  const headers = await adminHeaders(signal);
  if (import.meta.env.VITE_API_MOCK === '1') return mockQuality();
  const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/sessions/${encodeURIComponent(sessionId)}/quality`, { headers, signal });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.message ?? `Request failed (${response.status})`);
  return value as Quality;
}
