"use client";
import { useState, useTransition } from "react";
import type { ResultOrder } from "@/lib/data/results";
import type { ResultsSummary } from "@/lib/results";
import { canAcceptResults } from "@/lib/results-gate";
import { parseUpload, acceptUpload } from "./actions";
import styles from "./results.module.css";
export function ResultsForm({ orders }: { orders: ResultOrder[] }) {
  const [review, setReview] = useState<{ id: string; summary: ResultsSummary }>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className={styles.content}>
    <form className={styles.panel} action={form => {
      setError(""); setReview(undefined); setAccepted(""); setReason("");
      startTransition(async () => {
        const result = await parseUpload(form);
        if (result.error) setError(result.error);
        if (result.review) setReview(result.review);
      });
    }}>
      <h2>Upload results TXT</h2>
      <label>Order<select name="orderId" required disabled={pending}><option value="">Choose an order</option>{orders.map(order => <option key={order.id} value={order.id}>{order.code} · {order.stage}</option>)}</select></label>
      {!orders.length && <p>No acquired or registered orders are available.</p>}
      <label>SCIEX OS results TXT<input name="file" type="file" accept=".txt,text/plain" required disabled={pending} /></label>
      <label>SCIEX OS version<input name="sciexOsVersion" maxLength={200} /></label>
      <label>Processing method<input name="processingMethod" maxLength={500} /></label>
      <button className="button" disabled={pending || !orders.length}>{pending ? "Working…" : "Parse file"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {accepted && <p role="status" className={styles.panel}>{accepted} · Processed</p>}
    {review && <section className={styles.panel} aria-label="Parse summary">
      <h2>Parse summary</h2>
      <dl className={styles.metrics}>
        {Object.entries(review.summary.injections).map(([type, count]) => <div key={type}><dt>{type} injections</dt><dd>{count}</dd></div>)}
        <div><dt>Analytes</dt><dd>{review.summary.analytes.length}</dd></div>
        <div><dt>IS rows</dt><dd>{review.summary.internalStandards}</dd></div>
        <div><dt>Duplicates dropped</dt><dd>{review.summary.duplicatesDropped}</dd></div>
        <div><dt>N/A share</dt><dd>{(review.summary.naShare * 100).toFixed(1)}%</dd></div>
      </dl>
      <p className="muted">N/A share is measured on retained analytes across Unknown injections.</p>
      <h3>Checks</h3><ul className={styles.checks}>{review.summary.checks.map(check => <li key={check.id} data-status={check.status}><strong>{check.status}</strong> · {check.message}</li>)}</ul>
      <label>Override reason<input maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={pending || !!accepted} /></label>
      <p className="muted">Any stop check requires an operator reason, saved with the accepted summary.</p>
      <button className="button" disabled={pending || !!accepted || !canAcceptResults(review.summary.checks, reason)} onClick={() => {
        setError("");
        startTransition(async () => {
          const result = await acceptUpload(review.id, reason);
          if (result.error) setError(result.error);
          if (result.accepted) setAccepted(result.accepted.code);
        });
      }}>Accept</button>
    </section>}
  </div>;
}
