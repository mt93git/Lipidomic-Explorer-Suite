import type { Metadata } from "next";
import Link from "@/components/app-link";
import { DataError, previewInvitation, signedInEmail } from "@/lib/data/people";
import { getEnvironment } from "@/lib/environment";
import { formatLabInstant } from "@/lib/lab-time";
import { invitePath, MIN_PASSWORD } from "@/lib/people";
import { invitationReturn, nexoReturnPath, signInHref } from "@/lib/return-path";
import { AcceptForm, AcceptMineForm } from "./accept-form";

export const dynamic = "force-dynamic";
// The token is in the URL: keep it out of search indexes and out of Referer headers.
export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public: anyone with the link sees who is invited for what. A new person sets a password to join; an email that
// already has an account (including one left behind by a failed join) signs in and accepts without a password.
// next= a Nexo path: once accepted, the person continues there (through sign in when needed).
export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ next?: string | string[] }> }) {
  const { token } = await params;
  const next = nexoReturnPath((await searchParams).next);
  const { mock } = getEnvironment();
  let invitation: Awaited<ReturnType<typeof previewInvitation>> = null;
  let problem: string | null = null;
  try { invitation = await previewInvitation(token); } catch (error) {
    if (!(error instanceof DataError)) throw error;
    problem = error.message;
  }
  const signedIn = invitation?.hasAccount ? await signedInEmail() : null;
  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span></Link></header>
    <main className="auth-page"><section className="auth-card" aria-labelledby="invite-title">
      <div className="eyebrow">Invitation</div>{mock && <span className="example-label">Example data</span>}
      {invitation ? <>
        <h1 id="invite-title">Join as {invitation.target}.</h1>
        {!invitation.hasAccount ? <>
          <p className="muted">This invitation is for <strong>{invitation.email}</strong> and expires {formatLabInstant(invitation.expiresAt)}. Choose a password to create your account.</p>
          <AcceptForm token={token} email={invitation.email} minPassword={MIN_PASSWORD} next={next} />
        </> : signedIn === invitation.email ? <>
          <p className="muted">This invitation is for your account, <strong>{invitation.email}</strong>, and expires {formatLabInstant(invitation.expiresAt)}.</p>
          <AcceptMineForm token={token} target={invitation.target} next={next} />
        </> : <>
          <p className="muted">This invitation is for <strong>{invitation.email}</strong>, which already has an account; it expires {formatLabInstant(invitation.expiresAt)}.
            {signedIn ? <> You are signed in as {signedIn}.</> : null} Sign in as {invitation.email} to accept; your password does not change.</p>
          <Link className="button" href={signInHref(invitationReturn(invitePath(token), next))}>Sign in to accept →</Link>
        </>}
      </> : <>
        <h1 id="invite-title">This invitation link is not valid.</h1>
        <p className="muted">{problem ?? "It may have expired, been used already, or been revoked. Ask the lab for a new link."}</p>
        <Link className="button secondary" href={signInHref(next)}>Sign in →</Link>
      </>}
    </section></main>
  </>;
}
