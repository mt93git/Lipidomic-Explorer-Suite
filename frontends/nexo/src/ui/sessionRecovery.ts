import { openSession, openDatasetSession, confirmDesign, createCard, updateCard, replayActions, replayHeldEdits, isSessionLost, SessionLostError, type Design, type Inputs, type Node, type DatasetSettings } from '../api';
import { cardInstanceId } from '../api/instance';
import { replayRecorded } from '../state/actions';

/** What the reopened session lacks: inputs that differ from the ones it already holds for a card. */
export function changedInputs(want: Record<string, unknown>, have: Record<string, unknown> | undefined): Inputs {
  return Object.fromEntries(Object.entries(want).filter(([k, v]) => JSON.stringify(have?.[k]) !== JSON.stringify(v))) as Inputs;
}

export interface RecoveryContext {
  /** The checkpoint this page opened (or last saved). */
  checkpoint: string | null;
  dataset?: {adminDatasetId: string; settings?: DatasetSettings};
  design: Design | undefined;
  /** Plot cards on the canvas now (every tab). */
  nodes: Node[];
  /** Nexo's member inputs for a card (fixed dashboard inputs, computed controls). */
  nexoInputs(nodeId: string): Record<string, unknown> | undefined;
  /** Module buttons pressed on a card (Nexo's member), replayed on the reopened session (chart audit b07 F3). */
  nexoActions?(nodeId: string): string[];
}

/**
 * Reopen the checkpoint and put back what the lost session had: the confirmed design, analysis settings and cohort
 * this page applied, and every card with its instance id, source and current inputs (Nexo's member included).
 * A card the reopened session cannot take keeps going (it shows its own error when drawn); a new loss aborts.
 */
export async function reopenSession(lost: string, ctx: RecoveryContext): Promise<string> {
  let opened;
  if (ctx.checkpoint) opened = await openSession(ctx.checkpoint);
  else if (ctx.dataset?.settings) {
    const result = await openDatasetSession(ctx.dataset.adminDatasetId, ctx.dataset.settings);
    if (result.status !== 'ready') throw new SessionLostError();
    opened = result.session;
  } else throw new SessionLostError();
  const next = opened.sessionId;
  const design = ctx.design;
  if (design?.confirmed && design.unit && design.type) await confirmDesign(next, design.unit, design.type);
  await replayHeldEdits(lost, next);
  const known = new Map((opened.canvas?.nodes ?? []).filter(n => n.instance).map(n => [cardInstanceId(n), n.instance!.inputs ?? {}]));
  const guard = (error: unknown) => { if (error instanceof SessionLostError || isSessionLost(error)) throw error; };
  for (const node of ctx.nodes) {
    if (node.kind !== 'plot') continue;
    const instance = cardInstanceId(node), member = ctx.nexoInputs(node.id);
    try {
      if (node.instance) {
        const inputs = (node.instance.inputs ?? {}) as Inputs;
        if (!known.has(instance)) await createCard(next, node.instance.source, inputs, instance);
        else { const patch = changedInputs(inputs, known.get(instance)); if (Object.keys(patch).length) await updateCard(next, instance, patch); }
      }
      if (member && Object.keys(member).length) await updateCard(next, instance, member as Inputs);
      const pressed = ctx.nexoActions?.(node.id) ?? [];
      if (pressed.length) await replayRecorded(node.id, pressed, actions => replayActions(next, instance, actions), error => error instanceof SessionLostError || isSessionLost(error));
    } catch (error) { guard(error); }
  }
  return next;
}
