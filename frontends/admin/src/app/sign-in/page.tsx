import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getEnvironment } from "@/lib/environment";
import { SignInForm } from "@/components/sign-in-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { mock } = getEnvironment();
  const { error, next } = await searchParams;
  const invitation = typeof next === "string" && /^\/invite\/[0-9a-f]{64}$/.test(next) ? next : undefined;
  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span></Link></header>
    <main className="auth-page"><section className="auth-card" aria-labelledby="sign-in-title">
      <div className="eyebrow">Lab administration</div>{mock && <span className="example-label">Example data</span>}
      <h1 id="sign-in-title">Welcome back.</h1><p className="muted">Sign in to your lab workspace.</p>
      {error === "sign-out" && <p className="error" role="alert">Sign-out could not be completed. Your session may still be active; return to the workspace and try again.</p>}
      {invitation && <p className="notice">Sign in with the invited email address; you will return to the invitation to accept it.</p>}
      <SignInForm mock={mock} next={invitation} />
      <hr className="auth-divider" />
      <p className="sso-note auth-switch">New to the lipidomics service? <Link href="/request-access">Request access →</Link></p>
    </section></main>
  </>;
}
