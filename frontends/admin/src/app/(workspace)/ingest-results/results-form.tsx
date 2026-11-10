"use client";
import { useId, useState, useTransition } from "react";
import Link from "@/components/app-link";
import { FormAlert } from "@/components/error-summary";
import type { ResultOrder } from "@/lib/data/results";
import type { ResultsSummary } from "@/lib/results";
import { canAcceptResults } from "@/lib/results-gate";
import { parseUpload, acceptUpload } from "./actions";
import styles from "./results.module.css";

type CheckStatus = ResultsSummary["checks"][number]["status"];
const checkLook: Record<CheckStatus, { className: string; symbol: string; word: string }> = {
  ok: { className: "ok", symbol: "✓", word: "OK" }, warn: { className: "pending", symbol: "!", word: "Warning" }, stop: { className: "fail", symbol: "!", word: "Stop" },
};

// Upload, parse, review, accept. After acceptance the upload form goes away and the banner hands over to Release;
// the parse summary stays as the record of what was accepted.
export function ResultsForm({ orders }: { orders: ResultOrder[] }) {
  const id = useId();
  const [review, setReview] = useState<{ id: string; summary: ResultsSummary }>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState("");
  const [pending, startTransition] = useTransition();
  const tiles: [string, string][] = review ? [
    ...Object.entries(review.summary.injections).map(([type, count]) => [`${type} injections`, String(count)] as [string, string]),
    ["Analytes", String(review.summary.analytes.length)], ["IS rows", String(review.summary.internalStandards)],
    ["Duplicates dropped", String(review.summary.duplicatesDropped)], ["N/A share", `${(review.summary.naShare * 100).toFixed(1)}%`],
  ] : [];
  return <div className={styles.content}>
    {!accepted && <form className="panel" action={form => {
      setError(""); setReview(undefined); setAccepted(""); setReason("");
      startTransition(async () => {
        const result = await parseUpload(form);
        if (result.error) setError(result.error);
        if (result.review) setReview(result.review);
      });
    }}>
      <div className="eyebrow">Upload</div>
      <h2>Upload results TXT</h2>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-order`}>Order</label>
        <select id={`${id}-order`} name="orderId" required disabled={pending}><option value="">Choose an order</option>{orders.map(order => <option key={order.id} value={order.id}>{order.code} · {order.stage}</option>)}</select>
        <small className="field-hint">{orders.length ? "Only acquired or registered orders are listed." : "No acquired or registered orders are available."}</small>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-file`}>SCIEX OS results TXT</label>
        <input id={`${id}-file`} name="file" type="file" accept=".txt,text/plain" required disabled={pending} />
        <small className="field-hint">The export as saved by SCIEX OS, up to 5 MB. Raw peak areas are copied, never changed.</small>
      </div>
      <div className="form-row">
        <div className="field"><label className="field-label" htmlFor={`${id}-version`}>SCIEX OS version</label><input id={`${id}-version`} name="sciexOsVersion" maxLength={200} placeholder="Optional" /></div>
        <div className="field"><label className="field-label" htmlFor={`${id}-method`}>Processing method</label><input id={`${id}-method`} name="processingMethod" maxLength={500} placeholder="Optional" /></div>
      </div>
      <div className="form-actions">
        <button className="button" disabled={pending || !orders.length}>{pending ? "Working…" : "Parse file"}</button>
        <span className="muted"><small>Parsing shows the summary and the checks; nothing is accepted yet.</small></span>
      </div>
    </form>}
    {error && <FormAlert>{error}</FormAlert>}
    {accepted && <p className="notice success" role="status">
      <strong>Results accepted for {accepted}.</strong> The order is now Processed{review ? ` · ${review.summary.analytes.length} analytes · ${review.summary.injections.Unknown ?? 0} Unknown injections` : ""}.{" "}
      <Link className="button" href="/release">Build dataset v1 →</Link> <Link href={`/orders/${accepted}`}>Order detail</Link>
    </p>}
    {review && <section className="panel" aria-label="Parse summary">
      <div className="panel-heading">
        <div><div className="eyebrow">{accepted ? "Accepted" : "Parsed, not yet accepted"}</div><h2>Parse summary</h2></div>
        <span className={`pill ${accepted ? "ok" : "pending"}`}>{accepted ? "Accepted" : "Awaiting acceptance"}</span>
      </div>
      <div className={styles.tiles}>{tiles.map(([label, value]) => <div className="summary-tile" key={label}><span className="metric-title">{label}</span><span className="number">{value}</span></div>)}</div>
      <p className="muted"><small>N/A share is measured on retained analytes across Unknown injections.</small></p>
      <h3 className="section-title">Checks</h3>
      <ul className="checklist">{review.summary.checks.map(check => { const look = checkLook[check.status]; return <li key={check.id} className="check-row" data-status={check.status}>
        <span className={`check-status ${look.className}`} aria-hidden="true">{look.symbol}</span><span className="check-label">{check.message}</span><span className="check-word">{look.word}</span>
      </li>; })}</ul>
      {accepted
        ? reason.trim() && <p className="muted"><small>Override recorded: “{reason.trim()}”.</small></p>
        : <>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-reason`}>Override reason</label>
            <input id={`${id}-reason`} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={pending} />
            <small className="field-hint">Any stop check requires an operator reason, saved with the accepted summary.</small>
          </div>
          <div className="form-actions">
            <button className="button" disabled={pending || !canAcceptResults(review.summary.checks, reason)} onClick={() => {
              setError("");
              startTransition(async () => {
                const result = await acceptUpload(review.id, reason);
                if (result.error) setError(result.error);
                if (result.accepted) setAccepted(result.accepted.code);
              });
            }}>Accept</button>
            <span className="muted"><small>Moves the order to Processed and records the file&apos;s SHA-256.</small></span>
          </div>
        </>}
    </section>}
  </div>;
}
