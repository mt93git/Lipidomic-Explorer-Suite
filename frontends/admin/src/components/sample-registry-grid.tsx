"use client";

import { startTransition, useActionState, useId, useState, type ClipboardEvent } from "react";
import { registerSamplesAction, type RegisterSamplesPayload, type RegisterSamplesState } from "@/app/(workspace)/sample-registry/actions";
import { columns, emptyDraft, parsePaste, plural, toSampleInput, validateSamples, type OrderSummary, type SampleDraft, type SampleField } from "@/lib/samples";

type Props = { order: OrderSummary; shipmentId: string | null; existingNames: string[] };

// The registration grid: paste rows from Excel (or add them by hand), fix what the inline checks flag, save
// all at once. Codes are never typed here; the database assigns them and the page shows them after saving.
export function SampleRegistryGrid({ order, shipmentId, existingNames }: Props) {
  const idBase = useId();
  const [drafts, setDrafts] = useState<SampleDraft[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [state, submit, pending] = useActionState<RegisterSamplesState, RegisterSamplesPayload>(registerSamplesAction, {});
  const issues = validateSamples(drafts, existingNames);
  const rowsWithIssues = new Set(issues.map(issue => issue.row)).size;
  const issueFor = (row: number, field: SampleField) => issues.find(issue => issue.row === row && issue.field === field);

  const addRows = (text: string) => {
    const result = parsePaste(text);
    if (!result.rows.length) { setPasteNote("Nothing to add: paste at least one row with a FullName."); return; }
    setDrafts(list => [...list, ...result.rows]);
    setPasteText("");
    const header = result.headerDetected ? "header row recognised" : "no header row, columns read in grid order";
    const ignored = result.ignoredHeaders.length ? ` · ignored ${plural(result.ignoredHeaders.length, "column")}: ${result.ignoredHeaders.join(", ")}` : "";
    setPasteNote(`Added ${plural(result.rows.length, "row")} from the paste · ${header}${ignored}.`);
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n\r]/.test(text)) return;
    event.preventDefault();
    addRows(text);
  };
  const update = (row: number, field: SampleField, value: string) => setDrafts(list => list.map((draft, index) => index === row ? { ...draft, [field]: value } : draft));
  const remove = (row: number) => setDrafts(list => list.filter((_, index) => index !== row));
  const register = () => startTransition(() => submit({ orderId: order.id, orderCode: order.code, shipmentId, samples: drafts.map(toSampleInput) }));

  return <div className="registry">
    <div className="field paste-box">
      <label className="field-label" htmlFor={`${idBase}-paste`}>Paste from Excel</label>
      <textarea id={`${idBase}-paste`} rows={4} value={pasteText} onChange={event => setPasteText(event.target.value)} onPaste={onPaste} spellCheck={false}
        placeholder={"FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm\nCtrl_1\tControl\tWildType\t1\t…"} />
      <small className="field-hint">Tab-separated, one sample per row. Pasting adds the rows at once; a header row with the Metadata column names is recognised, otherwise columns are read in the grid&apos;s order.</small>
      <details className="column-help-toggle">
        <summary>Which columns?</summary>
        <ol className="column-help">{columns.map(column => <li key={column.field}><span className="mono">{column.label}{column.required ? " *" : ""}</span><span>{column.hint}</span></li>)}</ol>
      </details>
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={() => addRows(pasteText)} disabled={!pasteText.trim()}>Add rows</button>
        <button type="button" className="button subtle" onClick={() => { setDrafts(list => [...list, emptyDraft()]); setPasteNote(null); }}>Add empty row</button>
      </div>
      {pasteNote && <p className="muted" role="status"><small>{pasteNote}</small></p>}
    </div>

    {issues.length > 0 && <p className="error" role="alert">{plural(rowsWithIssues, "row")} need{rowsWithIssues === 1 ? "s" : ""} attention before saving. Each problem is written under its cell.</p>}
    {state.error && !issues.length && <p className="error" role="alert">{state.error}</p>}

    {drafts.length > 0 ? <div className="grid-frame"><div className="grid-scroll" role="region" aria-label="Sample grid" tabIndex={0}>
      <table className="registry-table" aria-label="Samples to register">
        <thead><tr>
          <th scope="col">#</th>
          {columns.map(column => <th key={column.field} scope="col" title={column.hint} className={column.field === "full_name" ? "pinned" : undefined}>{column.label}{column.required && <span className="required-mark" aria-hidden="true"> *</span>}</th>)}
          <th scope="col"><span className="sr-only">Remove</span></th>
        </tr></thead>
        <tbody>{drafts.map((draft, row) => <tr key={row}>
          <th scope="row">{row + 1}</th>
          {columns.map(column => {
            const issue = issueFor(row, column.field);
            const errorId = `${idBase}-r${row}-${column.field}-error`;
            return <td key={column.field} className={`cell${issue ? " invalid" : ""}${column.field === "full_name" ? " pinned" : ""}`}>
              <input value={draft[column.field]} aria-label={`Row ${row + 1} ${column.label}`} aria-invalid={issue ? true : undefined} aria-describedby={issue ? errorId : undefined}
                className={column.field === "full_name" || column.field === "client_sample_id" ? "mono" : undefined} inputMode={column.field === "volume_ul" ? "decimal" : undefined}
                autoComplete="off" spellCheck={false} style={{ width: column.width }} onChange={event => update(row, column.field, event.target.value)} />
              {issue && <small id={errorId} className="cell-error" style={{ maxWidth: column.width }}>{issue.message}</small>}
            </td>;
          })}
          <td><button type="button" className="link-button" aria-label={`Remove row ${row + 1}`} onClick={() => remove(row)}>Remove</button></td>
        </tr>)}</tbody>
      </table>
    </div><p className="grid-hint">↔ {columns.length - 1} more columns · FullName stays pinned</p></div> : <p className="empty-state">No rows yet. Paste the order&apos;s Metadata sheet above or add a row by hand.</p>}

    <div className="registry-toolbar">
      <span className="muted"><small>{drafts.length ? `${plural(drafts.length, "sample")} in the grid${order.expectedSamples ? ` · ${order.expectedSamples} expected` : ""}` : "Codes are assigned when you save and never contain a client name."}</small></span>
      <button type="button" className="button" onClick={register} disabled={!drafts.length || issues.length > 0 || pending}>
        {pending ? "Registering…" : drafts.length ? `Register ${plural(drafts.length, "sample")}` : "Register samples"}
      </button>
    </div>
  </div>;
}
