import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getEnvironment } from "@/lib/environment";
import { SignInForm } from "@/components/sign-in-form";
import { ACTIVATE_DONE, RESET_DONE } from "@/lib/password-reset";
import { nexoReturnPath, signInNext } from "@/lib/return-path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; reset?: string; activated?: string }> }) {
  const { mock } = getEnvironment();
  const { error, next, reset, activated } = await searchParams;
  const returnTo = signInNext(next);
  const nexo = nexoReturnPath(returnTo);
  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span></Link></header>
    <main className="auth-page"><section className="auth-card" aria-labelledby="sign-in-title">
      <div className="eyebrow">Lipidomics service</div>{mock && <span className="example-label">Example data</span>}
      <h1 id="sign-in-title">Welcome back.</h1><p className="muted">Sign in to follow your orders or to work in the lab.</p>
      {error === "sign-out" && <p className="error" role="alert">Sign-out could not be completed. Your session may still be active; return to the workspace and try again.</p>}
      {reset === "done" && <p className="notice success" role="status">{RESET_DONE}</p>}
      {activated === "done" && <p className="notice success" role="status">{ACTIVATE_DONE}</p>}
      {returnTo && !nexo && <p className="notice">Sign in with the invited email address; you will return to the invitation to accept it.</p>}
      {nexo && <p className="notice">Sign in with your lab account; you will return to Nexo.</p>}
      <SignInForm mock={mock} next={returnTo} />
      <hr className="auth-divider" />
      <p className="sso-note auth-switch">New to the lipidomics service? <Link href="/request-access">Request access →</Link></p>
    </section></main>
  </>;
}
