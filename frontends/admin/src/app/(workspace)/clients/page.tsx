import type { Metadata } from "next";
import Link from "@/components/app-link";
import { billingLabels, clientPermissions, kindLabels, listClientRecords, type ClientRecord } from "@/lib/data/clients";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../release/action-form";
import { createClientAction } from "./actions";
import { ClientFields } from "./client-fields";
import styles from "./clients.module.css";

export const metadata: Metadata = { title: "Clients" };
function ClientTable({ clients, label }: { clients: ClientRecord[]; label: string }) {
  return clients.length ? <div className={styles.scroll}><table className={styles.table} aria-label={label}>
    <thead><tr><th scope="col">Client</th><th scope="col">Kind</th><th scope="col">Billing method</th><th scope="col">Members</th><th scope="col">Open orders</th></tr></thead>
    <tbody>{clients.map(client => <tr key={client.id}>
      <td><Link href={`/clients/${encodeURIComponent(client.id)}`}>{client.name}</Link></td>
      <td>{kindLabels[client.kind] ?? client.kind}</td><td>{client.billingMethod ? billingLabels[client.billingMethod] ?? client.billingMethod : "Not set"}</td>
      <td>{client.memberCount}</td><td>{client.openOrders}</td>
    </tr>)}</tbody>
  </table></div> : <p className="empty-state">No {label.toLowerCase()}.</p>;
}
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requireWorkspace("staff");
  const [clients, permissions, query] = await Promise.all([listClientRecords(), clientPermissions(), searchParams]);
  const active = clients.filter(client => !client.archivedAt);
  const archived = clients.filter(client => client.archivedAt);
  return <>
    <div className="page-heading"><div><div className="eyebrow">Lab administration</div><h1>Clients</h1><p>Client details, billing methods and the people and orders in each client.</p></div></div>
    {query.archived === "1" && <p className="notice success" role="status">Client archived. Its record is kept under Archived clients.</p>}
    <div className={styles.layout}>
      <div><section className="panel" aria-labelledby="active-clients"><h2 id="active-clients">Active clients</h2><ClientTable clients={active} label="Active clients" /></section>
        <details className={styles.disclosure}><summary>Archived clients ({archived.length})</summary><ClientTable clients={archived} label="Archived clients" /></details>
      </div>
      <section className="panel" aria-labelledby="new-client"><h2 id="new-client">New client</h2>
        {permissions.canEdit ? <ActionForm action={createClientAction} submit="Create client" pendingLabel="Creating…" className={styles.form}><ClientFields actors={permissions.demoActors} /></ActionForm>
          : <p className="notice">Only a lab Owner or Admin can create clients.</p>}
      </section>
    </div>
  </>;
}
