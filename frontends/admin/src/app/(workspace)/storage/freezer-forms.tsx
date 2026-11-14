"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/error-summary";
import type { Freezer } from "@/lib/freezers";
import {
  archiveFreezerAction, archiveRackAction, createFreezerAction, createRackAction, setBoxLocationAction, type FreezerActionState,
} from "./freezer-actions";
import styles from "./storage.module.css";

type Action = (previous: FreezerActionState, form: FormData) => Promise<FreezerActionState>;
function useFreezerAction(action: Action) {
  return useActionState<FreezerActionState, FormData>(action, {});
}

// Owner or Admin: a new freezer (name, temperature as the lab writes it, an optional note).
export function AddFreezerForm() {
  const [state, formAction, pending] = useFreezerAction(createFreezerAction);
  return <form action={formAction} className={styles.freezerForm} aria-label="Add a freezer" aria-busy={pending}>
    <label className="field"><span className="field-label">Freezer name</span>
      <input name="name" required maxLength={80} defaultValue={state.values?.name ?? ""} autoComplete="off" placeholder="e.g. Freezer F2" /></label>
    <label className="field"><span className="field-label">Temperature</span>
      <input name="temperature" maxLength={40} defaultValue={state.values?.temperature ?? ""} autoComplete="off" placeholder="e.g. −80 °C" /></label>
    <label className="field"><span className="field-label">Note <span className="muted">(optional)</span></span>
      <input name="note" maxLength={500} defaultValue={state.values?.note ?? ""} autoComplete="off" placeholder="e.g. Room 2.14" /></label>
    <div className={styles.wide}>
      <button className="button secondary" disabled={pending}>{pending ? "Adding…" : "Add freezer"}</button>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </div>
  </form>;
}

export function AddRackForm({ freezer }: { freezer: Freezer }) {
  const [state, formAction, pending] = useFreezerAction(createRackAction);
  return <form action={formAction} className={styles.inlineForm} aria-label={`Add a rack to ${freezer.name}`} aria-busy={pending}>
    <input type="hidden" name="freezerId" value={freezer.id} />
    <label className="field"><span className="field-label">New rack</span>
      <input name="name" required maxLength={80} defaultValue={state.values?.name ?? ""} autoComplete="off" placeholder="e.g. Rack 3" /></label>
    <button className="button subtle" disabled={pending}>{pending ? "Adding…" : "Add rack"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}

// Archive (never delete) a freezer or a rack, with the reason; refused while a box is still there.
export function ArchiveForm({ kind, id, name }: { kind: "freezer" | "rack"; id: string; name: string }) {
  const [state, formAction, pending] = useFreezerAction(kind === "freezer" ? archiveFreezerAction : archiveRackAction);
  return <details className={styles.archive} open={Boolean(state.error)}>
    <summary aria-label={`Archive ${name}…`}>Archive…</summary>
    <form action={formAction} className={styles.inlineForm} aria-label={`Archive ${name}`} aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <label className="field"><span className="field-label">Reason</span>
        <input name="reason" required maxLength={500} defaultValue={state.values?.reason ?? ""} autoComplete="off" placeholder={kind === "freezer" ? "e.g. replaced" : "e.g. broken"} /></label>
      <button className="button subtle" disabled={pending}>{pending ? "Archiving…" : `Archive ${kind}`}</button>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  </details>;
}

// A lab writer: which freezer and rack the open box is in (one select: a freezer alone, or one of its racks).
export function BoxPlaceForm({ box, freezers, value }: { box: string; freezers: Freezer[]; value: string }) {
  const [state, formAction, pending] = useFreezerAction(setBoxLocationAction);
  return <form action={formAction} className={styles.inlineForm} aria-label={`Freezer and rack of box ${box}`} aria-busy={pending}>
    <input type="hidden" name="box" value={box} />
    <label className="field"><span className="field-label">Freezer and rack</span>
      <select name="place" defaultValue={state.values?.place ?? value}>
        <option value="">Not set</option>
        {freezers.map(freezer => <optgroup key={freezer.id} label={`${freezer.name}${freezer.temperature ? ` (${freezer.temperature})` : ""}`}>
          <option value={`${freezer.id}|`}>{freezer.name} · no rack</option>
          {freezer.racks.map(rack => <option key={rack.id} value={`${freezer.id}|${rack.id}`}>{freezer.name} · {rack.name}</option>)}
        </optgroup>)}
      </select></label>
    <button className="button subtle" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
