import { LIMITS } from '../state/document';
import type { Node } from '../state/types';
import { setAppearance } from '../state/visualCommands';

/** A committed card label uses the inspector's command. Drafts and cancellation never enter history. */
export function titleEditCommand(node: Pick<Node, 'id' | 'label'>, draft: string | undefined, readOnly: boolean) {
  if (readOnly || draft === undefined) return;
  const label = Array.from(draft).slice(0, LIMITS.label).join('');
  if (label === node.label) return;
  return setAppearance(node.id, { label });
}
