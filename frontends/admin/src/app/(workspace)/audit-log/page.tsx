import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import Link from "@/components/app-link";
import { redirect } from "next/navigation";
import { auditEntities, auditExportHref, auditHref, formatAuditWhen, parseAuditFilters, type AuditClientTag } from "@/lib/audit";
import { listAuditEvents } from "@/lib/data/audit";
import { withBasePath } from "@/lib/base-path";
import { formatLabInstant } from "@/lib/lab-time";
import map from "@/components/visual-map.module.css";
import styles from "./audit.module.css";

export const metadata: Metadata = { title: "Audit log" };

type Params = Record<string, string | string[] | undefined>;

// a21's Client cell: one client with its colour square; several (a batch) as their squares and "N clients"; none "—".
function Clients({ clients }: { clients: AuditClientTag[] }) {
  if (!clients.length) return <span className={styles.none}>—</span>;
  const squares = clients.slice(0, 4).map(client => <span key={client.name} className={`${map.swatch} ${map[`c${client.slot}`]}`} aria-hidden="true" />);
  if (clients.length === 1) return <span className={styles.client}>{squares}{clients[0].name}</span>;
  const names = clients.map(client => client.name).join(", ");
  return <span className={styles.client} title={names}><span className={styles.squares}>{squares}</span>{clients.length} clients<span className="sr-only">: {names}</span></span>;
}

// admin.audit_event, newest first, 50 per page: who changed what, in words, with the changed fields on demand.
// Lab staff only (listAuditEvents asks for the staff workspace, like every staff screen). Filters live in the URL.
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireWorkspace("staff");
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  // One spelling per view: ORD080 not ord080, no empty or invalid parameters.
  const given = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(item => [key, item]))).toString();
  const canonical = auditHref(filters);
  if ((given ? `/audit-log?${given}` : "/audit-log") !== canonical) redirect(canonical);

  const { rows, older, order } = await listAuditEvents(filters);
  const filtered = !!(filters.entity || filters.order);
  const now = new Date();
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">Organization / Audit log</div>
        <h1>Audit log</h1>
        <p>Append-only. Nothing in Admin is hard-deleted. Who did what, and when (lab time).</p>
      </div>
      <div className="heading-actions">
        <button className="button secondary" type="submit" form="audit-filters">Filter</button>
        <a className="button secondary" href={withBasePath(auditExportHref(filters))} download>Export CSV</a>
      </div>
    </div>
    {order && !order.found && <p className="notice" role="status">There is no order {order.code}.</p>}
    {order?.found && <p className="notice" role="status">Showing {order.code} and its shipments, samples, results files, datasets and signatures · <Link href={auditHref({ ...filters, order: null, before: null })}>all orders</Link></p>}
    <section className="panel" aria-labelledby="audit-title">
      <form method="get" id="audit-filters" className={styles.filters} aria-label="Filter events">
        <label>Entity
          <select name="entity" defaultValue={filters.entity ?? ""}>
            <option value="">All entities</option>
            {auditEntities.map(entity => <option key={entity.value} value={entity.value}>{entity.label}</option>)}
          </select>
        </label>
        <label>Order code
          <input name="order" defaultValue={filters.order ?? ""} placeholder="ORD080" autoComplete="off" spellCheck={false} />
        </label>
        {filtered && <Link href="/audit-log">Clear</Link>}
      </form>
      <h2 id="audit-title" className="sr-only">Events</h2>
      {rows.length
        ? <div className={styles.scroll}><table className={styles.events} aria-label="Audit events">
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Client</th><th scope="col">What</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td><time dateTime={row.at} title={formatLabInstant(row.at)}>{formatAuditWhen(row.at, now)}</time></td>
            <td>{row.who}</td>
            <td><Clients clients={row.clients} /></td>
            <td>{row.changes.length
              ? <details>
                <summary>{row.summary}</summary>
                <dl className={styles.changes}>{row.changes.map(change => <div key={change.field} className={styles.change}>
                  <dt>{change.field}</dt>
                  <dd>{change.before === null ? change.after : `${change.before} → ${change.after}`}</dd>
                </div>)}</dl>
              </details>
              : row.summary}</td>
          </tr>)}</tbody>
        </table></div>
        : <p className="empty-state">{filtered || filters.before ? "No events match these filters." : "Nothing has been recorded yet."}</p>}
      {(filters.before || older) && <nav className={styles.pages} aria-label="Pages">
        {filters.before && <Link className="button" href={auditHref({ ...filters, before: null })}>Newest</Link>}
        {older && <Link className="button" href={auditHref({ ...filters, before: older })}>Older</Link>}
      </nav>}
    </section>
  </>;
}
