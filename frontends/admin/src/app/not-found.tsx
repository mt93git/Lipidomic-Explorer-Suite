import Link from "@/components/app-link";
import { getAppSession } from "@/lib/session";

// A client (an order of another client, or a mistyped link) reads the portal's words; lab staff and visitors the lab's.
export default async function NotFound() {
  const session = await getAppSession().catch(() => null);
  const client = session?.view === "client";
  return <div className="auth-page"><section className="auth-card">
    <div className="eyebrow">{client ? "Lipidomics service" : "Lipidomic Explorer Admin"}</div><h1>Page not found</h1>
    <p className="muted">{client ? "This order is not available to you." : "This route or example order is not available."}</p>
    <Link className="button" href={client ? "/client/home" : "/"}>{client ? "Back to your orders" : "Back to workspace"}</Link>
  </section></div>;
}
