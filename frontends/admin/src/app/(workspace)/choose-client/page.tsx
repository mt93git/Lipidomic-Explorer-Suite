import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { chooseClient } from "@/app/actions";

export const metadata: Metadata = { title: "Choose client" };

export default async function ChooseClientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  // Lab staff never choose a client: their home is the all-clients overview.
  if (session.view === "staff") redirect("/pipeline");
  if (session.clients.length === 1) redirect("/client/home");
  const { error } = await searchParams;
  return <>
    <div className="page-heading"><div><div className="eyebrow">Your clients</div><h1>Choose client</h1><p>Choose which client&apos;s orders to see.</p></div></div>
    {error === "membership" && <p className="error" role="alert">Choose one of your available client memberships.</p>}
    {session.clients.length === 0 ? <p className="empty-state">No client memberships are assigned. Ask an administrator to add your client access.</p> : <div className="client-choices">
      {session.clients.map(client => <form key={client.id} action={chooseClient}>
        <input type="hidden" name="clientId" value={client.id} />
        <button className="client-choice"><span className="color-square" data-color={client.color} aria-hidden="true" /><strong>{client.name}</strong><small>{client.role ?? "Viewer"} · {session.selectedClient?.id === client.id ? "Selected" : "Open →"}</small></button>
      </form>)}
    </div>}
  </>;
}
