"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/error-summary";
import type { LabPerson } from "@/lib/release";
import { clientRoleNames, clientRoles, labRoleNames, labRoles } from "@/lib/roles";
import { inviteAction } from "./actions";
import { DemoActor } from "./demo-actor";
import styles from "./people.module.css";

// The Owner (lab roles) or an Admin (client roles) creates a 7-day link; the app server emails it to the person
// (activation.ts) and the link is shown here once as a fallback: only its digest is stored, so it cannot be shown again.
// defaultClientId: the client chosen before the form opens (Client detail's Invite user).
// days: INVITATION_DAYS from the server page (lib/people.ts imports node:crypto, which a client bundle must not pull in).
export function InviteForm({ clients, canInviteLab, actors, defaultClientId, days }: { clients: { id: string; name: string }[]; canInviteLab: boolean; actors: LabPerson[] | null; defaultClientId?: string; days: number }) {
  const [state, action, pending] = useActionState(inviteAction, {});
  const [target, setTarget] = useState("client:requester");
  const [copied, setCopied] = useState(false);
  const lab = target.startsWith("lab:");
  const link = state.link ? new URL(state.link, window.location.origin).toString() : null;
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }
  return <>
    {link && <div className="notice success" role="status">
      <strong>Invitation link for {state.email}.</strong> {state.emailNote} {state.emailed
        ? "The link below is a copy in case the email does not arrive; it works once, for 7 days, and is not shown again."
        : "Copy it now and send it yourself; it works once, for 7 days, and is not shown again."}
      <div className={styles.link}>
        <label className="field-label" htmlFor="invite-link">Invitation link</label>
        <input id="invite-link" readOnly value={link} onFocus={event => event.currentTarget.select()} />
        <button type="button" className="button secondary" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      </div>
    </div>}
    <form action={action} className={styles.inviteForm} aria-busy={pending} onSubmit={() => setCopied(false)}>
      <div className={styles.inviteFields}>
        <label className="field"><span className="field-label">Email</span><input name="email" type="email" autoComplete="off" placeholder="name@institution.edu" required /></label>
        <div className="field"><label className="field-label" htmlFor="invite-client">Client</label>
          {lab
            ? <select id="invite-client" disabled defaultValue=""><option value="">Lab (no client)</option></select>
            : <select id="invite-client" name="clientId" required defaultValue={defaultClientId}>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>}
        </div>
        <div className="field"><label className="field-label" htmlFor="invite-target">Role</label>
          <select id="invite-target" name="target" value={target} onChange={event => setTarget(event.target.value)}>
            <optgroup label="Client roles">{clientRoles.map(role => <option key={role} value={`client:${role}`}>{clientRoleNames[role]}</option>)}</optgroup>
            {canInviteLab && <optgroup label="Lab roles (Owner only)">{labRoles.map(role => <option key={role} value={`lab:${role}`}>Lab {labRoleNames[role]}</option>)}</optgroup>}
          </select>
        </div>
      </div>
      <DemoActor actors={actors} id="invite-actor" hint="Lab roles need the demo Owner; client roles an Owner or Admin." />
      <div className={styles.inviteSubmit}>
        <button className="button" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</button>
        <p className="muted">The invitation is valid for {days} days. It is emailed, and its link is shown here once to copy. Lab roles are given by the Owner only.</p>
      </div>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  </>;
}
