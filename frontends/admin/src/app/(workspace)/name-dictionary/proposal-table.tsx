"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/error-summary";
import { approveProposals, importList, saveDictionaryEntry } from "./actions";
import styles from "./proposal-table.module.css";

export type ProposalRow = { exportName: string; proposed: string; rule: string; needsChemist: boolean };
const PAGE_SIZE = 50;
const number = (value: number) => value.toLocaleString("en-US");

// A name no rule settles: the chemist sets it. Closed, it reads as the prototype's pill.
function ChemistDecision({ row, onSaved }: { row: ProposalRow; onSaved: (name: string) => void }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveDictionaryEntry, {});
  useEffect(() => { if (state.saved) onSaved(row.exportName); }, [state, row.exportName, onSaved]);
  return <details className={styles.chemist}>
    <summary className={styles.pill} data-tone="warn" aria-label={`Ask chemist about ${row.exportName}`}>ask chemist</summary>
    <form action={action} className={styles.chemistForm}>
      <input type="hidden" name="id" value="" />
      <input type="hidden" name="export_name" value={row.exportName} />
      <label className="field-label" htmlFor={`${id}-clean`}>Clean name set by the chemist</label>
      <input id={`${id}-clean`} name="clean_name" className="mono" defaultValue={row.proposed} required maxLength={500} />
      <button className="button secondary" disabled={pending}>{pending ? "Saving…" : "Save name"}</button>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
    </form>
  </details>;
}

function ImportList() {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(importList, {});
  return <form ref={form} action={action} className={styles.importForm}>
    <input id={`${id}-file`} name="file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only"
      aria-describedby={`${id}-hint`} disabled={pending} onChange={event => { if (event.target.files?.length) form.current?.requestSubmit(); }} />
    <label htmlFor={`${id}-file`} className="button secondary" aria-disabled={pending || undefined}>{pending ? "Importing…" : "Import list"}</label>
    <span id={`${id}-hint`} className="sr-only">A CSV of export name, clean name. A header row is optional.</span>
    {(state.error || state.added !== undefined) && <div className={styles.importResult}>
      {state.error ? <FormAlert>{state.error}</FormAlert>
        : <p className="notice success" role="status"><strong>{number(state.added ?? 0)} name{state.added === 1 ? "" : "s"} imported.</strong>{state.existing ? ` ${number(state.existing)} already in the dictionary, left as they are.` : ""}{state.skipped?.length ? ` ${state.skipped.length} row${state.skipped.length === 1 ? "" : "s"} skipped: ${state.skipped.slice(0, 3).join(" ")}` : ""}</p>}
    </div>}
  </form>;
}

export function ProposalTable({ proposals, mapped, classesRenamed, hasFile }: { proposals: ProposalRow[]; mapped: number; classesRenamed: { from: string; to: string }[]; hasFile: boolean }) {
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const rows = proposals.filter(row => !done.includes(row.exportName));
  const approvable = rows.filter(row => !row.needsChemist);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const markDone = (names: string[]) => setDone(previous => [...previous, ...names]);
  const approve = (names: string[]) => {
    setError(""); setNotice("");
    startTransition(async () => {
      const result = await approveProposals(names);
      if (result.error) { setError(result.error); return; }
      markDone(names);
      setNotice(names.length === 1 ? `${names[0]} approved.` : `${number(result.added ?? 0)} names approved.`);
    });
  };
  return <>
    <div className="page-heading">
      <div>
        <h1>Lipid name dictionary</h1>
        <p>Approved once, reused on every run, so the same lipid always reaches Nexo under one name.</p>
      </div>
      <div className="heading-actions">
        <ImportList />
        <button type="button" className="button" disabled={pending || !approvable.length} onClick={() => approve(approvable.map(row => row.exportName))}>Approve {number(approvable.length)}</button>
      </div>
    </div>
    <div className={styles.pills} aria-label="Dictionary status">
      <span className={styles.pill} data-tone="ok">{number(mapped + done.filter(name => proposals.some(row => row.exportName === name)).length)} mapped</span>
      <span className={styles.pill} data-tone="warn">{number(rows.length)} to review</span>
      <span className={styles.pill} title={classesRenamed.map(c => `${c.from} → ${c.to}`).join(", ") || undefined}>{classesRenamed.length} class{classesRenamed.length === 1 ? "" : "es"} renamed</span>
    </div>
    {error && <FormAlert>{error}</FormAlert>}
    {notice && <p className="notice success" role="status"><strong>{notice}</strong></p>}
    <section className={styles.card} aria-label="Names to review">
      {!hasFile ? <p className={styles.empty}>Parse a results file on Ingest results first: its names that the dictionary does not map yet are proposed here. The last file is retained for one hour in this session.</p>
        : !rows.length ? <p className={styles.empty}>Every name of the last file has a clean name.</p>
        : <table className={styles.table} aria-label="Proposed clean names">
          <thead><tr><th scope="col">In the SCIEX export</th><th scope="col">Proposed</th><th scope="col">Rule</th><th scope="col">Decision</th></tr></thead>
          <tbody>{rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(row => <tr key={row.exportName} data-chemist={row.needsChemist || undefined}>
            <td className="mono">{row.exportName}</td>
            <td className="mono">{row.proposed}</td>
            <td>{row.rule}</td>
            <td>{row.needsChemist
              ? <ChemistDecision row={row} onSaved={name => { markDone([name]); setNotice(`${name} saved.`); }} />
              : <button type="button" className={styles.approve} disabled={pending} onClick={() => approve([row.exportName])} aria-label={`Approve ${row.exportName}`}>Approve</button>}</td>
          </tr>)}</tbody>
        </table>}
    </section>
    {rows.length > PAGE_SIZE && <div className={styles.pagination}>
      <span>Showing {number(current * PAGE_SIZE + 1)}–{number(Math.min((current + 1) * PAGE_SIZE, rows.length))} of {number(rows.length)}</span>
      {current > 0 && <button type="button" className="button secondary" onClick={() => setPage(current - 1)}>Previous</button>}
      {current < pages - 1 && <button type="button" className="button secondary" onClick={() => setPage(current + 1)}>Show next {PAGE_SIZE}</button>}
    </div>}
  </>;
}
