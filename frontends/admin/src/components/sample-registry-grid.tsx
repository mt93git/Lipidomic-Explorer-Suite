"use client";

import { startTransition, useActionState, useId, useState, type ClipboardEvent, type ReactNode } from "react";
import { registerSamplesAction, type RegisterSamplesPayload, type RegisterSamplesState } from "@/app/(workspace)/sample-registry/actions";
import { applyFixes, checkSamples, columnMatches, draftFromCells, readPaste, summarizeChecks, type CheckIssue, type Fix, type Mapping } from "@/lib/sample-checks";
import { columns, emptyDraft, plural, toSampleInput, type OrderSummary, type SampleDraft, type SampleField } from "@/lib/samples";
import { sampleCode } from "@/lib/samples-demo";

// prefill: the sample list pasted in the New order wizard, offered in the paste box (the lab reviews and adds it).
type Props = { order: OrderSummary; shipmentId: string | null; existingNames: string[]; nextSampleNumber?: number; prefill?: string | null; eyebrow?: ReactNode; children?: ReactNode };
// One grid row: the draft, and where it came from in the last paste (re-read when Map columns changes a match).
type Row = { key: number; draft: SampleDraft; origin: number | null };
type Source = { headers: string[] | null; cells: string[][]; mapping: Mapping; edited: boolean };

// The grid's columns in the prototype's order; the lab's code comes first and is never typed.
const gridFields: SampleField[] = ["client_sample_id", "full_name", "group1_term", "group2_term", "replicate_term", "patient_term", "time_point_term", "matrix", "volume_ul"];
const shortLabels: Partial<Record<SampleField, ReactNode>> = { client_sample_id: "Client ID", replicate_term: "Replicate", patient_term: "Patient", time_point_term: "TimePoint", volume_ul: <>Volume <span className="unit">µL</span></> };
// Wide enough for the usual labels ("Apoptotic cells") without scrolling inside a cell.
const gridWidths: Record<SampleField, number> = { client_sample_id: 112, full_name: 140, group1_term: 168, group2_term: 120, replicate_term: 84, patient_term: 84, time_point_term: 96, matrix: 96, volume_ul: 80 };
const columnOf = (field: SampleField) => columns.find(column => column.field === field) ?? columns[0];
const monoFields = new Set<SampleField>(gridFields);
const fixLabel = (count: number) => count === 1 ? "Fix it" : count === 2 ? "Fix both" : `Fix all ${count}`;
let nextKey = 0;

