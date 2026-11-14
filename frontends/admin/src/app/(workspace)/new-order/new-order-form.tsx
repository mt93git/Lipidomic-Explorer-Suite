"use client";

import { useActionState } from "react";
import { ErrorSummary, FormAlert } from "@/components/error-summary";
import type { Client } from "@/lib/models";
import type { OrderField, Panel } from "@/lib/new-order";
import { createOrderAction, type NewOrderState } from "./actions";

const matrices = ["Plasma", "Serum", "Tissue", "Cells", "Urine", "CSF"];
// Field order of the form, for the error summary; each control carries the id order-<field>.
const fieldLabels: [OrderField, string][] = [["clientId", "Client"], ["panelId", "Panel"], ["title", "Title"], ["matrix", "Matrix"], ["expectedSamples", "Expected samples"], ["billingRef", "Billing reference"], ["notes", "Notes"]];

// The order record: who it is for, what is measured, how many samples to expect and how it is billed. noValidate:
// the server action checks it, so the error summary names every problem; samples are added later in the registry.
// defaultClientId: the client chosen before the form opens (Client detail's New order).
export function NewOrderForm({ clients, panels, defaultClientId }: { clients: Client[]; panels: Panel[]; defaultClientId?: string }) {
  const [state, action, pending] = useActionState<NewOrderState, FormData>(createOrderAction, {});
  const values = state.values;
  const error = (field: OrderField) => state.errors?.[field];
  const describe = (field: OrderField) => error(field) ? { "aria-invalid": true as const, "aria-describedby": `order-${field}-error` } : {};
  const fieldError = (field: OrderField) => error(field) ? <small id={`order-${field}-error`} className="field-error">{error(field)}</small> : null;

  return <form action={action} className="record-form" noValidate>
    {state.error && <FormAlert>{state.error}</FormAlert>}
    <ErrorSummary fields={fieldLabels.filter(([field]) => error(field)).map(([field, label]) => ({ id: `order-${field}`, label }))} />
    <div className="form-row">
      <div className="field">
        <label className="field-label" htmlFor="order-clientId">Client</label>
        <select id="order-clientId" name="clientId" required defaultValue={values?.clientId ?? defaultClientId ?? ""} {...describe("clientId")}>
          <option value="">Choose a client…</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <small className="field-hint">Active clients only.</small>
        {fieldError("clientId")}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="order-panelId">Panel</label>
        <select id="order-panelId" name="panelId" required defaultValue={values?.panelId ?? ""} {...describe("panelId")}>
          <option value="">Choose a panel…</option>
          {panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}
        </select>
        <small className="field-hint">Active panels only.</small>
        {fieldError("panelId")}
      </div>
    </div>
    <div className="field">
      <label className="field-label" htmlFor="order-title">Title</label>
      <input id="order-title" name="title" required autoComplete="off" defaultValue={values?.title ?? ""} placeholder="Plasma lipidome, diet study" {...describe("title")} />
      {fieldError("title")}
    </div>
    <div className="form-row">
      <div className="field">
        <label className="field-label" htmlFor="order-matrix">Matrix</label>
        <input id="order-matrix" name="matrix" list="order-matrices" autoComplete="off" defaultValue={values?.matrix ?? ""} placeholder="Plasma, tissue, cells…" {...describe("matrix")} />
        <datalist id="order-matrices">{matrices.map(matrix => <option key={matrix} value={matrix} />)}</datalist>
        {fieldError("matrix")}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="order-expectedSamples">Expected samples</label>
        <input id="order-expectedSamples" name="expectedSamples" type="number" min={0} step={1} inputMode="numeric" defaultValue={values?.expectedSamples ?? ""} placeholder="Optional" {...describe("expectedSamples")} />
        {fieldError("expectedSamples")}
      </div>
    </div>
    <div className="field">
      <label className="field-label" htmlFor="order-billingRef">Billing reference</label>
      <input id="order-billingRef" name="billingRef" autoComplete="off" defaultValue={values?.billingRef ?? ""} placeholder="Charge code, PO or grant number (optional)" {...describe("billingRef")} />
      {fieldError("billingRef")}
    </div>
    <div className="field">
      <label className="field-label" htmlFor="order-notes">Notes</label>
      <textarea id="order-notes" name="notes" rows={3} defaultValue={values?.notes ?? ""} placeholder="Anything the lab should know before the samples arrive." {...describe("notes")} />
      {fieldError("notes")}
    </div>
    <div className="form-actions">
      <button className="button" disabled={pending}>{pending ? "Creating…" : "Create order"}</button>
      <span className="muted"><small>The order starts at Request and waits for its shipment.</small></span>
    </div>
  </form>;
}
