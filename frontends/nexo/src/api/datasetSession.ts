import type { DatasetOpen, DatasetPreview, DatasetPreviewRequest, DatasetSession, PreparationChoices } from './types';
import { datasetStrings as d } from '../ui/strings';
import { AdminSignInRequired, adminHeaders } from './adminToken';
import { mockDatasetPreview, mockDatasetRecord } from '../mock/dataset';
// Every answer of POST /datasets/sessions for an Admin dataset (docs/integration/admin-nexo-open.md): 200 the session,
// 422 preparation_choices_required the choices to ask, 401 (admin_auth_required) a sign-in to Admin (admin-identity.md),
// anything else a sentence the person can act on.
const byCode: Record<string, string> = { dataset_not_found: d.notFound, dataset_integrity_failed: d.integrityFailed, admin_datasets_unavailable: d.unavailable };
const byStatus: Record<number, string> = { 404: d.notFound, 502: d.unavailable };
export function interpretDatasetResponse(status: number, body: unknown): DatasetOpen {
  const value = (body && typeof body === 'object' ? body : {}) as { error?: string; reason?: string; message?: string };
  if (status >= 200 && status < 300) return { status: 'ready', session: value as unknown as DatasetSession };
  if (status === 401) throw new AdminSignInRequired();
  if (status === 422 && value.reason === 'preparation_choices_required') return { status: 'choices', choices: value as unknown as PreparationChoices };
  throw new Error((value.error !== undefined ? byCode[value.error] : undefined) ?? byStatus[status] ?? value.message ?? `Request failed (${status})`);
}
/** The Prepare page's live counts (POST /datasets/preview), or null when they cannot be had (no route, signed out, any failure):
 *  the page then shows its settings without counts and never waits on them. */
export async function datasetPreview(body: DatasetPreviewRequest, signal?: AbortSignal): Promise<DatasetPreview | null> {
  try {
    const headers = { 'Content-Type': 'application/json', ...await adminHeaders(signal, true) };
    // The mock build answers from src/mock/dataset.ts.
    if (import.meta.env.VITE_API_MOCK === '1') { const record = mockDatasetRecord(body.adminDatasetId); return record ? mockDatasetPreview(record, body) : null; }
    const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/datasets/preview`, { method: 'POST', signal, headers, body: JSON.stringify(body) });
    return response.ok ? await response.json() as DatasetPreview : null;
  } catch { return null; }
}
