"use client";
import { useId, useState, useTransition } from "react";
import Link from "@/components/app-link";
import { FormAlert } from "@/components/error-summary";
import type { ResultOrder } from "@/lib/data/results";
import type { ResultsSummary } from "@/lib/results";
import { canAcceptResults } from "@/lib/results-gate";
import { diffCounts, fileCheckRows, openStops, statTiles, type CheckStatus, type ResultCounts } from "@/lib/ingest-review";
import { acceptUpload, compareUpload, parseUpload } from "./actions";
import styles from "./results.module.css";

type Review = { id: string; summary: ResultsSummary; toMap?: number; orderCode?: string; fileName?: string };
type Comparison = { current: ResultCounts; previous: { acceptedAt: string; counts: ResultCounts } | null; orderCode: string };

const Status = ({ status }: { status: CheckStatus }) => <span className={styles.status} data-status={status}>{status}</span>;

// Upload, parse, review, accept (prototype a12). After Parse file the page shows the five tiles, the file check
// and the detected lipids per sample; Accept stays disabled while a stop check is open (an override reason closes
// it, as before). After acceptance the parse review stays as the record of what was accepted.
export function ResultsForm({ orders }: { orders: ResultOrder[] }) {
  const id = useId();
  const [review, setReview] = useState<Review>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState("");
  const [comparison, setComparison] = useState<Comparison>();
  const [pending, startTransition] = useTransition();
  const stops = review ? openStops(review.summary.checks) : 0;
  const overridden = stops > 0 && reason.trim().length > 0;
  const canAccept = review ? canAcceptResults(review.summary.checks, reason) : false;
  const accept = () => {
    if (!review) return;
    setError("");
    startTransition(async () => {
      const result = await acceptUpload(review.id, reason);
      if (result.error) setError(result.error);
      if (result.accepted) setAccepted(result.accepted.code);
    });
  };
  const compare = () => {
    if (!review) return;
    setError("");
    startTransition(async () => {
      const result = await compareUpload(review.id);
      if (result.error) setError(result.error);
      if (result.comparison) setComparison(result.comparison);
    });
  };
  const restart = () => { setReview(undefined); setComparison(undefined); setReason(""); setError(""); setAccepted(""); };
  const order = review?.orderCode;

  return <>
    <div className="page-heading">
      <div>
        <h1>Ingest results TXT{order ? ` · ${order}` : ""}</h1>
        <p>SCIEX OS export, wide. Raw peak areas are copied as exported and never changed.{review?.fileName ? <> File: <span className="mono">{review.fileName}</span>.</> : ""}</p>
      </div>
      <div className="heading-actions">
        {review
          ? <>
            <button type="button" className="button secondary" disabled={pending} onClick={compare}>Compare with previous</button>
            {!accepted && <button type="button" className="button" disabled={pending || !canAccept} onClick={accept}
              aria-describedby={stops ? `${id}-open` : undefined}>{stops && !overridden ? `Accept (${stops} open)` : "Accept"}</button>}
          </>
          : <>
            <Link className="button secondary" href="/name-dictionary">Name dictionary</Link>
            <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
          </>}
      </div>
    </div>
    <div className={`${styles.content} ${styles.wide}`}>
      {!review && <form className="panel" style={{ maxWidth: 1000 }} action={form => {
        setError(""); setReview(undefined); setAccepted(""); setReason(""); setComparison(undefined);
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
        <strong>Results accepted for {accepted}.</strong> The order is now Processed{review ? ` · ${review.summary.analytes.length} lipids · ${review.summary.injections.Unknown ?? 0} Unknown injections` : ""}.{" "}
        <Link className="button" href={`/qc-review?order=${accepted}`}>QC review →</Link> <Link href="/release">Build dataset v1</Link> · <Link href={`/orders/${accepted}`}>Order detail</Link>
      </p>}
      {review && <ReviewBody review={review} comparison={comparison} />}
      {review && <div className={styles.below}>
        {!accepted && stops > 0 && <div className="field">
          <label className="field-label" htmlFor={`${id}-reason`}>Override reason</label>
          <input id={`${id}-reason`} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={pending} />
          <small className="field-hint" id={`${id}-open`}>{stops} stop check{stops === 1 ? " is" : "s are"} open. Fix the file and parse it again, or record why it is accepted anyway; the reason is saved with the accepted summary.</small>
        </div>}
        {accepted && reason.trim() && <p className="muted"><small>Override recorded: “{reason.trim()}”.</small></p>}
        {!accepted && <button type="button" className="button subtle" onClick={restart} disabled={pending}>Parse another file</button>}
      </div>}
    </div>
  </>;
}

function ReviewBody({ review, comparison }: { review: Review; comparison?: Comparison }) {
  const { summary } = review;
  const tiles = statTiles(summary, review.toMap ?? 0);
  const rows = fileCheckRows(summary);
  const bars = summary.detection ?? [];
  const top = Math.max(1, ...bars.map(bar => bar.detected));
  const odd = bars.filter(bar => bar.kind === "blank" && bar.likeSample);
  return <section className={styles.review} aria-label="Parse summary">
    <ul className={styles.statTiles} aria-label="File summary">
      {tiles.map(tile => <li key={tile.label} className={`${styles.statTile} ${tile.tone ? styles[tile.tone] : ""}`}>
        <strong>{tile.value}</strong><span>{tile.label}</span>
      </li>)}
    </ul>
    {comparison && <section className={styles.card} aria-label="Compare with previous">
      <h2 className={styles.cardTitle}>Compare with previous</h2>
      <div className={styles.cardBody}>
        {!comparison.previous
          ? <p className="muted" role="status" style={{ margin: 0 }}>No earlier file was accepted for {comparison.orderCode}; there is nothing to compare with.</p>
          : <>
            <p className="muted" role="status"><small>Against the file accepted for {comparison.orderCode} on {comparison.previous.acceptedAt.slice(0, 10)}.</small></p>
            <table className={styles.compare}>
              <thead><tr><th scope="col">Count</th><th scope="col">Accepted file</th><th scope="col">This file</th><th scope="col">Change</th></tr></thead>
              <tbody>{diffCounts(comparison.current, comparison.previous.counts).map(row => <tr key={row.label}>
                <td>{row.label}</td><td>{row.previous}</td><td>{row.current}</td><td data-changed={row.changed}>{row.change}</td>
              </tr>)}</tbody>
            </table>
          </>}
      </div>
    </section>}
    <div className={styles.columns}>
      <section className={styles.card} aria-labelledby="file-check-title">
        <h2 className={styles.cardTitle} id="file-check-title">File check</h2>
        <div className={styles.cardBody}>
          <table className={styles.checkTable} aria-label="File check">
            <thead><tr><th scope="col">Check</th><th scope="col">Result</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.check} data-status={row.status}>
              <td>{row.check}</td>
              <td>
                <span className={styles.result}>{row.result && <span>{row.result}</span>}{row.status && <Status status={row.status} />}</span>
                {row.list && <details><summary>{row.list.length} name{row.list.length === 1 ? "" : "s"}</summary><ul>{row.list.map(name => <li key={name}>{name}</li>)}</ul></details>}
                {row.note && <small className={styles.note}>{row.note}</small>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="detected-title">
        <h2 className={styles.cardTitle} id="detected-title">Detected lipids per sample</h2>
        <div className={styles.cardBody}>
          {!bars.length ? <p className="muted">No Unknown samples in this file.</p> : <ul className={styles.bars} aria-label="Detected lipids per sample">
            {bars.map(bar => {
              const label = bar.kind === "median" ? "median" : bar.kind === "blank" ? `Blank · ${bar.sample}` : `${bar.kind} · ${bar.sample}`;
              return <li key={`${bar.kind}-${bar.sample ?? ""}`} className={styles.bar} data-kind={bar.kind} data-like-sample={bar.likeSample ? "true" : undefined}>
                <span className={styles.barLabel}>{label}</span>
                <span className={styles.barTrack} role="img" aria-label={`${label}: ${bar.detected} lipids detected${bar.likeSample ? ", like a sample" : ""}`}><span className={styles.barFill} style={{ width: `${(bar.detected / top) * 100}%` }} /></span>
                <span className={styles.barValue}>{bar.detected.toLocaleString("en-US")}</span>
              </li>;
            })}
          </ul>}
          {bars.some(bar => bar.kind === "blank") && <p className={styles.explain}>{odd.length
            ? `A real blank detects a handful of lipids. ${odd.length === 1 ? "This one behaves" : `These ${odd.length} behave`} like a sample.`
            : "A real blank detects a handful of lipids; every blank here stays well below the samples."}</p>}
        </div>
      </section>
    </div>
  </section>;
}
