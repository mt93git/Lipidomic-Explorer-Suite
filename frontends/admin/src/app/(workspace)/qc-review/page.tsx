import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getQcOrder, listQcOrders } from "@/lib/data/qc-review";
import { formatLabInstant } from "@/lib/lab-time";
import { stages } from "@/lib/models";
import { PROCESSED, QC_REVIEWED, qcOpen, type QcOrder, type QcSample } from "@/lib/qc-review";
import { allows, labRoleKey } from "@/lib/roles";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../release/action-form";
import styles from "../release/release.module.css";
import { addExclusionAction, markQcReviewedAction, withdrawExclusionAction } from "./actions";
import qc from "./qc-review.module.css";

export const metadata: Metadata = { title: "QC review" };
type Query = { order?: string; excluded?: string; withdrawn?: string; reviewed?: string };

const stageIndex = (stage: number) => String(stage + 1).padStart(2, "0");
const StageTag = ({ stage }: { stage: number }) => <span className={styles.state} data-status="stage">{stageIndex(stage)} · {stages[stage] ?? "Released"}</span>;
const resultLine = (order: QcOrder) => !order.resultFile ? "None accepted"
  : `${order.resultFile.sha256 ? `SHA-256 ${order.resultFile.sha256.slice(0, 12)}…` : "Example file"}${order.resultFile.acceptedAt ? ` · ${formatLabInstant(order.resultFile.acceptedAt)}` : ""}`;

function OrderTable({ orders }: { orders: QcOrder[] }) {
  return <div className={qc.scroll}><table className={styles.orders} aria-label="Orders at Processed or QC reviewed">
    <thead><tr><th scope="col">Order</th><th scope="col">Client</th><th scope="col">Stage</th><th scope="col">Results file</th><th scope="col">Samples</th><th scope="col">Exclusions</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
    <tbody>{orders.map(order => <tr key={order.id}>
      <td><Link className="order-code" href={`/qc-review?order=${order.code}`}>{order.code}</Link><br /><small>{order.title}</small></td>
      <td><span className="client-name"><span className="color-square" data-color={order.clientId.replace(/^example-/, "")} aria-hidden="true" />{order.clientName}</span></td>
      <td><StageTag stage={order.stage} /></td>
      <td><small className="mono">{resultLine(order)}</small></td>
      <td>{order.sampleCount}</td>
      <td>{order.exclusionCount || <span className="muted">None</span>}</td>
      <td><Link className="button secondary" href={`/qc-review?order=${order.code}`} aria-label={`Open ${order.code}`}>Open →</Link></td>
    </tr>)}</tbody>
  </table></div>;
}

// One row per sample: included, or excluded with the recorded decision; a writer excludes or withdraws with a reason.
function SampleRow({ sample, orderCode, canWrite }: { sample: QcSample; orderCode: string; canWrite: boolean }) {
  const excluded = sample.exclusion;
  return <tr className={qc.row} data-excluded={excluded ? "true" : undefined}>
    <td className={`mono ${qc.code}`}>{sample.code}</td>
    <td className="mono">{sample.fullName}</td>
    <td>{excluded
      ? <><span className={qc.excluded}>Excluded</span> {excluded.reason}<br /><small className="muted">{excluded.decidedBy ?? "Lab staff"} · {formatLabInstant(excluded.decidedAt)}</small></>
      : <span className="muted">Included</span>}</td>
    {canWrite && <td className={qc.act}>{excluded
      ? <details className={qc.decide}><summary>Withdraw<span className="sr-only"> the exclusion of {sample.code}</span></summary>
        <ActionForm action={withdrawExclusionAction} submit="Withdraw exclusion" pendingLabel="Withdrawing…" secondary keepValues className={styles.form}>
          <input type="hidden" name="orderCode" value={orderCode} /><input type="hidden" name="exclusionId" value={excluded.id} />
          <label>Reason<input name="reason" required maxLength={500} placeholder="Why the sample is included again" /></label>
        </ActionForm></details>
      : <details className={qc.decide}><summary>Exclude<span className="sr-only"> {sample.code}</span></summary>
        <ActionForm action={addExclusionAction} submit="Exclude sample" pendingLabel="Excluding…" keepValues className={styles.form}>
          <input type="hidden" name="orderCode" value={orderCode} /><input type="hidden" name="sampleId" value={sample.id} />
          <label>Reason<input name="reason" required maxLength={500} placeholder="e.g. haemolysed, failed injection" /></label>
        </ActionForm></details>}</td>}
  </tr>;
}

