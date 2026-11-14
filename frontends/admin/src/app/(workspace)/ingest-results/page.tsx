import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { listResultOrders } from "@/lib/data/results";
import { ResultsForm } from "./results-form";

export const metadata: Metadata = { title: "Ingest results" };

// Accept a SCIEX OS export for an order: parse, review the checks, accept. The order moves to Processed and the
// dataset is built from the accepted file in Release. The heading lives in the form: it names the order once parsed.
export default async function IngestResultsPage() {
  await requireWorkspace("staff");
  const orders = await listResultOrders();
  return <ResultsForm orders={orders} />;
}
