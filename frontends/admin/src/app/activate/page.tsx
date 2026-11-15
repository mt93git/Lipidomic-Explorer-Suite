import type { Metadata } from "next";
import Link from "@/components/app-link";
import { Companion } from "@/components/companion/Companion";
import { getEnvironment } from "@/lib/environment";
import { isTokenHash } from "@/lib/password-reset";
import { MIN_PASSWORD } from "@/lib/people";
import { ExpiredLink, ResetForm } from "../reset-password/reset-form";

export const dynamic = "force-dynamic";
// The token is in the URL: keep it out of search indexes and out of Referer headers.
export const metadata: Metadata = { title: "Welcome to Lipidomics · Choose your password", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public, the activation email's link (activation.ts): /activate?token_hash=…&type=recovery. The Reset password page's
// mechanism and code (a GoTrue recovery token, spent only when the form is sent), with welcome words.
export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }> }) {
  const { mock } = getEnvironment();
  const { token_hash: tokenHash, type } = await searchParams;
  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span></Link></header>
    <main className="auth-page"><Companion screen="activate" /><section className="auth-card" aria-labelledby="reset-title">
      <div className="eyebrow">Lipidomics service</div>{mock && <span className="example-label">Example data</span>}
      {type === "recovery" && isTokenHash(tokenHash) ? <ResetForm tokenHash={tokenHash} minPassword={MIN_PASSWORD} purpose="activate" /> : <ExpiredLink purpose="activate" />}
    </section></main>
  </>;
}
