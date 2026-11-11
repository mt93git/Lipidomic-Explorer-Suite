import { BATCH_NAME, type BatchFile } from "@/lib/batch-run";
import { batchFile } from "@/lib/data/batches";
import { getAppSession } from "@/lib/session";

// GET /admin/batch-run/B2026-033/B2026-033-sequence.csv (or ...-bench-sheet.csv): the generic CSV of the saved
// sequence, built from the database rows on every request, for lab staff only. A route handler has no layout guard,
// so the session is checked here.
export const dynamic = "force-dynamic";

const kinds: Record<string, BatchFile> = { sequence: "sequence", "bench-sheet": "bench-sheet" };

export async function GET(_request: Request, { params }: { params: Promise<{ name: string; file: string }> }) {
  const session = await getAppSession();
  if (!session) return new Response("Sign in to download batch files.", { status: 401 });
  if (session.view !== "staff") return new Response("Batch files are for lab staff.", { status: 403 });
  const { name, file } = await params;
  const kind = /^B\d{4}-\d{3,}-(sequence|bench-sheet)\.csv$/.exec(file)?.[1];
  if (!BATCH_NAME.test(name) || !kind || !file.startsWith(`${name}-`)) return new Response("Not found.", { status: 404 });
  const found = await batchFile(name, kinds[kind]);
  if (!found) return new Response("Not found.", { status: 404 });
  return new Response(found.text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${found.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
