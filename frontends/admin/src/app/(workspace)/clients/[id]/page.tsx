import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import directory from "@/components/directory.module.css";
import { billingLabels, clientPermissions, getClient, kindLabels, memberRoleLabels } from "@/lib/data/clients";
import { listClientDocuments, type ClientDocument } from "@/lib/data/deliverables";
import { deliverableKinds } from "@/lib/deliverables";
import { lastActive, lowerFirst, personLabel, stageTone } from "@/lib/directory";
import { formatLabInstant } from "@/lib/lab-time";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../../release/action-form";
import { archiveClientAction, setMembersPrepareAction, setNexoAccessAction, updateClientAction } from "../actions";
import { ClientFields, DemoActor } from "../client-fields";
import styles from "../clients.module.css";

export const metadata: Metadata = { title: "Client details" };

// Client detail (prototype a18): who the client's people are, its orders, and three cards: Nexo access (the
// prototype's "Team workspace": Team is retired, Nexo is where released datasets open), Documents and Billing.
// Editing the client and archiving it follow. No two-step column: two-step sign-in is off for everyone (2026-11-11).
export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; nexo?: string; prepare?: string }> }) {
  await requireWorkspace("staff");
  const { id } = await params;
  const [client, permissions, query] = await Promise.all([getClient(id), clientPermissions(), searchParams]);
  if (!client) notFound();
  const documents: ClientDocument[] | null = await listClientDocuments(client.id).catch(() => null);
  const canEdit = permissions.canEdit && !client.archivedAt;
  const billing = client.billingMethod ? billingLabels[client.billingMethod] ?? client.billingMethod : null;
  const facts = [client.code, kindLabels[client.kind] ?? client.kind, billing ? `billing by ${lowerFirst(billing)}` : "billing not set"].filter(Boolean).join(" · ");
  const active = !client.archivedAt;
  return <>
    <div className={directory.heading}>
      <div>
        <h1><span className="color-square" data-color={client.color ?? "shared"} aria-hidden="true" />{client.name}</h1>
        <p>{facts}</p>
      </div>
      {active && <div className={directory.actions}>
        <Link className="button secondary" href={`/people?client=${encodeURIComponent(client.id)}#invite-title`}>Invite user</Link>
        <Link className="button" href={`/new-order?client=${encodeURIComponent(client.id)}`}>New order</Link>
      </div>}
    </div>
    {query.created === "1" && <p className="notice success" role="status">Client created.</p>}
    {query.saved === "1" && <p className="notice success" role="status">Client details saved.</p>}
    {(query.nexo === "on" || query.nexo === "off") && <p className="notice success" role="status">Nexo access turned {query.nexo} for {client.name}.</p>}
    {(query.prepare === "on" || query.prepare === "off") && <p className="notice success" role="status">{client.name}&apos;s members {query.prepare === "on" ? "may now" : "may no longer"} prepare datasets in Nexo.</p>}
    {client.archivedAt && <p className="notice">Archived {formatLabInstant(client.archivedAt)} · {client.archivedReason}</p>}

    <div className={directory.pair}>
      <section className={directory.card} aria-labelledby="members"><h2 id="members" className={directory.boxTitle}>Users</h2>
        {client.members.length
          ? <div className={`${directory.inset} ${directory.scroll}`}><table className={directory.table} aria-label="Client members">
            <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Last active</th></tr></thead>
            <tbody>{client.members.map(member => <tr key={member.userId}>
              <td>{personLabel(member)}{member.name && member.email && member.email !== member.name && <span className={directory.sub}>{member.email}</span>}</td>
              <td>{memberRoleLabels[member.role] ?? member.role}</td>
              <td className={directory.mono}>{member.lastSignInAt === undefined ? <span className={directory.dash}>—</span> : lastActive(member.lastSignInAt)}</td>
            </tr>)}</tbody>
          </table></div>
          : <p className={`${directory.boxBody} muted`}>No active members. Invite someone with Invite user.</p>}
      </section>
      <section className={directory.card} aria-labelledby="orders"><h2 id="orders" className={directory.boxTitle}>Orders</h2>
        {client.orders.length
          ? <div className={`${directory.inset} ${directory.scroll}`}><table className={directory.table} aria-label="Client orders">
            <thead><tr><th scope="col">Order</th><th scope="col">Panel</th><th scope="col" className={directory.num}>Samples</th><th scope="col">Stage</th></tr></thead>
            <tbody>{client.orders.map(order => <tr key={order.code}>
              <td className={directory.mono}>{order.archivedAt ? order.code : <Link href={`/orders/${encodeURIComponent(order.code)}`} title={order.title || undefined}>{order.code}</Link>}</td>
              <td>{order.panel ?? <span className={directory.dash}>—</span>}</td>
              <td className={directory.num}>{order.samples ?? <span className={directory.dash}>—</span>}</td>
              <td><span className={directory.pill} data-tone={order.archivedAt ? "superseded" : stageTone(order.stage)}>{lowerFirst(order.stage)}{order.archivedAt ? " · archived" : ""}</span></td>
            </tr>)}</tbody>
          </table></div>
          : <p className={`${directory.boxBody} muted`}>No orders for this client yet.</p>}
      </section>
    </div>

    <div className={directory.cards}>
      <section className={directory.card} aria-labelledby="nexo-access"><h2 id="nexo-access" className={directory.boxTitle}>Nexo access</h2>
        <div className={directory.boxBody}>
          <div className={directory.switchRow}>
            <p>When on, {client.name}&apos;s people see Open in Nexo on their released datasets (where this environment lets clients open Nexo). Off by default; the lab decides per client.</p>
            <span className={`pill ${client.nexoAccess ? "ok" : "pending"}`} style={{ marginTop: 0 }} data-testid="nexo-state">{client.nexoAccess ? "On" : "Off"}</span>
          </div>
          {canEdit
            ? <ActionForm action={setNexoAccessAction} submit={client.nexoAccess ? "Turn Nexo access off" : "Turn Nexo access on"} pendingLabel="Saving…" secondary={client.nexoAccess} className={styles.form}>
              <input type="hidden" name="clientId" value={client.id} /><input type="hidden" name="enabled" value={String(!client.nexoAccess)} /><DemoActor actors={permissions.demoActors} id="nexo-actor" />
            </ActionForm>
            : active && <p className="notice">Only a lab Owner or Admin can change Nexo access.</p>}
          {client.nexoAccess && <>
            <div className={directory.switchRow} style={{ marginTop: 14 }}>
              <p>Members of this client may prepare datasets and upload their own Excel in Nexo.</p>
              <span className={`pill ${client.membersPrepare ? "ok" : "pending"}`} style={{ marginTop: 0 }} data-testid="prepare-state">{client.membersPrepare ? "On" : "Off"}</span>
            </div>
            {canEdit && <ActionForm action={setMembersPrepareAction} submit={client.membersPrepare ? "Stop members preparing in Nexo" : "Let members prepare in Nexo"} pendingLabel="Saving…" secondary={client.membersPrepare} className={styles.form}>
              <input type="hidden" name="clientId" value={client.id} /><input type="hidden" name="enabled" value={String(!client.membersPrepare)} /><DemoActor actors={permissions.demoActors} id="prepare-actor" />
            </ActionForm>}
          </>}
        </div>
      </section>
      <section className={directory.card} aria-labelledby="documents"><h2 id="documents" className={directory.boxTitle}>Documents</h2>
        <div className={directory.boxBody}>
          {documents === null ? <p className="muted">Documents could not be read.</p>
            : documents.length
              ? <ul className={directory.list} aria-label="Client documents">{documents.map(item => <li key={item.id}>
                <Link href={`/orders/${encodeURIComponent(item.orderCode)}#deliverables`}>{item.title}</Link>
                <span className="muted"> · {item.orderCode} · {deliverableKinds[item.kind]}{item.visibleToClient ? "" : " · not shared yet"}</span></li>)}</ul>
              : <p className="muted">No documents yet. Files for the client are added on each order&apos;s Deliverables.</p>}
        </div>
      </section>
      <section className={directory.card} aria-labelledby="billing"><h2 id="billing" className={directory.boxTitle}>Billing</h2>
        <div className={directory.boxBody}>
          <p>{billing ? <>Billed by <strong>{lowerFirst(billing)}</strong>.</> : "No billing method set yet."} Each order carries its own billing reference.</p>
          <p className="muted">Invoicing stays outside Admin.</p>
        </div>
      </section>
    </div>

    <div className={directory.manage}>
      <section className="panel" aria-labelledby="edit-client"><h2 id="edit-client">{canEdit ? "Edit client" : "Client details"}</h2>
        {canEdit
          ? <ActionForm action={updateClientAction} submit="Save details" pendingLabel="Saving…" className={styles.form}><ClientFields client={client} actors={permissions.demoActors} /></ActionForm>
          : <><dl className="facts"><div className="fact-row"><dt>Name</dt><dd>{client.name}</dd></div><div className="fact-row"><dt>Kind</dt><dd>{kindLabels[client.kind]}</dd></div><div className="fact-row"><dt>Billing method</dt><dd>{billing ?? "Not set"}</dd></div><div className="fact-row"><dt>Notes</dt><dd>{client.notes ?? "None"}</dd></div></dl>{active && <p className="notice">Only a lab Owner or Admin can edit client details.</p>}</>}
      </section>
      {canEdit && <section className="panel" aria-labelledby="archive-client"><h2 id="archive-client">Archive client</h2><p className="muted">A client can be archived once every order is released or archived. The record and its history are kept.</p>
        {client.openOrders > 0 && <p className="notice">This client has {client.openOrders} open orders. Release or archive them first.</p>}
        <ActionForm action={archiveClientAction} submit="Archive client" pendingLabel="Archiving…" disabled={client.openOrders > 0} secondary className={styles.form}>
          <input type="hidden" name="clientId" value={client.id} /><label className="field"><span className="field-label">Reason for archiving</span><input name="reason" required /></label><DemoActor actors={permissions.demoActors} id="archive-actor" />
        </ActionForm>
      </section>}
    </div>
  </>;
}
