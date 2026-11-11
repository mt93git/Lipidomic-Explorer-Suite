"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/error-summary";
import { approvalMessage, clientKindNames, clientKinds, declineMessage, defaultRoleFor, type AccessRequest } from "@/lib/access-requests";
import { formatLabInstant } from "@/lib/lab-time";
import type { LabPerson } from "@/lib/release";
import { clientRoleNames, clientRoles, type ClientRoleKey } from "@/lib/roles";
import { answerAccessAction, type AccessAnswerState } from "./actions";
import { DemoActor } from "./demo-actor";
import styles from "./people.module.css";

type Client = { id: string; name: string };
const answerHint = "Answering needs the demo Owner or an Admin.";

// People asked for access on the public form. The lab approves into an existing or a new client with the role it
// picks (approving creates the 7-day invitation link, shown here once) or declines with an internal reason. One
// action state for the section: the link stays on screen after the request leaves the list. An approval's invitation
// emails itself (activation.ts); Copy message gives the lab a ready text to send if it did not (the link, 7 days, single
// use), or the answer to a declined request, which the app does not send.
export function AccessRequests({ requests, clients, actors }: { requests: AccessRequest[]; clients: Client[]; actors: LabPerson[] | null }) {
  const [state, action, pending] = useActionState<AccessAnswerState, FormData>(answerAccessAction, {});
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const waiting = requests.filter(item => item.status === "pending");
  const answered = requests.find(item => item.id === state.requestId);
  const link = state.link ? new URL(state.link, window.location.origin).toString() : null;
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }
  return <section className="panel" aria-labelledby="access-title">
    <div className="panel-heading"><h2 id="access-title">Access requests</h2>{waiting.length > 0 && <span className="pill pending">{waiting.length} waiting</span>}</div>
    <p className="muted">People who asked for access from the public form. Approving creates an invitation link and emails it to them.</p>
    {link && <div className="notice success" role="status">
      <strong>Invitation link for {answered?.email ?? "the person"}{answered ? ` (${answered.reference})` : ""}.</strong> {state.emailNote} {state.emailed
        ? "The link below is a copy in case the email does not arrive"
        : "Copy it now and send it yourself"}; it works once, for 7 days, and is not shown again. It is listed under Pending invitations.
      <div className={styles.link}>
        <label className="field-label" htmlFor="access-link">Invitation link</label>
        <input id="access-link" readOnly value={link} onFocus={event => event.currentTarget.select()} />
        <button type="button" className="button secondary" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        <CopyButton key={link} label="Copy message" text={approvalMessage({ fullName: answered?.fullName, reference: answered?.reference, link })} />
      </div>
    </div>}
    {state.declined && <div className="notice success" role="status">
      Request {answered?.reference ?? ""}{answered?.email ? ` from ${answered.fullName ? `${answered.fullName}, ` : ""}${answered.email}` : ""} declined. The app does not tell the requester: write to them yourself if you want to. Its personal data is erased after 90 days.
      <div className={styles.copy}><CopyButton key={state.requestId} label="Copy message" text={declineMessage({ fullName: answered?.fullName, reference: answered?.reference })} /></div>
    </div>}
    {waiting.length ? <div className={styles.scroll}><table className={styles.table} aria-label="Access requests">
      <thead><tr><th scope="col">Person</th><th scope="col">Organisation</th><th scope="col">Asked for</th><th scope="col">Received</th><th scope="col"><span className="sr-only">Review</span></th></tr></thead>
      <tbody>{waiting.flatMap(request => {
        const expanded = open === request.id;
        const match = clients.find(client => client.id === request.matchingClientId);
        return [
          <tr key={request.id} className={expanded ? styles.reviewing : undefined}>
            <td>{request.fullName}<span className={styles.email}>{request.email}</span></td>
            <td>{request.organisation}<span className={styles.email}>{clientKindNames[request.kind].toLowerCase()} · {match ? "matches a client" : "not a client yet"}</span></td>
            <td>{request.message ?? <span className="muted">Nothing written</span>}</td>
            <td>{formatLabInstant(request.createdAt)}<span className={styles.email}>{request.reference}</span></td>
            <td><button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={`review-${request.id}`} onClick={() => { setOpen(expanded ? null : request.id); setCopied(false); }}>
              {expanded ? "Reviewing" : "Review"}<span className="sr-only"> {request.fullName}</span> <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
            </button></td>
          </tr>,
          expanded && <tr key={`${request.id}-review`} className={styles.reviewing}><td colSpan={5} id={`review-${request.id}`}>
            <Review request={request} clients={clients} actors={actors} action={action} pending={pending} error={state.requestId === request.id ? state.error : undefined} />
          </td></tr>,
        ];
      })}</tbody>
    </table></div> : <p className="empty-state">No access requests are waiting.</p>}
  </section>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }
  return <button type="button" className="button secondary" onClick={copy}>{copied ? "Copied" : label}</button>;
}

