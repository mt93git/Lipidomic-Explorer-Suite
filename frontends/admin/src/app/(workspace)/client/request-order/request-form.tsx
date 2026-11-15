"use client";

import { useActionState } from "react";
import { ErrorSummary, FormAlert } from "@/components/error-summary";
import type { Panel } from "@/lib/new-order";
import type { RequestField } from "@/lib/order-request";
import { requestOrderAction, type RequestState } from "./actions";

const matrices = ["Plasma", "Serum", "Tissue", "Cells", "Urine", "CSF"];
const fieldLabels: [RequestField, string][] = [["panelId", "Panel"], ["title", "Title"], ["matrix", "Matrix"], ["expectedSamples", "Expected samples"], ["billingRef", "Billing reference"], ["notes", "Notes"]];

// The same fields as the lab's New order, without the client (the selected one). noValidate: the server action checks
// it, so the error summary names every problem.
export function RequestOrderForm({ clientName, panels }: { clientName: string; panels: Panel[] }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestOrderAction, {});
  const values = state.values;
  const error = (field: RequestField) => state.errors?.[field];
  const describe = (field: RequestField) => error(field) ? { "aria-invalid": true as const, "aria-describedby": `request-${field}-error` } : {};
  const fieldError = (field: RequestField) => error(field) ? <small id={`request-${field}-error`} className="field-error">{error(field)}</small> : null;
  return <form action={action} className="record-form" noValidate>
    {state.error && <FormAlert>{state.error}</FormAlert>}
    <ErrorSummary fields={fieldLabels.filter(([field]) => error(field)).map(([field, label]) => ({ id: `request-${field}`, label }))} />
    <div className="form-row">
      <div className="field">
        <label className="field-label" htmlFor="request-client">Requesting for</label>
        <input id="request-client" value={clientName} readOnly disabled />
        <small className="field-hint">Your selected client.</small>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="request-panelId">Panel</label>
        <select id="request-panelId" name="panelId" defaultValue={values?.panelId ?? ""} {...describe("panelId")}>
          <option value="">Let the lab advise</option>
          {panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}
        </select>
        <small className="field-hint">Not sure? Choose “Let the lab advise”.</small>
        {fieldError("panelId")}
      </div>
    </div>
    <div className="field">
      <label className="field-label" htmlFor="request-title">Title</label>
      <input id="request-title" name="title" required autoComplete="off" defaultValue={values?.title ?? ""} {...describe("title")} />
      <small className="field-hint">A short name you and the lab will both recognise. No patient names.</small>
      {fieldError("title")}
    </div>
    <div className="form-row">
      <div className="field">
        <label className="field-label" htmlFor="request-matrix">Matrix</label>
        <input id="request-matrix" name="matrix" list="request-matrices" autoComplete="off" defaultValue={values?.matrix ?? ""} placeholder="Plasma, tissue, cells…" {...describe("matrix")} />
        <datalist id="request-matrices">{matrices.map(matrix => <option key={matrix} value={matrix} />)}</datalist>
        {fieldError("matrix")}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="request-expectedSamples">Expected samples</label>
        <input id="request-expectedSamples" name="expectedSamples" type="number" min={0} step={1} inputMode="numeric" defaultValue={values?.expectedSamples ?? ""} placeholder="Optional" {...describe("expectedSamples")} />
        {fieldError("expectedSamples")}
      </div>
    </div>
    <div className="field">
      <label className="field-label" htmlFor="request-billingRef">Billing reference</label>
      <input id="request-billingRef" name="billingRef" autoComplete="off" defaultValue={values?.billingRef ?? ""} placeholder="Charge code, PO or grant number (optional)" {...describe("billingRef")} />
      {fieldError("billingRef")}
    </div>
    <div className="field">
      <label className="field-label" htmlFor="request-notes">Notes</label>
      <textarea id="request-notes" name="notes" rows={3} defaultValue={values?.notes ?? ""} {...describe("notes")} />
      <small className="field-hint">Anything the lab should know before the samples arrive.</small>
      {fieldError("notes")}
    </div>
    <div className="form-actions">
      <button className="button" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
      <span className="muted"><small>Nothing is shipped yet: wait for the lab to accept.</small></span>
    </div>
  </form>;
}
