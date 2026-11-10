"use client";
import { useActionState, useId } from "react";
import { FormAlert } from "@/components/error-summary";
import type { NameEntry } from "@/lib/results";
import { saveDictionaryEntry } from "./actions";

export function EntryForm({ entry }: { entry?: NameEntry }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveDictionaryEntry, {});
  return <form action={action}>
    <input type="hidden" name="id" value={entry?.id ?? ""} />
    <div className="form-row">
      <div className="field"><label className="field-label" htmlFor={`${id}-export`}>SCIEX export name</label><input id={`${id}-export`} name="export_name" className="mono" defaultValue={entry?.export_name} required maxLength={500} /></div>
      <div className="field"><label className="field-label" htmlFor={`${id}-clean`}>Clean name</label><input id={`${id}-clean`} name="clean_name" defaultValue={entry?.clean_name} required maxLength={500} /></div>
    </div>
    <div className="form-actions">
      <button className={`button${entry ? " secondary" : ""}`} disabled={pending}>{pending ? "Saving…" : entry ? "Save changes" : "Add entry"}</button>
      {state.saved && <p className="notice success" role="status" style={{ margin: 0 }}><strong>Entry saved.</strong></p>}
    </div>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
