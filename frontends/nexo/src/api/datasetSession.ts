import type { DatasetOpen, DatasetSession, PreparationChoices } from './types';
import { datasetStrings as d } from '../ui/strings';
import { AdminSignInRequired } from './adminToken';
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
