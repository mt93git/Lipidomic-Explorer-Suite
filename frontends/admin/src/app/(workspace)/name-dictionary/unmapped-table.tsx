"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { saveDictionaryEntry } from "./actions";
import styles from "./unmapped-table.module.css";
import resultsStyles from "../ingest-results/results.module.css";

const PAGE_SIZE = 33;

function UnmappedRow({ name, onSubmit, onSaved, onError }: { name: string; onSubmit: (name: string) => void; onSaved: (name: string) => void; onError: (name: string) => void }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveDictionaryEntry, {});
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.saved) onSaved(name); else if (state.error) { onError(name); input.current?.focus(); } }, [state, name, onSaved, onError]);
  return <tr>
    <td className="mono">{name}</td>
    <td><form id={id} action={action} onSubmit={() => onSubmit(name)} className="field">
      <input type="hidden" name="id" value="" />
      <input type="hidden" name="export_name" value={name} />
      <label className="sr-only" htmlFor={`${id}-clean`}>Clean name for {name}</label>
      <input ref={input} id={`${id}-clean`} name="clean_name" required maxLength={500} aria-describedby={state.error ? `${id}-error` : undefined} aria-invalid={state.error ? true : undefined} />
      {state.error && <p id={`${id}-error`} className="field-error" role="alert">{state.error}</p>}
    </form></td>
    <td><button form={id} className="button secondary" disabled={pending} aria-label={`Save ${name}`}>{pending ? "Saving…" : "Save"}</button></td>
  </tr>;
}

export function UnmappedTable({ analytes, hasFile = true }: { analytes: string[]; hasFile?: boolean }) {
  const [saved, setSaved] = useState<string[]>([]);
  const section = useRef<HTMLElement>(null);
  const focusIndex = useRef<number | null>(null);
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<{ name: string; index: number }[]>([]);
  const clearPending = useCallback((name: string) => setPending(previous => previous.filter(item => item.name !== name)), []);
  const markSaved = useCallback((name: string) => {
    const rows = Array.from(section.current?.querySelectorAll("tbody tr") ?? []);
    focusIndex.current = rows.findIndex(row => row.querySelector<HTMLInputElement>('input[name="export_name"]')?.value === name);
    setSaved(previous => [...previous, name]);
    clearPending(name);
  }, [clearPending]);
  useEffect(() => {
    if (focusIndex.current === null) return;
    const inputs = section.current?.querySelectorAll<HTMLInputElement>('input[name="clean_name"]');
    (inputs?.[focusIndex.current] ?? section.current?.querySelector<HTMLElement>('[role="status"]'))?.focus();
    focusIndex.current = null;
  }, [saved]);
  const missing = analytes.filter(name => !saved.includes(name));
  for (const item of pending) {
    if (!missing.includes(item.name) && !saved.includes(item.name)) missing.splice(item.index, 0, item.name);
  }
  const currentPage = Math.min(page, Math.max(0, Math.ceil(missing.length / PAGE_SIZE) - 1));
  return <section ref={section} className="panel" aria-labelledby="unmapped-title">
    <div className="eyebrow">From the last file</div>
    <h2 id="unmapped-title">Unmapped analytes · {missing.length}</h2>
    {saved.length > 0 && <p className="notice success" role="status" tabIndex={-1}><strong>{saved[saved.length - 1]} saved.</strong></p>}
    {!hasFile ? <p className="empty-state">Upload a results file first. The last file is retained for one hour in this session.</p>
      : missing.length === 0 ? <p className="muted">Every analyte of the last file has a clean name.</p>
      : <>
        <div className={resultsStyles.scroll}><table className={`${resultsStyles.entries} ${styles.table}`} aria-label="Unmapped analytes">
          <thead><tr><th scope="col">SCIEX export name</th><th scope="col">Clean name</th><th scope="col"><span className="sr-only">Save</span></th></tr></thead>
          <tbody>{missing.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(name =>
            <UnmappedRow key={name} name={name}
              onSubmit={name => setPending(previous => [...previous.filter(item => item.name !== name), { name, index: missing.indexOf(name) }])}
              onSaved={markSaved} onError={clearPending} />)}</tbody>
        </table></div>
        {missing.length > PAGE_SIZE && <div className={styles.pagination}>
          <span>Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, missing.length)} of {missing.length}</span>
          {currentPage > 0 && <button className="button secondary" disabled={pending.length > 0} onClick={() => setPage(currentPage - 1)}>Previous</button>}
          {(currentPage + 1) * PAGE_SIZE < missing.length && <button className="button secondary" disabled={pending.length > 0} onClick={() => setPage(currentPage + 1)}>Show next 33</button>}
        </div>}
      </>}
  </section>;
}
