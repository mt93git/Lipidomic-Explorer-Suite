import type { Metadata } from "next";
import Link from "@/components/app-link";
import { listAccessRequests } from "@/lib/data/access-requests";
import { listPeople } from "@/lib/data/people";
import { formatLabInstant } from "@/lib/lab-time";
import type { Person } from "@/lib/people";
import type { LabPerson } from "@/lib/release";
import { clientRoleNames, clientRoles, labRoleNames, labRoles, type ClientRoleKey, type LabRoleKey } from "@/lib/roles";
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
const roleName = (person: Person) => person.kind === "lab_staff" ? `Lab ${labRoleNames[person.role as LabRoleKey] ?? person.role}` : clientRoleNames[person.role as ClientRoleKey] ?? person.role;

// Whether the person has signed in to Admin (activation.ts); a lab Owner or Admin may email one who has not.
function Account({ person, canSend, actors }: { person: Person; canSend: boolean; actors: LabPerson[] | null }) {
  const state = person.activation;
  if (!state) return <>Not readable</>;
  if (state.active) return <span className="pill ok">Active</span>;
  return <div className={styles.account}>
    <span className="pill pending">Not activated yet</span>
    {state.lastSentAt && <small className="muted">Activation email sent {formatLabInstant(state.lastSentAt)}</small>}
    {canSend && <ActivationForm kind={person.kind} id={person.id} name={person.name} resend={!!state.lastSentAt} actors={actors} />}
  </div>;
}

function Change({ person, actors }: { person: Person; actors: LabPerson[] | null }) {
  const lab = person.kind === "lab_staff";
  const options = lab ? labRoles.map(role => [role, `Lab ${labRoleNames[role]}`]) : clientRoles.map(role => [role, clientRoleNames[role]]);
  const hidden = <><input type="hidden" name="kind" value={person.kind} /><input type="hidden" name="id" value={person.id} /><input type="hidden" name="userId" value={person.userId} /></>;
  const hint = lab ? "Lab staff are managed by the demo Owner." : "Client members are managed by an Owner or Admin.";
  return <details className={styles.change}><summary>Change<span className="sr-only"> {person.name}</span></summary>
    <ActionForm action={setRoleAction} submit="Save role" pendingLabel="Saving…">{hidden}
      <label className="field"><span className="field-label">Role</span><select name="role" defaultValue={person.role}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <DemoActor actors={actors} id={`role-actor-${person.id}`} hint={hint} />
    </ActionForm>
    <ActionForm action={archiveMemberAction} submit="Archive membership" pendingLabel="Archiving…" secondary>{hidden}
      <label className="field"><span className="field-label">Reason</span><input name="reason" required /></label>
      <DemoActor actors={actors} id={`archive-actor-${person.id}`} hint={hint} />
    </ActionForm>
  </details>;
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ done?: string; client?: string }> }) {
  await requireWorkspace("staff");
  const [view, access, query] = await Promise.all([listPeople(), listAccessRequests(), searchParams]);
  const canChange = (person: Person) => person.kind === "lab_staff" ? view.canInviteLab : view.canInviteClient;
  return <>
    <div className="page-heading"><div><div className="eyebrow">Organization</div><h1>People</h1>
      <p>Lab staff and client members, their roles, access requests and pending invitations. Invitations and activation emails are sent from {"“"}Lipidomics · Libreros Lab{"”"}; an invitation{"’"}s link is also shown once to copy.</p></div>
      <div className="heading-actions"><Link className="button secondary" href="/roles-permissions">Roles &amp; permissions</Link></div>
    </div>
    {query.done && banners[query.done] && <p className="notice success" role="status">{banners[query.done]}</p>}
    <div className={styles.layout}>
      <div>
        {access.canAnswer && <div className={styles.sectionFirst}><AccessRequests requests={access.requests} clients={access.clients} actors={access.demoActors} /></div>}
        <section className="panel" aria-labelledby="people-title"><h2 id="people-title">People</h2>
          {view.people.length ? <div className={styles.scroll}><table className={styles.table} aria-label="People">
            <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Client</th><th scope="col">Account</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{view.people.map(person => <tr key={`${person.kind}-${person.id}`}>
              <td>{person.name}{person.email && person.email !== person.name && <span className={styles.email}>{person.email}</span>}</td>
              <td>{roleName(person)}</td><td>{person.clientName ?? "Lab"}</td>
              <td><Account person={person} canSend={view.canInviteClient} actors={view.demoActors} /></td>
              <td>{canChange(person) && <Change person={person} actors={view.demoActors} />}</td>
            </tr>)}</tbody>
          </table></div> : <p className="empty-state">No people yet.</p>}
        </section>
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
      </div>
      <section className="panel" aria-labelledby="invite-title"><h2 id="invite-title">Invite</h2>
        {view.canInviteClient ? <InviteForm clients={view.clients} canInviteLab={view.canInviteLab} actors={view.demoActors} defaultClientId={view.clients.some(item => item.id === query.client) ? query.client : undefined} />
          : <p className="notice">Only a lab Owner or Admin can invite people. Ask them for an invitation link.</p>}
      </section>
    </div>
  </>;
}