function Review({ request, clients, actors, action, pending, error }: {
  request: AccessRequest; clients: Client[]; actors: LabPerson[] | null; action: (form: FormData) => void; pending: boolean; error?: string;
}) {
  const [target, setTarget] = useState<"existing" | "new">(request.matchingClientId || !request.organisation ? "existing" : "new");
  const [role, setRole] = useState<ClientRoleKey>(defaultRoleFor(target));
  const [roleChosen, setRoleChosen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const choose = (next: "existing" | "new") => { setTarget(next); if (!roleChosen) setRole(defaultRoleFor(next)); };
  const id = (name: string) => `${name}-${request.id}`;
  return <div className={styles.review}>
    {error && <FormAlert>{error}</FormAlert>}
    <form action={action} aria-label={`Approve ${request.fullName}`}>
      <input type="hidden" name="intent" value="approve" /><input type="hidden" name="requestId" value={request.id} />
      <fieldset className="radio-group"><legend className="field-label">Add to</legend>
        <div className="radio-options">
          <label className="radio"><input type="radio" name="target" value="existing" checked={target === "existing"} onChange={() => choose("existing")} disabled={!clients.length} />
            <span><strong>An existing client</strong><small className="muted">Choose from the list</small></span></label>
          <label className="radio"><input type="radio" name="target" value="new" checked={target === "new"} onChange={() => choose("new")} />
            <span><strong>A new client</strong><small className="muted">Created when you approve</small></span></label>
        </div>
      </fieldset>
      <div className={styles.reviewFields}>
        {target === "existing" ? <div className="field"><label className="field-label" htmlFor={id("client")}>Client</label>
          <select id={id("client")} name="clientId" defaultValue={request.matchingClientId ?? clients[0]?.id}>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
        </div> : <>
          <div className="field"><label className="field-label" htmlFor={id("name")}>Client name</label><input id={id("name")} name="newClientName" defaultValue={request.organisation ?? ""} required maxLength={200} /></div>
          <div className="field"><label className="field-label" htmlFor={id("kind")}>Kind</label>
            <select id={id("kind")} name="newClientKind" defaultValue={request.kind}>{clientKinds.map(kind => <option key={kind} value={kind}>{clientKindNames[kind]}</option>)}</select></div>
        </>}
        <div className="field"><label className="field-label" htmlFor={id("role")}>Role</label>
          <select id={id("role")} name="role" value={role} onChange={event => { setRole(event.target.value as ClientRoleKey); setRoleChosen(true); }}>
            {clientRoles.map(item => <option key={item} value={item}>{clientRoleNames[item]}</option>)}
          </select></div>
      </div>
      <DemoActor actors={actors} id={id("approve-actor")} hint={answerHint} />
      <div className="form-actions">
        <button className="button" disabled={pending}>{pending ? "Approving…" : "Approve and create invitation link"}</button>
        <button type="button" className="button secondary" aria-expanded={declining} aria-controls={id("decline")} onClick={() => setDeclining(!declining)}>Decline…</button>
      </div>
      <p className="muted"><small>A 7-day, single-use link for {request.email}.</small></p>
    </form>
    {declining && <form action={action} id={id("decline")} className={styles.decline} aria-label={`Decline ${request.fullName}`}>
      <input type="hidden" name="intent" value="decline" /><input type="hidden" name="requestId" value={request.id} />
      <div className="field"><label className="field-label" htmlFor={id("reason")}>Reason</label>
        <textarea id={id("reason")} name="reason" rows={2} maxLength={500} required aria-describedby={id("reason-hint")} />
        <small id={id("reason-hint")} className="field-hint">Only the lab reads it. The app tells the requester nothing; write to them yourself if you want to.</small></div>
      <DemoActor actors={actors} id={id("decline-actor")} hint={answerHint} />
      <button className="button secondary" disabled={pending}>{pending ? "Declining…" : "Decline request"}</button>
    </form>}
  </div>;
}
