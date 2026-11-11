import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getEnvironment } from "@/lib/environment";
import { RESET_SENT } from "@/lib/password-reset";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forgot password" };

// Public, no session (decision 4): GoTrue emails a one-hour, single-use link to /reset-password.
export default function ForgotPasswordPage() {
  const { mock } = getEnvironment();
  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span></Link></header>
    <main className="auth-page"><section className="auth-card" aria-labelledby="forgot-title">
      <div className="eyebrow">Lipidomics service</div>{mock && <span className="example-label">Example data</span>}
      <ForgotForm sentMessage={RESET_SENT} />
    </section></main>
  </>;
}
