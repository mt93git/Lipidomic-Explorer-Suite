import Link from "@/components/app-link";
import { listResultOrders } from "@/lib/data/results";
import { ResultsForm } from "./results-form";
export default async function IngestResultsPage() {
  const orders = await listResultOrders();
  return <><div className="page-heading"><div><h1>Ingest results</h1><p>Review raw peak areas before accepting a SCIEX OS export.</p></div><Link href="/name-dictionary">Name dictionary</Link></div><ResultsForm orders={orders} /></>;
}
