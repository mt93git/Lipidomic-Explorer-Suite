import type { NextRequest } from "next/server";
import { checkUpload, DELIVERABLE_MAX_BYTES } from "@/lib/deliverables";
import { addDeliverable } from "@/lib/data/deliverables";
import { getAppSession } from "@/lib/session";
import { uploadTarget } from "@/lib/deliverable-upload";
import { BASE_PATH } from "@/lib/base-path";

// POST /admin/orders/ORD041/deliverables (multipart: title, kind, visible, file): the lab adds a file for the client.
// A route, not a server action: deliverables are up to 50 MB and the app's server actions stop at 6 MB. The proxy is
// skipped for this path (src/proxy.ts) so the body is not buffered and cut at its 10 MB limit. A route handler has no
// layout guard and no action origin check, so both are done here before the body is read. Answers with a 303 back to
// the order and a notice key (lib/deliverables.ts uploadNotices); nothing the request sent is echoed.
export const dynamic = "force-dynamic";
const CODE = /^ORD\d{3,}$/;
// The Next.js basePath (next.config.ts); a route's Location header is used verbatim (request.nextUrl.basePath is empty here).
const BASE = BASE_PATH;

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const back = (key: string) => new Response(null, { status: 303, headers: { Location: `${BASE}/orders/${encodeURIComponent(code)}?deliverable=${key}#deliverables`, "Cache-Control": "no-store" } });
  const session = await getAppSession();
  if (session && session.view !== "staff") return new Response("Deliverables are added by lab staff.", { status: 403, headers: { "Cache-Control": "no-store" } });
  const decision = uploadTarget({
    session, code: CODE.test(code) ? code : null, origin: request.headers.get("origin"),
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"), length: Number(request.headers.get("content-length") ?? "0"),
  });
  if (decision !== "ok") {
    if (decision === "sign-in") return new Response(null, { status: 303, headers: { Location: `${BASE}/sign-in` } });
    if (decision === "size") return back("size");
    return new Response("Not allowed.", { status: decision === "not-found" ? 404 : 403, headers: { "Cache-Control": "no-store" } });
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return back("empty"); }
  const file = form.get("file");
  if (!(file instanceof File)) return back("empty");
  if (file.size > DELIVERABLE_MAX_BYTES) return back("size");
  const checked = checkUpload({
    title: String(form.get("title") ?? ""), kind: String(form.get("kind") ?? ""), fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()), visible: form.get("visible") === "on",
  });
  if (!checked.ok) return back(checked.problem);
  return back(await addDeliverable(code, checked.value));
}
