import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { billingLabels, clientPermissions, getClient, kindLabels, memberRoleLabels } from "@/lib/data/clients";
import { formatLabInstant } from "@/lib/lab-time";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../../release/action-form";
import { archiveClientAction, setMembersPrepareAction, setNexoAccessAction, updateClientAction } from "../actions";
import { ClientFields, DemoActor } from "../client-fields";
import styles from "../clients.module.css";

export const metadata: Metadata = { title: "Client details" };
export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; nexo?: string; prepare?: string }> }) {
  await requireWorkspace("staff");
  const { id } = await params;
  const [client, permissions, query] = await Promise.all([getClient(id), clientPermissions(), searchParams]);
  if (!client) notFound();
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Link href="/clients">Clients</Link> / Details</div><h1>{client.name}</h1><p>{kindLabels[client.kind]} · {client.memberCount} members · {client.openOrders} open orders</p></div><div className="heading-actions"><Link className="button secondary" href="/clients">Back to clients</Link></div></div>
    {query.created === "1" && <p className="notice success" role="status">Client created.</p>}
    {query.saved === "1" && <p className="notice success" role="status">Client details saved.</p>}
    {(query.nexo === "on" || query.nexo === "off") && <p className="notice success" role="status">Nexo access turned {query.nexo} for {client.name}.</p>}
    {(query.prepare === "on" || query.prepare === "off") && <p className="notice success" role="status">{client.name}&apos;s members {query.prepare === "on" ? "may now" : "may no longer"} prepare datasets in Nexo.</p>}
    {client.archivedAt && <p className="notice">Archived {formatLabInstant(client.archivedAt)} · {client.archivedReason}</p>}
    <div className={styles.layout}>
      <section className="panel" aria-labelledby="edit-client"><h2 id="edit-client">{permissions.canEdit && !client.archivedAt ? "Edit client" : "Client details"}</h2>
        {permissions.canEdit && !client.archivedAt
          ? <ActionForm action={updateClientAction} submit="Save details" pendingLabel="Saving…" className={styles.form}><ClientFields client={client} actors={permissions.demoActors} /></ActionForm>
          : <><dl className="facts"><div className="fact-row"><dt>Name</dt><dd>{client.name}</dd></div><div className="fact-row"><dt>Kind</dt><dd>{kindLabels[client.kind]}</dd></div><div className="fact-row"><dt>Billing method</dt><dd>{client.billingMethod ? billingLabels[client.billingMethod] : "Not set"}</dd></div><div className="fact-row"><dt>Notes</dt><dd>{client.notes ?? "None"}</dd></div></dl>{!client.archivedAt && <p className="notice">Only a lab Owner or Admin can edit client details.</p>}</>}
      </section>
      <section className="panel" aria-labelledby="members"><h2 id="members">Members</h2>
        {client.members.length ? <div className={styles.scroll}><table className={styles.table} aria-label="Client members"><thead><tr><th scope="col">Member (user ID)</th><th scope="col">Role</th></tr></thead><tbody>{client.members.map(member => <tr key={member.userId}><td className={styles.userId}>{member.userId}</td><td>{memberRoleLabels[member.role] ?? member.role}</td></tr>)}</tbody></table></div> : <p className="muted">No active members.</p>}
      </section>
    </div>
    <section className={`panel ${styles.section}`} aria-labelledby="nexo-access"><h2 id="nexo-access">Nexo access</h2>
      <div className={styles.switch}>
        <p className="muted">When on, {client.name}&apos;s people see Open in Nexo on their released datasets (where this environment lets clients open Nexo). Off by default; the lab decides per client.</p>
        <span className={`pill ${client.nexoAccess ? "ok" : "pending"}`} data-testid="nexo-state">{client.nexoAccess ? "On" : "Off"}</span>
      </div>
      {permissions.canEdit && !client.archivedAt
        ? <ActionForm action={setNexoAccessAction} submit={client.nexoAccess ? "Turn Nexo access off" : "Turn Nexo access on"} pendingLabel="Saving…" secondary={client.nexoAccess} className={styles.form}>
          <input type="hidden" name="clientId" value={client.id} /><input type="hidden" name="enabled" value={String(!client.nexoAccess)} /><DemoActor actors={permissions.demoActors} id="nexo-actor" />
        </ActionForm>
        : !client.archivedAt && <p className="notice">Only a lab Owner or Admin can change Nexo access.</p>}
      {client.nexoAccess && <>
        <div className={styles.switch}>
          <p className="muted">Members of this client may prepare datasets and upload their own Excel in Nexo.</p>
          <span className={`pill ${client.membersPrepare ? "ok" : "pending"}`} data-testid="prepare-state">{client.membersPrepare ? "On" : "Off"}</span>
        </div>
        {permissions.canEdit && !client.archivedAt && <ActionForm action={setMembersPrepareAction} submit={client.membersPrepare ? "Stop members preparing in Nexo" : "Let members prepare in Nexo"} pendingLabel="Saving…" secondary={client.membersPrepare} className={styles.form}>
          <input type="hidden" name="clientId" value={client.id} /><input type="hidden" name="enabled" value={String(!client.membersPrepare)} /><DemoActor actors={permissions.demoActors} id="prepare-actor" />
        </ActionForm>}
      </>}
    </section>
    <section className={`panel ${styles.section}`} aria-labelledby="orders"><h2 id="orders">Orders</h2>
      {client.orders.length ? <div className={styles.scroll}><table className={styles.table} aria-label="Client orders"><thead><tr><th scope="col">Order</th><th scope="col">Title</th><th scope="col">Stage</th></tr></thead><tbody>{client.orders.map(order => <tr key={order.code}><td>{order.archivedAt ? order.code : <Link href={`/orders/${encodeURIComponent(order.code)}`}>{order.code}</Link>}</td><td>{order.title || "Untitled"}</td><td>{order.stage}{order.archivedAt ? " · Archived" : ""}</td></tr>)}</tbody></table></div> : <p className="empty-state">No orders for this client.</p>}
    </section>
    {permissions.canEdit && !client.archivedAt && <section className={`panel ${styles.section}`} aria-labelledby="archive-client"><h2 id="archive-client">Archive client</h2><p className="muted">A client can be archived once every order is released or archived. The record and its history are kept.</p>
      {client.openOrders > 0 && <p className="notice">This client has {client.openOrders} open orders. Release or archive them first.</p>}
      <ActionForm action={archiveClientAction} submit="Archive client" pendingLabel="Archiving…" disabled={client.openOrders > 0} secondary className={styles.form}>
        <input type="hidden" name="clientId" value={client.id} /><label className="field"><span className="field-label">Reason for archiving</span><input name="reason" required /></label><DemoActor actors={permissions.demoActors} id="archive-actor" />
      </ActionForm>
    </section>}
  </>;
}
