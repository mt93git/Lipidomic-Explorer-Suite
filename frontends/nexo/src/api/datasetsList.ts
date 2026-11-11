import { adminHeaders, AdminSignInRequired } from './adminToken';
import { mockMembersPrepare, mockReleased } from '../mock/entry';
/** A dataset released to the caller (C2, GET /api/v1/datasets). */
export interface ReleasedDataset { adminDatasetId: string; orderCode: string; version: number; clientId: string; clientName: string; releasedAt: string; membersPrepare: boolean }
let membersPrepare = false;
/** Whether the caller, a client member, prepares for a client (the last list's membersPrepare): Start's Excel upload. */
export const knownMembersPrepare = () => membersPrepare;
/** Every dataset released to the caller; throws AdminSignInRequired on 401, an Error on any other failure. */
export async function listDatasets(signal?: AbortSignal): Promise<ReleasedDataset[]> {
  const headers = await adminHeaders(signal, true);
  if (import.meta.env.VITE_API_MOCK === '1') { membersPrepare = mockMembersPrepare(); return mockReleased(); }
  const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/datasets`, { headers, signal });
  if (response.status === 401) throw new AdminSignInRequired();
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  const value = (await response.json()) as { datasets: ReleasedDataset[]; membersPrepare?: boolean };
  membersPrepare = value.membersPrepare === true;
  return value.datasets;
}
