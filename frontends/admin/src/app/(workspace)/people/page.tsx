import type { Metadata } from "next";
import Link from "@/components/app-link";
import { listAccessRequests } from "@/lib/data/access-requests";
import { listPeople } from "@/lib/data/people";
import { formatLabInstant } from "@/lib/lab-time";
import { initials } from "@/lib/initials";
import { groupPeople, INVITATION_DAYS, lastActive, projectRoles, type Person, type PersonRow } from "@/lib/people";
import type { LabPerson } from "@/lib/release";
import { clientRoleNames, clientRoles, labRoleNames, labRoles, type LabRoleKey } from "@/lib/roles";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../release/action-form";
import { AccessRequests } from "./access-requests";
import { archiveMemberAction, revokeAction, setRoleAction } from "./actions";
import { ActivationForm } from "./activation-form";
import { DemoActor } from "./demo-actor";
import { InviteForm } from "./invite-form";
import styles from "./people.module.css";

export const metadata: Metadata = { title: "People" };
const banners: Record<string, string> = { role: "Role changed.", archived: "Membership archived. The record is kept.", revoked: "Invitation revoked. Its link no longer works." };
// a19's Remind: for an account that has never signed in, a lab Owner or Admin resends the welcome (activation email,
// activation.ts) from the row. Who has signed in reads as Last active instead.
function Remind({ row, canSend, actors }: { row: PersonRow; canSend: boolean; actors: LabPerson[] | null }) {
  const state = row.account.activation;
  if (!state || state.active || !canSend) return null;
  return <div className={styles.account}>
    <ActivationForm kind={row.account.kind} id={row.account.id} name={row.name} resend={!!state.lastSentAt} actors={actors} remind />
    {state.lastSentAt && <small className="muted">Reminded {formatLabInstant(state.lastSentAt)}</small>}
  </div>;
}