// QC review: the lab records its decisions on an order whose results file was accepted. Exclusions are decisions only
// (the dataset keeps every sample's data and lists them in its processing record); "QC reviewed" is optional.
export default async function QcReviewPage({ searchParams }: { searchParams: Promise<Query> }) {
  const session = await requireWorkspace("staff");
  const query = await searchParams;
  const canWrite = allows("qc_review", labRoleKey(session.role));
  const detail = query.order ? await getQcOrder(query.order) : null;
  const orders = detail ? [] : await listQcOrders();
  const order = detail?.order;
  const open = !!order && qcOpen(order.stage);
  const excluded = detail?.samples.filter(sample => sample.exclusion).length ?? 0;
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / {order ? <><Link href="/qc-review">QC review</Link> / {order.code}</> : "QC review"}</div>
        <h1>QC review{order ? ` · ${order.code}` : ""}</h1>
        <p>Record the lab&apos;s decisions on a processed order: exclude samples with a reason, and optionally mark the order QC reviewed. Scientific QC happens in Nexo/R; building the dataset keeps every sample&apos;s data and lists the exclusions in its processing record.</p>
      </div>
      <div className="heading-actions">
        {order && <Link className="button secondary" href="/qc-review">← All orders</Link>}
        <Link className="button secondary" href="/release">Release</Link>
      </div>
    </div>

    {query.order && !detail && <p className="notice" role="status">No order {query.order} was found. Choose one below.</p>}
    {!canWrite && <p className="notice" role="status">You can read QC decisions; recording them needs a lab Owner, Admin or Operator.</p>}
    {order && query.excluded && <p className="notice success" role="status"><strong>Exclusion recorded.</strong> {order.code} now has {plural(excluded, "excluded sample")}; the data stays in the dataset.</p>}
    {order && query.withdrawn && <p className="notice success" role="status"><strong>Exclusion withdrawn.</strong> The decision stays in the audit log.</p>}
    {order && query.reviewed && <p className="notice success" role="status"><strong>{order.code} is QC reviewed.</strong> Build its dataset in Release.<Link className="button" href="/release">Release →</Link></p>}

    {!detail && <section className="panel" aria-labelledby="orders-title">
      <div className="eyebrow">Processed or QC reviewed</div>
      <h2 id="orders-title">Orders to review · {orders.length}</h2>
      {orders.length
        ? <OrderTable orders={orders} />
        : <p className="empty-state">No order is at Processed or QC reviewed. <Link href="/ingest-results">Accept a results file</Link> first.</p>}
    </section>}

    {detail && order && <>
      <section className="panel facts-strip" aria-label="Order facts">
        <p className="facts-line"><strong>{order.clientName}</strong> · {order.title}</p>
        <dl className="facts-inline">
          {[["Stage", `${stages[order.stage] ?? "Released"}`], ["Results file", resultLine(order)], ["Samples", String(order.sampleCount)], ["Excluded", String(order.exclusionCount)]]
            .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </section>
      {!open && <p className="notice">{order.code} is {stages[order.stage] ?? "Released"}; its QC decisions are closed. The dataset&apos;s processing record in <Link href="/release">Release</Link> lists the exclusions it was built with.</p>}

      <section className="panel" aria-labelledby="reviewed-title">
        <div className="eyebrow">Optional step</div>
        <h2 id="reviewed-title">QC reviewed</h2>
        {order.stage === PROCESSED
          ? <>
            <p className="muted">Marks that the lab reviewed QC for this order. Release builds the dataset from Processed too.</p>
            {canWrite && <details className={qc.decide}><summary className="button">Mark QC reviewed</summary>
              <p className={qc.confirm}>Move {order.code} from Processed to QC reviewed? A stage does not move back; exclusions can still change until the dataset is built.</p>
              <ActionForm action={markQcReviewedAction} submit="Yes, mark QC reviewed" pendingLabel="Marking…" className={styles.form}>
                <input type="hidden" name="orderCode" value={order.code} /><input type="hidden" name="orderId" value={order.id} />
              </ActionForm>
            </details>}
          </>
          : order.stage > PROCESSED
            ? <p className="muted">{order.stage === QC_REVIEWED
              ? `${order.code} is QC reviewed${detail.reviewed ? ` · ${formatLabInstant(detail.reviewed.at)}${detail.reviewed.by ? ` · ${detail.reviewed.by}` : ""}` : ""}.`
              : `${order.code} is ${stages[order.stage] ?? "Released"}; its dataset is built.`}</p>
            : <p className="muted">{order.code} has no accepted results file yet.</p>}
        <p><Link href="/release">Go to Release →</Link></p>
      </section>
      <section className="panel" aria-labelledby="samples-title">
        <div className="eyebrow">Samples</div>
        <h2 id="samples-title">{plural(detail.samples.length, "sample")} · {excluded} excluded</h2>
        {detail.samples.length
          ? <div className={qc.scroll}><table className={`${styles.orders} ${qc.samples}`} aria-label={`Samples of ${order.code}`}>
            <thead><tr><th scope="col">Code</th><th scope="col">FullName</th><th scope="col">Decision</th>{canWrite && open && <th scope="col"><span className="sr-only">Action</span></th>}</tr></thead>
            <tbody>{detail.samples.map(sample => <SampleRow key={sample.id} sample={sample} orderCode={order.code} canWrite={canWrite && open} />)}</tbody>
          </table></div>
          : <p className="empty-state">No live samples are registered for this order.</p>}
      </section>
    </>}
  </>;
}
