// Real-time collaboration (docs/integration/nexo-collab-plan.md 2.3, flag-off isolation): on only with the build's
// VITE_COLLAB_URL, a ?project=<uuid> to share and no ?collab=0. This module never imports yjs: everything collab is a
// dynamic import behind the decision.
export interface Collab { url: string; project: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function decideCollab({ url, search }: { url?: string; search: string }): Collab | null {
  const params = new URLSearchParams(search), project = params.get('project');
  return url && params.get('collab') !== '0' && project && uuid.test(project) ? { url, project } : null;
}
// Decided once per page load, like readonly.ts.
let decision: Collab | null = null;
export function initCollab(env = { url: import.meta.env.VITE_COLLAB_URL as string | undefined, search: location.search }) {
  decision = decideCollab(env);
}
export const collab = (): Collab | null => decision;