// The registration screen: paste the client's Excel, see which columns were matched, fix what the checks flag
// (errors block saving, warnings may carry a fix), then save the valid rows. Codes are assigned by the database.
export function SampleRegistryGrid({ order, shipmentId, existingNames, nextSampleNumber = 1, prefill = null, eyebrow, children }: Props) {
  const idBase = useId();
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [pasteText, setPasteText] = useState(prefill ?? "");
  const [pasteNote, setPasteNote] = useState<{ text: string; empty: boolean } | null>(null);
  const [manifestText, setManifestText] = useState("");
  const [state, submit, pending] = useActionState<RegisterSamplesState, RegisterSamplesPayload>(registerSamplesAction, {});

  const drafts = rows.map(row => row.draft);
  const manifest = manifestText.split(/[\t\r\n,;]+/).map(id => id.trim()).filter(Boolean);
  const issues = checkSamples(drafts, { existingNames, manifest });
  const summary = summarizeChecks(drafts, issues);
  const cellIssues = (row: number, field: SampleField) => issues.filter(issue => issue.row === row && issue.field === field);
  const columnErrors = new Set(issues.flatMap(issue => issue.row === null && issue.severity === "error" ? [issue.field] : []));

  const addRows = (text: string) => {
    const paste = readPaste(text);
    const added = paste.cells.flatMap((line, origin) => { const draft = draftFromCells(line, paste.mapping); return Object.values(draft).some(Boolean) ? [{ key: nextKey++, draft, origin }] : []; });
    if (!added.length) { setPasteNote({ text: "Nothing to add: paste at least one row with a FullName.", empty: true }); return; }
    const next = [...rows.map(row => ({ ...row, origin: null })), ...added];
    setRows(next);
    setSource({ ...paste, edited: false });
    setPasteText("");
    const unused = paste.headers ? paste.headers.filter((header, index) => header && !paste.mapping[index]) : [];
    const header = paste.headers ? "header row recognised" : "no header row, columns read in grid order";
    const nextDrafts = next.map(row => row.draft);
    const checked = summarizeChecks(nextDrafts, checkSamples(nextDrafts, { existingNames, manifest }));
    setPasteNote({ text: `Added ${plural(added.length, "row")} from the paste · ${header}${unused.length ? ` · ignored ${plural(unused.length, "column")}: ${unused.join(", ")}` : ""} · ${plural(checked.errors, "error")}, ${plural(checked.warnings, "warning")}.`, empty: false });
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n\r]/.test(text)) return;
    event.preventDefault();
    addRows(text);
  };
  const remap = (index: number, field: SampleField | null) => {
    if (!source) return;
    const mapping = source.mapping.map((current, at) => at === index ? field : current === field ? null : current);
    setSource({ ...source, mapping, edited: true });
    setRows(list => list.map(row => row.origin === null ? row : { ...row, draft: draftFromCells(source.cells[row.origin] ?? [], mapping) }));
  };
  const update = (index: number, field: SampleField, value: string) => setRows(list => list.map((row, at) => at === index ? { ...row, draft: { ...row.draft, [field]: value } } : row));
  const remove = (index: number) => setRows(list => list.filter((_, at) => at !== index));
  const fixRow = (index: number) => {
    const fixed = applyFixes(drafts, issues, index);
    setRows(list => list.map((row, at) => at === index ? { ...row, draft: fixed[at] } : row));
  };
  const valid = summary.validRows.length;
  const canSave = rows.length > 0 && valid > 0 && summary.errors === 0 && !pending;
  const register = () => startTransition(() => submit({ orderId: order.id, orderCode: order.code, shipmentId, samples: summary.validRows.map(index => toSampleInput(drafts[index])) }));

  const matches = source?.headers ? columnMatches(source.headers, source.mapping) : [];
  const unused = source?.headers ? source.headers.filter((header, index) => header && !source.mapping[index]) : [];
  const description = !source
    ? "Paste the client's Excel below. Columns are matched automatically by name; Map columns changes a match."
    : !source.headers
      ? "Pasted from the client's Excel without a header row: columns read in the order FullName, Group1Term, Group2Term, ReplicateTerm, PatientTerm, TimePointTerm, Client ID, Matrix, Volume."
      : <>Pasted from the client&apos;s Excel. {source.edited ? "Columns as mapped" : "Columns matched automatically"}{matches.length
        ? <>: {matches.map((match, index) => <span key={match.from}>{index ? ", " : ""}&quot;{match.from}&quot; <span aria-label="matched to">→</span> {columnOf(match.to).label}</span>)}.</>
        : " by name."}{unused.length ? <> Not used: {unused.map(header => `"${header}"`).join(", ")}.</> : null}</>;

  const prefilled = Boolean(prefill) && pasteText === prefill;
  const pasteBox = <div className="field paste-box">
    <label className="field-label" htmlFor={`${idBase}-paste`}>Paste from Excel</label>
    {prefilled && <p id={`${idBase}-prefill`} className="notice"><strong>From the order&apos;s sample list — review and register</strong> <small>The list pasted in New order. Add rows to check it, fix what is flagged, then save.</small></p>}
    <textarea id={`${idBase}-paste`} rows={prefilled ? 8 : 4} value={pasteText} aria-describedby={prefilled ? `${idBase}-prefill` : undefined} onChange={event => setPasteText(event.target.value)} onPaste={onPaste} spellCheck={false}
      placeholder={"Client ID\tFullName\tGroup 1\tGroup2Term\tReplicate\tPatient\tTime\tMatrix\nTUBE-01\tCtrl_0h_R1\tControl\tWT\t1\tNA\t0h\tcells"} />
    <small className="field-hint">Tab-separated, one sample per row. A header row is matched to the Metadata columns by name (&quot;Group 1&quot; → Group1Term, &quot;Time&quot; → TimePointTerm); without one, columns are read in the order FullName, Group1Term, Group2Term, ReplicateTerm, PatientTerm, TimePointTerm, Client ID, Matrix, Volume.</small>
    <details className="column-help-toggle">
      <summary>Which columns?</summary>
      <ol className="column-help">{columns.map(column => <li key={column.field}><span className="mono">{column.label}{column.required ? " *" : ""}</span><span>{column.hint}</span></li>)}</ol>
    </details>
    <div className="form-actions">
      <button type="button" className="button secondary" onClick={() => addRows(pasteText)} disabled={!pasteText.trim()}>Add rows</button>
      <button type="button" className="button subtle" onClick={() => { setRows(list => [...list, { key: nextKey++, draft: emptyDraft(), origin: null }]); setPasteNote(null); }}>Add empty row</button>
    </div>
  </div>;
  // Outside the paste box, which folds into "Paste more rows" once the grid has rows, so the note is still announced.
  const pasteStatus = <p className={pasteNote?.empty ? "muted" : "sr-only"} role="status">{pasteNote && <small>{pasteNote.text}</small>}</p>;

  return <div className="registry">
    <div className="page-heading registry-heading">
      <div>
        {eyebrow}
        <h1>Register samples · {order.code}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">
        <button type="button" className="button secondary" aria-expanded={mapOpen} aria-controls={`${idBase}-map`} disabled={!source} onClick={() => setMapOpen(open => !open)}>Map columns</button>
        <button type="button" className="button" onClick={register} disabled={!canSave}>{pending ? "Saving…" : `Save ${plural(valid, "valid row")}`}</button>
      </div>
    </div>

    {rows.length === 0 && children}

    {mapOpen && source && <section id={`${idBase}-map`} className="check-card map-columns" aria-labelledby={`${idBase}-map-title`}>
      <h2 id={`${idBase}-map-title`} className="check-card-title">Map columns</h2>
      <div className="check-card-body">
        <table className="map-table">
          <thead><tr><th scope="col">Pasted column</th><th scope="col">First value</th><th scope="col">Column in Admin</th></tr></thead>
          <tbody>{source.mapping.map((field, index) => {
            const header = source.headers?.[index] || `Column ${index + 1}`;
            return <tr key={index}>
              <th scope="row">{header}</th>
              <td className="mono">{source.cells.find(line => line[index])?.[index] ?? ""}</td>
              <td><select aria-label={`Column for ${header}`} value={field ?? ""} onChange={event => remap(index, (event.target.value || null) as SampleField | null)}>
                <option value="">Not used</option>
                {columns.map(column => <option key={column.field} value={column.field}>{column.label}</option>)}
              </select></td>
            </tr>;
          })}</tbody>
        </table>
        <p className="muted"><small>Changing a match re-reads the {plural(rows.filter(row => row.origin !== null).length, "pasted row")}; edits made to those rows are replaced. Each column takes one pasted column.</small></p>
        <button type="button" className="button secondary" onClick={() => setMapOpen(false)}>Done</button>
      </div>
    </section>}

    {state.error && !summary.errors && <p className="error" role="alert">{state.error}</p>}

    {rows.length > 0 && <>
      <div className="check-pills" role="group" aria-label="Paste checks">
        <span className="count-pill valid">{valid} valid</span>
        <span className="count-pill error">{plural(summary.errors, "error")}</span>
        <span className="count-pill warning">{plural(summary.warnings, "warning")}</span>
      </div>

      <div className="grid-frame"><div className="grid-scroll" role="region" aria-label="Sample grid" tabIndex={0}>
        <table className="registry-table check-table" aria-label="Samples to register">
          <thead><tr>
            <th scope="col" className="pinned" title="Assigned when you save">Sample ID</th>
            {gridFields.map(field => <th key={field} scope="col" title={columnOf(field).hint} className={columnErrors.has(field) ? "column-error" : undefined}>{shortLabels[field] ?? columnOf(field).label}</th>)}
            <th scope="col"><span className="sr-only">Remove</span></th>
          </tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.key}>
            <th scope="row" className="pinned code-preview">{sampleCode(order.code, nextSampleNumber + index)}</th>
            {gridFields.map(field => {
              const column = columnOf(field);
              const own: CheckIssue[] = cellIssues(index, field);
              const tone = own.some(issue => issue.severity === "error") ? "invalid" : own.length ? "warning" : "";
              const messageId = `${idBase}-r${index}-${field}-issue`;
              return <td key={field} className={`cell${tone ? ` ${tone}` : ""}`}>
                <input value={row.draft[field]} aria-label={`Row ${index + 1} ${column.label}`} aria-invalid={tone === "invalid" ? true : undefined} aria-describedby={own.length ? messageId : undefined}
                  className={monoFields.has(field) ? "mono" : undefined} inputMode={field === "volume_ul" ? "decimal" : undefined} placeholder={tone ? "—" : undefined}
                  autoComplete="off" spellCheck={false} style={{ width: gridWidths[field] }} onChange={event => update(index, field, event.target.value)} />
                {own.length > 0 && <span id={messageId} className="sr-only">{own.map(issue => issue.message).join(" ")}</span>}
              </td>;
            })}
            <td className="remove-cell"><button type="button" className="link-button" aria-label={`Remove row ${index + 1}`} title={`Remove row ${index + 1}`} onClick={() => remove(index)}>×</button></td>
          </tr>)}</tbody>
        </table>
      </div><p className="grid-hint">↔ {gridFields.length} more columns · Sample ID stays pinned</p></div>

      <div className="check-panels">
        <section className="check-card" aria-labelledby={`${idBase}-fix-title`}>
          <h2 id={`${idBase}-fix-title`} className="check-card-title">Fix before saving</h2>
          <div className="check-card-body">
            {summary.items.length ? <ul className="fix-list">{summary.items.map(item => <li key={`${item.severity}-${item.row ?? "column"}-${item.text}`}>
              <span className={`count-pill ${item.severity}`}>{item.severity}</span> {item.text}
              {item.row !== null && item.fixes.length > 0 && <div className="fix-action">
                <button type="button" className="fix-button" onClick={() => fixRow(item.row as number)} aria-describedby={`${idBase}-fix-${item.row}`}>{fixLabel(item.fixes.length)}</button>
                <small id={`${idBase}-fix-${item.row}`} className="muted">{item.fixes.map((fix: Fix) => `${columnOf(fix.field).label} → ${fix.value}`).join(" · ")}</small>
              </div>}
            </li>)}</ul> : <p className="muted">Nothing to fix. Every row passes the checks.</p>}
          </div>
        </section>
        <section className="check-card" aria-labelledby={`${idBase}-checks-title`}>
          <h2 id={`${idBase}-checks-title`} className="check-card-title">Checks Admin runs on every paste</h2>
          <div className="check-card-body">
            <ul className="check-list">
              <li>FullName unique within the order</li>
              <li>Six Nexo columns present (FullName, Group1Term, Group2Term, ReplicateTerm, PatientTerm, TimePointTerm)</li>
              <li>TimePointTerm filled in a time-course design (NA allowed)</li>
              <li>Group1Term has at least 2 levels</li>
              <li>Client IDs match the manifest (catches <span className="mono">TUBE-0xx</span> vs <span className="mono">TUB-0xx</span>) <span className="muted">· {manifest.length ? `${plural(manifest.length, "ID")} in the manifest` : "no manifest pasted, skipped"}</span></li>
              <li>Near-duplicate group labels and group terms used once are warnings</li>
            </ul>
            <details className="manifest-box">
              <summary>{manifest.length ? "Client manifest" : "Add the client's manifest"}</summary>
              <div className="field">
                <label className="field-label" htmlFor={`${idBase}-manifest`}>Client manifest</label>
                <textarea id={`${idBase}-manifest`} rows={3} value={manifestText} onChange={event => setManifestText(event.target.value)} spellCheck={false} placeholder={"TUBE-01\nTUBE-02"} />
                <small className="field-hint">The client&apos;s tube IDs, one per line. Used for this check only; it is not saved.</small>
              </div>
            </details>
          </div>
        </section>
      </div>
    </>}

    {rows.length > 0 && children}

    {rows.length ? <details className="paste-more"><summary>Paste more rows</summary>{pasteBox}</details> : pasteBox}
    {pasteStatus}

    <p className="registry-foot muted"><small>{rows.length ? `${plural(rows.length, "sample")} in the grid${order.expectedSamples ? ` · ${order.expectedSamples} expected` : ""} · ` : ""}Sample IDs are assigned when you save and never contain a client name.</small></p>
  </div>;
}
