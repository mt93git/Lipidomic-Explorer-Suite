import type { Node } from '../api/types';
const fingerprint = (node: Node) => JSON.stringify([node.width, node.height, node.label, node.instance?.inputs, node.visual, node.statistics]);
/** Session-only export receipts: moving a card, or finishing it (a snapshot of the same plot), does not change its exported plot. */
export function createExportReceipts() {
  const receipts = new Map<string, string>();
  return {
    exported(node: Node) { receipts.set(node.id, fingerprint(node)); },
    changed(node: Node) { const saved = receipts.get(node.id); return saved !== undefined && saved !== fingerprint(node); },
    forget(id: string) { receipts.delete(id); }
  };
}
export const exportReceipts = createExportReceipts();
