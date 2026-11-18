import { adminHeaders } from './adminToken';
import { mockDiagnosticsOptions, mockLandscape } from '../mock/diagnostics';
/** Diagnostics (frontends/nexo-api/diagnostics.R): an attractor landscape of the prepared lipidomics after
 *  Shin et al. 2025 (Adv. Sci. 12:2412503), tested against the sample metadata. */
export interface DiagnosticsColumn { name: string; numeric: boolean; missing: number; levels: { level: string; n: number }[] }
export interface DiagnosticsOptions { samples: number; features: number; columns: DiagnosticsColumn[] }
export interface LandscapeRequest {
  groupColumn: string; reference: string[]; target: string[];
  /** Optional: a numeric column (pseudotime, time, severity) that orders the samples; without it, the reference -> target axis does. */
  orderingColumn?: string; subjectColumn?: string; nodes?: number; cut?: number; window?: number; minDetection?: number;
  /** Most regulators in one Boolean rule, and the fit an extra regulator must add to be kept. */
  maxInputs?: number; parsimony?: number;
}
export interface Attractor { id: string; code: number; basin: number; entropy: number; deff: number; depth: number; cyclic: boolean; state: number[]; label: string }
export interface NetworkNode { id: number; name: string; cls: string; effect: number; p: number; fdr: number; core: boolean; x: number; y: number }
export interface NetworkEdge { from: number; to: number; sign: number }
export interface LandscapeSample {
  sample: string; group: string; pc1: number; pc2: number; order: number; dInit: number; dFinal: number; entropy: number;
  attractor: string; state: string; subject?: string | null;
}
export interface Perturbation { id: string; node: number; value: number; score: number; attractors: Attractor[] }
export interface DoublePerturbation { first: string; second: string; score: number; attractors: Attractor[] }
export interface LevelSummary { level: string; n: number; min: number; q1: number; median: number; q3: number; max: number; attractors: Record<string, number> }
export interface MetadataTest {
  column: string; kind: 'numeric' | 'categorical'; n: number; statistic: number; statisticName: string; p: number; fdr: number;
  attractorP?: number | null; mirrorsGroup?: boolean; levels?: LevelSummary[]; points?: { x: number; y: number; attractor: string }[];
}
export interface Landscape {
  params: { groupColumn: string; reference: string[] | string; target: string[] | string; ordering: string; nodes: number; window: number; step: number; cut: number; samples: number; features: number; stateSpace: number;
    maxInputs?: number; parsimony?: number; ends?: number; perturbations?: string; ruleFit?: number };
  network: { nodes: NetworkNode[]; edges: NetworkEdge[] };
  rules: { node: string; rule: string; fit: number; self: boolean }[];
  attractors: Attractor[]; score: number; smax: number; samples: LandscapeSample[];
  flow: { dInit: number; dFinal: number; count: number }[];
  entropyByAttractor: { attractor: string; deff: number; min: number; q1: number; median: number; q3: number; max: number }[];
  perturbations: { single: Perturbation[]; double: DoublePerturbation[]; control: { score: number } };
  metadata: MetadataTest[]; metadataCases: MetadataTest[];
  diagnostic: { group: string; vs: string; n: number; aucInit: number; aucFinal: number; inTarget: number }[];
  transitionIndex: { group: string; n: number; index: number }[];
  warnings: string[];
}
const base = () => import.meta.env.VITE_API_BASE ?? '/api/v1';
async function call<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const headers = await adminHeaders(signal);
  const init: RequestInit = body === undefined ? { headers, signal } : { method: 'POST', signal, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const response = await fetch(`${base()}${path}`, init);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.message ?? `Request failed (${response.status})`);
  return value as T;
}
export async function getDiagnosticsOptions(sessionId: string, signal?: AbortSignal): Promise<DiagnosticsOptions> {
  if (import.meta.env.VITE_API_MOCK === '1') return mockDiagnosticsOptions();
  return call(`/sessions/${encodeURIComponent(sessionId)}/diagnostics/options`, undefined, signal);
}
export async function runLandscape(sessionId: string, request: LandscapeRequest, signal?: AbortSignal): Promise<Landscape> {
  if (import.meta.env.VITE_API_MOCK === '1') return mockLandscape(request);
  return call(`/sessions/${encodeURIComponent(sessionId)}/diagnostics/landscape`, request, signal);
}
