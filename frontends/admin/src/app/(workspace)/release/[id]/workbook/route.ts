import { DataError, getDataset, readDatasetWorkbook } from "@/lib/data/release";
import { downloadHeaders } from "@/lib/deliverables";

// GET /admin/release/<id>/workbook: Download Excel on the release page. Lab staff only (getDataset asks for the
// staff workspace); the exact stored dataset workbook of that version, checked against its recorded SHA-256 and
// always sent as an attachment, never shown inline.
export const dynamic = "force-dynamic";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const plain = (message: string, status: number) => new Response(message, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getDataset(id);
  if (!view) return plain("Not found.", 404);
  try {
    const { bytes, fileName } = await readDatasetWorkbook(view.dataset);
    return new Response(new Blob([new Uint8Array(bytes)]), { headers: downloadHeaders({ fileName, contentType: XLSX, sizeBytes: bytes.byteLength }) });
  } catch (error) {
    if (error instanceof DataError) return plain(error.message, 502);
    throw error;
  }
}
