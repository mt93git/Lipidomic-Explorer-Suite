import type { Metadata } from "next";
import Link from "@/components/app-link";
import { listResultOrders } from "@/lib/data/results";
import { ResultsForm } from "./results-form";

export const metadata: Metadata = { title: "Ingest results" };

// Accept a SCIEX OS export for an order: parse, review the checks, accept. The order moves to Processed and the
// dataset is built from the accepted file in Release.
export default async function IngestResultsPage() {
  const orders = await listResultOrders();
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Ingest results</div>
        <h1>Ingest results</h1>
        <p>Review raw peak areas before accepting a SCIEX OS export. Accepting moves the order to Processed; the dataset version is then built in Release.</p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href="/name-dictionary">Name dictionary</Link>
        <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
      </div>
    </div>
    <ResultsForm orders={orders} />
  </>;
}
