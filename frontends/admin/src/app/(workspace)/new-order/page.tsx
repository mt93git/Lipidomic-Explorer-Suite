import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getOpenDraft, listOpenDrafts, listWizardPanels } from "@/lib/data/order-drafts";
import { listClients } from "@/lib/data/orders";
import { emptyWizard, wizardSteps } from "@/lib/order-wizard";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../release/action-form";
import { discardDraftAction } from "./actions";
import styles from "./new-order.module.css";
import { OrderWizard } from "./order-wizard";

export const metadata: Metadata = { title: "New order" };

const savedAt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// New order as a four-step wizard (Client, Service, Sample list, Review & quote) with the estimate from the lab's rate
// sheet. ?draft=<id> resumes a saved draft; ?created=ORD055 after placing shows the code with the next steps, above a
// fresh wizard for another order; ?discarded=1 after discarding a draft; ?client=<id> starts with that client chosen
// (Client detail's New order).
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ created?: string; draft?: string; discarded?: string; client?: string }> }) {
  const session = await requireWorkspace("staff");
  const query = await searchParams;
  const code = query.created && /^ORD\d{3,}$/.test(query.created) ? query.created : null;
  const [clients, panels, drafts, resumed] = await Promise.all([
    listClients(), listWizardPanels(), listOpenDrafts(), query.draft ? getOpenDraft(query.draft) : Promise.resolve(null),
  ]);
  const clientName = (id: string | null) => clients.find(client => client.id === id)?.name ?? null;
  const others = drafts.filter(draft => draft.id !== resumed?.id);

  const notices = <>
    {code && <p className="notice success" role="status">
      <strong>Order <span className="mono">{code}</span> placed.</strong> It is at Request, waiting for its shipment.
      <Link className="button" href={`/receive-shipment?order=${code}`}>Receive shipment →</Link>
      <Link className="button secondary" href={`/orders/${code}`}>Open order →</Link>
    </p>}
    {query.discarded && <p className="notice success" role="status">Draft discarded.</p>}
    {query.draft && !resumed && <p className="notice warning" role="status">That draft is no longer open: it was placed or discarded. Start a new order or resume another draft below.</p>}
    {resumed && <p className="notice" role="status">Resuming a saved draft{drafts.find(draft => draft.id === resumed.id) ? `, last saved by ${drafts.find(draft => draft.id === resumed.id)!.updatedBy}` : ""}. Save draft keeps your changes; Place order on the last step creates the order.</p>}
  </>;

  if (!clients.length || !panels.length) return <>
    <div className="page-heading"><div><h1>New order</h1><p>Orders can be placed by lab staff or by the client&apos;s Requester.</p></div></div>
    {notices}
    <p className="empty-state">{clients.length ? "No active panel exists yet." : "No active client exists yet."} An order needs both.</p>
  </>;

  return <>
    <OrderWizard key={code ?? "wizard"} clients={clients} panels={panels} placedBy={session.displayName}
      initial={resumed ? { draftId: resumed.id, step: resumed.step, data: resumed.data } : { draftId: null, step: 1, data: { ...emptyWizard(), clientId: !code && clients.some(item => item.id === query.client) ? query.client! : "" } }}>
      {notices}
    </OrderWizard>
    {others.length > 0 && <section className={`${styles.card} ${styles.drafts}`} aria-labelledby="drafts-title">
      <h2 id="drafts-title" className={styles.cardHead}>Saved drafts</h2>
      <ul className={styles.draftList}>
        {others.map(draft => <li key={draft.id}>
          <div>
            <strong>{draft.title ?? "Untitled order"}</strong>
            <span className="muted"> · {clientName(draft.clientId) ?? "No client yet"} · step {draft.step} of 4, {wizardSteps[draft.step - 1].label}</span>
            <small className="muted">Saved by {draft.updatedBy}, {savedAt.format(new Date(draft.updatedAt))}</small>
          </div>
          <div className={styles.draftActions}>
            <Link className="button secondary" href={`/new-order?draft=${encodeURIComponent(draft.id)}`}>Resume</Link>
            <ActionForm action={discardDraftAction} submit="Discard" pendingLabel="Discarding…" secondary className={styles.inlineForm}>
              <input type="hidden" name="id" value={draft.id} />
            </ActionForm>
          </div>
        </li>)}
      </ul>
    </section>}
  </>;
}
