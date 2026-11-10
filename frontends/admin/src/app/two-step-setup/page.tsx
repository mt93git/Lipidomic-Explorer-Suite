import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/components/app-link";
import { signOut } from "@/app/actions";
import { needsTwoStepEnrollment } from "@/lib/session";
import { TwoStepSetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up two-step sign-in", robots: { index: false, follow: false } };

// Where the session gate sends a lab-role account with no app authenticator (lib/session.ts). Nothing else in the
// workspace opens for it until the code is verified. Any other visitor goes back to the start.
export default async function TwoStepSetupPage() {
  if (!await needsTwoStepEnrollment()) redirect("/");
  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span></Link></header>
    <main className="auth-page"><section className="auth-card" aria-labelledby="two-step-title">
      <div className="eyebrow">Two-step sign-in</div>
      <h1 id="two-step-title">Set up two-step sign-in.</h1>
      <p className="muted">Lab accounts need an authenticator app (for example Google Authenticator or 1Password). Show your QR code, scan it with the app, then enter the six-digit code it shows. You will need a new code each time you sign in.</p>
      <TwoStepSetupForm />
      <hr className="auth-divider" />
      <form action={signOut}><button className="button secondary">Sign out</button></form>
    </section></main>
  </>;
}
