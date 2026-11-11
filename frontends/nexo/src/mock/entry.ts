// Mock answers for Start and the quality check (VITE_API_MOCK=1): synthetic clients, projects and Team-like quality.
// sessionStorage 'nexo-mock-entry' = 'empty' empties every Start list, checkpoints included (Start's empty state); 'nexo-mock-members-prepare' = '1':
// the client member's client prepares (GET /datasets membersPrepare).
import type { ReleasedDataset } from '../api/datasetsList';
import type { ProjectRow } from '../api/projectsList';
import type { Quality } from '../api/quality';
import { knownAdminView } from '../api/adminToken';
import { mockDatasets, mockDatasetCounters } from './dataset';
const FENNEL = '00000000-0000-4000-8000-0000000c0001', MARLOW = '00000000-0000-4000-8000-0000000c0002';
export const mockEntryEmpty = () => { try { return sessionStorage.getItem('nexo-mock-entry') === 'empty'; } catch { return false; } };
const mine = (clientId: string) => knownAdminView() !== 'client' || clientId === FENNEL;
const released: ReleasedDataset[] = [
  { adminDatasetId: mockDatasets[0].adminDatasetId, orderCode: 'ORD041', version: 1, clientId: FENNEL, clientName: 'Fennel Hill group', releasedAt: '2026-11-10T08:30:00Z', membersPrepare: false },
  { adminDatasetId: '3f6c1e2a-7b4d-4a8e-9c01-5d2f8e7a0038', orderCode: 'ORD038', version: 2, clientId: MARLOW, clientName: 'Marlow Bay lab', releasedAt: '2026-11-02T08:30:00Z', membersPrepare: false },
  { adminDatasetId: '3f6c1e2a-7b4d-4a8e-9c01-5d2f8e7a0036', orderCode: 'ORD036', version: 1, clientId: FENNEL, clientName: 'Fennel Hill group', releasedAt: '2026-10-28T08:30:00Z', membersPrepare: false },
];
const projects: ProjectRow[] = [
  { projectId: 'mock-project-38', workspace: `nexo-client-${MARLOW}`, origin: { kind: 'dataset', id: released[1].adminDatasetId },
    createdBy: { userId: 'mock-staff-2', displayName: 'Blair Synthetic' }, createdAt: '2026-11-03T10:00:00Z', updatedAt: '2026-11-09T16:00:00Z',
    online: [{ userId: 'mock-staff-2', displayName: 'Blair Synthetic' }] },
  { projectId: 'mock-project-36', workspace: `nexo-client-${FENNEL}`, origin: { kind: 'dataset', id: released[2].adminDatasetId },
    createdBy: { userId: 'mock-staff-1', displayName: 'Ana Synthetic' }, createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-11-05T11:00:00Z', online: [] },
];
export const mockMembersPrepare = () => { try { return sessionStorage.getItem('nexo-mock-members-prepare') === '1'; } catch { return false; } };
export const mockReleased = (): ReleasedDataset[] => mockEntryEmpty() ? [] : structuredClone(released.filter(d => mine(d.clientId)));
export const mockProjects = (): ProjectRow[] => mockEntryEmpty() ? [] : structuredClone(projects.filter(p => mine(p.workspace.replace('nexo-client-', ''))));
// Synthetic PC1/PC2 scores (Treated_3 far from the others) and per-sample spread; the flag follows Team's rule:
// distance to the centroid, flagged when (distance - median) / (1.4826 * MAD) > 2.5.
const scores: Record<string, [number, number]> = { Control_1: [-2.2, .5], Control_2: [-1.7, -.6], Control_3: [-2.5, -.1], Treated_1: [2, .4], Treated_2: [2.4, -.5], Treated_3: [.9, 5.6] };
const quartiles: Record<string, [number, number]> = { Control_1: [18.6, 21.7], Control_2: [18.5, 21.8], Control_3: [18.7, 21.6], Treated_1: [18.4, 21.9], Treated_2: [18.5, 21.8], Treated_3: [17.7, 22.5] };
const missing: Record<string, number> = { Control_1: 3, Control_2: 4, Control_3: 2, Treated_1: 5, Treated_2: 3, Treated_3: 11 };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (v: number) => Math.round(v * 100) / 100;
/** The quality of the last prepared mock session (its samples). */
export function mockQuality(): Quality {
  const removed = (mockDatasetCounters.last?.outlierTreatments ?? {}) as Record<string, string>; // Team leaves "remove" samples out of the prepared data
  const samples = (mockDatasetCounters.last?.samples ?? mockDatasets[0].samples).filter(s => s in scores && removed[s] !== 'remove'), group = (s: string) => s.split('_')[0];
  const cx = samples.reduce((a, s) => a + scores[s][0], 0) / samples.length, cy = samples.reduce((a, s) => a + scores[s][1], 0) / samples.length;
  const d = samples.map(s => Math.hypot(scores[s][0] - cx, scores[s][1] - cy)), med = median(d), mad = 1.4826 * median(d.map(x => Math.abs(x - med))) || 1e-6;
  return {
    pca: samples.map((s, i) => ({ sample: s, group: group(s), pc1: scores[s][0], pc2: scores[s][1], distance: round(d[i]), flagged: (d[i] - med) / mad > 2.5 })),
    limit: round(med + 2.5 * mad), variance: [58, 21],
    spread: samples.map(s => ({ sample: s, group: group(s), median: 20.1, q1: quartiles[s][0], q3: quartiles[s][1] })),
    missing: samples.map(s => ({ sample: s, missing: missing[s], of: 74 })),
  };
}
