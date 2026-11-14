import type { Metadata } from "next";
import Link from "@/components/app-link";
import { clientPermissions } from "@/lib/data/clients";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../../release/action-form";
import { createClientAction } from "../actions";
import { ClientFields } from "../client-fields";
import styles from "../clients.module.css";

export const metadata: Metadata = { title: "New client" };
// Clients' New client button: the client's details; the database gives it its code (0037).
export default async function NewClientPage() {
  await requireWorkspace("staff");
  const permissions = await clientPermissions();
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Link href="/clients">Clients</Link> / New client</div><h1>New client</h1><p>A group or company that places orders. It gets its code when it is created; people are invited from its page.</p></div>
      <div className="heading-actions"><Link className="button secondary" href="/clients">Back to clients</Link></div></div>
    <section className={`panel ${styles.narrow}`} aria-labelledby="new-client"><h2 id="new-client">New client</h2>
      {permissions.canEdit ? <ActionForm action={createClientAction} submit="Create client" pendingLabel="Creating…" className={styles.form}><ClientFields actors={permissions.demoActors} /></ActionForm>
        : <p className="notice">Only a lab Owner or Admin can create clients.</p>}
    </section>
  </>;
}
