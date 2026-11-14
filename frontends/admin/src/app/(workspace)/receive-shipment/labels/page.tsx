import type { Metadata } from "next";
import Link from "@/components/app-link";
import { PrintButton } from "@/components/print-button";
import { getShipmentCheckin } from "@/lib/data/shipment-checkin";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";
import styles from "@/components/shipment-checkin.module.css";

export const metadata: Metadata = { title: "Print labels" };

// Tube labels for one shipment's manifest, ready for the browser's print dialog (no label printer integration):
// the sample code, the client's own tube ID and the order. Codes never contain a client name.
export default async function ShipmentLabelsPage({ searchParams }: { searchParams: Promise<{ order?: string; shipment?: string }> }) {
  await requireWorkspace("staff");
  const { order: code, shipment } = await searchParams;
  const view = code ? await getShipmentCheckin(code, shipment) : null;
  const back = code ? `/receive-shipment?order=${encodeURIComponent(code)}${shipment ? `&shipment=${encodeURIComponent(shipment)}` : ""}` : "/receive-shipment";
  return <>
    <div className={`page-heading ${styles.noPrint}`}>
      <div>
        <div className="eyebrow"><Link href="/receive-shipment">Receive shipment</Link> / Print labels</div>
        <h1>Tube labels{view ? ` · ${view.orderCode}` : ""}</h1>
        <p>{view ? `${plural(view.tubes.length, "label")} · shipment ${view.shipment.number} of ${view.shipment.of}. Print on label sheets or plain paper and cut.` : "No received shipment was found for this order."}</p>
      </div>
      <div className="heading-actions">
        {view && view.tubes.length > 0 && <PrintButton />}
        <Link className="button secondary" href={back}>← Back to check-in</Link>
      </div>
    </div>
    {view && (view.tubes.length
      ? <ul className={styles.labels} aria-label="Tube labels">
        {view.tubes.map(tube => <li key={tube.sampleCode} className={styles.label}>
          <strong>{tube.sampleCode}</strong>
          <span>{tube.clientSampleId ? `Client ID ${tube.clientSampleId}` : "No client ID"} · {view.orderCode}</span>
        </li>)}
      </ul>
      : <p className="notice">Nothing on the manifest yet: register the order&apos;s samples first.</p>)}
  </>;
}
