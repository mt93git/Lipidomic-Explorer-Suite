import type { Metadata } from "next";
import Link from "@/components/app-link";
import styles from "@/components/directory.module.css";
import { listClients, listOrders } from "@/lib/data/orders";
import { getReleasePolicy, listDatasets, type DatasetRecord } from "@/lib/data/release";
import { datasetPill, releasedDay, type DatasetPill } from "@/lib/directory";
import { formatLabInstant } from "@/lib/lab-time";
import type { Client, Order } from "@/lib/models";
import { mayOpenInNexo, nexoDatasetLink, signerRoleLabels } from "@/lib/release";
import { stageFromDb } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Datasets" };

// Orders whose results were accepted and whose Excel is not built yet: listed as "processing" with the version to come.
const PROCESSING = [stageFromDb("processed"), stageFromDb("qc_checked")];
type Row = { key: string; client: Client; orderCode: string; name: string; href: string | null; panel: string; samples: number | null; lipids: number | null;
  pill: DatasetPill; released: string | null; dataset: DatasetRecord | null };
const count = (value: number | null) => value === null ? <span className={styles.dash}>—</span> : value.toLocaleString("en-US");
const datasetName = (title: string, code: string, version: number) => `${title.trim() || code} v${version}`;

// Every dataset version Admin has built, by client and version, with a client filter (?client=) and the order filter
// other screens link to (?order=). A version never changes once signed; a correction is a new version.
export default async function DatasetsPage({ searchParams }: { searchParams: Promise<{ order?: string; client?: string }> }) {
  const session = await requireWorkspace("staff");
  const nexo = (dataset: DatasetRecord) => nexoDatasetLink(process.env.NEXT_PUBLIC_NEXO_URL, dataset, mayOpenInNexo(session.view));
  const { order: orderFilter, client: clientFilter } = await searchParams;
  const [all, orders, clients, policy] = await Promise.all([listDatasets(), listOrders(), listClients(), getReleasePolicy()]);
  const orderByCode = new Map(orders.map(order => [order.code, order]));
  const clientOf = (id: string, name: string): Client => clients.find(client => client.id === id) ?? { id, name, color: "shared" };
  const built: Row[] = all.map(dataset => {
    const order = orderByCode.get(dataset.orderCode);
    return {
      key: dataset.id, client: clientOf(dataset.clientId, dataset.clientName), orderCode: dataset.orderCode, name: datasetName(dataset.orderTitle, dataset.orderCode, dataset.version),
      href: `/release/${dataset.id}`, panel: order?.panel ?? "—", samples: dataset.samples ?? order?.sampleCount ?? null, lipids: dataset.lipids ?? null,
      pill: datasetPill({ status: dataset.status, signatures: dataset.signatures.length }, policy.policy.requiredSignatures), released: dataset.releasedAt, dataset,
    };
  });
  const processing: Row[] = orders.filter((order: Order) => !order.released && PROCESSING.includes(order.stage) && !all.some(dataset => dataset.orderCode === order.code))
    .map(order => ({ key: `processing-${order.code}`, client: clientOf(order.clientId, "Client"), orderCode: order.code, name: datasetName(order.description, order.code, 1),
      href: null, panel: order.panel || "—", samples: order.sampleCount, lipids: null, pill: datasetPill("processing", 0), released: null, dataset: null }));
  const rows = [...built, ...processing]
    .filter(row => (!orderFilter || row.orderCode === orderFilter) && (!clientFilter || row.client.id === clientFilter))
    .sort((a, b) => a.client.name.localeCompare(b.client.name) || b.orderCode.localeCompare(a.orderCode) || b.name.localeCompare(a.name));
  const chosen = clientFilter ? clients.find(client => client.id === clientFilter) : undefined;
  const filterHref = (id?: string) => `/datasets${id ? `?client=${encodeURIComponent(id)}` : ""}`;
  return <>
    <div className={styles.heading}>
      <div>
        <h1>Datasets</h1>
        <p>Every Excel Admin has built, by client and version.</p>
      </div>
      <div className={styles.actions}>
        <details className={styles.filter}>
          <summary aria-label="Filter by client">Filter: {chosen ? chosen.name : "all clients"}</summary>
          <nav className={styles.filterList} aria-label="Clients">
            <a href={filterHref()} aria-current={!clientFilter}>All clients</a>
            {clients.map(client => <a key={client.id} href={filterHref(client.id)} aria-current={client.id === clientFilter}>
              <span className="color-square" data-color={client.color} aria-hidden="true" />{client.name}</a>)}
          </nav>
        </details>
      </div>
    </div>
    {orderFilter && <p className="notice" role="status">Showing {orderFilter} only · <Link href="/datasets">all orders</Link></p>}
    {rows.length
      ? <div className={styles.card}><div className={styles.scroll}><table className={styles.table} aria-label="Dataset versions">
        <thead><tr><th scope="col">Client</th><th scope="col">Order</th><th scope="col">Dataset</th><th scope="col">Panel</th>
          <th scope="col" className={styles.num}>Samples</th><th scope="col" className={styles.num}>Lipids</th><th scope="col">Status</th><th scope="col">Released</th></tr></thead>
        <tbody>{rows.map(row => {
          const dataset = row.dataset;
          const href = dataset ? nexo(dataset) : null;
          return <tr key={row.key}>
            <td><span className={styles.client}><span className="color-square" data-color={row.client.color} aria-hidden="true" />{row.client.name}</span></td>
            <td><Link href={`/orders/${row.orderCode}`}>{row.orderCode}</Link></td>
            <td>{row.href ? <Link href={row.href}>{row.name}</Link> : row.name}
              {dataset && dataset.exclusions.length > 0 && <ul className={styles.sub} aria-label={`Sample exclusions recorded for ${dataset.orderCode} v${dataset.version}`}>
                {dataset.exclusions.map(item => <li key={item.sampleCode}><span className="mono">{item.sampleCode}</span> excluded · {item.reason} · {item.decidedBy ?? "Lab staff"} · {formatLabInstant(item.decidedAt)}</li>)}
              </ul>}</td>
            <td>{row.panel}</td>
            <td className={styles.num}>{count(row.samples)}</td>
            <td className={styles.num}>{count(row.lipids)}</td>
            <td><span className={styles.pill} data-tone={row.pill.tone}>{row.pill.label}</span>
              {dataset && dataset.signatures.length > 0 && <span className={styles.sub}>{dataset.signatures.map(signature => `${signature.name} · ${signerRoleLabels[signature.role]}`).join(", ")}</span>}</td>
            <td><span className={styles.mono}>{row.released ? releasedDay(row.released) : <span className={styles.dash}>—</span>}</span>
              {href && <span className={styles.sub}><a href={href} target="_blank" rel="noreferrer">Open in Nexo</a></span>}</td>
          </tr>;
        })}</tbody>
      </table></div></div>
      : <p className="empty-state">{all.length || processing.length ? "No dataset matches this filter." : <>No dataset has been built yet. <Link href="/release">Build one from Release</Link>.</>}</p>}
  </>;
}
