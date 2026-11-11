"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/error-summary";
import { MAX_REASON } from "@/lib/storage";
import { moveAliquotAction, placeAliquotAction, removeAliquotAction, type StorageActionState } from "./actions";
import styles from "./storage.module.css";

export type AliquotAction = "place" | "move" | "remove";
const actions = { place: placeAliquotAction, move: moveAliquotAction, remove: removeAliquotAction };
const labels: Record<AliquotAction, { submit: string; pending: string }> = {
  place: { submit: "Place", pending: "Placing…" }, move: { submit: "Move", pending: "Moving…" }, remove: { submit: "Remove", pending: "Removing…" },
};

// One aliquot's Place, Move or Remove form. It opens with the focus in its first field (the link that opened it is
// further down the page). A refusal is shown under the button and the typed values stay; on success the action
// reopens the screen with a confirmation. from: the box the aliquot is in now (Remove returns to it).
export function AliquotForm({ action, aliquotId, code, from }: { action: AliquotAction; aliquotId: string; code: string; from?: string }) {
  const [state, formAction, pending] = useActionState<StorageActionState, FormData>(actions[action], {});
  const label = labels[action];
  return <form action={formAction} className={styles.form} aria-label={`${label.submit} ${code}`} aria-busy={pending}>
    <input type="hidden" name="aliquotId" value={aliquotId} />
    <input type="hidden" name="code" value={code} />
    {from !== undefined && <input type="hidden" name="from" value={from} />}
    {action === "remove"
      ? <label className={`field ${styles.wide}`}><span className="field-label">Reason</span>
        <input name="reason" required autoFocus maxLength={MAX_REASON} defaultValue={state.reason ?? ""} placeholder="e.g. used up in batch B2026-032" /></label>
      : <>
        <label className="field"><span className="field-label">{action === "move" ? "New box" : "Box"}</span>
          <input name="box" required autoFocus maxLength={120} defaultValue={state.box ?? ""} autoComplete="off" placeholder="e.g. F1-R1-B02" /></label>
        <label className="field"><span className="field-label">Position</span>
          <input name="position" required maxLength={40} defaultValue={state.position ?? ""} autoComplete="off" placeholder="e.g. A5" /></label>
      </>}
    <div className={styles.wide}>
      <button className={`button${action === "remove" ? " secondary" : ""}`} disabled={pending}>{pending ? label.pending : label.submit}</button>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </div>
  </form>;
}
