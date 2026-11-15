import type { Metadata } from "next";
import Link from "@/components/app-link";
import { Companion } from "@/components/companion/Companion";
import { publicClientContact } from "@/lib/data/order-requests";
import { getEnvironment } from "@/lib/environment";
import { RequestAccessForm } from "./request-access-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request access" };

// Public, no session: a person without an account asks the lab for one. Nothing is created but the request; the lab
// approves it in People, which makes the existing 7-day invitation link. The lab's contact for clients (0023) is read
// with the anon key: the text only.
export default async function RequestAccessPage() {
  const { mock } = getEnvironment();
  const contact = await publicClientContact();
  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span></Link></header>
    <main className="auth-page"><Companion screen="request-access" /><section className="auth-card wide" aria-labelledby="access-title">
      <div className="eyebrow">Lipidomics service</div>{mock && <span className="example-label">Example data</span>}
      <RequestAccessForm contact={contact} />
    </section></main>
  </>;
}
