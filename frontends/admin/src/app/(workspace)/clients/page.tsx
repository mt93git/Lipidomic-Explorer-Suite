import type { Metadata } from "next";
import Link from "@/components/app-link";
import styles from "@/components/directory.module.css";
import { billingLabels, clientPermissions, kindLabels, listClientRecords, type ClientRecord } from "@/lib/data/clients";
import { lowerFirst } from "@/lib/directory";
import { requireWorkspace } from "@/lib/session";
import local from "./clients.module.css";

export const metadata: Metadata = { title: "Clients" };
const billing = (client: ClientRecord) => client.billingMethod ? lowerFirst(billingLabels[client.billingMethod] ?? client.billingMethod) : "not set";
const firstLine = (notes: string | null) => notes?.split("\n").map(line => line.trim()).find(Boolean) ?? null;
function ClientTable({ clients, label }: { clients: ClientRecord[]; label: string }) {
  return clients.length ? <div className={styles.card}><div className={styles.scroll}><table className={styles.table} aria-label={label}>
    <thead><tr><th scope="col">Client</th><th scope="col">Type</th><th scope="col">Billing</th>
      <th scope="col" className={styles.num}>Users</th><th scope="col" className={styles.num}>Open orders</th><th scope="col" className={styles.num}>Released</th></tr></thead>
    <tbody>{clients.map(client => {
      const note = firstLine(client.notes);
      return <tr key={client.id}>
        <td><span className={styles.client}><span className="color-square" data-color={client.color ?? "shared"} aria-hidden="true" />
          <Link className={styles.clientName} href={`/clients/${encodeURIComponent(client.id)}`}>{client.name}</Link></span>
          {(client.code || note) && <span className={styles.sub}>{[client.code, note].filter(Boolean).join(" · ")}</span>}</td>
        <td>{kindLabels[client.kind] ?? client.kind}</td><td>{billing(client)}</td>
        <td className={styles.num}>{client.memberCount}</td><td className={styles.num}>{client.openOrders}</td><td className={styles.num}>{client.released ?? 0}</td>
      </tr>;
    })}</tbody>
  </table></div></div> : <p className="empty-state">No {label.toLowerCase()}.</p>;
}
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requireWorkspace("staff");
  const [clients, permissions, query] = await Promise.all([listClientRecords(), clientPermissions(), searchParams]);
  const active = clients.filter(client => !client.archivedAt);
  const archived = clients.filter(client => client.archivedAt);
  return <>
    <div className={styles.heading}>
      <div><h1>Clients</h1><p>Groups and companies that place orders. Each client only ever sees its own data.</p></div>
      {permissions.canEdit && <div className={styles.actions}><Link className="button" href="/clients/new">New client</Link></div>}
    </div>
    {query.archived === "1" && <p className="notice success" role="status">Client archived. Its record is kept under Archived clients.</p>}
    <ClientTable clients={active} label="Active clients" />
    <p className={styles.note}>Today the operator&apos;s files are organized by hand as <code>Collaboration/&lt;PI&gt;/&lt;project&gt;/</code>. Each of those folders becomes a client and its orders here.</p>
    {archived.length > 0 && <details className={local.disclosure}><summary>Archived clients ({archived.length})</summary><ClientTable clients={archived} label="Archived clients" /></details>}
  </>;
}