// Change role or archive, one form pair per membership (a person may be lab staff and a member of several clients).
function Change({ memberships, actors }: { memberships: Person[]; actors: LabPerson[] | null }) {
  if (!memberships.length) return null;
  return <details className={styles.change}><summary>Change<span className="sr-only"> {memberships[0].name}</span></summary>
    {memberships.map(person => {
      const lab = person.kind === "lab_staff";
      const options = lab ? labRoles.map(role => [role, `Lab ${labRoleNames[role]}`]) : clientRoles.map(role => [role, clientRoleNames[role]]);
      const hidden = <><input type="hidden" name="kind" value={person.kind} /><input type="hidden" name="id" value={person.id} /><input type="hidden" name="userId" value={person.userId} /></>;
      const hint = lab ? "Lab staff are managed by the demo Owner." : "Client members are managed by an Owner or Admin.";
      return <div key={`${person.kind}-${person.id}`} className={styles.membership}>
        {memberships.length > 1 && <strong>{lab ? "Lab" : person.clientName ?? "Client"}</strong>}
        <ActionForm action={setRoleAction} submit="Save role" pendingLabel="Saving…">{hidden}
          <label className="field"><span className="field-label">Role</span><select name="role" defaultValue={person.role}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <DemoActor actors={actors} id={`role-actor-${person.id}`} hint={hint} />
        </ActionForm>
        <ActionForm action={archiveMemberAction} submit="Archive membership" pendingLabel="Archiving…" secondary>{hidden}
          <label className="field"><span className="field-label">Reason</span><input name="reason" required /></label>
          <DemoActor actors={actors} id={`archive-actor-${person.id}`} hint={hint} />
        </ActionForm>
      </div>;
    })}
  </details>;
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ done?: string; client?: string }> }) {
  await requireWorkspace("staff");
  const [view, access, query] = await Promise.all([listPeople(), listAccessRequests(), searchParams]);
  const canChange = (person: Person) => person.kind === "lab_staff" ? view.canInviteLab : view.canInviteClient;
  const rows = groupPeople(view.people);
  const now = new Date();
  return <>
    <div className="page-heading"><div><div className="eyebrow">Organization</div><h1>People</h1>
      <p>Lab staff and client users in one list. Invitations and activation emails are sent from {"“"}Lipidomics · Libreros Lab{"”"}.</p></div>
      <div className="heading-actions">
        <Link className="button secondary" href="/roles-permissions">Roles &amp; permissions</Link>
        {view.canInviteClient && <a className="button" href="#invite">Invite person</a>}
      </div>
    </div>
    {query.done && banners[query.done] && <p className="notice success" role="status">{banners[query.done]}</p>}
    <section className={`panel ${styles.tablePanel}`} aria-labelledby="people-title"><h2 id="people-title" className="sr-only">People</h2>
      {rows.length ? <div className={styles.scroll}><table className={styles.table} aria-label="People">
        <thead><tr><th scope="col">Person</th><th scope="col">Lab role</th><th scope="col">Clients and project roles</th><th scope="col">Last active</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map(row => {
          const scope = projectRoles(row);
          const account = row.account.activation;
          return <tr key={row.userId}>
            <td><div className={styles.person}>
              <span className={styles.avatar} aria-hidden="true">{initials(row.name)}</span>
              <span>{row.name}{row.email && row.email !== row.name && <span className={styles.email}>{row.email}</span>}</span>
            </div></td>
            <td>{row.lab ? <span className={`${styles.role} ${styles[row.lab.role] ?? ""}`}>{labRoleNames[row.lab.role as LabRoleKey] ?? row.lab.role}</span>
              : <span className={styles.role}>Client</span>}</td>
            <td>{scope.length ? scope.map(line => <span key={line} className={styles.scope}>{line}</span>) : <span className="muted">—</span>}</td>
            <td className={styles.lastActive}>{account
              ? <time dateTime={row.account.lastSignedInAt ?? undefined} title={row.account.lastSignedInAt ? formatLabInstant(row.account.lastSignedInAt) : "Has not signed in yet"}>{lastActive(row.account.lastSignedInAt, true, now)}</time>
              : <span title="Only a lab Owner or Admin can read when accounts were last active">{lastActive(null, false, now)}</span>}</td>
            <td className={styles.actions}>
              <Remind row={row} canSend={view.canInviteClient} actors={view.demoActors} />
              <Change memberships={[...(row.lab ? [row.lab] : []), ...row.clients].filter(canChange)} actors={view.demoActors} />
            </td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="empty-state">No people yet.</p>}
    </section>
    <section className={`panel ${styles.section}`} id="invite" aria-labelledby="invite-title"><h2 id="invite-title">Invite</h2>
      {view.canInviteClient ? <InviteForm clients={view.clients} canInviteLab={view.canInviteLab} actors={view.demoActors} defaultClientId={view.clients.some(item => item.id === query.client) ? query.client : undefined} days={INVITATION_DAYS} />
        : <p className="notice">Only a lab Owner or Admin can invite people. Ask them for an invitation link.</p>}
    </section>
    {access.canAnswer && <div className={styles.section}><AccessRequests requests={access.requests} clients={access.clients} actors={access.demoActors} /></div>}
    <section className={`panel ${styles.section}`} aria-labelledby="pending-title"><h2 id="pending-title">Pending invitations</h2>
      <p className="muted">A link is shown once, when it is created. If it was lost, revoke it and invite again.</p>
      {view.invitations.length ? <div className={styles.scroll}><table className={styles.table} aria-label="Pending invitations">
        <thead><tr><th scope="col">Email</th><th scope="col">Invited as</th><th scope="col">Expires</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{view.invitations.map(invitation => <tr key={invitation.id}>
          <td>{invitation.email}</td><td>{invitation.target}</td><td>{formatLabInstant(invitation.expiresAt)}</td>
          <td>{(invitation.labRole ? view.canInviteLab : view.canInviteClient) && <ActionForm action={revokeAction} submit="Revoke" pendingLabel="Revoking…" secondary>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <DemoActor actors={view.demoActors} id={`revoke-actor-${invitation.id}`} hint="Lab invitations need the demo Owner." />
          </ActionForm>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-state">No pending invitations.</p>}
    </section>
  </>;
}
