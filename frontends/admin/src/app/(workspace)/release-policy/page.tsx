import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getReleasePolicy } from "@/lib/data/release";
import { formatLabInstant } from "@/lib/lab-time";
import { labRoleLabels } from "@/lib/release";
import { requireWorkspace } from "@/lib/session";
import { PolicyForm } from "./policy-form";

export const metadata: Metadata = { title: "Release policy" };

// Who may sign a release and how many signatures it needs. The lab Owner edits; everyone else reads.
export default async function ReleasePolicyPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireWorkspace("staff");
  const { saved } = await searchParams;
  const { policy, staff, canEdit, demoActors } = await getReleasePolicy();
  const name = (userId: string) => staff.find(person => person.userId === userId);
  const setBy = policy.setBy ? name(policy.setBy)?.name ?? `${policy.setBy.slice(0, 8)}…` : null;
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / <Link href="/release">Release</Link> / Release policy</div>
        <h1>Release policy</h1>
        <p>Two signatures by different people are always required. The Owner chooses who may sign and how many signatures a release needs.</p>
      </div>
      <div className="heading-actions"><Link className="button secondary" href="/release">← Release</Link></div>
    </div>
    {saved && <p className="notice success" role="status"><strong>Release policy saved.</strong> It applies to every release from now on; earlier policies are kept in the history.<Link className="button" href="/release">Release →</Link></p>}
    <div className="detail-grid">
      <section className="panel" aria-labelledby="policy-title">
        <div className="eyebrow">Current policy</div>
        <h2 id="policy-title">{policy.requiredSignatures} signatures required</h2>
        <dl className="facts">
          <div className="fact-row"><dt>Eligible signers</dt><dd>{policy.eligibleSigners.length
            ? <ul className="checklist" style={{ margin: 0 }}>{policy.eligibleSigners.map(userId => { const person = name(userId); return <li key={userId} className="check-row" style={{ padding: "6px 0" }}><span className="check-status ok" aria-hidden="true">✓</span><span className="check-label">{person?.name ?? `${userId.slice(0, 8)}…`}</span><span className="check-word">{person ? labRoleLabels[person.role] : "not lab staff any more"}</span></li>; })}</ul>
            : "Any lab Owner or Admin"}</dd></div>
          <div className="fact-row"><dt>Set by</dt><dd>{setBy ? `${setBy}${policy.setAt ? ` · ${formatLabInstant(policy.setAt)}` : ""}` : "Default (never set in the app)"}</dd></div>
        </dl>
        {canEdit
          ? <PolicyForm policy={policy} staff={staff} demoActors={demoActors} />
          : <p className="notice">Only the lab Owner changes the release policy. You can read it here; ask the Owner for a change.</p>}
      </section>
      <section className="panel" aria-labelledby="staff-title">
        <div className="eyebrow">Lab staff</div>
        <h2 id="staff-title">Who can be a signer</h2>
        <p className="muted">Lab Owners, Admins and Operators may be listed. A person who leaves the lab stops counting even if listed; their earlier signatures stay as evidence.</p>
        <ul className="order-list compact" aria-label="Lab staff">{staff.map(person => <li key={person.userId}><span className="order-choice"><span className="order-code">{labRoleLabels[person.role]}</span>{person.name}</span></li>)}</ul>
      </section>
    </div>
  </>;
}
