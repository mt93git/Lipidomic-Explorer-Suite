import { auditCsv, auditExportFilename, parseAuditFilters } from "@/lib/audit";
import { exportAuditEvents, recordAuditExport } from "@/lib/data/audit";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

// GET /admin/audit-log/export?entity=…&order=…: the audit log's current filter as a CSV file (every page, newest
// first, UTF-8 with a byte order mark, ISO 8601 time plus lab time). Lab staff only; a route handler has no layout
// guard, so the session is checked here (the data seam checks the staff workspace again, and RLS a third time).
// Each export is itself audited (0042: who, the filter, the row count) before the file is sent; no audit row, no file.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getAppSession();
  if (!session) return new Response("Sign in to export the audit log.", { status: 401 });
  if (session.view !== "staff") return new Response("The audit log is for lab staff.", { status: 403 });
  const url = new URL(request.url);
  const filters = parseAuditFilters(Object.fromEntries(url.searchParams));
  try {
    const { rows, truncated } = await exportAuditEvents(filters);
    await recordAuditExport(filters, rows.length, truncated);
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
