"use client";
import { useActionState } from "react";
import type { NameEntry } from "@/lib/results";
import { saveDictionaryEntry } from "./actions";
export function EntryForm({ entry }: { entry?: NameEntry }) {
  const [state, action, pending] = useActionState(saveDictionaryEntry, {});
  return <form action={action}>
    <input type="hidden" name="id" value={entry?.id ?? ""} />
    <label>SCIEX export name<input name="export_name" defaultValue={entry?.export_name} required maxLength={500} /></label>
    <label>Clean name<input name="clean_name" defaultValue={entry?.clean_name} required maxLength={500} /></label>
    <button className="button" disabled={pending}>{entry ? "Save changes" : "Add entry"}</button>
    {state.error && <p role="alert">{state.error}</p>}{state.saved && <p role="status">Entry saved.</p>}
  </form>;
}
