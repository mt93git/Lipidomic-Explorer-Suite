import Link from "@/components/app-link";
import { gateStatus, type Client, type Order } from "@/lib/models";

const statusLabels = { fail: "Gate blocked", pending: "Awaiting checks", ok: "Ready to advance" };

type Props = {
  order: Order;
  client: Client;
  // Other clients sharing this order's batch (mixed batch). Only ever supplied for lab staff.
  companions?: Client[];
  // The batch also holds another client's samples; shown as one anonymous mark when no companions are named.
  shared?: boolean;
  // Batch note already worded for the audience (see batchNote in pipeline-filters).
  note?: string | null;
  // Shown in swimlanes, where the column no longer tells the stage.
  stageLabel?: string;
};

export function OrderCard({ order, client, companions = [], shared = false, note, stageLabel }: Props) {
  const status = gateStatus(order.gates);
  const problem = order.gates.find(gate => gate.status === "fail");
  return <article className="order-card" data-gate={status} aria-label={order.code}>
    <Link className="card-link" href={`/orders/${order.code}`}>
      <span className="card-client">
        <span className="color-square" data-color={client.color} aria-hidden="true" />{client.name}
        {companions.map(other => <span key={other.id} className="color-square companion" data-color={other.color} title={`Batch shared with ${other.name}`} aria-hidden="true" />)}
        {!companions.length && shared && <span className="color-square companion" data-color="shared" title="Shared run" aria-hidden="true" />}
        {stageLabel && <span className="card-stage">{stageLabel}</span>}
      </span>
      <span className="order-code">{order.code}</span>
      <h3>{order.description}</h3>
      <div className="card-progress"><span>{order.completedSamples} / {order.sampleCount} samples</span><span>{Math.round(order.completedSamples / order.sampleCount * 100)}%</span></div>
      <progress max={order.sampleCount} value={order.completedSamples} aria-label={`${order.code} progress`} />
      <span className={`pill ${status}`}>{statusLabels[status]}</span>
      {problem && <span className="card-problem">{problem.label}</span>}
      {note && <span className="card-batch">{note}</span>}
    </Link>
  </article>;
}
