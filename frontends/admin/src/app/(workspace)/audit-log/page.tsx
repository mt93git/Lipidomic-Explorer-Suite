import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import Link from "@/components/app-link";
import { redirect } from "next/navigation";
import { auditEntities, auditHref, parseAuditFilters } from "@/lib/audit";
import { listAuditEvents } from "@/lib/data/audit";
import { formatLabInstant } from "@/lib/lab-time";
import styles from "./audit.module.css";

export const metadata: Metadata = { title: "Audit log" };

type Params = Record<string, string | string[] | undefined>;

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
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">Organization / Audit log</div>
        <h1>Audit log</h1>
        <p>The append-only record of changes to the lab&apos;s records: who did what, and when (lab time). Nothing here can be edited or deleted.</p>
      </div>
    </div>
    {order && !order.found && <p className="notice" role="status">There is no order {order.code}.</p>}
    {order?.found && <p className="notice" role="status">Showing {order.code} and its shipments, samples, results files, datasets and signatures · <Link href={auditHref({ ...filters, order: null, before: null })}>all orders</Link></p>}
    <section className="panel" aria-labelledby="audit-title">
      <form method="get" className={styles.filters} aria-label="Filter events">
        <label>Entity
          <select name="entity" defaultValue={filters.entity ?? ""}>
            <option value="">All entities</option>
            {auditEntities.map(entity => <option key={entity.value} value={entity.value}>{entity.label}</option>)}
          </select>
        </label>
        <label>Order code
          <input name="order" defaultValue={filters.order ?? ""} placeholder="ORD080" autoComplete="off" spellCheck={false} />
        </label>
        <button className="button" type="submit">Filter</button>
        {filtered && <Link href="/audit-log">Clear</Link>}
      </form>
      <h2 id="audit-title" className="sr-only">Events</h2>
      {rows.length
        ? <div className={styles.scroll}><table className={styles.events} aria-label="Audit events">
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td><time dateTime={row.at}>{formatLabInstant(row.at)}</time></td>
            <td>{row.who}</td>
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
