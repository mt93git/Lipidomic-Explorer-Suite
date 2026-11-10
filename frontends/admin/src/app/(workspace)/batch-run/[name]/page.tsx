import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { PlateMap } from "@/components/plate-map";
import { SequenceTable } from "@/components/sequence-table";
import styles from "@/components/batch-plan.module.css";
import { formatRunTime, storedMinutes } from "@/lib/batch-builder";
import { batchFileNames, batchStatusLabel, batchSteps, BATCH_NAME } from "@/lib/batch-run";
import { getBatch } from "@/lib/data/batches";
import { formatLabInstant } from "@/lib/lab-time";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../../release/action-form";
import { markAcquiredAction, markExportedAction } from "../actions";

export const metadata: Metadata = { title: "Batch run" };
type Params = { saved?: string; exported?: string; acquired?: string };

// The Next.js basePath: a plain download link is not rewritten by the router.
const BASE = "/admin";

// One batch: download the sequence and bench sheet, mark the sequence exported (freezes the version, orders move to
// Sequence exported), then mark it acquired (orders move to Acquired; results are ingested as before).
export default async function BatchPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<Params> }) {
  await requireWorkspace("staff");
  const { name } = await params;
  const { saved, exported, acquired } = await searchParams;
  if (!BATCH_NAME.test(name)) notFound();
  const batch = await getBatch(name);
  if (!batch) notFound();
  const steps = batchSteps(batch.status);
  const minutes = storedMinutes(batch.rules);
  const counts = (["Unknown", "Blank", "Quality Control"] as const).map(type => batch.injections.filter(row => row.sample_type === type).length);
  const pill = batch.status === "planned" ? "pending" : "ok";
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
      <dl className={`${styles.counts} facts-inline`} aria-label="Batch summary">
        <div><dt>Samples</dt><dd>{counts[0]}</dd></div><div><dt>Blanks</dt><dd>{counts[1]}</dd></div><div><dt>Pooled QC</dt><dd>{counts[2]}</dd></div>
        <div><dt>Planned</dt><dd>{formatLabInstant(batch.createdAt)}</dd></div>
      </dl>
      <PlateMap injections={batch.injections} />
      <SequenceTable label="Batch sequence" rows={batch.injections}
        detail={row => row.FullName ? `${row.FullName} · ${row.orderCode}` : "—"} />
    </section>
  </>;
}
