import type { CanvasState, Node as SavedNode } from './state/document';
import { fixedInstanceId } from './api/instance';
/** Nexo always shows the frontend's PCA design: the dashboard "Principal components" card for the scores and the
 *  dashboard "PCA loadings" card for the loadings (R/frontends/team/results_dashboard.R plot_pca / plot_loadings).
 *  The Quality-check PCA cards keep running in Team's backend, but Nexo never offers or creates them, and a saved
 *  board that holds one reopens it as the dashboard card. Same table as the API (frontends/nexo-api/catalog.R
 *  api_nexo_pca_aliases). */
export const PCA_ALIASES: Readonly<Record<string, string>> = {
  'qc_pca_tab-pca2dPlot': 'results_dashboard-plot_pca',
  'qc_pca_tab-pca2dVectorPlot': 'results_dashboard-plot_pca',
  'qc_pca_tab-load2dPlot': 'results_dashboard-plot_loadings',
  'qc_pca_tab-load2dVectorPlot': 'results_dashboard-plot_loadings',
};
/** The source Nexo uses for a card: ours for the four QC PCA sources, the source itself otherwise. */
export const nexoSource = (source: string): string => Object.prototype.hasOwnProperty.call(PCA_ALIASES, source) ? PCA_ALIASES[source] : source;
/** A Library entry Nexo never offers. */
export const hiddenFromNexo = (id: string): boolean => nexoSource(id) !== id;

type Saved = Pick<CanvasState, 'nodes' | 'document' | 'tabs'>;
/** A saved board (Team canvas v1) with its QC PCA cards reopened as the dashboard cards: same place, size, label and
 *  look; the node id follows the new source (`<instance>-<output>`, as Team names it) and every reference to it
 *  (tabs, figure order and selection, figure page panels) follows too. QC-only inputs are dropped: the dashboard card
 *  starts from its own defaults (the API drops them as well, cards.R api_saved_inputs_accepted). */
export function withOurPcaDesign<T extends Saved>(state: T): T {
  const renamed = new Map<string, string>();
  const nodes = state.nodes.map((node): SavedNode => {
    const old = node.instance?.source ?? (node.instance ? undefined : node.id);
    const ours = old && nexoSource(old);
    if (!old || !ours || ours === old) return node;
    const instanceId = node.instance ? (node.instance.id ?? (node.instance as { instanceId?: string }).instanceId) : fixedInstanceId(node.id);
    if (!instanceId) return node;
    const id = `${instanceId}-${ours.slice(ours.indexOf('-') + 1)}`;
    renamed.set(node.id, id);
    return { ...node, id, instance: { id: instanceId, source: ours, inputs: {} } };
  });
  if (!renamed.size) return state;
  const rename = (id: string) => renamed.get(id) ?? id;
  const tabs = state.tabs && {
    ...state.tabs,
    tabs: state.tabs.tabs.map(t => ({ ...t, nodes: t.nodes.map(rename) })),
    ...(state.tabs.figure ? { figure: { deselected: state.tabs.figure.deselected.map(rename), order: state.tabs.figure.order.map(rename) } } : {}),
  };
  const document = state.document && { ...state.document, items: state.document.items.map(item => item.type === 'figure' ? { ...item, nodeId: rename(item.nodeId) } : item) };
  return { ...state, nodes, tabs, document };
}
