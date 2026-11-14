import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { PlateMap } from "@/components/plate-map";
import { SequenceTable } from "@/components/sequence-table";
import { StatTiles, type StatTile } from "@/components/stat-tiles";
import map from "@/components/visual-map.module.css";
import { endsAt, injectionStatuses, orderOf, statusCounts } from "@/lib/visual-map";
import styles from "@/components/batch-plan.module.css";
import { formatRunTime, storedMinutes } from "@/lib/batch-builder";
import { batchFileNames, batchStatusLabel, batchSteps, BATCH_NAME } from "@/lib/batch-run";
import { getBatch } from "@/lib/data/batches";
import { formatLabInstant } from "@/lib/lab-time";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../../release/action-form";
import { markAcquiredAction, markExportedAction, pasteStatusAction, setInjectionStatusAction } from "../actions";
import { BASE_PATH } from "@/lib/base-path";

export const metadata: Metadata = { title: "Batch run" };
type Params = { saved?: string; exported?: string; acquired?: string; status?: string; unmatched?: string };

// The Next.js basePath: a plain download link is not rewritten by the router.
const BASE = BASE_PATH;

// One batch: download the sequence and bench sheet, mark the sequence exported (freezes the version, orders move to
// Sequence exported), then mark it acquired (orders move to Acquired; results are ingested as before).
export default async function BatchPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<Params> }) {
  await requireWorkspace("staff");
  const { name } = await params;
  const { saved, exported, acquired, status, unmatched } = await searchParams;
  if (!BATCH_NAME.test(name)) notFound();
  const batch = await getBatch(name);
  if (!batch) notFound();
  const steps = batchSteps(batch.status);
  const minutes = storedMinutes(batch.rules);
  const counts = (["Unknown", "Blank", "Quality Control"] as const).map(type => batch.injections.filter(row => row.sample_type === type).length);
  const pill = batch.status === "planned" ? "pending" : "ok";
  const running = batch.status !== "planned";
  const canRecord = batch.status === "sequence_exported" || batch.status === "acquired";
  const tally = statusCounts(batch.injections);
  const tiles: StatTile[] = [
    { value: batch.injections.length, label: "injections" }, { value: counts[0], label: "samples" },
    { value: counts[2], label: "pooled QC" }, { value: counts[1], label: "blanks" },
    ...(minutes ? [{ value: formatRunTime(batch.injections.length * minutes), label: "run time" }] : []),
    ...(running
      ? [{ value: `${tally.acquired} / ${batch.injections.length}`, label: "acquired", tone: tally.acquired === batch.injections.length ? "good" as const : undefined },
        ...(tally.failed ? [{ value: tally.failed, label: "failed", tone: "bad" as const }] : []),
        ...(tally.skipped ? [{ value: tally.skipped, label: "skipped", tone: "warn" as const }] : []),
        ...(batch.status === "sequence_exported" && batch.exportedAt && minutes ? [{ value: endsAt(new Date(batch.exportedAt), batch.injections.length * minutes), label: "expected end (from export)" }] : [])]
      : [{ value: endsAt(new Date(), batch.injections.length * (minutes ?? 0)), label: "ends if started now" }]),
  ];
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / <Link href="/batch-run">Batch run</Link> / {batch.name}</div>
        <h1>Batch {batch.name}</h1>
        <p>{batch.panel} · version {batch.version} · {plural(batch.injections.length, "injection")}{minutes ? ` · about ${formatRunTime(batch.injections.length * minutes)} of run time` : ""}</p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href="/batch-builder">+ New batch</Link>
        <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
      </div>
    </div>

    {saved && <p className="notice success" role="status"><strong>Batch {batch.name} saved as planned.</strong> Its orders are In batch. Download the files below.</p>}
    {exported && <p className="notice success" role="status"><strong>Sequence exported.</strong> Version {batch.version} is frozen{batch.sequenceSha256 ? <> · SHA-256 <span className="mono">{batch.sequenceSha256.slice(0, 12)}…</span></> : null}. Its orders are at Sequence exported.</p>}
    {status !== undefined && <p className="notice success" role="status"><strong>Injection status recorded.</strong> {plural(Number(status) || 0, "injection")} changed{Number(unmatched) ? `; ${plural(Number(unmatched), "pasted line")} matched no injection of this batch and ${Number(unmatched) === 1 ? "was" : "were"} ignored` : ""}.</p>}
    {acquired && <p className="notice success" role="status"><strong>Batch acquired.</strong> Its orders are at Acquired. <Link className="button" href="/ingest-results">Ingest results →</Link></p>}

    <section className="panel" aria-labelledby="run-title">
      <div className="panel-heading"><div><div className="eyebrow">Run</div><h2 id="run-title">Files and status</h2></div>
        <span className={`pill ${pill}`}>{batchStatusLabel(batch.status)}</span></div>
      <p className="muted">{steps.summary}</p>
      <ol className={styles.steps} aria-label="Batch steps">
        <li>
          <strong>1. Download</strong>
          <a className="button secondary" href={`${BASE}/batch-run/${batch.name}/${batchFileNames.sequence(batch.name)}`} download>Download sequence CSV</a>
          <a className="button secondary" href={`${BASE}/batch-run/${batch.name}/${batchFileNames["bench-sheet"](batch.name)}`} download>Download bench sheet CSV</a>
        </li>
        <li>
          <strong>2. Export</strong>
          {batch.exportedAt
            ? <span>Exported {formatLabInstant(batch.exportedAt)}{batch.exportedBy ? ` · ${batch.exportedBy}` : ""}{batch.sequenceSha256 ? <> · SHA-256 <span className={`mono ${styles.hash}`}>{batch.sequenceSha256}</span></> : null}</span>
            : <ActionForm action={markExportedAction} submit="Mark exported" pendingLabel="Freezing…" disabled={!steps.canExport}>
              <input type="hidden" name="name" value={batch.name} />
            </ActionForm>}
        </li>
        <li>
          <strong>3. Acquire</strong>
          {batch.status === "acquired" || batch.status === "processed" || batch.status === "qc_checked"
            ? <span>Acquired.</span>
            : <ActionForm action={markAcquiredAction} submit="Mark acquired" pendingLabel="Recording…" disabled={!steps.canAcquire}>
              <input type="hidden" name="name" value={batch.name} />
            </ActionForm>}
        </li>
      </ol>
      <p className="muted"><small>Orders in this batch: {batch.orderCodes.length ? batch.orderCodes.map((code, index) => <span key={code}>{index > 0 && ", "}<Link href={`/orders/${code}`}>{code}</Link></span>) : "none"}. The CSV files use the generic layout; the SCIEX OS template is added when the lab has it.</small></p>
    </section>

    <section className="panel" aria-labelledby="plan-title">
      <div className="eyebrow">Plan</div>
      <h2 id="plan-title">Plate map and sequence</h2>
      <StatTiles label="Batch summary" tiles={tiles} />
      <p className="muted"><small>Planned {formatLabInstant(batch.createdAt)} · {plural(batch.orderCodes.length, "order")}</small></p>
      <PlateMap injections={batch.injections} clients={new Map(batch.injections.flatMap(row => row.orderCode && row.clientName ? [[row.orderCode, row.clientName] as const] : []))} />
      <SequenceTable label="Batch sequence" rows={batch.injections}
        detail={row => row.FullName ? `${row.FullName} · ${row.orderCode}` : "—"} />
    </section>

    {running && <section className="panel" id="monitor" aria-labelledby="monitor-title">
      <div className="panel-heading"><div><div className="eyebrow">Run monitor</div><h2 id="monitor-title">Acquisition status</h2></div>
        <span className={`pill ${tally.failed ? "fail" : tally.acquired === batch.injections.length ? "ok" : "pending"}`}>{tally.acquired} of {batch.injections.length} acquired</span></div>
      <div className="grid-frame"><div className="grid-scroll" role="region" aria-label="Acquisition status (scrolls)" tabIndex={0}>
        <table className="registry-table registered" aria-label="Acquisition status">
          <thead><tr><th scope="col">Seq</th><th scope="col">Injection name</th><th scope="col">Order</th><th scope="col">Well</th><th scope="col">Status</th></tr></thead>
          <tbody>{batch.injections.map(row => <tr key={row.seq}>
            <td className="mono">{String(row.seq).padStart(3, "0")}</td><td className="mono">{row.sample_name}</td>
            <td>{orderOf(row) ? <Link className="mono" href={`/orders/${orderOf(row)}`}>{orderOf(row)}</Link> : "—"}</td>
            <td className="mono">{row.vial}</td>
            <td><span className={`${map.status} ${map[row.status] ?? ""}`}>{row.status}</span></td>
          </tr>)}</tbody>
        </table>
      </div></div>
      {canRecord ? <div className={map.monitorForms}>
        <ActionForm action={pasteStatusAction} submit="Record pasted status" pendingLabel="Recording…" keepValues>
          <input type="hidden" name="name" value={batch.name} />
          <label className="field"><span className="field-label">Paste SCIEX OS status</span>
            <textarea name="paste" required placeholder={`${batch.injections[0]?.sample_name ?? "Sample name"}\tAcquired\n${batch.injections[1]?.sample_name ?? "Sample name"}\tFailed`} />
            <small className="field-hint">The batch status exported from SCIEX OS, one line per injection: the injection name and its state (Acquired, Failed, Skipped, Waiting). Lines that match no injection are ignored and counted.</small></label>
        </ActionForm>
        <ActionForm action={setInjectionStatusAction} submit="Set status" pendingLabel="Saving…" secondary>
          <input type="hidden" name="name" value={batch.name} />
          <label className="field"><span className="field-label">One injection</span>
            <select name="injection" required defaultValue=""><option value="" disabled>Choose an injection…</option>
              {batch.injections.map(row => <option key={row.seq} value={row.sample_name}>{String(row.seq).padStart(3, "0")} · {row.sample_name} ({row.status})</option>)}</select></label>
          <label className="field"><span className="field-label">Status</span>
            <select name="status" required defaultValue="failed">{injectionStatuses.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        </ActionForm>
      </div> : <p className="muted"><small>Results are accepted for this batch; its injection status is final.</small></p>}
      <p className="muted"><small>The 7500 PC stays offline: the operator pastes the batch status exported from SCIEX OS and Admin matches it by injection name. Mark acquired still moves the orders; a failed injection stays failed.</small></p>
    </section>}
  </>;
}
