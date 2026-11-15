import { downloadHeaders } from "@/lib/deliverables";
import { deliverableDownload } from "@/lib/data/deliverables";

// GET /admin/deliverables/<id>: one deliverable's file, always as a download (Content-Disposition: attachment, nosniff,
// a sandboxing CSP; an SVG is sent as application/octet-stream), never shown inline in the app's origin. Lab staff get
// any file; a client user only a live, visible file of their own client (downloadDecision; RLS and Storage check it
// again in live mode). Anything else is "Not found.", so a client learns nothing about other files.
export const dynamic = "force-dynamic";
const messages = { 401: "Sign in to download files.", 403: "Not allowed.", 404: "Not found.", 502: "The file could not be read. Try again later." };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await deliverableDownload(id);
  if ("status" in found) return new Response(messages[found.status], { status: found.status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  return new Response(new Blob([found.bytes as BlobPart]), { headers: downloadHeaders(found.item) });
}
