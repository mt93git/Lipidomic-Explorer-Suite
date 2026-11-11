import type { Metadata } from "next";
import Link from "@/components/app-link";
import { batchStatusLabel } from "@/lib/batch-run";
import { listBatches } from "@/lib/data/batches";
import { formatLabInstant } from "@/lib/lab-time";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Batch run" };

// The batches planned in Admin and where each one is: open one to download its sequence and record the run.
export default async function BatchRunPage() {
  await requireWorkspace("staff");
  const batches = await listBatches();
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Batch run</div>
        <h1>Batch run</h1>
        <p>Export a batch&apos;s sequence and bench sheet, freeze it, and record when the instrument has acquired it.</p>
      </div>
      <div className="heading-actions">
        <Link className="button" href="/batch-builder">+ New batch</Link>
        <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
      </div>
    </div>
    {batches.length ? <section className="panel" aria-labelledby="batches-title">
      <div className="eyebrow">Planned in Admin</div>
      <h2 id="batches-title">Batches</h2>
      <div className="grid-frame"><div className="grid-scroll" role="region" aria-label="Batch list (scrolls)" tabIndex={0}>
        <table className="registry-table registered" aria-label="Batches">
          <thead><tr><th scope="col">Batch</th><th scope="col">Status</th><th scope="col">Panel</th><th scope="col">Injections</th><th scope="col">Planned</th></tr></thead>
          <tbody>{batches.map(batch => <tr key={batch.name}>
            <td className="mono"><Link href={`/batch-run/${batch.name}`}>{batch.name}</Link></td><td>{batchStatusLabel(batch.status)}</td>
            <td>{batch.panel}</td><td>{batch.injectionCount}</td><td>{formatLabInstant(batch.createdAt)}</td>
          </tr>)}</tbody>
        </table>
      </div></div>
    </section> : <p className="empty-state"><strong>No batch has been planned yet.</strong>Pick registered samples in the <Link href="/batch-builder">batch builder</Link> to plan one.</p>}
  </>;
}
