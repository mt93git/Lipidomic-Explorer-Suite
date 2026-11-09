import type { Metadata } from "next";
import Link from "@/components/app-link";
import { listDatasets } from "@/lib/data/release";
import { formatLabInstant } from "@/lib/lab-time";
import { datasetStatusLabels, mayOpenInNexo, nexoDatasetLink, signerRoleLabels } from "@/lib/release";
import { requireWorkspace } from "@/lib/session";
import styles from "../release/release.module.css";

export const metadata: Metadata = { title: "Datasets" };

const NexoLink = ({ href }: { href: string | null }) => href ? <><br /><a href={href} target="_blank" rel="noreferrer">Open in Nexo</a></> : null;

// Every frozen dataset version, by order: status, who signed, where it came from, which Team project it became.
export default async function DatasetsPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const session = await requireWorkspace("staff");
  const nexo = (dataset: Parameters<typeof nexoDatasetLink>[1]) => nexoDatasetLink(process.env.NEXT_PUBLIC_NEXO_URL, dataset, mayOpenInNexo(session.view));
  const { order: filter } = await searchParams;
  const all = await listDatasets();
  const datasets = filter ? all.filter(dataset => dataset.orderCode === filter) : all;
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Datasets</div>
        <h1>Datasets</h1>
        <p>Frozen dataset versions with their status and provenance. A version never changes once signed; a correction is a new version.</p>
      </div>
      <div className="heading-actions"><Link className="button" href="/release">Release</Link></div>
    </div>
    {filter && <p className="notice" role="status">Showing {filter} only · <Link href="/datasets">all orders</Link></p>}
    <section className="panel" aria-labelledby="datasets-title">
      <div className="eyebrow">{datasets.length} version{datasets.length === 1 ? "" : "s"}</div>
      <h2 id="datasets-title">Versions by order</h2>
      {datasets.length
        ? <div className={styles.scroll}><table className={styles.orders} aria-label="Dataset versions">
          <thead><tr><th scope="col">Order</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Built</th><th scope="col">Signed by</th><th scope="col">Provenance</th><th scope="col">Team project</th></tr></thead>
          <tbody>{datasets.map(dataset => <tr key={dataset.id}>
            <td><Link href={`/orders/${dataset.orderCode}`} className="order-code">{dataset.orderCode}</Link><br /><small>{dataset.clientName}</small></td>
            <td><Link href={`/release/${dataset.id}`}>v{dataset.version}</Link></td>
            <td><span className={styles.state} data-status={dataset.status}>{datasetStatusLabels[dataset.status]}</span>{dataset.archivedReason && <><br /><small className="muted">{dataset.archivedReason}</small></>}</td>
            <td>{formatLabInstant(dataset.builtAt)}{dataset.builtBy && <><br /><small className="muted">{dataset.builtBy}</small></>}</td>
            <td>{dataset.signatures.length ? dataset.signatures.map(signature => <span key={signature.id}>{signature.name} · {signerRoleLabels[signature.role]}<br /></span>) : <span className="muted">Nobody yet</span>}</td>
            <td><small className={styles.digest}>TXT {dataset.provenance.sourceSha256 ? `${dataset.provenance.sourceSha256.slice(0, 12)}…` : "not recorded"}</small><br />
              <small className="muted">{dataset.provenance.sciexOsVersion ? `SCIEX OS ${dataset.provenance.sciexOsVersion}` : "SCIEX OS version not provided"}{dataset.provenance.processingMethod ? ` · ${dataset.provenance.processingMethod}` : ""}</small><br />
              <small className={styles.digest}>analysis {dataset.analysis.sha256 ? `${dataset.analysis.sha256.slice(0, 12)}…` : "not recorded"}</small></td>
            <td>{dataset.projectId ? <><span className={`mono ${styles.id}`}>{dataset.projectId}</span>{dataset.releasedAt && <><br /><small className="muted">released {formatLabInstant(dataset.releasedAt)}</small></>}</> : <span className="muted">Not released</span>}
              <NexoLink href={nexo(dataset)} /></td>
          </tr>)}</tbody>
        </table></div>
        : <p className="empty-state">No dataset has been built yet. <Link href="/release">Build one from Release</Link>.</p>}
    </section>
  </>;
}
