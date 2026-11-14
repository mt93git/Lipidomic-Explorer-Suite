import { auditCsv, auditExportFilename, parseAuditFilters } from "@/lib/audit";
import { exportAuditEvents } from "@/lib/data/audit";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

// GET /admin/audit-log/export?entity=…&order=…: the audit log's current filter as a CSV file (every page, newest
// first, UTF-8 with a byte order mark, ISO 8601 time plus lab time). Lab staff only; a route handler has no layout
// guard, so the session is checked here (the data seam checks the staff workspace again, and RLS a third time).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getAppSession();
  if (!session) return new Response("Sign in to export the audit log.", { status: 401 });
  if (session.view !== "staff") return new Response("The audit log is for lab staff.", { status: 403 });
  const url = new URL(request.url);
  const filters = parseAuditFilters(Object.fromEntries(url.searchParams));
  try {
    const { rows, truncated } = await exportAuditEvents(filters);
    return new Response(auditCsv(rows, { truncated }), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${auditExportFilename(filters)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DataError) return new Response(error.message, { status: 403 });
    throw error;
  }
}
