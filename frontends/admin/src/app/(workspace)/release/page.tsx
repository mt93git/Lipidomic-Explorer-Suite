import type { Metadata } from "next";
import Link from "@/components/app-link";
import { listReleaseOrders, type ReleaseOrder, type VersionSummary } from "@/lib/data/release";
import { formatLabInstant } from "@/lib/lab-time";
import { stages } from "@/lib/models";
import { datasetStatusLabels } from "@/lib/release";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "./action-form";
import { buildDatasetAction } from "./actions";
import styles from "./release.module.css";

export const metadata: Metadata = { title: "Release" };

const latest = (order: ReleaseOrder): VersionSummary | null => order.versions.at(-1) ?? null;
const describe = (version: VersionSummary) => version.status === "built" ? `v${version.version} built · ${version.signatures} signature${version.signatures === 1 ? "" : "s"}`
  : `v${version.version} ${datasetStatusLabels[version.status].toLowerCase()}${version.releasedAt && version.status === "released" ? ` · ${formatLabInstant(version.releasedAt)}` : ""}`;
// What a row needs next: a version in progress is opened, a released order may get a new version, the rest is built.
type Need = "open" | "build" | "rebuild";
const need = (order: ReleaseOrder): Need => latest(order)?.status === "built" ? "open" : order.releasedAt || order.versions.some(version => version.status === "released") ? "rebuild" : "build";
const rank: Record<Need, number> = { open: 0, build: 1, rebuild: 2 };
const stageIndex = (stage: number) => String(stage + 1).padStart(2, "0");

// The release side starts here: orders whose results file was accepted can be built into a frozen dataset
// version; each version then collects its signatures and is released from its own page.
export default async function ReleasePage() {
  const session = await requireWorkspace("staff");
  const orders = (await listReleaseOrders()).map(order => ({ order, need: need(order) })).sort((a, b) => rank[a.need] - rank[b.need]);
  const awaiting = orders.flatMap(({ order }) => order.versions.filter(version => version.status === "built").map(version => ({ order, version })));
  const canBuild = ["Owner", "Admin", "Operator"].includes(session.role);
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Release</div>
        <h1>Release</h1>
        <p>Build a frozen dataset version from an accepted results file, collect the signatures the release policy requires, and release it into Team&apos;s library.</p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href="/datasets">Datasets</Link>
        <Link className="button secondary" href="/release-policy">Release policy</Link>
      </div>
    </div>

    {awaiting.length > 0 && <section className="panel" aria-labelledby="awaiting-title">
      <div className="eyebrow">Awaiting signatures or release</div>
      <h2 id="awaiting-title">Built versions · {awaiting.length}</h2>
      <ul className="order-list" aria-label="Built dataset versions">
        {awaiting.map(({ order, version }) => <li key={version.id}><Link className="order-choice" href={`/release/${version.id}`}>
          <span className="order-code">{order.code} · v{version.version}</span>{order.title}
          <small>{order.clientName} · {version.signatures} signature{version.signatures === 1 ? "" : "s"} so far</small>
        </Link></li>)}
      </ul>
    </section>}

    <section className="panel" aria-labelledby="build-title">
      <div className="eyebrow">From an accepted results file</div>
      <h2 id="build-title">Build a dataset</h2>
      <p className="muted">The server builds the dataset v1 workbook, splits it into the analysis file (Abundance, Metadata) and the companion (Internal_Standards, QC_Injections, Provenance), and records each file&apos;s SHA-256 and size. Raw peak areas are copied, never changed.</p>
      {orders.length
        ? <div className={styles.scroll}><table className={styles.orders} aria-label="Orders with an accepted results file">
          <thead><tr><th scope="col">Order</th><th scope="col">Client</th><th scope="col">Stage</th><th scope="col">Results accepted</th><th scope="col">Versions</th><th scope="col"><span className="sr-only">Build</span></th></tr></thead>
          <tbody>{orders.map(({ order, need }) => {
            const last = latest(order);
            const releasedAt = order.versions.filter(version => version.status === "released").at(-1)?.releasedAt ?? order.releasedAt;
            return <tr key={order.id}>
              <td><span className="order-code">{order.code}</span><br /><small>{order.title}</small></td>
              <td><span className="client-name"><span className="color-square" data-color={order.clientId.replace(/^example-/, "")} aria-hidden="true" />{order.clientName}</span></td>
              <td>{need === "rebuild"
                ? <span className={styles.state} data-status="released">Released{releasedAt ? ` · ${formatLabInstant(releasedAt)}` : ""}</span>
                : <span className={styles.state} data-status="stage">{stageIndex(order.stage)} · {stages[order.stage]}</span>}</td>
              <td>{order.acceptedAt ? formatLabInstant(order.acceptedAt) : "Accepted"}</td>
              <td>{order.versions.length
                ? <ul className={styles.versions}>{order.versions.map(version => <li key={version.id}><Link href={`/release/${version.id}`}>{describe(version)}</Link></li>)}</ul>
                : <span className="muted">None yet</span>}</td>
              <td>{need === "open" && last
                ? <Link className="button secondary" href={`/release/${last.id}`}>Open v{last.version} →</Link>
                : canBuild
                  ? <ActionForm action={buildDatasetAction} submit={need === "rebuild" ? `Build v${(last?.version ?? 0) + 1}` : `Build dataset v${(last?.version ?? 0) + 1}`} pendingLabel="Building…" secondary={need === "rebuild"}>
                    <input type="hidden" name="orderId" value={order.id} />
                  </ActionForm>
                  : <span className="muted">Operator access needed</span>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        : <p className="empty-state">No order has an accepted results file yet. <Link href="/ingest-results">Accept one in Ingest results</Link> first.</p>}
    </section>
  </>;
}
