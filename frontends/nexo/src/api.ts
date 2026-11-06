import checkpoints from './mock/checkpoints.json';
import session from './mock/session.json';
import pca from './mock/pca.json';
import violin from './mock/violin.json';
import dist from './mock/dist.json';
import comp from './mock/comp.json';
import heat from './mock/heat.json';
export interface Node { kind: 'plot' | 'illustration'; id: string; label: string; x: number; y: number; width: number; height: number; visual?: { plotTitle?: string }; finished?: { url: string; createdAt?: string; stale?: boolean; provenance?: unknown } | null; assetId?: string; assetVersion?: string; color?: string; instance?: unknown }
export interface Session { sessionId: string; checkpointSha256?: string; preparationCheck?: string; samples: unknown; lipids: unknown; preparation: unknown; inputs: Record<string, unknown>; canvas: { nodes: Node[] } }
export interface Figure { data: unknown[]; layout: Record<string, unknown> }
export interface PlotResult { figure: Figure; provenance: unknown }
export const plots = { pca, violin, dist, comp, heat };
export type PlotId = keyof typeof plots;
export function inputsFor(s: Session): Record<string, unknown> {
  const inputs: Record<string, unknown> = { color_by: 'Group1', n_class: 7, top_n: 10, pca_transform: 'log2', pca_scale: 'uv', ...s.inputs };
  if (!inputs.violin_lipid && Array.isArray(s.lipids) && typeof s.lipids[0] === 'string') inputs.violin_lipid = s.lipids[0];
  return inputs;
}
// The R engine renders one request at a time (503 while busy), so requests are
// queued here and a 503 is retried.
let queue: Promise<unknown> = Promise.resolve();
async function send<T>(path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.status === 503 && attempt < 60) { await new Promise(r => setTimeout(r, 500)); continue; }
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.message ?? `Request failed (${response.status})`);
    return value as T;
  }
}
function request<T>(path: string, body?: unknown): Promise<T> {
  const run = queue.then(() => send<T>(path, body));
  queue = run.catch(() => undefined);
  return run;
}
const mock = import.meta.env.VITE_API_MOCK === '1';
export const getCheckpoints = () => mock ? Promise.resolve(checkpoints) : request<typeof checkpoints>('/checkpoints');
export const openSession = (checkpointId: string): Promise<Session> => mock ? (checkpoints.some(c => c.id === checkpointId) ? Promise.resolve(structuredClone(session) as Session) : Promise.reject(new Error('Unknown checkpoint'))) : request('/sessions', { checkpointId });
export const getPlot = (id: string, plot: PlotId, inputs: Record<string, unknown>, width: number): Promise<PlotResult> => mock ? Promise.resolve({ figure: structuredClone(plots[plot]), provenance: { mock: true } }) : request(`/sessions/${encodeURIComponent(id)}/plots/results_dashboard/${plot}`, { inputs, width });
