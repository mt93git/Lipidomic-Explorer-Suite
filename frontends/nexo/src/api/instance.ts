import type { Node } from './types';
/**
 * The instance id the server answers to for a card. Checkpoint cards (Team's canvas v1) carry instance.id; cards
 * added in this session carry instance.instanceId until they are saved; legacy dashboard nodes have no instance
 * and the server serves them as tcinstance_v0_<output>.
 */
export function cardInstanceId(node: Pick<Node, 'id' | 'instance'>): string {
  const legacy = /^results_dashboard-plot_(pca|violin|dist|comp|heat)$/.exec(node.id);
  return node.instance?.id ?? node.instance?.instanceId ?? (legacy ? `tcinstance_v0_${legacy[1]}` : fixedInstanceId(node.id) ?? node.id);
}
/**
 * Older Team canvases keep a family's own view as a node with no instance, its id the source (`<family>-<output>`).
 * The server restores it as tcinstance_fixed_<id> (R/frontends/api/cards.R api_card_fixed_id).
 */
export function fixedInstanceId(nodeId: string): string | undefined {
  return /^[a-z][a-z0-9_]*-[A-Za-z][A-Za-z0-9_]*$/.test(nodeId) && !nodeId.startsWith('tcinstance_') ? `tcinstance_fixed_${nodeId.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}` : undefined;
}
