import { ActionForm } from "@/app/(workspace)/release/action-form";
import { retireDeliverableAction, setDeliverableVisibilityAction } from "@/app/(workspace)/orders/[code]/actions";
import { clientDay } from "@/lib/client-portal";
import {
  clientMaySee, deliverableAccept, deliverableKinds, formatSize, typeLabel, uploadNotices, type ClientDeliverable, type Deliverable,
} from "@/lib/deliverables";
import { formatLabInstant } from "@/lib/lab-time";
import styles from "./deliverables.module.css";

// The Next.js basePath: a plain form action or download link is not rewritten by the router.
const BASE = "/admin";
export const downloadHref = (id: string) => `${BASE}/deliverables/${encodeURIComponent(id)}`;

function Notice({ notice }: { notice?: string }) {
  const known = notice ? uploadNotices[notice] : undefined;
  return known ? <p className={`notice ${known.tone}`} role={known.tone === "error" ? "alert" : "status"}>{known.text}</p> : null;
}

// The lab's Deliverables section on an order: add a file (hidden from the client unless ticked), show or hide it,
// retire it with a reason. Files are added only to an accepted, open order; the list stays readable afterwards and
// comes before the form. released: a released order whose client sees no file yet says so.
type LabProps = { code: string; items: Deliverable[]; dataset: { id: string; version: number } | null; open: boolean; notice?: string; example: boolean; released?: boolean };
export function LabDeliverables({ code, items, dataset, open, notice, example, released = false }: LabProps) {
  return <section className={`panel ${styles.section}`} id="deliverables" aria-labelledby="deliverables-title">
    <div className="eyebrow">For the client</div>
    <h2 id="deliverables-title">Deliverables</h2>
    <p className="muted">Reports, figures and tables the client downloads from their order. A new file stays hidden until you show it.{dataset ? ` Files added now belong to dataset v${dataset.version}.` : ""}</p>
    <Notice notice={notice} />
    {released && !items.some(clientMaySee) && <p className="notice">The client sees no files for this order yet.</p>}
    {items.length ? <ul className={styles.list} aria-label="Deliverables">{items.map(item => <li className={styles.item} key={item.id} data-retired={Boolean(item.retiredAt)}>
      <div>
        <span className={styles.name}>{item.title}
          <span className={styles.state} data-state={item.retiredAt ? "retired" : item.visibleToClient ? "visible" : "hidden"}>{item.retiredAt ? "Retired" : item.visibleToClient ? "Client sees it" : "Hidden"}</span></span>
        <span className={styles.meta}>{deliverableKinds[item.kind]} · {typeLabel(item.contentType)} · {formatSize(item.sizeBytes)} · <span className="mono">{item.fileName}</span>{item.datasetVersion ? ` · dataset v${item.datasetVersion}` : ""} · added {formatLabInstant(item.addedAt)}</span>
        {item.retiredAt && <span className={styles.meta}>Retired {formatLabInstant(item.retiredAt)}: {item.retiredReason}</span>}
      </div>
      <div className={styles.actions}>
        <a className="button secondary" href={downloadHref(item.id)} download aria-label={`Download ${item.title}`}>Download</a>
        {!item.retiredAt && <>
          <ActionForm action={setDeliverableVisibilityAction} submit={item.visibleToClient ? "Hide from client" : "Show to client"} pendingLabel="Saving…" secondary={item.visibleToClient}>
            <input type="hidden" name="code" value={code} /><input type="hidden" name="deliverableId" value={item.id} /><input type="hidden" name="visible" value={String(!item.visibleToClient)} />
          </ActionForm>
          <ActionForm action={retireDeliverableAction} submit="Retire" pendingLabel="Retiring…" secondary>
            <input type="hidden" name="code" value={code} /><input type="hidden" name="deliverableId" value={item.id} />
            <input name="reason" required maxLength={500} aria-label={`Reason for retiring ${item.title}`} placeholder="Reason for retiring" />
          </ActionForm>
        </>}
      </div>
    </li>)}</ul> : <p className="empty-state">No files for this order yet.</p>}
    {open && <form className={styles.upload} method="post" action={`${BASE}/orders/${encodeURIComponent(code)}/deliverables`} encType="multipart/form-data" aria-label="Add a deliverable">
      <label className="field"><span className="field-label">Title</span><input name="title" required maxLength={200} placeholder="e.g. Study report" /></label>
      <div className="field"><label className="field-label" htmlFor="deliverable-kind">Kind</label>
        <select id="deliverable-kind" name="kind" defaultValue="report">{Object.entries(deliverableKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className={`field ${styles.wide}`}><label className="field-label" htmlFor="deliverable-file">File</label>
        <input id="deliverable-file" type="file" name="file" required accept={deliverableAccept} />
        <small>PDF, PNG, JPEG, SVG, XLSX or CSV, {example ? "5 MB at most in the demo" : "50 MB at most"}.</small></div>
      <label className={`${styles.check} ${styles.wide}`}><input type="checkbox" name="visible" /> Show to the client now</label>
      <div className={styles.wide}><button className="button">Add file</button></div>
    </form>}
    {!open && <p className="notice">Files can be added once the order is accepted, and not to an archived order.</p>}
  </section>;
}

// The client's files for an order: download only (the route serves each as an attachment).
export function ClientDeliverables({ items }: { items: ClientDeliverable[] }) {
  return <section className={`panel ${styles.section}`} aria-labelledby="files-title">
    <div className="eyebrow">From the lab</div>
    <h2 id="files-title">Your files</h2>
    {items.length ? <ul className={styles.list} aria-label="Your files">{items.map(item => <li className={styles.item} key={item.id}>
      <div><span className={styles.name}>{item.title}</span>
        <span className={styles.meta}>{deliverableKinds[item.kind]} · {typeLabel(item.contentType)} · {formatSize(item.sizeBytes)} · shared {clientDay(item.addedAt, true)}</span></div>
      <div className={styles.actions}><a className="button" href={downloadHref(item.id)} download aria-label={`Download ${item.title}`}>Download</a></div>
    </li>)}</ul> : <p className="muted">The lab has not shared any files for this order yet.</p>}
  </section>;
}
