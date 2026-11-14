"use client";

import { useMemo, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import Link from "@/components/app-link";
import type { Client } from "@/lib/models";
import {
  approxRunTime, billingMethods, checkSampleList, controlsText, estimateOrder, formatMoney, matrices, metadataColumns, nextLabel, sampleCount,
  stepErrors, studyDesigns, templateFileName, templateHref, wizardSteps,
  type Estimate, type InjectionRules, type WizardData, type WizardErrors, type WizardField, type WizardPanel, type WizardStep,
} from "@/lib/order-wizard";
import { plural } from "@/lib/samples";
import { placeOrderAction, saveDraftAction } from "./actions";
import styles from "./new-order.module.css";

type Props = {
  clients: Client[]; panels: WizardPanel[]; placedBy: string;
  // The active instrument profile's blank and QC rules (fromProfile false: Batch builder's own defaults).
  rules?: { values: InjectionRules; fromProfile: boolean };
  initial: { draftId: string | null; step: WizardStep; data: WizardData }; children?: ReactNode;
};
type Status = { tone: "success" | "error"; text: string } | null;

// The step each field is entered on, to send the person back to it when the last step finds a problem.
const fieldStep: Record<WizardField, WizardStep> = {
  clientId: 1, title: 1, panelId: 2, matrix: 2, expectedSamples: 2, studyDesign: 2, billingMethod: 2, billingRef: 2, notes: 2, sampleList: 3,
};
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

// New order as four steps. Everything typed lives here until Save draft (save_order_draft) or Place order
// (place_order_draft / create_order); Next checks only the step being left, and the server checks every step again.
export function OrderWizard({ clients, panels, placedBy, initial, children, rules }: Props) {
  const [data, setData] = useState<WizardData>(initial.data);
  const [step, setStep] = useState<WizardStep>(initial.step);
  const [draftId, setDraftId] = useState<string | null>(initial.draftId);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [saving, startSave] = useTransition();
  const [placing, startPlace] = useTransition();
  // Another draft (Resume) or a fresh order (no ?draft=) starts over from what the page sent. The draft this wizard
  // just saved does not: saving can refresh the page under ?draft=<its id>, and what is on screen must stay.
  const [pageDraft, setPageDraft] = useState<string | null>(initial.draftId);
  if (initial.draftId !== pageDraft) {
    setPageDraft(initial.draftId);
    if (initial.draftId !== draftId) {
      setData(initial.data); setStep(initial.step); setDraftId(initial.draftId); setErrors({}); setStatus(null);
    }
  }

  const panel = panels.find(item => item.id === data.panelId) ?? null;
  const client = clients.find(item => item.id === data.clientId) ?? null;
  const count = sampleCount(data);
  const estimate = estimateOrder(count, panel?.rate ?? null, rules?.values);
  const list = useMemo(() => data.sampleList.trim() ? checkSampleList(data.sampleList) : null, [data.sampleList]);

  const set = (field: WizardField) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setData(current => ({ ...current, [field]: value }));
    if (errors[field]) setErrors(current => { const next = { ...current }; delete next[field]; return next; });
  };
  const showErrors = (found: WizardErrors) => {
    setErrors(found);
    const first = (Object.keys(found) as WizardField[]).sort((a, b) => fieldStep[a] - fieldStep[b])[0];
    // The client is asked on step 1 and shown again on step 2: stay on step 2 when that is where the person is.
    const target = first === "clientId" && step === 2 ? 2 : fieldStep[first];
    setStep(target);
    requestAnimationFrame(() => document.getElementById(`wizard-${first}`)?.focus());
  };

  // Back is always allowed; forward checks every step in between and stops at the first with a problem.
  function go(target: WizardStep) {
    setStatus(null);
    if (target > step) {
      for (let at = step; at < target; at += 1) {
        const found = stepErrors(data, at as WizardStep);
        if (Object.keys(found).length) { showErrors(found); return; }
      }
    }
    setErrors({});
    setStep(target);
  }

  function save() {
    setStatus(null);
    startSave(async () => {
      const result = await saveDraftAction({ id: draftId, step, data });
      if (!result.ok) { setStatus({ tone: "error", text: result.error }); return; }
      setDraftId(result.id);
      // The address now resumes this draft (reload, or share it with a colleague in the lab).
      window.history.replaceState(null, "", `${window.location.pathname}?draft=${encodeURIComponent(result.id)}`);
      setStatus({ tone: "success", text: `Draft saved at ${clock.format(new Date(result.savedAt))}. Anyone in the lab can resume it from New order, under Saved drafts.` });
    });
  }

  function place() {
    setStatus(null);
    const found = stepErrors(data, 4);
    if (Object.keys(found).length) { showErrors(found); return; }
    startPlace(async () => {
      const result = await placeOrderAction({ draftId, data });
      if (result?.draftId) setDraftId(result.draftId);
      if (result?.errors) showErrors(result.errors);
      else if (result?.error) setStatus({ tone: "error", text: result.error });
    });
  }

  const field = (name: WizardField) => ({
    id: `wizard-${name}`, name, value: data[name], onChange: set(name),
    ...(errors[name] ? { "aria-invalid": true as const, "aria-describedby": `wizard-${name}-error` } : {}),
  });
  const fieldError = (name: WizardField) => errors[name] ? <small id={`wizard-${name}-error`} className="field-error">{errors[name]}</small> : null;
  const clientSelect = <div className="field">
    <label className="field-label" htmlFor="wizard-clientId">Client</label>
    <select {...field("clientId")}>
      <option value="">Choose a client…</option>
      {clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {fieldError("clientId")}
  </div>;

  return <>
    <div className="page-heading">
      <div>
        <h1>New order</h1>
        <p>Step {step} of 4. Orders can be placed by lab staff or by the client&apos;s Requester.</p>
      </div>
      <div className="heading-actions">
        <button type="button" className={`button secondary ${styles.headingButton}`} onClick={save} disabled={saving || placing}>{saving ? "Saving…" : "Save draft"}</button>
        <button type="button" className={`button ${styles.headingButton}`} onClick={step === 4 ? place : () => go((step + 1) as WizardStep)} disabled={placing}>
          {placing ? "Placing…" : nextLabel[step]}
        </button>
      </div>
    </div>
    {children}
    {status && <p className={`notice ${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>{status.text}</p>}

    <nav aria-label="New order steps">
      <ol className={styles.steps}>
        {wizardSteps.map(item => <li key={item.step}>
          <button type="button" className={styles.step} onClick={() => go(item.step)}
            aria-current={item.step === step ? "step" : undefined} data-done={item.step < step ? "" : undefined}>
            <span>{item.step}</span>{" "}{item.label}
          </button>
        </li>)}
      </ol>
    </nav>

    {step === 1 && <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardHead}>Client</h2>
      <div className={`${styles.cardBody} ${styles.grid}`}>
        {clientSelect}
        <div className={`field ${styles.span2}`}>
          <label className="field-label" htmlFor="wizard-title">Order title</label>
          <input {...field("title")} autoComplete="off" placeholder="Serum lipidome, repeated visits" />
          <small className="field-hint">A short name the lab and the client both recognise. No patient names.</small>
          {fieldError("title")}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wizard-placedBy">Placed by</label>
          <input id="wizard-placedBy" value={placedBy} readOnly />
          <small className="field-hint">Lab staff. A client&apos;s Requester or Client admin uses Request an order instead.</small>
        </div>
      </div>
    </section>}

    {step === 2 && <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardHead}>Service</h2>
      <div className={`${styles.cardBody} ${styles.grid}`}>
        {clientSelect}
        <div className="field">
          <label className="field-label" htmlFor="wizard-panelId">Panel</label>
          <select {...field("panelId")}>
            <option value="">Choose a panel…</option>
            {panels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {fieldError("panelId")}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wizard-matrix">Sample matrix</label>
          <select {...field("matrix")}>
            <option value="">Not specified</option>
            {[...matrices, ...(data.matrix && !matrices.includes(data.matrix) ? [data.matrix] : [])].map(matrix => <option key={matrix} value={matrix}>{matrix}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wizard-expectedSamples">Number of samples</label>
          <input {...field("expectedSamples")} type="number" min={0} step={1} inputMode="numeric"
            placeholder={list?.rows.length ? `${list.rows.length} from the sample list` : "Optional"} />
          {fieldError("expectedSamples")}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wizard-studyDesign">Study design</label>
          <select {...field("studyDesign")}>
            <option value="">Not specified</option>
            {studyDesigns.map(design => <option key={design} value={design}>{design}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wizard-billingMethod">Billing</label>
          <select {...field("billingMethod")}>
            <option value="">Not specified</option>
            {billingMethods.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wizard-billingRef">Billing reference</label>
          <input {...field("billingRef")} autoComplete="off" placeholder="Charge code, PO or grant number" />
        </div>
        <div className={`field ${styles.wide}`}>
          <label className="field-label" htmlFor="wizard-notes">Notes for the lab</label>
          <textarea {...field("notes")} rows={3} placeholder="Groups, aliquot volume, how the samples will be shipped." />
        </div>
      </div>
    </section>}

    {step === 3 && <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardHead}>Sample list</h2>
      <div className={styles.cardBody}>
        <p className="muted">Optional now. The client fills the template: the six metadata columns Nexo reads ({metadataColumns.join(", ")}), then their tube label, matrix and volume. Paste it here to check the names and count the samples; the registry records the samples when the shipment arrives.</p>
        <div className={styles.tools}>
          <a className="button secondary" href={templateHref()} download={templateFileName}>Download template</a>
          <small className="muted">CSV, one row per sample; FullName must be unique in the order.</small>
        </div>
        <div className="field paste-box">
          <label className="field-label" htmlFor="wizard-sampleList">Paste the sample list (optional)</label>
          <textarea {...field("sampleList")} rows={6} spellCheck={false} placeholder={`${metadataColumns.join("\t")}\nS01\tControl\tVisit1\t1\tP01\t0h`} />
          <small className="field-hint">Copy the rows from Excel or Google Sheets, with or without the header row.</small>
          {fieldError("sampleList")}
        </div>
        {list && <SampleListPreview list={list} typed={data.expectedSamples} onUse={rows => setData(current => ({ ...current, expectedSamples: String(rows) }))} />}
      </div>
    </section>}

    {step === 4 && <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardHead}>Review &amp; quote</h2>
      <div className={styles.cardBody}>
        <dl className={styles.review}>
          <Row label="Client" value={client?.name} edit={() => go(1)} />
          <Row label="Order title" value={data.title.trim()} edit={() => go(1)} />
          <Row label="Panel" value={panel?.name} edit={() => go(2)} />
          <Row label="Sample matrix" value={data.matrix} edit={() => go(2)} />
          <Row label="Number of samples" value={count === null ? "" : String(count)} edit={() => go(2)} />
          <Row label="Study design" value={data.studyDesign} edit={() => go(2)} />
          <Row label="Billing" value={[billingMethods.find(method => method.value === data.billingMethod)?.label, data.billingRef.trim()].filter(Boolean).join(" · ")} edit={() => go(2)} />
          <Row label="Sample list" value={list ? plural(list.rows.length, "row") : "Not attached: the client sends it with the shipment"} edit={() => go(3)} />
          <Row label="Notes for the lab" value={data.notes.trim()} edit={() => go(2)} wide />
        </dl>
        <p className={styles.footnote}>Place order creates the order at Request; the client sees it in their orders. The study design is added to the notes and the billing method to the billing reference.</p>
      </div>
    </section>}

    <div className={styles.pair}>
      <EstimatePanel estimate={estimate} panel={panel} fromProfile={rules?.fromProfile ?? false} />
      <section className={styles.card} aria-labelledby="client-next-title">
        <h2 id="client-next-title" className={styles.cardHead}>What the client sees next</h2>
        <div className={styles.cardBody}>
          <ul className={styles.bullets}>
            <li>A sample list template with the six Nexo metadata columns</li>
            <li>Shipping instructions and the order number to write on each box</li>
            <li>Status updates at Samples received, In analysis and Released</li>
          </ul>
        </div>
      </section>
    </div>
  </>;
}

function Row({ label, value, edit, wide = false }: { label: string; value: string | null | undefined; edit: () => void; wide?: boolean }) {
  return <div className={wide ? styles.reviewWide : undefined}>
    <dt>{label}</dt>
    <dd>{value || <span className="muted">Not specified</span>} <button type="button" className={styles.edit} onClick={edit} aria-label={`Edit ${label.toLowerCase()}`}>Edit</button></dd>
  </div>;
}

function SampleListPreview({ list, typed, onUse }: { list: ReturnType<typeof checkSampleList>; typed: string; onUse: (rows: number) => void }) {
  const rows = list.rows.length;
  const typedNumber = typed.trim() ? Number(typed) : null;
  return <div aria-live="polite">
    <p className={styles.listSummary}>
      <strong>{plural(rows, "sample")} read</strong>{list.headerDetected ? " · header row recognised" : " · no header row: columns read in the template's order"}
      {list.ignoredHeaders.length > 0 && <> · ignored columns: {list.ignoredHeaders.join(", ")}</>}
      {typedNumber !== null && typedNumber !== rows && <> · Number of samples says {typedNumber}. <button type="button" className={styles.edit} onClick={() => onUse(rows)}>Use {rows}</button></>}
    </p>
    {list.issues.length > 0 && <ul className={styles.issues}>
      {list.issues.slice(0, 5).map(issue => <li key={`${issue.row}-${issue.field}`}>Row {issue.row + 1}: {issue.message}</li>)}
      {list.issues.length > 5 && <li>and {list.issues.length - 5} more</li>}
    </ul>}
    <table className={styles.preview} aria-label="First rows of the sample list">
      <thead><tr><th scope="col">#</th>{metadataColumns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{list.rows.slice(0, 5).map((row, index) => <tr key={index}>
        <td>{index + 1}</td><td>{row.full_name}</td><td>{row.group1_term}</td><td>{row.group2_term}</td><td>{row.replicate_term}</td><td>{row.patient_term}</td><td>{row.time_point_term}</td>
      </tr>)}</tbody>
    </table>
    {rows > 5 && <p className="muted"><small>And {plural(rows - 5, "more row")}.</small></p>}
  </div>;
}

// The estimate: panel rate × samples from the rate sheet (or "not set"), blanks and QC included, and the run time as
// injections × minutes per injection under the active instrument profile's blank and QC rules (Batch builder's own
// defaults when no profile is active).
function EstimatePanel({ estimate, panel, fromProfile }: { estimate: Estimate; panel: WizardPanel | null; fromProfile: boolean }) {
  const samples = estimate.samples;
  const money = !panel ? <span className="muted">choose a panel</span>
    : samples === null ? <span className="muted">enter the samples</span>
    : estimate.amount !== null && estimate.currency ? <>{formatMoney(estimate.amount, estimate.currency)}<small>from the rate sheet, {formatMoney(estimate.ratePerSample!, estimate.currency)} per sample</small></>
    : <><span className={styles.notSet}>not set</span><small><Link href="/instruments-panels#rate-sheet">Set the rate in Instruments &amp; panels</Link></small></>;
  return <section className={styles.card} aria-labelledby="estimate-title">
    <h2 id="estimate-title" className={styles.cardHead}>Estimate</h2>
    <div className={styles.cardBody}>
      <table className={styles.estimate}>
        <tbody>
          <tr><th scope="row">{panel?.name ?? "Panel"}, {samples === null ? "samples not set" : plural(samples, "sample")}</th><td>{money}</td></tr>
          <tr>
            <th scope="row">Blanks and QC (added by the lab){samples ? <small>{controlsText(estimate, fromProfile)}</small> : null}</th>
            <td>included</td>
          </tr>
          <tr>
            <th scope="row">Run time on the {panel?.instrumentName ?? "instrument"}
              {estimate.minutes !== null && <small>{estimate.injections} injections × {estimate.minutesPerInjection} min{estimate.minutesFromRateSheet ? "" : " (batch builder default; set the panel's minutes on the rate sheet)"}{estimate.plates > 1 ? ` · ${estimate.plates} plates` : ""}</small>}
            </th>
            <td>{estimate.minutes !== null ? approxRunTime(estimate.minutes) : <span className="muted">enter the samples</span>}</td>
          </tr>
        </tbody>
      </table>
      <p className={styles.footnote}>Rates come from the lab&apos;s charges sheet; the quote is sent from the order once approved.</p>
    </div>
  </section>;
}
